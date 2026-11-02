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
  mcpPrefixes: string[] = [],
) {
  return resolvePolicy(
    "test",
    global,
    agent,
    { ...sandbox, mode },
    "openai/model",
    plugins,
    findings,
    mcpPrefixes,
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

const mcp: Plugin[] = [{
  id: "bundle-mcp",
  enabled: true,
  tools: ["docs__*", "outlook-graph__*"],
  optionalTools: [],
}];

Deno.test("MCP pseudo tools follow enabled inventory and implicit profile grants", () => {
  for (const profile of [undefined, "coding", "messaging"]) {
    const result = granted(tools({ profile }, {}, "off", mcp));
    assert(result.includes("docs__*") && result.includes("outlook-graph__*"));
  }
  assert(
    !granted(tools({ profile: "minimal" }, {}, "off", mcp)).includes("docs__*"),
  );
  const disabled = [{ ...mcp[0], enabled: false }];
  assert(!granted(tools({}, {}, "off", disabled)).includes("docs__*"));
});

Deno.test("MCP server globs, bundle-mcp and group:plugins expand in sandbox policy", () => {
  for (const allow of [["docs__*"], ["bundle-mcp"], ["group:plugins"], ["*"]]) {
    const result = tools(
      {},
      {
        sandbox: { tools: { allow, deny: [] } },
      },
      "all",
      mcp,
    );
    assert.deepEqual(
      granted(result).filter((tool) => tool.endsWith("__*")),
      allow[0] === "docs__*" ? ["docs__*"] : mcp[0].tools,
    );
  }
});

Deno.test("MCP subsets are known but cannot grant a whole server", () => {
  for (const entry of ["docs__search", "docs__**"]) {
    const findings: Finding[] = [];
    assert.deepEqual(
      tools({ allow: [entry] }, {}, "off", mcp, findings).grants,
      [],
    );
    assert.deepEqual(findings.map((f) => [f.code, f.severity, f.subject]), [
      ["MCP_TOOL_SUBSET_UNRESOLVED", "info", "test"],
    ]);
  }
  const findings: Finding[] = [];
  const result = tools(
    { allow: ["bundle-mcp", "disabled__*", "disabled__search"] },
    {},
    "off",
    null,
    findings,
    ["disabled"],
  );
  assert.deepEqual(result.grants, []);
  assert.deepEqual(findings.map((f) => f.code), ["MCP_TOOL_SUBSET_UNRESOLVED"]);
});
