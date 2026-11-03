/** Bundle entry for the OpenClaw plugin: the same pipeline as the CLI, with no
 * second implementation. Built to core.mjs by `deno task plugin:build`. */
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { collect } from "../src/collect.ts";
import { doctor } from "../src/doctor.ts";
import { emit } from "../src/emit.ts";
import { ExportError } from "../src/error.ts";
import {
  type AgentInference,
  cronSources,
  emitInferred,
  inferencePrompt,
  parseAgentInference,
} from "../src/infer.ts";
import { arr, json, obj, required } from "../src/input.ts";
import { ASSEMBLY_LIBRARY } from "../src/library.ts";
import { digest } from "../src/redaction.ts";
import {
  type Agent,
  canonical,
  type Cron,
  type FileRef,
} from "../src/snapshot.ts";
import {
  type FindingSummary,
  type VersionEntry,
  versionId,
  withVersion,
} from "../src/versions.ts";
import { viewerPage } from "../src/viewer.ts";
import { validationReport, type ValidationSummary } from "../src/validate.ts";
export { installToolkit, toolkitStatus } from "../src/toolkit-install.ts";

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
}

/** Rereads an instruction file only if it is still inside the workspace and
 * still has the bytes the collector hashed. */
async function collected(root: string, file: FileRef): Promise<string> {
  const base = await realpath(root),
    target = await realpath(join(root, file.path));
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw changed();
  const bytes = await readFile(target);
  if (digest(bytes) !== file.sha256) throw changed();
  return bytes.toString("utf8");
}

function changed(): ExportError {
  return new ExportError(
    "INSTRUCTION_CHANGED",
    "An instruction source moved, changed or became unreadable after collection",
    "Run the export again.",
  );
}

/** Raw prose is released only against the digest collected for this source. */
function verified(value: unknown, file: FileRef): string {
  if (typeof value !== "string" || digest(value) !== file.sha256) {
    throw changed();
  }
  return value;
}

/** Read only the selected jobs, including committed WAL records, without
 * retaining bodies in the snapshot or exposing database/parser errors. */
function collectedCron(stateDir: string, jobs: Cron[]) {
  if (!jobs.length) return [];
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(join(stateDir, "state", "openclaw.sqlite"), {
      readOnly: true,
    });
    db.exec("PRAGMA query_only=ON; BEGIN");
    const query = db.prepare("SELECT job_json FROM cron_jobs WHERE job_id = ?");
    const sources = jobs.map((job) => {
      const current = obj(json(required(query.get(job.id)?.job_json))),
        payload = obj(current.payload);
      if (current.agentId !== job.agentId || payload.kind !== "agentTurn") {
        throw changed();
      }
      return {
        path: `cron:${job.id}`,
        text: verified(payload.message, job.prompt!),
        schedule: job.schedule,
        enabled: job.enabled,
      };
    });
    db.exec("ROLLBACK");
    return sources;
  } catch {
    throw changed();
  } finally {
    db?.close();
  }
}

/** Match the collector's keyed/list agent precedence and heartbeat inheritance. */
async function collectedHeartbeat(stateDir: string, agent: Agent) {
  const heartbeat = agent.heartbeat;
  if (!heartbeat?.prompt) return [];
  try {
    const config = obj(
        json(await readFile(join(stateDir, "openclaw.json"), "utf8")),
      ),
      agents = obj(config.agents),
      entries = obj(agents.entries);
    const own = obj(
      Object.keys(entries).length
        ? entries[agent.id]
        : arr(agents.list).map(obj).find((a) => a.id === agent.id),
    );
    const hb = {
      ...obj(obj(agents.defaults).heartbeat),
      ...obj(own.heartbeat),
    };
    return [{
      path: "heartbeat",
      text: verified(hb.prompt, heartbeat.prompt),
      enabled: heartbeat.everyMs > 0,
      schedule: {
        kind: "every" as const,
        everyMs: heartbeat.everyMs,
        expression: null,
        timezone: null,
      },
    }];
  } catch {
    throw changed();
  }
}

/** Workspace sources are behavior files: bootstrap-style names (AGENTS.md,
 * SOUL.md, TOOLS.md…), never the agent's memory or its owner's profile, nor
 * other notes kept in the workspace. */
function isBehavior(f: FileRef): boolean {
  return /^[A-Z_]+\.md$/.test(f.path) &&
    !["MEMORY.md", "USER.md"].includes(f.path);
}

/** The runtime's own error, short and with anything token-like masked. */
function modelError(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const name = typeof code === "string" ? code : (e as Error)?.name ?? "Error";
  const message = String((e as Error)?.message ?? "").slice(0, 160)
    .replace(/CANARY-[A-Za-z0-9_-]+|[A-Za-z0-9_\-]{24,}/g, "[redacted]");
  return message ? `${name}: ${message}` : name;
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

/** versions.json lists the runs kept in outDir; none before the first run. */
async function readVersions(outDir: string): Promise<VersionEntry[]> {
  try {
    return JSON.parse(await readFile(join(outDir, "versions.json"), "utf8"));
  } catch (e) {
    if ((e as { code?: unknown }).code === "ENOENT") return [];
    throw e;
  }
}

/** A kept version's exported files by name (other files, such as a .DS_Store
 * left by a file browser, are not part of it). */
async function versionFiles(dir: string): Promise<Record<string, string>> {
  const names = await readdir(dir).catch((e) => {
    throw e?.code === "ENOENT"
      ? new ExportError(
        "EXPORT_VERSION_MISSING",
        "versions.json lists a version whose directory is gone",
        "Restore the directory or remove its entry from versions.json.",
      )
      : e;
  });
  return Object.fromEntries(
    await Promise.all(
      names.filter((n) => /\.(sysml|json)$/.test(n)).map(async (n) => [
        n,
        await readFile(join(dir, n), "utf8"),
      ]),
    ),
  );
}

/** Writes one run into its own `<outDir>/<UTC time>/` directory, named after
 * `now`, lists it in `<outDir>/versions.json` and regenerates the viewer,
 * `<outDir>/index.html`. `pluginList` is the output of `openclaw plugins list
 * --json`, or null to export without plugin tools. */
export async function runExport(
  stateDir: string,
  pluginList: unknown,
  outDir: string,
  complete: Complete | null,
  now: Date,
): Promise<ExportSummary> {
  const snapshot = await collect(stateDir, pluginList);
  const findings = doctor(snapshot);
  const findingSummary: FindingSummary = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) findingSummary[finding.severity]++;
  const files = new Map([
    ["snapshot.json", canonical(snapshot)],
    ["findings.json", canonical(findings)],
    ...emit(snapshot),
    ...ASSEMBLY_LIBRARY,
  ]);
  let inferred: ExportSummary["inferred"] = null;
  if (complete) {
    const agents: AgentInference[] = [], failed: string[] = [];
    let model = "unknown";
    for (const agent of snapshot.agents) {
      const behavior = agent.workspace.instructions.filter(isBehavior);
      const root = resolve(stateDir, agent.workspace.path);
      try {
        const sources = [
          ...await Promise.all(
            behavior.map(async (f) => ({
              path: f.path,
              text: await collected(root, f),
            })),
          ),
          ...collectedCron(stateDir, cronSources(snapshot, agent.id)),
          ...await collectedHeartbeat(stateDir, agent),
        ];
        if (!sources.length) continue;
        const answer = await complete(
          inferencePrompt(agent.id, sources, snapshot.agents),
          agent.id,
        );
        model = answer.model ?? model;
        agents.push(
          parseAgentInference(
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
            : `${agent.id}: MODEL_FAILED (${modelError(e)})`,
        );
      }
    }
    const inference = {
      schema: "openclaw-inference/1" as const,
      model,
      agents,
    };
    files.set("inference.json", canonical(inference));
    for (const [k, v] of emitInferred(snapshot, inference)) files.set(k, v);
    inferred = {
      procedures: agents.reduce((n, a) => n + a.procedures.length, 0),
      rules: agents.reduce((n, a) => n + a.rules.length, 0),
      failed,
    };
  }
  const version = versionId(now), dir = join(outDir, version);
  await mkdir(outDir, { recursive: true });
  await mkdir(dir).catch((e) => {
    throw e?.code === "EEXIST"
      ? new ExportError(
        "EXPORT_VERSION_EXISTS",
        "An export already ran within this second",
        "Run the export again.",
      )
      : e;
  });
  for (const [name, text] of files) await writeFile(join(dir, name), text);
  const { validation, diagnostics } = await validationReport(
    new Map([...files].filter(([name]) => name.endsWith(".sysml"))),
    stateDir,
  );
  await writeFile(
    join(dir, "validation.json"),
    canonical({ validation, ...diagnostics }),
  );
  const versions = withVersion(await readVersions(outDir), {
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
  await writeFile(join(outDir, "versions.json"), canonical(versions));
  const viewer = join(outDir, "index.html");
  await writeFile(
    viewer,
    await viewerPage(
      await Promise.all(versions.map(async (entry) => ({
        entry,
        files: await versionFiles(join(outDir, entry.id)),
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
  };
}
