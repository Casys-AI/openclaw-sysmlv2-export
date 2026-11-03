import { compareFindings } from "../../domain/model/diagnostics/findings.ts";
import {
  type ApeSummary,
  persistedApeReport,
} from "../../domain/model/diagnostics/ape.ts";
import type { ValidationSummary } from "../../domain/model/diagnostics/validation.ts";
import { ExportError } from "../../domain/primitives/error.ts";
import {
  type AgentInference,
  cronSources,
  inferencePrompt,
} from "../../domain/model/inference.ts";
import { json } from "../../domain/primitives/input.ts";
import type { FileRef } from "../../domain/model/snapshot.ts";
import {
  type FindingSummary,
  versionId,
  withVersion,
} from "../../domain/export/versions.ts";
import type { ExportPorts } from "./ports/out/export.port.ts";

/** One model call about one agent: the raw text and the model that answered. */
export type Complete = (
  prompt: string,
  agentId: string,
) => Promise<{ text: string; model?: string }>;

export interface ExportSummary {
  /** The run's own directory, `<outDir>/<version>`. */
  outDir: string;
  version: string;
  /** `<outDir>/index.html`, the version viewer. */
  viewer: string;
  agents: number;
  inferred: { procedures: number; rules: number; failed: string[] } | null;
  validation: ValidationSummary;
  findings: FindingSummary;
  ape: ApeSummary;
}

/** Workspace sources are behavior files: bootstrap-style names (AGENTS.md,
 * SOUL.md, TOOLS.md…), never the agent's memory or its owner's profile, nor
 * other notes kept in the workspace. */
function isBehavior(f: FileRef): boolean {
  return /^[A-Z_]+\.md$/.test(f.path) &&
    !["MEMORY.md", "USER.md"].includes(f.path);
}

/** The model may wrap the object in prose or a fence; keep the outer object. */
function jsonObject(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new ExportError(
      "INFERENCE_NOT_JSON",
      "The model answer holds no JSON object",
      "Retry the inference; check the agent's model.",
    );
  }
  return json(text.slice(start, end + 1));
}

/** The plugin inventory from a run of `openclaw plugins list --json` through
 * the plugin runtime's command runner: its parsed stdout, which the collector
 * then validates. */
export function pluginList(
  result: { code: number | null; stdout: string },
): unknown {
  if (result.code !== 0) {
    throw new ExportError(
      "PLUGIN_LIST_FAILED",
      "openclaw plugins list --json did not exit with status 0",
      "Run openclaw plugins list --json on the host, fix what it reports, then export again.",
    );
  }
  return json(result.stdout);
}

/** Writes one run into its own `<outDir>/<UTC time>/` directory, named after
 * `now`, lists it in `<outDir>/versions.json` and regenerates the viewer,
 * `<outDir>/index.html`. `pluginList` is the output of `openclaw plugins list
 * --json`, or null to export without plugin tools. */
export async function runExport(
  ports: ExportPorts,
  stateDir: string,
  pluginList: unknown,
  outDir: string,
  complete: Complete | null,
  now: Date,
): Promise<ExportSummary> {
  const snapshot = await ports.collect(stateDir, pluginList);
  const findings = snapshot.ambiguities.map((finding) => ({ ...finding }));
  const findingSummary: FindingSummary = { error: 0, warning: 0, info: 0 };
  const files = new Map([
    ["snapshot.json", ports.serialize(snapshot)],
    ...ports.sysml.emit(snapshot),
    ...ports.sysml.library,
  ]);
  let inferred: ExportSummary["inferred"] = null;
  if (complete) {
    const agents: AgentInference[] = [], failed: string[] = [];
    let model = "unknown";
    for (const agent of snapshot.agents) {
      const behavior = agent.workspace.instructions.filter(isBehavior);
      const root = ports.instructions.workspaceRoot(
        stateDir,
        agent.workspace.path,
      );
      try {
        const sources = [
          ...await Promise.all(
            behavior.map(async (f) => ({
              path: f.path,
              text: await ports.instructions.collected(root, f),
            })),
          ),
          ...ports.instructions.collectedCron(
            stateDir,
            cronSources(snapshot, agent.id),
          ),
          ...await ports.instructions.collectedHeartbeat(stateDir, agent),
        ];
        if (!sources.length) continue;
        const answer = await complete(
          inferencePrompt(agent.id, sources, snapshot.agents),
          agent.id,
        );
        model = answer.model ?? model;
        agents.push(
          ports.inference.parse(
            jsonObject(answer.text),
            snapshot,
            agent.id,
            sources.map((f) => f.path),
          ),
        );
      } catch (e) {
        // context is our own message, never model or input text.
        failed.push(
          e instanceof ExportError
            ? `${agent.id}: ${e.code} (${e.context})`
            : `${agent.id}: MODEL_FAILED (${ports.modelError(e)})`,
        );
      }
    }
    const inference = {
      schema: "openclaw-inference/1" as const,
      model,
      agents,
    };
    files.set("inference.json", ports.serialize(inference));
    for (const [k, v] of ports.sysml.emitInferred(snapshot, inference)) {
      files.set(k, v);
    }
    inferred = {
      procedures: agents.reduce((n, a) => n + a.procedures.length, 0),
      rules: agents.reduce((n, a) => n + a.rules.length, 0),
      failed,
    };
  }
  const version = versionId(now), dir = ports.output.join(outDir, version);
  await ports.output.mkdir(outDir, { recursive: true });
  await ports.output.mkdir(dir).catch((e) => {
    throw e?.code === "EEXIST"
      ? new ExportError(
        "EXPORT_VERSION_EXISTS",
        "An export already ran within this second",
        "Run the export again.",
      )
      : e;
  });
  for (const [name, text] of files) {
    await ports.output.writeFile(ports.output.join(dir, name), text);
  }
  const { validation, diagnostics, ape } = await ports.validationReport(
    new Map([...files].filter(([name]) => name.endsWith(".sysml"))),
  );
  findings.push(...ape.findings);
  findings.sort(compareFindings);
  for (const finding of findings) findingSummary[finding.severity]++;
  if (ape.validationReport !== undefined) {
    await ports.output.writeFile(
      ports.output.join(dir, "ape-report.ttl"),
      ape.validationReport,
    );
  }
  await ports.output.writeFile(
    ports.output.join(dir, "findings.json"),
    ports.serialize(findings),
  );
  await ports.output.writeFile(
    ports.output.join(dir, "validation.json"),
    ports.serialize({
      validation,
      ...diagnostics,
      ape: persistedApeReport(ape),
    }),
  );
  const versions = withVersion(await ports.output.readVersions(outDir), {
    id: version,
    createdAt: now.toISOString(),
    agents: snapshot.agents.length,
    validation,
    findings: findingSummary,
    inferred: inferred && {
      procedures: inferred.procedures,
      rules: inferred.rules,
      failed: inferred.failed.length,
    },
  });
  await ports.output.writeFile(
    ports.output.join(outDir, "versions.json"),
    ports.serialize(versions),
  );
  const viewer = ports.output.join(outDir, "index.html");
  await ports.output.writeFile(
    viewer,
    await ports.viewerPage(
      await Promise.all(versions.map(async (entry) => ({
        entry,
        files: await ports.output.versionFiles(
          ports.output.join(outDir, entry.id),
        ),
      }))),
    ),
  );
  return {
    outDir: dir,
    version,
    viewer,
    agents: snapshot.agents.length,
    validation,
    findings: findingSummary,
    inferred,
    ape: {
      status: ape.status,
      count: ape.findings.length,
      ...(ape.code ? { code: ape.code } : {}),
    },
  };
}
