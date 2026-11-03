import assert from "node:assert/strict";
import { resolvePolicy } from "./policy.ts";
import type { Finding, Plugin, Sandbox } from "../model/snapshot.ts";
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
  version: string | null = null,
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
    version,
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
  {
    id: "quotes",
    enabled: true,
    tools: ["quote"],
    optionalTools: [],
    toolProfiles: [],
  },
  {
    id: "flows",
    enabled: true,
    tools: ["flow_list", "flow_run"],
    optionalTools: ["flow_run"],
    toolProfiles: [],
  },
  {
    id: "board",
    enabled: false,
    tools: ["board_list", "browser"],
    optionalTools: [],
    toolProfiles: [],
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
  toolProfiles: [],
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

Deno.test("2026.10 catalogs replace old groups and profiles only for that version family", () => {
  const run = (version: string | null, global: Record<string, unknown>) =>
    granted(tools(global, {}, "off", null, [], [], version));
  for (const version of ["2026.10.0", "2026.10.9", "2026.10.11-beta.1"]) {
    const coding = run(version, { profile: "coding" });
    for (
      const name of [
        "sessions_search",
        "create_goal",
        "view_image",
        "music_generate",
        "theme",
        "automations",
      ]
    ) {
      assert(coding.includes(name), name);
    }
    for (const name of ["image", "update_plan", "tts", "gateway", "openclaw"]) {
      assert(!coding.includes(name), name);
    }
    const ui = run(version, { allow: ["group:ui"] });
    assert.deepEqual(ui, [
      "browser",
      "canvas",
      "dashboard",
      "portal",
      "screen",
      "show_widget",
      "terminal",
      "theme",
    ]);
    assert.deepEqual(run(version, { allow: ["cron"] }), ["automations"]);
    assert(!run(version, { deny: ["cron"] }).includes("automations"));
  }
  for (const version of [null, "2026.6.10", "2026.11.1", "2026.100.1"]) {
    assert(run(version, { profile: "coding" }).includes("image"));
    assert(!run(version, { profile: "coding" }).includes("view_image"));
    assert.deepEqual(run(version, { allow: ["cron"] }), ["cron"]);
  }
});

Deno.test("2026.10 group:openclaw excludes filesystem, exec, canvas and plugin-owned tools", () => {
  const owned = [{ ...plugins[0], tools: ["browser", "quote"] }];
  const result = granted(
    tools({ allow: ["group:openclaw"] }, {}, "off", owned, [], [], "2026.10.9"),
  );
  for (
    const name of [
      "read",
      "write",
      "edit",
      "apply_patch",
      "exec",
      "process",
      "canvas",
      "browser",
      "quote",
      "transcripts",
    ]
  ) {
    assert(!result.includes(name), name);
  }
  for (
    const name of [
      "computer",
      "automations",
      "pdf",
      "ask_user",
      "sessions_search",
    ]
  ) {
    assert(result.includes(name), name);
  }
});

Deno.test("restricted 2026.10 profiles report their unrepresented gateway action subset", () => {
  for (const profile of ["minimal", "coding", "messaging"]) {
    const findings: Finding[] = [];
    const result = tools(
      { profile },
      {},
      "off",
      null,
      findings,
      [],
      "2026.10.9",
    );
    assert(!granted(result).includes("gateway"));
    assert(
      findings.some((f) =>
        f.code === "TOOL_PROFILE_PARTIAL" && f.severity === "info" &&
        f.context.includes(profile)
      ),
    );
    assert(
      granted(
        tools(
          { profile, alsoAllow: ["gateway"] },
          {},
          "off",
          null,
          [],
          [],
          "2026.10.9",
        ),
      ).includes("gateway"),
    );
  }
});

Deno.test("plugin profile attachments admit only matching tools through all policy gates", () => {
  const inventory = plugins.map((p) => ({
    ...p,
    toolProfiles: p.id === "flows"
      ? [{ id: "flow_run", profiles: ["coding", "messaging"] }]
      : [],
  }));
  const run = (
    global: Record<string, unknown>,
    agent = {},
    mode: Sandbox["mode"] = "off",
  ) => granted(tools(global, agent, mode, inventory, [], [], "2026.10.9"));
  assert(run({ profile: "coding" }).includes("flow_run"));
  assert(!run({ profile: "coding" }).includes("flow_list"));
  assert(!run({ profile: "minimal" }).includes("flow_run"));
  assert(!run({}).includes("flow_run"));
  assert(!run({ profile: "coding", deny: ["flows"] }).includes("flow_run"));
  assert(!run({ profile: "coding", allow: ["read"] }).includes("flow_run"));
  assert(
    !run({ profile: "coding", byProvider: { openai: { profile: "minimal" } } })
      .includes("flow_run"),
  );
  assert(
    run({ profile: "coding", byProvider: { openai: { profile: "messaging" } } })
      .includes("flow_run"),
  );
  assert(
    !run({ profile: "coding" }, {
      sandbox: { tools: { allow: ["read"], deny: [] } },
    }, "all").includes("flow_run"),
  );
  assert(
    run({ profile: "coding" }, {
      sandbox: { tools: { allow: ["flows"], deny: [] } },
    }, "all").includes("flow_run"),
  );
  assert(
    !granted(
      tools(
        { profile: "coding" },
        {},
        "off",
        inventory.map((p) => ({ ...p, enabled: false })),
        [],
        [],
        "2026.10.9",
      ),
    ).includes("flow_run"),
  );
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
      ["MCP_TOOL_SUBSET_UNRESOLVED", "info", "agent:test"],
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
