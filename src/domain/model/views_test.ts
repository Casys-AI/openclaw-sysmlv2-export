import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emit } from "../../adapters/out/sysml/emitter.ts";
import { type Inference } from "./inference.ts";
import { emitInferred } from "../../adapters/out/sysml/inferred.ts";
import { type Snapshot } from "./snapshot.ts";
import { parseSnapshot } from "../../infrastructure/snapshot-codec.ts";
import { drawing, tableData } from "./tables.ts";
import {
  cronWeek,
  declarations,
  type DiagramView,
  diagramViews,
  RUNTIME_ATTRIBUTES,
} from "./views.ts";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const snapshot: Snapshot = parseSnapshot(
  await read("../../../test/golden/snapshot.json"),
);
const inference: Inference = await read(
  "../../../test/fixtures/inference.json",
);

const view = (views: DiagramView[], id: string) =>
  views.find((v) => v.id === id)!;
const ids = (v: DiagramView, prefix: string) =>
  v.nodes.filter((n) => n.id.startsWith(prefix)).map((n) => n.id);
const edges = (v: DiagramView, kind: string) =>
  v.edges.filter((e) => e.kind === kind).map((e) => `${e.source} ${e.target}`);

Deno.test("the fixture's views hold its agents, tools, schedules and procedures", () => {
  const views = diagramViews(snapshot, inference);
  assert.deepEqual(views.map((v) => v.id), [
    "overview",
    "system",
    "reach",
    "tools",
    "schedules",
    "behaviour:field",
    "behaviour:lead",
  ]);

  const system = view(views, "system");
  assert.equal(ids(system, "agent:").length, 6);
  assert.deepEqual(ids(system, "channel:"), [
    "channel:discord",
    "channel:telegram",
    "channel:whatsapp",
  ]);
  assert.equal(ids(system, "account:").length, 10);
  // The disabled account is drawn; the absent account has no endpoint. The
  // hook's trigger edge is the tenth.
  assert.equal(system.edges.length, 10);
  assert.ok(
    edges(system, "connection").includes("agent:lead account:telegram:lead"),
  );
  const field = system.nodes.find((n) => n.id === "agent:field")!;
  assert.deepEqual(field.compartments.map((c) => c.title), [
    "attributes",
    "context",
    "tools · sandbox",
  ]);
  assert.match(
    field.compartments[2].rows.join("\n"),
    /^plugin \(1\): browser$/m,
  );

  // A matrix: agents as columns, in id order; one grant cell per tool held.
  const tools = view(views, "tools");
  assert.equal(tools.table?.kind, "matrix");
  assert.deepEqual(
    tools.table.columns.map((id) => id.slice(6)),
    ["client", "coach", "devbox", "field", "lead", "secretary"],
  );
  const holders = (tool: string) =>
    tools.edges.filter((e) => e.target === tool).map((e) =>
      `${e.source.slice(6)} ${e.label}`
    );
  assert.deepEqual(holders("tool:cli:git"), ["lead host"]);
  assert.deepEqual(holders("tool:browser"), [
    "client sandbox",
    "coach sandbox",
    "devbox sandbox",
    "field sandbox",
    "lead host",
    "secretary sandbox",
  ]);
  assert.equal(
    tools.nodes.find((n) => n.id === "tool:docs__*")!.parent,
    "mcp:docs",
  );
  // Declared but granted to no agent: a row of its provider, without cells.
  const ghost = tools.nodes.find((n) =>
    n.id === "plugin:workboard:board_list"
  )!;
  assert.ok(ghost.muted && ghost.dashed && !holders(ghost.id).length);

  const schedules = view(views, "schedules");
  assert.equal(ids(schedules, "cron:").length, 10);
  assert.deepEqual(
    edges(schedules, "owner").filter((e) => e.startsWith("heartbeat")),
    [
      "heartbeat:lead agent:lead",
    ],
  );
  assert.equal(edges(schedules, "owner").length, 5);
  assert.equal(edges(schedules, "target").length, 6);
  assert.ok(schedules.nodes.find((n) => n.id === "agent:main")!.dashed);

  const behaviour = view(views, "behaviour:field");
  assert.deepEqual(
    behaviour.nodes.filter((n) => n.parent === "procedure:report-incident")
      .map((n) => n.shape),
    ["initial", "action", "decision", "send", "action", "final"],
  );
  assert.deepEqual(
    behaviour.edges.filter((e) => e.kind !== "succession").map((e) =>
      `${e.kind} ${e.source} ${e.target}`
    ),
    [
      "handoff step:hand-to-lead party:lead",
      "handoff step:tell-customer party:customer",
      "escalation step:escalate-owner party:owner",
    ],
  );
  assert.equal(
    behaviour.nodes.find((n) => n.id === "party:owner")!.shape,
    "actor",
  );
  assert.equal(ids(behaviour, "rule:").length, 3);
});

Deno.test("the Overview sums each agent up and links it to its views", () => {
  const overview = view(diagramViews(snapshot, inference), "overview");
  const table = tableData(overview);
  assert.ok(table?.kind === "elements" && table.summary);
  const row = (id: string) => table.rows.find((r) => r.id === id)!;
  const figures = (id: string) =>
    Object.fromEntries(table.columns.map((c, i) => [c, row(id).values[i]]));
  assert.deepEqual(figures("agent:lead"), {
    model: "ollama/glm-5.1:cloud · 1 fallback",
    "runs on": "host",
    tools: "42 · built-in 31, plugin 5, MCP 2, CLI 4",
    channels: "telegram:lead, discord:default",
    "scheduled tasks": "1 of 5 enabled",
    context:
      "9 instructions · 32 skills · memory search local · MEMORY.md · 2 daily notes · 2 other",
    inferred: "1 procedure · 1 rule",
  });
  assert.deepEqual(row("agent:lead").views, [
    "system",
    "reach",
    "tools",
    "schedules",
    "behaviour:lead",
  ]);
  assert.deepEqual(row("agent:client").views, ["system", "reach", "tools"]);
  // Tasks the instance runs for no agent of its own still count.
  const totals = new Map(
    overview.nodes.find((n) => n.id === table.summary!.id)!.attributes,
  );
  assert.equal(totals.get("scheduled tasks"), "1 of 11 enabled");
});

Deno.test("a Behaviour view lists its rules in a table, not in its drawing", () => {
  const behaviour = view(diagramViews(snapshot, inference), "behaviour:field");
  assert.ok(!drawing(behaviour).nodes.some((n) => n.shape === "requirement"));
  const table = tableData(behaviour);
  assert.ok(table?.kind === "elements" && table.facet === "kind");
  assert.deepEqual(table.rows.map((r) => [r.name, ...r.values]), [
    [
      "field_no_payments",
      "prohibition",
      "Never change a payment method or approve a refund.",
      "SOUL.md:2",
    ],
    [
      "field_reply_within_hour",
      "constraint",
      "Reply to every field message within one hour.",
      "AGENTS.md:2-3",
    ],
    [
      "field_share_site_address",
      "permission",
      "May share a site address with registered staff.",
      "TOOLS.md:1",
    ],
  ]);
});

Deno.test("the week shows when each scheduled task fires", () => {
  const { table } = view(diagramViews(snapshot, inference), "schedules");
  assert.ok(table?.kind === "week");
  const row = (node: string) => table.rows.find((r) => r.node === node)!;
  // Thursdays at 12:00, in the gateway's time zone; an interval all week.
  assert.deepEqual(row("cron:job-10").fires, [[3 * 24 + 12, 1]]);
  assert.equal(row("cron:job-10").zone, null);
  assert.deepEqual(
    [row("heartbeat:lead").fires, row("heartbeat:lead").everyMs],
    [null, 1800000],
  );
  assert.deepEqual(row("cron:job-5"), {
    node: "cron:job-5",
    agent: "main",
    label: "Weekly scouting A",
    when: "Tue, Fri at 01:00",
    enabled: false,
    zone: "UTC",
    model: "anthropic/claude-opus-4-6",
    lastRun: "ok",
    fires: [[25, 1], [4 * 24 + 1, 1]],
    everyMs: null,
  });
});

Deno.test("cron expressions repeat weekly only with any day of month and month", () => {
  assert.deepEqual(cronWeek("*/15 9 * * MON-FRI")?.[0], [9, 4]);
  assert.deepEqual(cronWeek("0 0 * * 0,7"), [[6 * 24, 1]]);
  assert.deepEqual(cronWeek("0 9 * * FRI-SUN")?.map(([h]) => h), [
    4 * 24 + 9,
    5 * 24 + 9,
    6 * 24 + 9,
  ]);
  assert.deepEqual(cronWeek("30 0 9 * * ?")?.length, 7);
  for (
    const e of ["0 0 1 * *", "0 0 * 1 *", "0 24 * * *", "0 9 * * L", "@daily"]
  ) {
    assert.equal(cronWeek(e), null, e);
  }
});

Deno.test("behaviour views exist only with inference", () => {
  assert.ok(
    !diagramViews(snapshot, null).some((v) => v.group === "Behaviour"),
  );
  const silent = {
    ...inference,
    agents: [{ ...inference.agents[0], procedures: [], rules: [] }],
  };
  assert.ok(
    !diagramViews(snapshot, silent).some((v) => v.group === "Behaviour"),
  );
});

Deno.test("every element names a declaration of the emitted files", () => {
  const files = new Map([
    ...emit(snapshot),
    ...emitInferred(snapshot, inference),
  ]);
  const index = new Map(
    [...files].map(([name, text]) => [name, declarations(text)]),
  );
  for (const v of diagramViews(snapshot, inference)) {
    for (const ref of [...v.nodes, ...v.edges].flatMap((e) => e.sysml)) {
      assert.ok(index.get(ref.file)?.has(ref.qname), `${v.id}: ${ref.qname}`);
    }
  }
  const [from, to] = index.get("OpenClawInstance.sysml")!.get(
    "OpenClawInstance::Tools::toolCatalog::'tool_cli:git'",
  )!;
  const lines = files.get("OpenClawInstance.sysml")!.split("\n");
  assert.match(lines[from - 1], /part 'tool_cli:git' :> tools \{$/);
  assert.equal(lines[to - 1].trim(), "}");
  const delegation = "OpenClawInstance::Authority::'delegation_lead:coach'";
  const span = index.get("OpenClawInstance.sysml")!.get(delegation)!;
  assert.ok(span, delegation);
  assert.equal(span[0], span[1]);
  assert.match(
    lines[span[0] - 1],
    /connection .* : DelegationRule connect .*;$/,
  );
});

const attrs = (v: DiagramView, id: string) =>
  new Map(v.nodes.find((n) => n.id === id)!.attributes);

Deno.test("posture states a host policy only for an exec that runs on the host", () => {
  const full = structuredClone(snapshot);
  for (const a of full.agents) {
    a.execution.effective = { security: "full", ask: "off" };
  }
  const nonMain = full.agents.find((a) => a.id === "devbox")!;
  nonMain.sandbox.mode = "non-main";
  nonMain.grants = [
    { id: "host:exec", tool: "exec", layer: "host" },
    { id: "sandbox:exec", tool: "exec", layer: "sandbox" },
  ];
  const views = diagramViews(full, null);
  const system = view(views, "system");
  assert.equal(attrs(system, "agent:client").get("exec"), "in sandbox");
  assert.equal(
    attrs(system, "agent:lead").get("exec"),
    "on host · full, ask off",
  );
  assert.equal(
    attrs(system, "agent:devbox").get("exec"),
    "on host · full, ask off + in sandbox",
  );
  assert.equal(attrs(system, "agent:client").get("network"), "fixture-net");
  assert.equal(
    attrs(system, "agent:client").get("elevated"),
    "sender-gated · 1 channel",
  );
  assert.equal(attrs(system, "agent:client").get("external binds"), "allowed");
  assert.ok(!attrs(system, "agent:lead").has("network"));
  // Overview and Tools say the same, and the facet reads the qualified cell.
  const table = tableData(view(views, "overview"));
  assert.ok(table?.kind === "elements");
  const runsOn = (id: string) =>
    table.rows.find((r) => r.id === id)!
      .values[table.columns.indexOf("runs on")];
  assert.deepEqual(
    ["lead", "client", "devbox"].map((id) => runsOn(`agent:${id}`)),
    [
      "host",
      "sandbox · elevated",
      "sandbox, except the main session · elevated",
    ],
  );
  assert.equal(
    attrs(view(views, "tools"), "agent:client").get("exec"),
    "in sandbox",
  );
  const totals = attrs(view(views, "overview"), table.summary!.id);
  assert.equal(totals.get("elevated exec"), "5 of 5 sandboxed");
});

Deno.test("a hook is drawn in its own group, with an edge to the agent it starts", () => {
  const system = view(diagramViews(snapshot, inference), "system");
  assert.equal(
    system.nodes.find((n) => n.id === "hook:hook-0")!.parent,
    "hooks",
  );
  assert.deepEqual(edges(system, "trigger"), ["hook:hook-0 agent:lead"]);
  const lost = structuredClone(snapshot);
  lost.hooks[0].agentId = "ghost";
  const missing = view(diagramViews(lost, null), "system");
  assert.deepEqual(edges(missing, "target"), ["hook:hook-0 agent:ghost"]);
  assert.ok(missing.nodes.find((n) => n.id === "agent:ghost")!.dashed);
});

Deno.test("Reach draws one edge per delegating pair and leaves out what has no endpoint", () => {
  const reach = view(diagramViews(snapshot, inference), "reach");
  const rules = reach.edges.filter((e) => e.kind === "delegation");
  assert.deepEqual(
    rules.filter((e) => !e.mutual).map((e) => `${e.source} ${e.target}`),
    [
      "agent:lead agent:client",
      "agent:lead agent:coach",
    ],
  );
  const pair = rules.find((e) => e.id === "delegation:client:coach")!;
  assert.ok(pair.mutual && pair.sysml.length === 2);
  assert.equal(rules.filter((e) => e.mutual).length, 4);
  assert.deepEqual(edges(reach, "trigger"), ["hook:hook-0 agent:lead"]);
  assert.ok(reach.nodes.some((n) => n.id === "messaging"));
  const loop = structuredClone(snapshot);
  loop.agents.find((a) => a.id === "client")!.delegation = [
    "client",
    "*",
    "gone",
  ];
  const client = view(diagramViews(loop, null), "reach").nodes.find((n) =>
    n.id === "agent:client"
  )!;
  assert.deepEqual(client.compartments.at(-1), {
    title: "delegates to",
    rows: ["any agent (*)", "unknown: gone"],
  });
  const alone = structuredClone(snapshot);
  for (const a of alone.agents) a.delegation = [];
  alone.hooks = [];
  alone.messaging.enabled = false;
  assert.ok(!diagramViews(alone, null).some((v) => v.id === "reach"));
});

Deno.test("built-in tools sit in their version's capability groups, with holder counts", () => {
  const tools = view(diagramViews(snapshot, inference), "tools");
  const parent = (v: DiagramView, id: string) =>
    v.nodes.find((n) => n.id === id)!.parent;
  assert.equal(parent(tools, "tool:exec"), "capability:runtime");
  assert.equal(parent(tools, "capability:runtime"), "origin:builtin");
  assert.equal(parent(tools, "tool:pdf"), "capability:other");
  const modern = structuredClone(snapshot);
  modern.openclawVersion = "2026.10.9";
  assert.equal(
    parent(view(diagramViews(modern, null), "tools"), "tool:read"),
    "capability:fs",
  );
  const table = tableData(tools);
  assert.ok(table?.kind === "matrix");
  const row = (id: string) => table.rows.find((r) => r.id === id)!;
  assert.deepEqual(
    ["tool:cli:git", "tool:browser", "tool:exec", "plugin:workboard:board_list"]
      .map((id) => row(id).held),
    ["one", "all", "all", "none"],
  );
  assert.equal(row("tool:cli:git").holders, 1);
  // Lead's exec is on the host layer: the group and its origin say so.
  assert.ok(row("capability:runtime").host && row("origin:builtin").host);
  assert.equal(row("origin:cli").host, true);
  assert.equal(row("plugin:browser").host, true);
  assert.equal(row("capability:fs").host, true);
});

Deno.test("an MCP server and a plugin state their filters and profiles as attributes", () => {
  const tools = view(diagramViews(snapshot, inference), "tools");
  assert.equal(attrs(tools, "mcp:docs").get("toolInclude"), "search_*");
  assert.equal(attrs(tools, "mcp:Outlook Graph").get("oauth"), "true");
  assert.equal(attrs(tools, "tool:docs__*").get("exposed"), "docs__search_*");
  assert.equal(
    attrs(tools, "plugin:stock-quotes").get("toolProfiles"),
    "stock_quote: coding",
  );
});

Deno.test("an Overview row has its figures, and the totals name the declarations they rest on", () => {
  const overview = view(diagramViews(snapshot, inference), "overview");
  const table = tableData(overview);
  assert.ok(table?.kind === "elements");
  const lead = table.rows.find((r) => r.id === "agent:lead")!;
  assert.deepEqual(lead.figures, {
    model: { n: 1, names: ["openai/gpt-5.5"] },
    tools: {
      n: 42,
      parts: [["built-in", 31], ["plugin", 5], ["MCP", 2], ["CLI", 4]],
    },
    channels: { n: 2, of: 2, parts: [["telegram", 1], ["discord", 1]] },
    "scheduled tasks": { n: 1, of: 5 },
    context: {
      parts: [["instructions", 9], ["skills", 32], ["daily notes", 2]],
      flags: ["search", "curated", "daily"],
    },
  });
  assert.equal(lead.title, "Lead");
  assert.equal(
    attrs(overview, "agent:lead").get("inferred role"),
    "Coordinates the other agents and reports to the owner.",
  );
  const totals = overview.nodes.find((n) => n.id === table.summary!.id)!;
  assert.deepEqual(
    totals.sysml.map((r) => r.qname.replace("OpenClawInstance::", "")),
    [
      "inventory",
      "Authority::messaging",
      "Authority::execApprovals",
      "Context::memoryBackend",
      "Operators::provider_google",
      "Operators::provider_ollama",
    ],
  );
});

Deno.test("a scheduled task states its model and delivery, and its last run is runtime state", () => {
  const schedules = view(diagramViews(snapshot, inference), "schedules");
  const job = attrs(schedules, "cron:job-1");
  assert.equal(job.get("primaryModel"), "anthropic/claude-opus-4-6");
  assert.equal(job.get("delivery"), "announce · discord");
  assert.ok(RUNTIME_ATTRIBUTES.every((name) => job.has(name)));
  assert.equal(
    schedules.nodes.find((n) => n.id === "cron:job-1")!.text,
    "Daily digest",
  );
});

Deno.test("a Behaviour view lists its procedures and the authority its rules stand under", () => {
  const field = view(diagramViews(snapshot, inference), "behaviour:field");
  assert.deepEqual(field.procedures?.map((p) => [p.id, p.steps]), [
    ["procedure:handle-request", 5],
    ["procedure:report-incident", 4],
  ]);
  assert.equal(field.authority?.exec.join(), "sandbox");
  assert.equal(field.authority?.ask, null);
  const rule = attrs(field, "rule:no-payments");
  assert.equal(rule.get("exec runs"), "sandbox");
  assert.ok(!rule.has("exec ask"));
  assert.equal(
    rule.get("outbound tools"),
    field.authority!.outbound.join(", "),
  );
});
