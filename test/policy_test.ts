import assert from "node:assert/strict";
import { resolvePolicy } from "../src/policy.ts";
import type { Finding, Sandbox } from "../src/snapshot.ts";
const sandbox: Sandbox = {
  mode: "off",
  scope: "agent",
  workspaceAccess: "none",
  image: "image",
  readOnlyRoot: true,
  network: "none",
  memory: null,
  cpus: null,
  bindCount: 0,
  bindModes: [],
  environmentNames: [],
  dangerouslyAllowExternalBindSources: false,
};
function tools(
  global: Record<string, unknown>,
  agent: Record<string, unknown>,
  mode: Sandbox["mode"] = "off",
) {
  const findings: Finding[] = [];
  return resolvePolicy(
    "test",
    global,
    agent,
    { ...sandbox, mode },
    "openai/model",
    findings,
  );
}
Deno.test("tool profiles, additive grants and deny intersections cannot restore a denied tool", () => {
  const result = tools({
    profile: "minimal",
    alsoAllow: ["group:runtime"],
    deny: ["process"],
  }, { alsoAllow: ["process", "read"], deny: ["code_execution"] });
  assert.deepEqual(result.grants.map((g) => g.tool), [
    "exec",
    "read",
    "session_status",
  ]);
  assert.deepEqual(
    tools({ profile: "minimal" }, { profile: "messaging" }).grants.map((g) =>
      g.tool
    ),
    [
      "message",
      "session_status",
      "sessions_history",
      "sessions_list",
      "sessions_send",
    ],
  );
});
Deno.test("provider, agent and sandbox policies intersect; explicit sandbox override replaces global", () => {
  const result = tools({
    profile: "full",
    allow: ["group:fs", "exec"],
    byProvider: { openai: { deny: ["edit"] } },
    sandbox: { tools: { allow: ["exec"], deny: ["write"] } },
  }, {
    allow: ["READ", "write", "exec"],
    deny: ["exec"],
    sandbox: { tools: { allow: ["read", "write"], deny: [] } },
  }, "all");
  assert.deepEqual(result.grants.map((g) => g.tool), [
    "apply_patch",
    "read",
    "write",
  ]);
  assert(result.grants.every((g) => g.layer === "sandbox"));
});
Deno.test("wildcards and bash alias work; non-main represents both contexts", () => {
  const result = tools(
    { allow: ["sessions_*", "bash"], deny: ["sessions_send"] },
    { sandbox: { tools: { allow: ["exec"], deny: [] } } },
    "non-main",
  );
  assert(result.grants.some((g) => g.id === "host:exec"));
  assert(result.grants.some((g) => g.id === "sandbox:exec"));
  assert(!result.grants.some((g) => g.tool === "sessions_send"));
  assert(!result.grants.some((g) => g.id === "sandbox:sessions_list"));
});

Deno.test("unresolved sandbox defaults grant nothing; model restrictions remove patch", () => {
  assert.deepEqual(tools({ profile: "full" }, {}, "all").grants, []);
  const findings: Finding[] = [];
  const result = resolvePolicy(
    "test",
    { allow: ["write"] },
    {},
    sandbox,
    "ollama/model",
    findings,
  );
  assert.deepEqual(result.grants.map((g) => g.tool), ["write"]);
});
