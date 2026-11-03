import { readFile } from "node:fs/promises";
import { compareFindings } from "./doctor.ts";
import { elementId } from "./element-id.ts";
import { isRecord, recordDiagnosticError } from "./error.ts";
import { namedNode, type Store, type Term } from "./oxigraph.ts";
import {
  materializeShaclRules,
  readShaclProgram,
  REPORT_GRAPH,
  SH,
  type ShaclProgram,
  ShaclStageError,
  SHAPES_GRAPH,
  validateShacl,
} from "./shacl.ts";
import type { Finding } from "./snapshot.ts";

export interface ApeFinding extends Finding {
  pattern: string;
  finding: "present" | "absent" | "indeterminate";
}
export type ApeStage = "projection" | "loading" | "view" | "rule";
export interface ApeReport {
  status: "completed" | "skipped" | "failed";
  code?: string;
  context?: string | Record<string, unknown>;
  recovery?: string;
  stage?: ApeStage;
  file?: string;
  cause?: string;
  findings: ApeFinding[];
  validationReport?: string;
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

export type PersistedApeReport =
  & Omit<ApeReport, "metrics" | "validationReport">
  & {
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
  const { metrics, validationReport: _validationReport, ...stable } =
    report as ApeReport;
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

const APE = "urn:ase:ape:v1:";
const FILE = "rules/ape/ape.ttl";
const SHAPE_URL = new URL(
  import.meta.url.endsWith(".ts")
    ? "../rules/ape/ape.ttl"
    : "./rules/ape/ape.ttl",
  import.meta.url,
);
export interface ApeAnnotation {
  code: string;
  pattern: string;
  finding: ApeFinding["finding"];
  recovery: string;
  message: string;
}
export interface ApeProgram extends ShaclProgram {
  readonly annotations: ReadonlyMap<string, ApeAnnotation>;
}
/** Admit APE annotations once, alongside generic query admission. */
export function admitApeProgram(
  store: Store,
  program: ShaclProgram,
): ApeProgram {
  return { ...program, annotations: annotations(store, program) };
}
function selected(
  store: Store,
  query: string,
  options?: Parameters<Store["query"]>[1],
): Map<string, Term>[] {
  const result = store.query(query, options);
  if (!Array.isArray(result) || result.some((row) => !(row instanceof Map))) {
    throw new Error("Expected APE SELECT results");
  }
  return result as Map<string, Term>[];
}
function annotations(
  store: Store,
  program: ShaclProgram,
): Map<string, ApeAnnotation> {
  const result = new Map<string, ApeAnnotation>();
  const fields = ["code", "pattern", "finding", "recovery"];
  for (const shape of program.shapes) {
    const values: Record<string, string> = {};
    for (
      const row of selected(
        store,
        `SELECT ?p ?o WHERE { ${shape.node} ?p ?o }`,
        { default_graph: namedNode(SHAPES_GRAPH), named_graphs: [] },
      )
    ) {
      const predicate = row.get("p")!.value;
      const name = predicate.slice(APE.length);
      if (!predicate.startsWith(APE) || !fields.includes(name)) continue;
      const value = row.get("o")!;
      if (
        value.termType !== "Literal" || !value.value.trim() || name in values
      ) throw new Error(`Invalid APE shape annotation ${name}`);
      values[name] = value.value;
    }
    for (const name of fields) {
      if (!(name in values)) {
        throw new Error(`Missing APE shape annotation ${name}`);
      }
    }
    if (!/^[A-Z][A-Z_]+$/.test(values.code)) {
      throw new Error("Invalid APE shape annotation code");
    }
    if (!["present", "absent"].includes(values.finding)) {
      throw new Error("Invalid APE shape annotation finding");
    }
    for (const constraint of shape.constraints) {
      if (constraint.messages.length !== 1) {
        throw new Error("APE constraints require one message");
      }
      result.set(
        JSON.stringify([shape.node.value, constraint.sourceConstraint.value]),
        {
          ...values,
          message: constraint.messages[0].value,
        } as unknown as ApeAnnotation,
      );
    }
  }
  return result;
}
function stageError(
  error: unknown,
  fallback: ApeStage = "rule",
  file = FILE,
): ApeStageError {
  return error instanceof ApeStageError
    ? error
    : error instanceof ShaclStageError
    ? new ApeStageError(error.stage, error.cause, error.file ?? file)
    : new ApeStageError(fallback, error, file);
}

/** Shapes are the only runtime rule source, packaged beside the bundled worker. */
export async function readApeProgram(
  store: Store,
): Promise<ApeProgram> {
  try {
    store.load(await readFile(SHAPE_URL, "utf8"), {
      format: "text/turtle",
      to_graph_name: namedNode(SHAPES_GRAPH),
    });
    const program = readShaclProgram(store, FILE);
    return admitApeProgram(store, program);
  } catch (error) {
    throw stageError(error, "loading");
  }
}

export function materializeApeViews(store: Store, program: ShaclProgram) {
  try {
    return materializeShaclRules(store, program);
  } catch (error) {
    throw stageError(error, "view");
  }
}

/** Map the standard report, never re-run an independent TypeScript rule pipeline. */
export function evaluateApeRules(store: Store, program: ApeProgram) {
  try {
    const evaluated = validateShacl(store, program);
    const meta = program.annotations;
    const ids = new Map<string, string>();
    for (
      const row of selected(
        store,
        `SELECT ?node ?id WHERE { ?node <${APE}agentId> ?id }`,
        program.dataOptions,
      )
    ) {
      const node = row.get("node")!;
      const id = row.get("id")!;
      if (
        node.termType !== "NamedNode" || id.termType !== "Literal" || !id.value
      ) throw new Error("APE agents require IRI nodes and literal agentId");
      if (ids.has(node.value) && ids.get(node.value) !== id.value) {
        throw new Error("APE agent has conflicting agentId values");
      }
      ids.set(node.value, id.value);
    }
    const groups = new Map<
      string,
      {
        annotation: ApeAnnotation;
        focus: string;
        severity: Finding["severity"];
        related: Set<string>;
      }
    >();
    for (
      const row of selected(
        store,
        `SELECT ?focus ?shape ?constraint ?severity ?value WHERE {
      ?result a <${SH}ValidationResult>; <${SH}focusNode> ?focus; <${SH}sourceShape> ?shape; <${SH}sourceConstraint> ?constraint;
        <${SH}resultSeverity> ?severity; <${SH}value> ?value .
    }`,
        { default_graph: namedNode(REPORT_GRAPH), named_graphs: [] },
      )
    ) {
      const annotation = meta.get(
        JSON.stringify([row.get("shape")!.value, row.get("constraint")!.value]),
      );
      if (!annotation) {
        throw new Error("Missing APE annotations for report result");
      }
      const focus = ids.get(row.get("focus")!.value);
      if (!focus) throw new Error("APE report focus has no agentId");
      const severity = ({
        [SH + "Violation"]: "error",
        [SH + "Warning"]: "warning",
        [SH + "Info"]: "info",
      } as const)[row.get("severity")!.value];
      if (!severity) throw new Error("Unsupported APE result severity");
      const key = JSON.stringify([annotation.code, focus]);
      if (!groups.has(key)) {
        groups.set(key, { annotation, focus, severity, related: new Set() });
      }
      const group = groups.get(key)!;
      if (group.severity !== severity) {
        throw new Error("APE finding group has conflicting severity");
      }
      if (/\{[?$]relatedAgentId\}/.test(annotation.message)) {
        const related = ids.get(row.get("value")!.value);
        if (!related) {
          throw new Error("APE report value has no related agentId");
        }
        group.related.add(related);
      }
    }
    const findings: ApeFinding[] = [...groups.values()].map((
      { annotation, focus, severity, related },
    ) => ({
      code: `APE_${annotation.code}`,
      severity,
      subject: elementId("agent", focus),
      context: annotation.message.replace(
        /\{[?$]relatedAgentId\}/g,
        () => [...related].sort().join(", "),
      ),
      recovery: annotation.recovery,
      pattern: annotation.pattern,
      finding: annotation.finding,
    }));
    findings.sort(compareFindings);
    const queries = evaluated.queries.map((query) => {
      const annotation = meta.get(
        JSON.stringify([query.sourceShape.value, query.sourceConstraint.value]),
      )!;
      return {
        code: annotation.code,
        ms: query.ms,
        findings: [...groups.values()].filter((group) =>
          group.annotation.code === annotation.code
        ).length,
      };
    });
    return { findings, queries, validationReport: evaluated.validationReport };
  } catch (error) {
    throw stageError(error);
  }
}
