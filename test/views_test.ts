import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emit } from "../src/emit.ts";
import { emitInferred, type Inference } from "../src/infer.ts";
import { parseSnapshot, type Snapshot } from "../src/snapshot.ts";
import { drawing, tableData } from "../src/tables.ts";
import { declarations, type DiagramView, diagramViews } from "../src/views.ts";

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
  assert.equal(system.edges.length, 8);
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
