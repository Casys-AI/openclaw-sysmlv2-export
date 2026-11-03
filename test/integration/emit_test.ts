import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";
import { collect } from "../src/collect.ts";
import { doctor } from "../src/doctor.ts";
import { emit, name } from "../src/emit.ts";
import { canonical } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

Deno.test("fixture output is deterministic, sanitized, and matches reviewed goldens", async () => {
  const fixture = await createFixture({ git: true, backups: 2 });
  try {
    const snapshot = await collect(fixture.home, fixture.plugins);
    const files = emit(snapshot);
    const repeated = await collect(fixture.home, fixture.plugins);
    assert.equal(canonical(snapshot), canonical(repeated));
    assert.deepEqual([...files], [...emit(repeated)]);

    const outputs = new Map([
      ["snapshot.json", canonical(snapshot)],
      ...files,
      ["findings.json", canonical(doctor(snapshot))],
    ]);
    assert.deepEqual([...outputs.keys()].sort(), [
      "OpenClawImport.sysml",
      "OpenClawInstance.sysml",
      "findings.json",
      "snapshot.json",
    ]);
    for (const [name, output] of outputs) {
      assert.doesNotMatch(output, /CANARY-/);
      assert.doesNotMatch(output, EMAIL_ADDRESS_PATTERN.pattern);
      assert.doesNotMatch(output, JWT_PATTERN.pattern);
      assert.equal(
        output,
        await readFile(new URL(`./golden/${name}`, import.meta.url), "utf8"),
        name,
      );
    }
    const instance = files.get("OpenClawInstance.sysml")!;
    assert.doesNotMatch(
      instance,
      /lastRun|consecutiveErrors|hasLastError|createdAt/i,
    );
    const changed = structuredClone(snapshot);
    for (const job of changed.cron) {
      job.runtime = {
        lastRunStatus: "runtime-only-marker",
        lastRunAtMs: 123456789,
        consecutiveErrors: 99,
        hasLastError: true,
        createdAtMs: 987654321,
      };
    }
    assert.deepEqual([...files], [...emit(changed)]);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("memory emission omits unset metadata while keeping empty inventory counts", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await collect(fixture.home);
    for (const agent of snapshot.agents) {
      agent.workspace.instructions = agent.workspace.instructions.filter((f) =>
        f.path !== "MEMORY.md"
      );
      agent.memory.search.provider = null;
      agent.memory.search.model = null;
      agent.memory.search.fallback = null;
      agent.memory.search.rememberAcrossConversations = null;
      agent.memory.daily = {
        count: 0,
        firstDate: null,
        lastDate: null,
        bytes: 0,
        sha256: null,
      };
    }
    snapshot.memoryBackend = {
      slot: null,
      dreaming: { enabled: null, frequency: null, timezone: null },
      activeMemory: null,
    };
    const instance = emit(snapshot).get("OpenClawInstance.sysml")!;
    assert.equal(
      [...instance.matchAll(/part :>> memory \{/g)].length,
      snapshot.agents.length,
    );
    assert.match(instance, /attribute :>> dailyCount = 0;/);
    assert.match(instance, /part memoryBackend : MemoryBackend/);
    assert.doesNotMatch(
      instance,
      /attribute :>> (?:curated\w+|searchProvider|searchModel|searchFallback|rememberAcrossConversations|dailyFirstDate|dailyLastDate|dailySha256|slot|dreaming\w+|activeMemory\w+|persistTranscripts) =/,
    );
    assert.doesNotMatch(instance, /= (?:null|undefined);/);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("agent links reference known parts and retain wildcard, unresolved, and absent targets", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await collect(fixture.home);
    const lead = snapshot.agents.find((a) => a.id === "lead")!;
    lead.delegation = ["coach", "*", "missing"];
    snapshot.agents = [lead, snapshot.agents.find((a) => a.id === "coach")!];
    snapshot.agents[1].delegation = [];
    snapshot.messaging = {
      enabled: false,
      allowedTargets: ["coach", "*", "missing"],
    };
    snapshot.hooks = ["coach", "missing"].map((agentId) => ({
      id: agentId,
      name: agentId,
      agentId,
      channel: null,
      template: null,
    }));
    snapshot.cron = ["coach", "missing", null].map((agentId, i) => ({
      ...snapshot.cron[0],
      id: `link-${i}`,
      agentId,
    }));
    const instance = emit(snapshot).get("OpenClawInstance.sysml")!;
    const body = (header: string) => {
      const start = instance.indexOf(`${header} {`);
      assert.ok(start >= 0, header);
      return instance.slice(start, instance.indexOf("\n        }", start));
    };
    assert.deepEqual(
      instance.match(/connection .* : DelegationRule connect .*;/g),
      [
        "connection 'delegation_lead:coach' : DelegationRule connect Operators::agent_lead to Operators::agent_coach;",
      ],
    );
    const delegation = body("part delegationPolicy_lead : DelegationPolicy");
    assert.match(delegation, /ref part :>> fromAgent = Operators::agent_lead;/);
    assert.match(delegation, /attribute :>> wildcardTargets = true;/);
    assert.ok(delegation.includes(
      'attribute :>> unresolvedTargets = "[\\"missing\\"]";',
    ));
    const messaging = body("part messaging : MessagingPolicy");
    assert.match(messaging, /attribute :>> enabled = false;/);
    assert.match(messaging, /attribute :>> wildcardTargets = true;/);
    assert.match(
      messaging,
      /ref part messagingTarget_coach :> targets = Operators::agent_coach;/,
    );
    assert.doesNotMatch(messaging, /messagingTarget_(?:missing|\*)/);
    for (
      const header of [
        "part hook_coach : ExternalTrigger",
        "part 'cron_link-0' : ScheduledCase",
        "part heartbeat_lead : ScheduledCase",
      ]
    ) {
      assert.match(
        body(header),
        /ref part :>> targetAgent = Operators::agent_/,
      );
      assert.doesNotMatch(
        body(header),
        /attribute :>> (?:targetAgent|unresolvedTarget)/,
      );
    }
    for (
      const header of [
        "part hook_missing : ExternalTrigger",
        "part 'cron_link-1' : ScheduledCase",
      ]
    ) {
      assert.match(body(header), /attribute :>> unresolvedTarget = "missing";/);
      assert.doesNotMatch(body(header), /ref part :>> (?:targetAgent|owner)/);
    }
    assert.doesNotMatch(
      body("part 'cron_link-2' : ScheduledCase"),
      /targetAgent|unresolvedTarget|ref part :>> owner/,
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("granted tools are catalogued once by origin; CLI commands are granted on exec's layer", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await collect(fixture.home, fixture.plugins);
    const agent = snapshot.agents.find((a) => a.id === "lead")!;
    snapshot.agents = [agent];
    const catalog = (text: string) =>
      new Map(
        [...text.matchAll(
          /part (\S+) :> tools \{\n\s+attribute :>> toolId = "[^"]+";\n\s+attribute :>> origin = ToolOrigin::(\w+);\n(?:\s+attribute :>> provider = "([^"]+)";)?/g,
        )].map((m) => [m[1], [m[2], m[3] ?? null]]),
      );
    const instance = emit(snapshot).get("OpenClawInstance.sysml")!;
    const tools = catalog(instance);
    const references = [
      ...instance.matchAll(/ref :>> tool = Tools::toolCatalog\.(\S+);/g),
    ].map((m) => m[1]);
    assert.deepEqual(new Set(references), new Set(tools.keys()));
    for (
      const [tool, origin, provider] of [
        ["exec", "builtin", null],
        ["memory_search", "plugin", "memory-core"],
        ["outlook-graph__*", "mcp", "Outlook Graph"],
        ["cli:git", "cli", "exec"],
      ]
    ) assert.deepEqual(tools.get(name("tool", tool!)), [origin, provider]);
    assert.doesNotMatch(instance, /bundle-mcp|CommandGrant/);

    for (const layer of ["host", "sandbox"] as const) {
      agent.grants = [{ id: `${layer}:exec`, tool: "exec", layer }];
      agent.execution.effective.security = "allowlist";
      const allowed = emit(snapshot).get("OpenClawInstance.sysml")!;
      for (const c of agent.execution.commands) {
        assert.equal(
          catalog(allowed).get(name("tool", `cli:${c.command}`))?.[0],
          "cli",
        );
        assert.ok(allowed.includes(
          `item ${name("grant", `lead:${layer}:cli:${c.id}`)} : ToolGrant {\n` +
            `            ref :>> tool = Tools::toolCatalog.${
              name("tool", `cli:${c.command}`)
            };\n` +
            `            attribute :>> layer = "${layer}";\n` +
            `            attribute :>> commandKind = "${c.kind}";\n` +
            `            attribute :>> argsRestricted = ${c.argsRestricted};`,
        ));
      }
    }
    for (const security of ["full", "deny"]) {
      agent.execution.effective.security = security;
      assert.doesNotMatch(
        emit(snapshot).get("OpenClawInstance.sysml")!,
        /ToolOrigin::cli|commandKind/,
      );
    }
    snapshot.execApprovals = null;
    assert.doesNotMatch(
      emit(snapshot).get("OpenClawInstance.sysml")!,
      /part execApprovals/,
    );
  } finally {
    await fixture.cleanup();
  }
});
