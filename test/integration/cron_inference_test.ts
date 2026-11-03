import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runExport } from "../../src/composition/openclaw.ts";
import { collect } from "../../src/adapters/out/openclaw/collector.ts";
import { ExportError } from "../../src/infrastructure/error.ts";
import { parseAgentInference } from "../../src/adapters/out/llm/inference.ts";
import { digest } from "../../src/infrastructure/redaction.ts";
import { createFixture } from "../support/fixture.ts";

const schedule = { kind: "cron", expr: "15 8 * * 1", tz: "Asia/Taipei" };
const prompts = [
  "Review synthetic queue.\nPrepare a summary.",
  "Check synthetic backlog.",
];
const answer = (agentId: string, file?: string) => ({
  agentId,
  role: "Prepares summaries. CANARY-PROMPT-ECHO",
  procedures: file
    ? [{
      id: "review-queue",
      title: "Review queue",
      trigger: "15 8 * * 1 Asia/Taipei",
      steps: [{
        id: "summarize",
        text: "Prepare summary.",
        kind: "action",
        target: null,
      }],
      source: { file, fromLine: 1, toLine: 2 },
    }]
    : [],
  rules: [],
});
const reply = (id: string, file?: string) =>
  Promise.resolve({ text: JSON.stringify(answer(id, file)) });
function job(
  home: string,
  id: string,
  agentId: string | null,
  message: string,
  enabled = true,
  kind = "agentTurn",
) {
  const db = new DatabaseSync(join(home, "state", "openclaw.sqlite"));
  try {
    db.prepare("DELETE FROM cron_jobs WHERE job_id = ?").run(id);
    db.prepare(
      "INSERT INTO cron_jobs (job_id, job_json, state_json) VALUES (?, ?, '{}')",
    ).run(
      id,
      JSON.stringify({
        id,
        name: "Synthetic job",
        agentId,
        enabled,
        schedule,
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: { kind, message },
      }),
    );
  } finally {
    db.close();
  }
}
async function setup() {
  const f = await createFixture();
  await mkdir(join(f.home, "empty"));
  const config = {
    agents: {
      entries: {
        alpha: { workspace: "empty" },
        bravo: { workspace: "workspace-field" },
      },
    },
  };
  await writeFile(join(f.home, "openclaw.json"), JSON.stringify(config));
  return { ...f, out: join(f.home, "export") };
}
async function cleanOutput(dir: string): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) await cleanOutput(path);
    else {
      const text = await readFile(path, "utf8");
      assert.doesNotMatch(text, /CANARY-/);
      for (const line of prompts.flatMap((p) => p.split("\n"))) {
        assert.ok(!text.includes(line));
      }
    }
  }
}

Deno.test("scheduled prompts reach only their agent, including disabled jobs and an empty workspace", async () => {
  const f = await setup(), received = new Map<string, string>();
  try {
    job(f.home, "active", "alpha", prompts[0]);
    job(f.home, "disabled", "alpha", prompts[1], false);
    job(f.home, "other", "bravo", "CANARY-PROMPT-OTHER");
    job(f.home, "unassigned", null, "CANARY-PROMPT-UNASSIGNED");
    job(f.home, "event", "alpha", "CANARY-PROMPT-EVENT", true, "systemEvent");
    const s = await runExport(f.home, null, f.out, (prompt, id) => {
      received.set(id, prompt);
      return reply(id, id === "alpha" ? "cron:active" : undefined);
    }, new Date("2026-11-02T12:00:00Z"));
    assert.deepEqual(s.inferred, { procedures: 1, rules: 0, failed: [] });
    const alpha = received.get("alpha")!, bravo = received.get("bravo")!;
    assert.match(
      alpha,
      /### cron:active[\s\S]*1: Review synthetic queue\.\n2: Prepare a summary\./,
    );
    assert.match(alpha, /### cron:disabled/);
    assert.match(alpha, /Scheduled task \(enabled\)/);
    assert.match(alpha, /Scheduled task \(disabled\)/);
    assert.ok(alpha.includes("15 8 * * 1") && alpha.includes("Asia/Taipei"));
    assert.doesNotMatch(alpha, /CANARY-|cron:other|cron:unassigned|cron:event/);
    assert.match(bravo, /### cron:other/);
    assert.doesNotMatch(bravo, /cron:active|cron:disabled|cron:unassigned/);
    const sysml = await readFile(
      join(s.outDir, "OpenClawInferred.sysml"),
      "utf8",
    );
    assert.ok(
      sysml.includes(`source cron:active:1-2 sha256 ${digest(prompts[0])}`),
    );
    assert.ok(sysml.includes("Trigger: 15 8 * * 1 Asia/Taipei"));
    assert.doesNotMatch(JSON.stringify(s), /CANARY-/);
    await cleanOutput(f.out);
  } finally {
    await f.cleanup();
  }
});

Deno.test("changed scheduled text or ownership is refused only for the affected agent", async (t) => {
  for (const change of ["digest", "owner"]) {
    await t.step(change, async () => {
      const f = await setup(), called: string[] = [];
      try {
        job(f.home, "first", "alpha", prompts[0]);
        job(f.home, "later", "bravo", prompts[1]);
        const s = await runExport(f.home, null, f.out, (_prompt, id) => {
          called.push(id);
          if (id === "alpha") {
            job(
              f.home,
              "later",
              change === "owner" ? "alpha" : "bravo",
              change === "digest" ? "CANARY-PROMPT-CHANGED" : prompts[1],
            );
          }
          return reply(id);
        }, new Date("2026-11-02T12:00:00Z"));
        assert.deepEqual(called, ["alpha"]);
        assert.equal(s.inferred!.failed.length, 1);
        assert.match(s.inferred!.failed[0], /^bravo: INSTRUCTION_CHANGED /);
        assert.doesNotMatch(JSON.stringify(s), /CANARY-|synthetic/);
        await cleanOutput(f.out);
      } finally {
        await f.cleanup();
      }
    });
  }
});

Deno.test("scheduled citations require an owned source that was actually sent", async () => {
  const f = await setup();
  try {
    job(f.home, "own", "alpha", prompts[0]);
    job(f.home, "foreign", "bravo", prompts[1]);
    job(f.home, "unassigned", null, prompts[1]);
    const s = await collect(f.home);
    assert.equal(
      parseAgentInference(answer("alpha", "cron:own"), s, "alpha", ["cron:own"])
        .procedures[0].source.file,
      "cron:own",
    );
    for (const file of ["cron:foreign", "cron:unassigned", "cron:missing"]) {
      assert.throws(
        () => parseAgentInference(answer("alpha", file), s, "alpha", [file]),
        ExportError,
      );
    }
    assert.throws(
      () => parseAgentInference(answer("alpha", "cron:own"), s, "alpha", []),
      ExportError,
    );
  } finally {
    await f.cleanup();
  }
});

Deno.test("heartbeat prompts use raw inherited and overridden digests with both agent configuration forms", async (t) => {
  for (const form of ["entries", "list"]) {
    await t.step(form, async () => {
      const f = await setup(), received = new Map<string, string>();
      try {
        const entries = {
          alpha: { workspace: "empty", heartbeat: {} },
          bravo: {
            workspace: "workspace-field",
            heartbeat: { prompt: prompts[1] },
          },
        };
        await writeFile(
          join(f.home, "openclaw.json"),
          JSON.stringify({
            agents: {
              defaults: { heartbeat: { every: "30m", prompt: prompts[0] } },
              [form]: form === "entries"
                ? entries
                : Object.entries(entries).map(([id, value]) => ({
                  id,
                  ...value,
                })),
            },
          }),
        );
        const snapshot = await collect(f.home);
        assert.deepEqual(
          snapshot.agents.map((a) => a.heartbeat!.prompt!.sha256),
          prompts.map(digest),
        );
        const s = await runExport(f.home, null, f.out, (prompt, id) => {
          received.set(id, prompt);
          return reply(id, id === "alpha" ? "heartbeat" : undefined);
        }, new Date("2026-11-02T12:00:00Z"));
        assert.deepEqual(s.inferred!.failed, []);
        assert.match(
          received.get("alpha")!,
          /### heartbeat[\s\S]*1: Review synthetic queue\.\n2: Prepare a summary\./,
        );
        assert.match(received.get("alpha")!, /1800000/);
        assert.ok(received.get("bravo")!.includes(prompts[1]));
        assert.ok(!received.get("bravo")!.includes(prompts[0].split("\n")[0]));
        const sysml = await readFile(
          join(s.outDir, "OpenClawInferred.sysml"),
          "utf8",
        );
        assert.ok(
          sysml.includes(`source heartbeat:1-2 sha256 ${digest(prompts[0])}`),
        );
        await cleanOutput(f.out);
      } finally {
        await f.cleanup();
      }
    });
  }
});
