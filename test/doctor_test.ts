import assert from "node:assert/strict";
import { collect } from "../src/collect.ts";
import { doctor } from "../src/doctor.ts";
import {
  approvalPolicy,
  configuredExec,
  effectiveExec,
} from "../src/execution.ts";
import type { Snapshot } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

let cached: Promise<Snapshot> | undefined;
function baseline(): Promise<Snapshot> {
  return cached ??= (async () => {
    const fixture = await createFixture();
    try {
      return await collect(fixture.home);
    } finally {
      await fixture.cleanup();
    }
  })();
}

const rules: [string, (s: Snapshot, positive: boolean) => void][] = [
  ["MCP_SANDBOX_GATE", (s, yes) => {
    for (const a of s.agents) a.sandbox.mode = "off";
    const server = s.mcpServers[0];
    server.enabled = true;
    const a = s.agents[0];
    a.sandbox.mode = "all";
    a.grants = [{
      id: "test-mcp",
      tool: `${server.toolPrefix}__*`,
      layer: yes ? "host" : "sandbox",
    }];
  }],
  ["SAFE_BIN_INTERPRETER_UNPROFILED", (s, yes) => {
    for (const a of s.agents) a.execution.safeBins = null;
    const execution = s.agents[0].execution;
    execution.safeBins = ["python3", "python3.12", "PowerShell.EXE", "wc"];
    execution.safeBinProfiles = yes
      ? ["wc"]
      : ["python3", "python3.12", " PowerShell "];
  }],
  ["EXEC_ALLOWLIST_WILDCARD", (s, yes) => {
    for (const a of s.agents) a.execution.commands = [];
    s.execApprovals!.wildcardCommands = [];
    s.agents[0].execution.commands = [{
      id: yes ? "path:*" : "name:git*",
      command: yes ? "*" : "git*",
      kind: yes ? "path" : "name",
      argsRestricted: false,
    }];
  }],
  ["EXEC_WITHOUT_APPROVAL", (s, yes) => {
    for (const a of s.agents) a.execution.effective.ask = "always";
    const a = s.agents[0];
    a.execution.host = "auto";
    a.grants.push({ id: "test-exec", tool: "exec", layer: "host" });
    a.execution.effective.security = "full";
    a.execution.effective.ask = yes ? "off" : "always";
  }],
  ["AGENT_WITHOUT_SANDBOX", (s, yes) => {
    for (const a of s.agents) a.grants = [];
    const a = s.agents[0];
    a.execution.host = "auto";
    a.execution.effective.security = "full";
    a.grants = [{
      id: "test-exec",
      tool: "exec",
      layer: yes ? "host" : "sandbox",
    }];
    a.sandbox.mode = yes ? "off" : "all";
  }],
  ["EXTERNAL_BIND_SOURCES", (s, yes) => {
    for (const a of s.agents) {
      a.sandbox.dangerouslyAllowExternalBindSources = false;
    }
    s.agents[0].sandbox.dangerouslyAllowExternalBindSources = yes;
    s.agents[0].sandbox.mode = "all";
  }],
  ["AGENT_TO_AGENT_WILDCARD", (s, yes) => {
    s.messaging.enabled = true;
    s.messaging.allowedTargets = yes ? ["*"] : ["lead"];
  }],
  ["CRON_FAILING", (s, yes) => {
    for (const job of s.cron) job.runtime.consecutiveErrors = 2;
    s.cron[0].enabled = true;
    s.cron[0].runtime.consecutiveErrors = yes ? 3 : 2;
  }],
  ["WORKSPACE_UNVERSIONED", (s, yes) => {
    for (const a of s.agents) a.workspace.versioned = true;
    s.agents[0].workspace.versioned = !yes;
  }],
  ["MANUAL_CONFIG_BACKUPS", (s, yes) => {
    s.backupCount = yes ? 1 : 0;
  }],
  ["MALFORMED_SKILLS_DIR", (s, yes) => {
    for (const a of s.agents) a.workspace.malformedSkills = [];
    s.agents[0].workspace.malformedSkills = yes
      ? ["skills/broken"]
      : ["skills/SKILL.md"];
  }],
  ["UNRESOLVED_AGENT_REFERENCE", (s, yes) => {
    for (const job of s.cron) job.agentId = s.agents[0].id;
    s.cron[0].agentId = yes ? "absent-agent" : null;
  }],
  ["BINDING_ACCOUNT_UNAVAILABLE", (s, yes) => {
    s.bindings = [{
      id: "binding-test",
      agentId: s.agents[0].id,
      account: s.accounts[0].id,
      peerKind: null,
    }];
    s.accounts[0].enabled = !yes;
  }],
  ["UNRESOLVED_BINDING_REFERENCE", (s, yes) => {
    s.bindings = [{
      id: "binding-test",
      agentId: yes ? "absent-agent" : s.agents[0].id,
      account: s.accounts[0].id,
      peerKind: null,
    }];
  }],
  ["MEMORY_SESSIONS_INDEXED", (s, yes) => {
    for (const a of s.agents) {
      a.memory.search.sources = ["memory"];
      a.memory.search.rememberAcrossConversations = false;
    }
    s.agents[0].memory.search.enabled = true;
    s.agents[0].memory.search.sources = yes
      ? ["memory", "sessions"]
      : ["memory"];
  }],
  ["MEMORY_REMOTE_EMBEDDINGS", (s, yes) => {
    for (const a of s.agents) a.memory.search.provider = "local";
    s.agents[0].memory.search.enabled = true;
    s.agents[0].memory.search.provider = yes ? "openai" : "none";
  }],
];

for (const [code, arrange] of rules) {
  Deno.test(`doctor ${code}: positive and negative`, async () => {
    for (const positive of [false, true]) {
      const snapshot = structuredClone(await baseline());
      snapshot.ambiguities = [];
      arrange(snapshot, positive);
      const findings = doctor(snapshot);
      assert.equal(findings.some((finding) => finding.code === code), positive);
      assert.doesNotMatch(JSON.stringify(findings), /CANARY-/);
    }
  });
}

Deno.test("doctor MCP gate requires an enabled server and a sandbox context", async () => {
  const snapshot = structuredClone(await baseline());
  snapshot.ambiguities = [];
  for (const a of snapshot.agents) {
    a.grants = [];
    a.sandbox.mode = "non-main";
  }
  for (const server of snapshot.mcpServers) server.enabled = false;
  assert.ok(!doctor(snapshot).some((f) => f.code === "MCP_SANDBOX_GATE"));
  snapshot.mcpServers[0].enabled = true;
  for (const a of snapshot.agents) a.sandbox.mode = "off";
  assert.ok(!doctor(snapshot).some((f) => f.code === "MCP_SANDBOX_GATE"));
  snapshot.agents[0].sandbox.mode = "non-main";
  assert.deepEqual(
    doctor(snapshot).filter((f) => f.code === "MCP_SANDBOX_GATE")
      .map((f) => [f.subject, f.severity]),
    [[`agent:${snapshot.agents[0].id}`, "info"]],
  );
});

Deno.test("doctor reports wildcard approvals independently of agent commands", async () => {
  const snapshot = structuredClone(await baseline());
  snapshot.ambiguities = [];
  for (const a of snapshot.agents) a.execution.commands = [];
  assert.deepEqual(
    doctor(snapshot).filter((f) => f.code === "EXEC_ALLOWLIST_WILDCARD")
      .map((f) => [f.subject, f.severity]),
    [["instance", "warning"]],
  );
  snapshot.execApprovals = null;
  assert.ok(
    !doctor(snapshot).some((f) => f.code === "EXEC_ALLOWLIST_WILDCARD"),
  );
});

Deno.test("doctor memory findings respect disabled search and explicit recall", async () => {
  const snapshot = structuredClone(await baseline());
  snapshot.ambiguities = [];
  snapshot.agents = snapshot.agents.slice(0, 1);
  const search = snapshot.agents[0].memory.search;
  search.sources = ["memory"];
  search.rememberAcrossConversations = true;
  for (const provider of [null, "local", "none", "openai"]) {
    search.provider = provider;
    for (const enabled of [false, true]) {
      search.enabled = enabled;
      const memory = doctor(snapshot).filter((f) =>
        f.code.startsWith("MEMORY_")
      );
      assert.deepEqual(
        memory.map((f) => [f.code, f.severity]),
        enabled
          ? [
            ...(provider === "openai"
              ? [["MEMORY_REMOTE_EMBEDDINGS", "info"]]
              : []),
            ["MEMORY_SESSIONS_INDEXED", "warning"],
          ]
          : [],
      );
      assert.ok(
        memory.every((f) => f.subject === `agent:${snapshot.agents[0].id}`),
      );
    }
  }
});

Deno.test("doctor host exec follows routing, modes and host approval tightening", async () => {
  const s = structuredClone(await baseline());
  s.agents = s.agents.slice(0, 1);
  const a = s.agents[0];
  for (const host of ["auto", "gateway", "sandbox", "node"]) {
    for (const layer of ["host", "sandbox"] as const) {
      a.grants = [{ id: "exec", tool: "exec", layer }];
      for (const mode of ["full", "ask", "auto", "deny"]) {
        for (const ask of ["off", "always"]) {
          const configured = configuredExec({ host, mode }, {}, "2026.10.9");
          Object.assign(a.execution, configured, {
            effective: effectiveExec(configured, approvalPolicy({ ask })),
          });
          assert.equal(
            doctor(s).some((f) => f.code === "EXEC_WITHOUT_APPROVAL"),
            (host === "gateway" || host === "auto" && layer === "host") &&
              mode === "full" && ask === "off",
          );
        }
      }
    }
  }
  a.execution.host = "gateway";
  a.execution.effective.security = "unknown";
  assert.equal(
    doctor(s).find((f) => f.code === "AGENT_WITHOUT_SANDBOX")?.severity,
    "info",
  );
});

Deno.test("doctor distinguishes inactive policies and historical cron errors", async () => {
  const s = structuredClone(await baseline());
  s.openclawVersion = "2026.10.9";
  s.messaging = { enabled: false, allowedTargets: ["*"] };
  for (const a of s.agents) {
    a.sandbox.mode = "off";
    a.sandbox.dangerouslyAllowExternalBindSources = true;
  }
  s.cron = s.cron.slice(0, 1);
  const job = s.cron[0];
  job.agentId = "absent-agent";
  job.runtime.consecutiveErrors = 3;
  for (const enabled of [false, true]) {
    job.enabled = enabled;
    const findings = doctor(s);
    assert.equal(
      findings.find((f) => f.code === "UNRESOLVED_AGENT_REFERENCE")?.severity,
      enabled ? "error" : "info",
    );
    assert.equal(findings.some((f) => f.code === "CRON_FAILING"), enabled);
    assert.ok(
      !findings.some((f) =>
        [
          "AGENT_TO_AGENT_WILDCARD",
          "EXTERNAL_BIND_SOURCES",
          "PLAINTEXT_SECRET_IN_CONFIG",
        ].includes(f.code)
      ),
    );
  }
  s.openclawVersion = "2026.6.10";
  assert.equal(
    doctor(s).find((f) => f.code === "UNRESOLVED_AGENT_REFERENCE")?.severity,
    "info",
  );
});

Deno.test("doctor binding account matching includes wildcard accounts and drawn subjects", async () => {
  const s = structuredClone(await baseline());
  s.accounts = s.accounts.slice(0, 1);
  const account = s.accounts[0], agent = s.agents[0];
  s.bindings = [{
    id: "binding-test",
    agentId: agent.id,
    account: account.id,
    peerKind: null,
  }];
  for (
    const target of [
      account.id,
      `${account.channel}:*`,
      `${account.channel}:absent`,
    ]
  ) {
    s.bindings[0].account = target;
    for (const enabled of [false, true]) {
      account.enabled = enabled;
      const f = doctor(s).find((f) => f.code === "BINDING_ACCOUNT_UNAVAILABLE");
      assert.equal(!!f, !enabled || target.endsWith(":absent"));
      if (f) {
        assert.equal(
          f.subject,
          target === account.id ? `account:${account.id}` : `agent:${agent.id}`,
        );
      }
    }
  }
});

Deno.test("reference findings kept by earlier snapshots are not repeated", async () => {
  const s = structuredClone(await baseline());
  const job = s.cron.find((j) =>
    j.agentId !== null && !s.agents.some((a) => a.id === j.agentId)
  )!;
  s.ambiguities.push({
    code: "UNRESOLVED_AGENT_REFERENCE",
    severity: "info",
    subject: job.id,
    context: "",
    recovery: "",
  });
  assert.deepEqual(
    doctor(s).filter((f) => f.code === "UNRESOLVED_AGENT_REFERENCE").map((f) =>
      f.subject
    ),
    doctor(await baseline()).filter((f) =>
      f.code === "UNRESOLVED_AGENT_REFERENCE"
    ).map((f) => f.subject),
  );
});
