import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emit } from "../src/emit.ts";
import { emitInferred, type Inference } from "../src/infer.ts";
import { parseSnapshot, type Snapshot } from "../src/snapshot.ts";
import { drawing, tableData } from "../src/tables.ts";
import {
  cronWeek,
  declarations,
  type DiagramView,
  diagramViews,
} from "../src/views.ts";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const snapshot: Snapshot = parseSnapshot(await read("./golden/snapshot.json"));
const inference: Inference = await read("./fixtures/inference.json");

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
  // The disabled account is drawn; the absent account has no endpoint.
  assert.equal(system.edges.length, 9);
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
    "tools",
    "schedules",
    "behaviour:lead",
  ]);
  assert.deepEqual(row("agent:client").views, ["system", "tools"]);
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
});
