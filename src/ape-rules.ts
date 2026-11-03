import { readdir, readFile } from "node:fs/promises";
import { compareFindings } from "./doctor.ts";
import { elementId } from "./element-id.ts";
import { isRecord, recordDiagnosticError } from "./error.ts";
import { namedNode, Quad, quad, type Store } from "./oxigraph.ts";
import type { Finding } from "./snapshot.ts";

export interface ApeFinding extends Finding {
  pattern: string;
  finding: "present" | "absent" | "indeterminate";
}
export interface ApeRule {
  code: string;
  severity: Finding["severity"];
  pattern: string;
  finding: ApeFinding["finding"];
  context: string;
  recovery: string;
  query: string;
  file?: string;
}
export type ApeStage = "projection" | "loading" | "view" | "rule";
export interface ApeView {
  name: string;
  file: string;
  graph: string;
  query: string;
}
export interface ApeReport {
  status: "completed" | "skipped" | "failed";
  code?: string;
  context?: string | Record<string, unknown>;
  recovery?: string;
  stage?: ApeStage;
  file?: string;
  cause?: string;
  findings: ApeFinding[];
  metrics?: {
    elements: number;
    sourceElements?: number;
    baseQuads: number;
    derivedQuads: number;
    batches: number;
    totalMs: number;
    preparationMs: number;
    projectionMs: number;
    loadMs: number;
    views: { file: string; graph: string; ms: number; quads: number }[];
    queries: { code: string; ms: number; findings: number }[];
  };
}
export type ApeSummary = Pick<ApeReport, "status" | "code"> & { count: number };

export type PersistedApeReport = Omit<ApeReport, "metrics"> & {
  metrics?:
    & Pick<
      NonNullable<ApeReport["metrics"]>,
      "elements" | "sourceElements" | "baseQuads" | "derivedQuads" | "batches"
    >
    & {
      views: { file: string; graph: string; quads: number }[];
      queries: { code: string; findings: number }[];
    };
};

/** Persist counts and identities; timings remain available only in memory. */
export function persistedApeReport(
  report: ApeReport | PersistedApeReport,
): PersistedApeReport {
  const { metrics, ...stable } = report;
  return {
    ...stable,
    ...(metrics
      ? {
        metrics: {
          elements: metrics.elements,
          ...(metrics.sourceElements !== undefined
            ? { sourceElements: metrics.sourceElements }
            : {}),
          baseQuads: metrics.baseQuads,
          derivedQuads: metrics.derivedQuads,
          batches: metrics.batches,
          views: metrics.views.map(({ file, graph, quads }) => ({
            file,
            graph,
            quads,
          })),
          queries: metrics.queries.map(({ code, findings }) => ({
            code,
            findings,
          })),
        },
      }
      : {}),
  };
}

/** The stage and original cause remain inspectable separately from compiler diagnostics. */
export class ApeStageError extends Error {
  readonly code: string;
  readonly context: string | Record<string, unknown>;
  readonly recovery =
    "Check the reported APE stage, query file and cause, then retry the export.";
  constructor(
    readonly stage: ApeStage,
    error: unknown,
    readonly file?: string,
  ) {
    const record = isRecord(error) ? error : {};
    const code = typeof record.code === "string"
      ? record.code
      : stage === "projection"
      ? "APE_GRAPH_FAILED"
      : `APE_${stage.toUpperCase()}_FAILED`;
    super(code, { cause: error });
    this.name = "ApeStageError";
    this.code = code;
    this.context =
      typeof record.context === "string" || isRecord(record.context)
        ? record.context
        : `APE ${stage}${file ? ` (${file})` : ""}`;
  }
  toJSON() {
    const recorded = recordDiagnosticError({
      code: this.code,
      context: this.context,
      message: isRecord(this.cause) && typeof this.cause.message === "string"
        ? this.cause.message
        : String(this.cause),
    });
    return {
      code: recorded.code!,
      context: recorded.context!,
      recovery: this.recovery,
      stage: this.stage,
      ...(this.file
        ? { file: recordDiagnosticError(new Error(this.file)).message }
        : {}),
      cause: recorded.message,
    };
  }
}

/** One admission boundary for the six metadata fields, before execution. */
export function parseApeRule(text: string, file = "<inline>"): ApeRule {
  const header = text.split(/\r?\n\s*\r?\n/, 1)[0];
  const meta: Record<string, string> = {};
  const invalid = (message: string): never => {
    throw new ApeStageError("rule", new Error(message), file);
  };
  for (const line of header.split(/\r?\n/)) {
    const field = /^# (\w+):\s*(.*)$/.exec(line);
    if (!field) invalid("Invalid APE rule header line");
    const [, name, value] = field!;
    if (
      !["code", "severity", "pattern", "finding", "context", "recovery"]
        .includes(name)
    ) {
      invalid(`Invalid APE rule header field: ${name}`);
    }
    if (name in meta) invalid(`Duplicate APE rule header field: ${name}`);
    meta[name] = value;
  }
  for (
    const name of [
      "code",
      "severity",
      "pattern",
      "finding",
      "context",
      "recovery",
    ]
  ) {
    if (!(name in meta)) invalid(`Missing APE rule header field: ${name}`);
    if (!meta[name].trim()) invalid(`Invalid APE rule header field: ${name}`);
  }
  if (!/^[A-Z][A-Z_]+$/.test(meta.code)) {
    invalid("Invalid APE rule header field: code");
  }
  if (!["error", "warning", "info"].includes(meta.severity)) {
    invalid("Invalid APE rule header field: severity");
  }
  if (!["present", "absent"].includes(meta.finding)) {
    invalid("Invalid APE rule header field: finding");
  }
  return { ...meta, query: text, file } as unknown as ApeRule;
}

const directory = () =>
  new URL(
    import.meta.url.endsWith(".ts") ? "../rules/ape/" : "./rules/ape/",
    import.meta.url,
  );
async function readQuery(
  name: string,
  stage: "view" | "rule",
  root = directory(),
): Promise<string> {
  try {
    return await readFile(new URL(name, root), "utf8");
  } catch (error) {
    throw new ApeStageError(stage, error, `rules/ape/${name}`);
  }
}

/** Files remain verbatim SPARQL, including their metadata comments. */
export async function readApeRules(root = directory()): Promise<ApeRule[]> {
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".rq"))
      .map((entry) => entry.name).sort();
  } catch (error) {
    throw new ApeStageError("rule", error, "rules/ape");
  }
  return await Promise.all(
    names.map(async (name) =>
      parseApeRule(await readQuery(name, "rule", root), `rules/ape/${name}`)
    ),
  );
}

export const APE_VIEW_ORDER = [
  "agents",
  "delegation",
  "messaging",
  "entries",
  "exec",
] as const;

/** Each query sees earlier views in APE_VIEW_ORDER. */
export async function readApeViews(): Promise<ApeView[]> {
  return await Promise.all(
    APE_VIEW_ORDER.map(async (
      name,
    ) => ({
      name,
      file: `rules/ape/views/${name}.rq`,
      graph: `urn:ase:ape:v1:view:${name}`,
      query: await readQuery(`views/${name}.rq`, "view"),
    })),
  );
}

export function materializeApeViews(store: Store, views: ApeView[]) {
  const timings: NonNullable<ApeReport["metrics"]>["views"] = [];
  let derivedQuads = 0;
  for (const view of views) {
    const started = performance.now();
    try {
      const result = store.query(view.query);
      if (
        !Array.isArray(result) ||
        result.some((value) => !(value instanceof Quad))
      ) {
        throw new Error("APE view must CONSTRUCT RDF quads");
      }
      const graph = namedNode(view.graph);
      const before = store.size;
      for (const value of result as Quad[]) {
        store.add(quad(value.subject, value.predicate, value.object, graph));
      }
      const quads = store.size - before;
      derivedQuads += quads;
      timings.push({
        file: view.file,
        graph: view.graph,
        ms: performance.now() - started,
        quads,
      });
    } catch (error) {
      throw new ApeStageError("view", error, view.file);
    }
  }
  return { views: timings, derivedQuads };
}

export function evaluateApeRules(store: Store, rules: ApeRule[]) {
  const findings: ApeFinding[] = [];
  const queries: NonNullable<ApeReport["metrics"]>["queries"] = [];
  for (const rule of rules) {
    const started = performance.now();
    // A context naming {related} needs a literal ?relatedAgentId in every row.
    const related = rule.context.includes("{related}");
    const literal = (
      row: Map<string, { termType: string; value: string }>,
      name: string,
    ) => row.get(name)?.termType === "Literal" && Boolean(row.get(name)?.value);
    let rows;
    try {
      rows = store.query(rule.query);
      // Every row names its agent; do not silently drop rows.
      if (
        !Array.isArray(rows) ||
        rows.some((row) =>
          !(row instanceof Map) || !literal(row, "agentId") ||
          related !== literal(row, "relatedAgentId")
        )
      ) {
        throw new Error(
          `APE rule ${rule.code} must SELECT a literal ?agentId` +
            (related ? " and ?relatedAgentId" : ""),
        );
      }
    } catch (error) {
      throw new ApeStageError("rule", error, rule.file);
    }
    // One finding per agent; the agents it relates to are listed sorted.
    const byAgent = new Map<string, Set<string>>();
    for (const row of rows as Map<string, { value: string }>[]) {
      const agent = row.get("agentId")!.value;
      if (!byAgent.has(agent)) byAgent.set(agent, new Set());
      if (related) byAgent.get(agent)!.add(row.get("relatedAgentId")!.value);
    }
    for (const [agent, others] of byAgent) {
      findings.push({
        code: `APE_${rule.code}`,
        severity: rule.severity,
        subject: elementId("agent", agent),
        context: rule.context.replaceAll(
          "{related}",
          () => [...others].sort().join(", "),
        ),
        recovery: rule.recovery,
        pattern: rule.pattern,
        finding: rule.finding,
      });
    }
    queries.push({
      code: rule.code,
      ms: performance.now() - started,
      findings: byAgent.size,
    });
  }
  findings.sort(compareFindings);
  return { findings, queries };
}
