import assert from "node:assert/strict";
import { resolvePolicy } from "../src/policy.ts";
import type { Finding, Plugin, Sandbox } from "../src/snapshot.ts";
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
  plugins: Plugin[] | null = null,
  findings: Finding[] = [],
) {
  return resolvePolicy(
    "test",
    global,
    agent,
    { ...sandbox, mode },
    "openai/model",
    plugins,
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
    null,
    findings,
  );
  assert.deepEqual(result.grants.map((g) => g.tool), ["write"]);
});

const plugins: Plugin[] = [
  { id: "quotes", enabled: true, tools: ["quote"], optionalTools: [] },
  {
    id: "flows",
    enabled: true,
    tools: ["flow_list", "flow_run"],
    optionalTools: ["flow_run"],
  },
  {
    id: "board",
    enabled: false,
    tools: ["board_list", "browser"],
    optionalTools: [],
  },
];
const granted = (r: ReturnType<typeof tools>) => r.grants.map((g) => g.tool);

Deno.test("enabled plugin tools are granted; a disabled plugin's are not, built-in names included", () => {
  const result = granted(tools({}, {}, "off", plugins));
  assert(result.includes("quote") && result.includes("flow_list"));
  assert(!result.includes("board_list") && !result.includes("browser"));
  assert(granted(tools({}, {})).includes("browser"));
});

Deno.test("optional plugin tools need an explicit opt-in", () => {
  const has = (global: Record<string, unknown>, agent = {}) =>
    granted(tools(global, agent, "off", plugins)).includes("flow_run");
  assert.equal(has({}), false);
  assert.equal(has({ profile: "coding" }), false);
  assert.equal(has({ alsoAllow: ["flow_run"] }), true);
  assert.equal(has({}, { alsoAllow: ["flows"] }), true);
  assert.equal(has({ alsoAllow: ["group:plugins"] }), true);
  assert.equal(has({ profile: "full" }), true);
});

Deno.test("plugin ids and group:plugins expand in deny and sandbox policies", () => {
  assert(
    !granted(tools({ deny: ["quotes"] }, {}, "off", plugins)).includes(
      "quote",
    ),
  );
  const sandboxed = tools(
    {},
    {
      sandbox: { tools: { allow: ["group:plugins"], deny: [] } },
    },
    "all",
    plugins,
  );
  assert.deepEqual(granted(sandboxed), ["flow_list", "flow_run", "quote"]);
});

Deno.test("TOOL_CATALOG_INCOMPLETE fires only for names no plugin declares", () => {
  const incomplete = (deny: string[]) => {
    const findings: Finding[] = [];
    tools({ deny }, {}, "off", plugins, findings);
    return findings.some((f) => f.code === "TOOL_CATALOG_INCOMPLETE");
  };
  assert.equal(incomplete(["board_list", "flows", "quote"]), false);
  assert.equal(incomplete(["telegram"]), true);
});
