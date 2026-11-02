import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";
import { collect } from "../src/collect.ts";
import { ExportError } from "../src/error.ts";
import { canonical } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

async function treeHashes(
  home: string,
  relative = "",
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (
    const entry of await readdir(join(home, relative), { withFileTypes: true })
  ) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, await treeHashes(home, path));
    } else {result[path] = createHash("sha256").update(
        await readFile(join(home, path)),
      ).digest("hex");}
  }
  return result;
}

Deno.test("collector is deterministic, read-only and projects six explicit agents", async () => {
  const fixture = await createFixture();
  try {
    const before = await treeHashes(fixture.home);
    const first = await collect(fixture.home);
    assert.equal(canonical(first), canonical(await collect(fixture.home)));
    assert.deepEqual(await treeHashes(fixture.home), before);
    assert.deepEqual(first.agents.map((agent) => agent.id), [
      "client",
      "coach",
      "devbox",
      "field",
      "lead",
      "secretary",
    ]);
    assert.ok(first.agents.every((agent) => !agent.implicit));
    assert.ok(first.cron.some((job) => job.agentId === "main"));
    assert.ok(first.plaintextSecretCount > 0);
    assert.ok(
      first.agents.some((agent) => agent.workspace.instructions.length > 0),
    );
    assert.ok(first.agents.some((agent) => agent.workspace.skills.length > 0));
    const serialized = canonical(first);
    assert.doesNotMatch(serialized, /CANARY-/);
    assert.doesNotMatch(serialized, EMAIL_ADDRESS_PATTERN.pattern);
    assert.doesNotMatch(serialized, JWT_PATTERN.pattern);
    assert.doesNotMatch(
      serialized,
      /Fixture placeholder|original skill is private|original file \(/,
    );
    for (const id of ["field", "secretary", "client"]) {
      const agent = first.agents.find((candidate) => candidate.id === id)!;
      assert.ok(
        !agent.grants.some((grant) =>
          grant.tool === "process" || grant.tool === "gateway"
        ),
        id,
      );
    }
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("collector detects optional Git marker and counts config backups", async () => {
  const fixture = await createFixture();
  const versioned = await createFixture({ git: true, backups: 3 });
  try {
    const plain = await collect(fixture.home);
    const changed = await collect(versioned.home);
    assert.equal(plain.backupCount, 0);
    assert.ok(plain.agents.every((agent) => !agent.workspace.versioned));
    assert.equal(changed.backupCount, 3);
    assert.equal(
      changed.agents.find((agent) => agent.id === "lead")!.workspace.versioned,
      true,
    );
    assert.ok(
      changed.agents.filter((agent) => agent.id !== "lead").every((agent) =>
        !agent.workspace.versioned
      ),
    );
  } finally {
    await fixture.cleanup();
    await versioned.cleanup();
  }
});

Deno.test("collector rejects malformed config with a coded error without input echo", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(
      join(fixture.home, "openclaw.json"),
      '{"token":"CANARY-INVALID-INPUT"',
    );
    await assert.rejects(() => collect(fixture.home), (error: unknown) => {
      assert.ok(error instanceof ExportError);
      assert.ok(error.code.length > 0);
      assert.doesNotMatch(JSON.stringify(error), /CANARY-|token/);
      return true;
    });
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("collector follows inner skill symlinks, skips outer ones, flags broken ones and ignores other files", async () => {
  const fixture = await createFixture();
  const outside = await Deno.makeTempDir();
  try {
    const lead = join(fixture.home, "workspace");
    await writeFile(join(lead, "private-client-notes.txt"), "CANARY-FILE-1");
    await mkdir(join(lead, "lib", "inner"), { recursive: true });
    await writeFile(
      join(lead, "lib", "inner", "SKILL.md"),
      "---\nname: inner\n---\n",
    );
    await symlink(join(lead, "lib", "inner"), join(lead, "skills", "inner"));
    await symlink(
      join(lead, "skills", "skill-s"),
      join(lead, "skills", "skill-s-link"),
    );
    await mkdir(join(outside, "shared"));
    await writeFile(
      join(outside, "shared", "SKILL.md"),
      "---\nname: shared\n---\n",
    );
    await symlink(join(outside, "shared"), join(lead, "skills", "shared"));
    await symlink(join(outside, "deleted"), join(lead, "skills", "broken"));
    await writeFile(join(outside, "notes.md"), "CANARY-FILE-2");
    await symlink(join(outside, "notes.md"), join(lead, "NOTES.md"));
    const snapshot = await collect(fixture.home);
    const agent = snapshot.agents.find((a) => a.id === "lead")!;
    const ids = agent.workspace.skills.map((s) => s.id);
    assert.ok(ids.includes("inner") && ids.includes("skill-s"));
    // The same real skill folder is collected once.
    assert.ok(!ids.includes("skill-s-link"));
    assert.ok(!ids.includes("shared"));
    assert.deepEqual(agent.workspace.malformedSkills, ["skills/broken"]);
    assert.ok(!agent.workspace.instructions.some((f) => f.path === "NOTES.md"));
    assert.ok(
      snapshot.ambiguities.some((f) =>
        f.code === "INSTRUCTION_OUTSIDE_ROOT" && f.subject === "lead"
      ),
    );
    assert.ok(
      snapshot.ambiguities.some((f) =>
        f.code === "SKILL_SYMLINK_OUTSIDE_ROOT" && f.subject === "lead"
      ),
    );
    assert.doesNotMatch(canonical(snapshot), /private-client-notes|CANARY-/);
  } finally {
    await fixture.cleanup();
    await Deno.remove(outside, { recursive: true });
  }
});

Deno.test("2026.10 keyed agents.entries give the same agents as agents.list", async () => {
  const listed = await createFixture();
  const keyed = await createFixture();
  try {
    const path = join(keyed.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.agents.entries = Object.fromEntries(
      config.agents.list.map(({ id, ...rest }: { id: string }) => [id, rest]),
    );
    delete config.agents.list;
    await writeFile(path, JSON.stringify(config));
    const a = await collect(listed.home), b = await collect(keyed.home);
    assert.ok(b.agents.some((agent) => agent.id === "secretary"));
    assert.equal(canonical(b.agents), canonical(a.agents));
  } finally {
    await listed.cleanup();
    await keyed.cleanup();
  }
});

Deno.test("2026.10 exec modes keep the no-approval posture visible", async () => {
  const posture = async (version: string, exec: unknown) => {
    const fixture = await createFixture();
    try {
      const path = join(fixture.home, "openclaw.json");
      const config = JSON.parse(await readFile(path, "utf8"));
      config.meta.lastTouchedVersion = version;
      if (exec === undefined) delete config.tools.exec;
      else config.tools.exec = exec;
      await writeFile(path, JSON.stringify(config));
      const lead = (await collect(fixture.home)).agents.find((a) =>
        a.id === "lead"
      )!;
      return `${lead.execution.security}/${lead.execution.ask}`;
    } finally {
      await fixture.cleanup();
    }
  };
  assert.equal(await posture("2026.10.9", { mode: "full" }), "full/off");
  assert.equal(
    await posture("2026.10.9", { mode: "ask" }),
    "allowlist/on-miss",
  );
  assert.equal(await posture("2026.10.9", undefined), "full/off");
  assert.equal(await posture("2026.6.10", undefined), "unknown/unknown");
});

Deno.test("plugin inventory keeps tool-declaring plugins and manifest optional flags, never paths", async () => {
  const fixture = await createFixture();
  try {
    const without = await collect(fixture.home);
    assert.equal(without.plugins, null);
    assert.ok(
      without.ambiguities.some((f) => f.code === "PLUGIN_INVENTORY_ABSENT"),
    );
    const snapshot = await collect(fixture.home, fixture.plugins);
    const plugin = (
      id: string,
      enabled: boolean,
      tools: string[],
      optional = false,
    ) => ({
      id,
      enabled,
      tools,
      optionalTools: optional ? tools : [],
    });
    assert.deepEqual(snapshot.plugins, [
      plugin("browser", true, ["browser"]),
      plugin("memory-core", true, ["memory_get", "memory_search"]),
      plugin("stock-quotes", true, ["stock_quote"]),
      plugin("whatsapp", true, ["whatsapp_login"], true),
      plugin("workboard", false, ["board_claim", "board_list"], true),
    ]);
    assert.ok(
      !snapshot.ambiguities.some((f) => f.code === "PLUGIN_INVENTORY_ABSENT"),
    );
    const lead = snapshot.agents.find((a) => a.id === "lead")!;
    assert.ok(lead.grants.some((g) => g.id === "host:stock_quote"));
    assert.doesNotMatch(
      canonical(snapshot),
      /CANARY-|openclaw-export-fixture-/,
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("a plugin listed with tools but no readable manifest fails with a coded error", async () => {
  const fixture = await createFixture();
  try {
    const { plugins } = fixture.plugins as {
      plugins: { id: string; rootDir: string }[];
    };
    const root = plugins.find((p) => p.id === "stock-quotes")!.rootDir;
    await rm(join(root, "openclaw.plugin.json"));
    await assert.rejects(
      () => collect(fixture.home, fixture.plugins),
      (error: unknown) =>
        error instanceof ExportError &&
        error.code === "PLUGIN_MANIFEST_READ_FAILED",
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("a cron job without agentId is kept unassigned with a finding", async () => {
  const fixture = await createFixture();
  try {
    const db = new DatabaseSync(
      join(fixture.home, "state", "openclaw.sqlite"),
    );
    const row = db.prepare("SELECT job_id, job_json FROM cron_jobs LIMIT 1")
      .get()!;
    const job = JSON.parse(String(row.job_json));
    delete job.agentId;
    db.prepare("UPDATE cron_jobs SET job_json = ? WHERE job_id = ?")
      .run(JSON.stringify(job), row.job_id as string);
    db.close();
    const snapshot = await collect(fixture.home);
    assert.equal(
      snapshot.cron.find((j) => j.id === row.job_id)!.agentId,
      null,
    );
    assert.ok(
      snapshot.ambiguities.some((f) =>
        f.code === "CRON_AGENT_UNRESOLVED" && f.subject === row.job_id
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});
