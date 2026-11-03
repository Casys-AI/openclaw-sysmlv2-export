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
import { doctor } from "../src/doctor.ts";
import { ExportError } from "../src/error.ts";
import { canonical, type Snapshot } from "../src/snapshot.ts";
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
        f.code === "INSTRUCTION_OUTSIDE_ROOT" && f.subject === "agent:lead"
      ),
    );
    assert.ok(
      snapshot.ambiguities.some((f) =>
        f.code === "SKILL_SYMLINK_OUTSIDE_ROOT" && f.subject === "agent:lead"
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
      delete config.agents.list.find((a: { id: string }) => a.id === "lead")
        .tools.exec;
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

Deno.test("2026.10 messaging defaults on but respects an explicit disable", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.meta.lastTouchedVersion = "2026.10.9";
    for (const enabled of [undefined, false]) {
      config.tools.agentToAgent = { enabled, allow: ["*"] };
      await writeFile(path, JSON.stringify(config));
      assert.equal(
        (await collect(fixture.home)).messaging.enabled,
        enabled !== false,
      );
    }
  } finally {
    await fixture.cleanup();
  }
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
      toolProfiles: id === "stock-quotes"
        ? [{ id: "stock_quote", profiles: ["coding"] }]
        : [],
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
        f.code === "CRON_AGENT_UNRESOLVED" && f.subject === `cron:${row.job_id}`
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("memory search resolves legacy and current sources with per-agent field overrides", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    const search = (s: Snapshot, id = "lead") =>
      s.agents.find((a) => a.id === id)!.memory.search;
    const expected = {
      enabled: true,
      provider: "local",
      model: null,
      fallback: "none",
      sources: ["memory"],
      rememberAcrossConversations: null,
      extraPathCount: 0,
      multimodal: false,
    };
    assert.deepEqual(search(await collect(fixture.home)), expected);
    const field = config.agents.list.find((a: { id: string }) =>
      a.id === "field"
    );
    field.memorySearch = { enabled: false };
    await writeFile(path, JSON.stringify(config));
    assert.deepEqual(search(await collect(fixture.home), "field"), {
      ...expected,
      enabled: false,
    });

    config.memory = {
      search: {
        provider: "openai",
        sources: ["memory", "sessions"],
        extraPaths: ["CANARY-PATH-30"],
      },
    };
    field.memorySearch = { enabled: true, provider: "none" };
    field.memory = { search: { enabled: false } };
    for (const keyed of [false, true]) {
      if (keyed) {
        config.agents.entries = Object.fromEntries(
          config.agents.list.map((
            { id, ...entry }: { id: string },
          ) => [id, entry]),
        );
        delete config.agents.list;
      }
      await writeFile(path, JSON.stringify(config));
      const snapshot = await collect(fixture.home);
      const current = {
        ...expected,
        provider: "openai",
        fallback: null,
        sources: ["memory", "sessions"],
        extraPathCount: 1,
      };
      assert.deepEqual(search(snapshot), current);
      assert.deepEqual(search(snapshot, "field"), {
        ...current,
        enabled: false,
      });
      assert.doesNotMatch(canonical(snapshot), /CANARY-/);
    }
    // An explicitly empty current source suppresses the legacy default source.
    config.memory.search = {};
    await writeFile(path, JSON.stringify(config));
    assert.deepEqual(search(await collect(fixture.home)), {
      ...expected,
      provider: "openai",
      fallback: null,
    });
    delete config.memory;
    delete config.agents.defaults.memorySearch;
    config.memorySearch = {
      provider: "none",
      model: "fixture-embedding",
      sources: ["sessions"],
      rememberAcrossConversations: true,
      extraPaths: ["CANARY-PATH-31"],
      multimodal: { enabled: true },
    };
    config.agents.entries.field.memory.search = {
      sources: [],
      rememberAcrossConversations: false,
      extraPaths: [],
      multimodal: { enabled: false },
    };
    await writeFile(path, JSON.stringify(config));
    const snapshot = await collect(fixture.home);
    assert.deepEqual(search(snapshot), {
      ...expected,
      provider: "none",
      model: "fixture-embedding",
      fallback: null,
      sources: ["sessions"],
      rememberAcrossConversations: true,
      extraPathCount: 1,
      multimodal: true,
    });
    assert.deepEqual(search(snapshot, "field"), {
      ...search(snapshot),
      sources: [],
      rememberAcrossConversations: false,
      extraPathCount: 0,
      multimodal: false,
    });
    assert.doesNotMatch(canonical(snapshot), /CANARY-/);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("memory inventory hashes direct daily notes and counts other Markdown without following links", async () => {
  const fixture = await createFixture();
  try {
    const memory = join(fixture.home, "workspace", "memory");
    const outside = join(fixture.home, "CANARY-MEMORY-DIR");
    await mkdir(outside);
    await writeFile(join(outside, "2026-06-09.md"), "CANARY-MEMORY-6");
    await symlink(
      join(outside, "2026-06-09.md"),
      join(memory, "2026-06-09.md"),
    );
    await symlink(outside, join(memory, "CANARY-LINK"));
    await mkdir(join(memory, ".CANARY-HIDDEN"));
    await writeFile(
      join(memory, ".CANARY-HIDDEN", "notes.md"),
      "CANARY-MEMORY-7",
    );
    const first = await collect(fixture.home);
    const lead = first.agents.find((a) => a.id === "lead")!;
    const lines: string[] = [];
    let bytes = 0;
    for (
      const [date, name] of [
        ["2026-06-01", "2026-06-01.md"],
        ["2026-06-02", "2026-06-02-CANARY-SLUG-1.md"],
      ]
    ) {
      const body = await readFile(join(memory, name));
      bytes += body.byteLength;
      const hash = createHash("sha256").update(body).digest("hex");
      lines.push(`${date} ${hash} ${body.byteLength}\n`);
    }
    assert.deepEqual(lead.memory.daily, {
      count: 2,
      firstDate: "2026-06-01",
      lastDate: "2026-06-02",
      bytes,
      sha256: createHash("sha256").update(lines.sort().join("")).digest("hex"),
    });
    assert.equal(lead.memory.otherCount, 2);
    assert.equal(
      first.agents.find((a) => a.id === "field")!.memory.daily.count,
      1,
    );
    const empty = first.agents.find((a) => a.id === "client")!.memory;
    assert.deepEqual(empty.daily, {
      count: 0,
      firstDate: null,
      lastDate: null,
      bytes: 0,
      sha256: null,
    });
    assert.equal(empty.otherCount, 0);
    const repeated = await collect(fixture.home);
    assert.equal(canonical(first), canonical(repeated));
    assert.doesNotMatch(canonical(first), /CANARY-SLUG|CANARY-MEMORY|CANARY-/);

    const fieldMemory = join(fixture.home, "workspace-field", "memory");
    await rm(fieldMemory, { recursive: true });
    await symlink(outside, fieldMemory);
    const escaped = (await collect(fixture.home)).agents.find((a) =>
      a.id === "field"
    )!;
    assert.deepEqual(escaped.memory.daily, empty.daily);
    assert.equal(escaped.memory.otherCount, 0);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("memory backend projects only allowed settings and both Active Memory enablement gates", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    const snapshot = await collect(fixture.home);
    assert.deepEqual(snapshot.memoryBackend, {
      slot: null,
      dreaming: { enabled: true, frequency: "0 3 * * *", timezone: null },
      activeMemory: {
        enabled: true,
        agents: ["lead"],
        allowedChatTypes: ["direct"],
        persistTranscripts: false,
      },
    });
    assert.doesNotMatch(
      canonical(snapshot),
      /CANARY-|promptAppend|allowedChatIds/,
    );
    config.plugins.slots = { memory: "memory-core" };
    config.plugins.entries["memory-core"].config.dreaming.timezone = "UTC";
    const active = config.plugins.entries["active-memory"];
    Object.assign(active.config, {
      agents: ["lead", "field", "lead"],
      allowedChatTypes: ["group", "direct", "group"],
      promptOverride: "CANARY-PROMPT-3",
      deniedChatIds: ["CANARY-PEER-10"],
      transcriptDir: "CANARY-PATH-32",
      model: "CANARY-MODEL-1",
    });
    delete active.config.enabled;
    delete active.config.persistTranscripts;
    await writeFile(path, JSON.stringify(config));
    const changed = await collect(fixture.home);
    assert.deepEqual(changed.memoryBackend, {
      slot: "memory-core",
      dreaming: { enabled: true, frequency: "0 3 * * *", timezone: "UTC" },
      activeMemory: {
        enabled: true,
        agents: ["field", "lead"],
        allowedChatTypes: ["direct", "group"],
        persistTranscripts: null,
      },
    });
    assert.doesNotMatch(
      canonical(changed),
      /CANARY-|promptOverride|deniedChatIds|transcriptDir/,
    );
    for (
      const [pluginEnabled, configEnabled] of [[false, true], [true, false], [
        undefined,
        true,
      ]]
    ) {
      active.enabled = pluginEnabled;
      active.config.enabled = configEnabled;
      await writeFile(path, JSON.stringify(config));
      assert.equal(
        (await collect(fixture.home)).memoryBackend.activeMemory!.enabled,
        false,
      );
    }
    delete config.plugins.entries["active-memory"];
    delete config.plugins.entries["memory-core"].config;
    await writeFile(path, JSON.stringify(config));
    const absent = (await collect(fixture.home)).memoryBackend;
    assert.equal(absent.activeMemory, null);
    assert.deepEqual(absent.dreaming, {
      enabled: null,
      frequency: null,
      timezone: null,
    });
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("MCP projection keeps server metadata, names and counts only", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await collect(fixture.home, fixture.plugins);
    assert.deepEqual(snapshot.mcpServers, [
      {
        id: "9tools",
        toolPrefix: "mcp-9tools",
        enabled: false,
        transport: "sse",
        oauth: false,
        oauthIdentity: null,
        toolFilter: { include: [], exclude: [] },
        envNames: [],
        headerNames: [],
        argCount: 0,
      },
      {
        id: "Outlook Graph",
        toolPrefix: "outlook-graph",
        enabled: true,
        transport: "streamable-http",
        oauth: true,
        oauthIdentity: "per-requester",
        toolFilter: { include: [], exclude: [] },
        envNames: [],
        headerNames: ["Authorization"],
        argCount: 0,
      },
      {
        id: "docs",
        toolPrefix: "docs",
        enabled: true,
        transport: "stdio",
        oauth: false,
        oauthIdentity: null,
        toolFilter: { include: ["search_*"], exclude: [] },
        envNames: ["DOCS_TOKEN"],
        headerNames: [],
        argCount: 2,
      },
    ]);
    assert.ok(!snapshot.plugins!.some((p) => p.id === "bundle-mcp"));
    const lead = snapshot.agents.find((a) => a.id === "lead")!;
    assert.ok(lead.grants.some((g) => g.tool === "docs__*"));
    assert.ok(lead.grants.some((g) => g.tool === "outlook-graph__*"));
    assert.ok(
      !snapshot.agents.some((a) =>
        a.grants.some((g) => g.tool === "mcp-9tools__*")
      ),
    );
    assert.doesNotMatch(canonical(snapshot), /CANARY-/);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("MCP prefixes preserve redacted dictionary keys and declaration-order collisions", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    const long = "x".repeat(35);
    config.mcp.servers = Object.fromEntries([
      ["token", { command: "CANARY-COMMAND-3" }],
      ["docs!", { command: "CANARY-COMMAND-4", enabled: false }],
      ["Docs?", { url: "CANARY-URL-3", type: "http" }],
      ["DOCS-", { url: "CANARY-URL-4" }],
      [long, { url: "CANARY-URL-5" }],
      [long + "a", { url: "CANARY-URL-6" }],
      ["  ", { url: "CANARY-URL-7" }],
    ]);
    await writeFile(path, JSON.stringify(config));
    const snapshot = await collect(fixture.home);
    assert.deepEqual(snapshot.mcpServers.map((s) => [s.id, s.toolPrefix]), [
      ["  ", "mcp"],
      ["DOCS-", "docs--3"],
      ["Docs?", "docs--2"],
      ["docs!", "docs-"],
      ["token", "token"],
      [long, "x".repeat(30)],
      [long + "a", "x".repeat(28) + "-2"],
    ]);
    assert.equal(
      snapshot.mcpServers.find((s) => s.id === "Docs?")!.transport,
      "streamable-http",
    );
    assert.doesNotMatch(canonical(snapshot), /CANARY-/);
    delete config.mcp;
    await writeFile(path, JSON.stringify(config));
    assert.deepEqual((await collect(fixture.home)).mcpServers, []);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("MCP rejects ambiguous, missing and unsupported transports with a coded error", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    for (
      const server of [
        { command: "CANARY-COMMAND-5", url: "CANARY-URL-8" },
        { transport: "stdio" },
        { url: "CANARY-URL-9", transport: "unsupported" },
        { url: "CANARY-URL-10", transport: null },
      ]
    ) {
      config.mcp.servers = { docs: server };
      await writeFile(path, JSON.stringify(config));
      await assert.rejects(() => collect(fixture.home), (error: unknown) => {
        assert.ok(error instanceof ExportError);
        assert.equal(error.code, "INVALID_INPUT");
        assert.equal(error.context, "Unsupported MCP server transport");
        assert.doesNotMatch(JSON.stringify(error), /CANARY-/);
        return true;
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("exec projects safe bins and SQLite allowlists without private metadata", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await collect(fixture.home);
    const execution = snapshot.agents.find((a) => a.id === "lead")!.execution;
    assert.deepEqual(execution, {
      host: "auto",
      mode: null,
      security: "allowlist",
      ask: "on-miss",
      approvals: { security: "allowlist", ask: "on-miss" },
      effective: { security: "allowlist", ask: "on-miss" },
      elevated: true,
      elevatedChannelsCount: 1,
      safeBins: ["jq", "python3", "wc"],
      safeBinProfiles: ["wc"],
      trustedDirCount: 1,
      pathPrependCount: 1,
      strictInlineEval: false,
      commands: [
        { id: "name:rg", command: "rg", kind: "name", argsRestricted: false },
        { id: "path:git", command: "git", kind: "path", argsRestricted: true },
        {
          id: "safe-bin:python3",
          command: "python3",
          kind: "safe-bin",
          argsRestricted: true,
        },
        {
          id: "safe-bin:wc",
          command: "wc",
          kind: "safe-bin",
          argsRestricted: true,
        },
      ],
    });
    assert.deepEqual(snapshot.execApprovals, {
      defaults: {
        security: "allowlist",
        ask: "on-miss",
        askFallback: "deny",
        autoAllowSkills: false,
      },
      wildcardCommands: [{
        id: "path:*",
        command: "*",
        kind: "path",
        argsRestricted: false,
      }],
    });
    assert.ok(
      snapshot.agents.every((a) =>
        !a.execution.commands.some((c) => c.command === "*")
      ),
    );
    assert.doesNotMatch(
      canonical(snapshot),
      /CANARY-|argPattern|lastUsedCommand|lastResolvedPath|socket/,
    );
    const db = new DatabaseSync(join(fixture.home, "state", "openclaw.sqlite"));
    try {
      db.exec("DELETE FROM exec_approvals_config WHERE config_key = 'current'");
    } finally {
      db.close();
    }
    assert.equal((await collect(fixture.home)).execApprovals, null);
    const withoutRow = new DatabaseSync(
      join(fixture.home, "state", "openclaw.sqlite"),
    );
    try {
      withoutRow.exec("DROP TABLE exec_approvals_config");
    } finally {
      withoutRow.close();
    }
    const absent = await collect(fixture.home);
    assert.equal(absent.execApprovals, null);
    assert.ok(
      absent.agents.every((a) =>
        a.execution.effective.security === a.execution.security &&
        a.execution.effective.ask === a.execution.ask
      ),
    );
    assert.ok(
      absent.agents.find((a) => a.id === "lead")!.execution.commands.every((
        c,
      ) => c.kind === "safe-bin"),
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("exec replaces agent lists, merges profile keys and leaves default safe bins unresolved", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    const lead = config.agents.list.find((a: { id: string }) =>
      a.id === "lead"
    );
    config.tools.exec.strictInlineEval = true;
    Object.assign(lead.tools.exec, {
      safeBins: [],
      safeBinProfiles: { python3: {}, wc: {} },
      safeBinTrustedDirs: [],
      pathPrepend: [],
      strictInlineEval: false,
    });
    await writeFile(path, JSON.stringify(config));
    const execution = (await collect(fixture.home)).agents.find((a) =>
      a.id === "lead"
    )!.execution;
    assert.deepEqual(execution.safeBins, []);
    assert.deepEqual(execution.safeBinProfiles, ["python3", "wc"]);
    assert.equal(execution.trustedDirCount, 0);
    assert.equal(execution.pathPrependCount, 0);
    assert.equal(execution.strictInlineEval, false);
    assert.ok(execution.commands.every((c) => c.kind !== "safe-bin"));
    lead.tools.exec.safeBins = ["awk", "sed", "jq", "wc", "wc"];
    await writeFile(path, JSON.stringify(config));
    assert.deepEqual(
      (await collect(fixture.home)).agents.find((a) => a.id === "lead")!
        .execution.commands
        .filter((c) => c.kind === "safe-bin").map((c) => c.command),
      ["wc"],
    );
    delete lead.tools.exec.safeBins;
    delete config.tools.exec.safeBins;
    lead.tools.deny = ["exec"];
    await writeFile(path, JSON.stringify(config));
    const snapshot = await collect(fixture.home);
    assert.ok(snapshot.agents.every((a) => a.execution.safeBins === null));
    assert.ok(
      snapshot.agents.every((a) =>
        !a.execution.commands.some((c) => c.kind === "safe-bin")
      ),
    );
    assert.deepEqual(
      doctor(snapshot).filter((f) => f.code === "SAFE_BINS_DEFAULT_UNRESOLVED")
        .map((f) => f.subject).sort(),
      snapshot.agents.filter((a) => a.grants.some((g) => g.tool === "exec"))
        .map((a) => `agent:${a.id}`).sort(),
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("exec collapses command identities and preserves restrictions only when every entry restricts args", async () => {
  const fixture = await createFixture();
  try {
    const db = new DatabaseSync(join(fixture.home, "state", "openclaw.sqlite"));
    try {
      db.prepare(
        "UPDATE exec_approvals_config SET raw_json = ? WHERE config_key = 'current'",
      ).run(JSON.stringify({
        agents: {
          lead: {
            allowlist: [
              { pattern: "CANARY-DIR-2/bin/git", argPattern: "CANARY-ARGS-2" },
              { pattern: "CANARY-DIR-3/bin/git" },
              { pattern: "rg", argPattern: "CANARY-ARGS-3" },
              { pattern: "rg", argPattern: "" },
              { pattern: "git*" },
            ],
          },
        },
      }));
    } finally {
      db.close();
    }
    const snapshot = await collect(fixture.home);
    assert.deepEqual(
      snapshot.agents.find((a) => a.id === "lead")!.execution.commands
        .filter((c) => c.kind !== "safe-bin"),
      [
        {
          id: "name:git*",
          command: "git*",
          kind: "name",
          argsRestricted: false,
        },
        { id: "name:rg", command: "rg", kind: "name", argsRestricted: true },
        { id: "path:git", command: "git", kind: "path", argsRestricted: false },
      ],
    );
    assert.deepEqual(snapshot.execApprovals, {
      defaults: {
        security: null,
        ask: null,
        askFallback: null,
        autoAllowSkills: null,
      },
      wildcardCommands: [],
    });
    assert.doesNotMatch(canonical(snapshot), /CANARY-/);
  } finally {
    await fixture.cleanup();
  }
});
