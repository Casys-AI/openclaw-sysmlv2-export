import { readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ExportError } from "../../../infrastructure/error.ts";
import { digest } from "../../../infrastructure/redaction.ts";
import { arr, json, obj, required } from "../../../domain/primitives/input.ts";
import type { Agent, Cron, FileRef } from "../../../domain/model/snapshot.ts";

/** Rereads an instruction file only if it is still inside the workspace and
 * still has the bytes the collector hashed. */
export async function collected(root: string, file: FileRef): Promise<string> {
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
export function collectedCron(stateDir: string, jobs: Cron[]) {
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
export async function collectedHeartbeat(stateDir: string, agent: Agent) {
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

export function workspaceRoot(stateDir: string, path: string) {
  return resolve(stateDir, path);
}
