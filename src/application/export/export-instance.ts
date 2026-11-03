import { compareFindings } from "../../domain/model/diagnostics/findings.ts";
import {
  type ApeSummary,
  persistedApeReport,
} from "../../domain/model/diagnostics/ape.ts";
import type { ValidationSummary } from "../../domain/model/diagnostics/validation.ts";
import { ExportError, isRecord } from "../../domain/primitives/error.ts";
import {
  type AgentInference,
  behaviourFiles,
  cronSources,
  inferenceInput,
  inferencePrompt,
} from "../../domain/model/inference.ts";
import { json } from "../../domain/primitives/input.ts";
import {
  type FindingSummary,
  type VersionEntry,
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
  inferred: {
    procedures: number;
    rules: number;
    failed: string[];
    /** Agents that kept the inference of an earlier version. */
    reused?: string[];
  } | null;
  validation: ValidationSummary;
  findings: FindingSummary;
  ape: ApeSummary;
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

/** The inference of the newest kept version that has one: its model and the
 * agents' entries as stored, which `runExport` validates before reusing. */
async function lastInference(
  ports: ExportPorts,
  outDir: string,
  versions: VersionEntry[],
): Promise<{ model: string; agents: unknown[] } | null> {
  const last = versions.find((v) => v.inferred);
  if (!last) return null;
  const stored = await ports.output.readInference(
    ports.output.join(outDir, last.id),
  );
  return isRecord(stored) && typeof stored.model === "string" &&
      Array.isArray(stored.agents)
    ? { model: stored.model, agents: stored.agents }
    : null;
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
  const versions = await ports.output.readVersions(outDir);
  const version = versionId(now);
  const earlier = await lastInference(ports, outDir, versions);
  const snapshot = await ports.collect(stateDir, pluginList);
  const findings = snapshot.ambiguities.map((finding) => ({ ...finding }));
  const findingSummary: FindingSummary = { error: 0, warning: 0, info: 0 };
  const files = new Map([
    ["snapshot.json", ports.serialize(snapshot)],
    ...ports.sysml.emit(snapshot),
    ...ports.sysml.library,
  ]);
  let inferred: ExportSummary["inferred"] = null;
  const reused: AgentInference[] = [];
  if (complete) {
    const agents: AgentInference[] = [], failed: string[] = [];
    let model: string | undefined;
    for (const agent of snapshot.agents) {
      const behavior = behaviourFiles(agent);
      const input = inferenceInput(snapshot, agent);
      const root = ports.instructions.workspaceRoot(
        stateDir,
        agent.workspace.path,
      );
      try {
        // The model is asked again only when what it is sent has changed.
        const before = earlier?.agents.find((a) =>
          isRecord(a) && a.agentId === agent.id
        );
        if (
          isRecord(before) && typeof before.inferredIn === "string" &&
          before.input !== undefined &&
          ports.serialize(before.input) === ports.serialize(input)
        ) {
          try {
            const carried = {
              ...ports.inference.parse(
                before,
                snapshot,
                agent.id,
                input.files.map((f) => f.file),
              ),
              input,
              inferredIn: before.inferredIn,
            };
            agents.push(carried);
            reused.push(carried);
            continue;
          } catch (e) {
            // A stored answer that no longer validates is asked again.
            if (!(e instanceof ExportError)) throw e;
          }
        }
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
        agents.push({
          ...ports.inference.parse(
            jsonObject(answer.text),
            snapshot,
            agent.id,
            sources.map((f) => f.path),
          ),
          input,
          inferredIn: version,
        });
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
      model: model ?? (reused.length ? earlier!.model : "unknown"),
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
      ...(reused.length ? { reused: reused.map((a) => a.agentId) } : {}),
    };
  }
  const dir = ports.output.join(outDir, version);
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
  const listed = withVersion(versions, {
    id: version,
    createdAt: now.toISOString(),
    agents: snapshot.agents.length,
    validation,
    findings: findingSummary,
    inferred: inferred && {
      procedures: inferred.procedures,
      rules: inferred.rules,
      failed: inferred.failed.length,
      ...(inferred.reused
        ? {
          reused: {
            agents: inferred.reused.length,
            from: [...new Set(reused.map((a) => a.inferredIn!))].sort(),
          },
        }
        : {}),
    },
    ...await ports.producer(),
  });
  await ports.output.writeFile(
    ports.output.join(outDir, "versions.json"),
    ports.serialize(listed),
  );
  const viewer = ports.output.join(outDir, "index.html");
  await ports.output.writeFile(
    viewer,
    await ports.viewerPage(
      await Promise.all(listed.map(async (entry) => ({
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
