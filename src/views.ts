import { type Grant, grants, name, ORIGINS } from "./emit.ts";
import type { Inference } from "./infer.ts";
import type { Agent, Snapshot } from "./snapshot.ts";

/** Diagram model of one version: the viewer's views (System, Tools, Scheduled
 * tasks and, with inference, one Behaviour view per agent) as nodes and edges,
 * built from the snapshot and inference the emitter reads. Each element names
 * the SysML declarations that state it, so a view and its text say the same
 * thing. A view may show some elements as a table instead of drawing them.
 * Pure, no geometry: layout.ts places the drawn elements and tables.ts shapes
 * the table. */

export type Shape =
  /** A part usage, with compartments. */
  | "block"
  /** A container with a SysML header: a package, a part, an action def. */
  | "frame"
  /** A visual group of elements sharing an attribute value. */
  | "group"
  /** A catalog tool: a row of the Tools allocation matrix. */
  | "tool"
  | "initial"
  | "final"
  | "action"
  | "decision"
  /** A step that sends work elsewhere (hand-off, escalation). */
  | "send"
  | "actor"
  | "requirement";

export interface Compartment {
  title: string;
  rows: string[];
}
/** A declaration in an emitted file, by qualified name as written. */
export interface SysmlRef {
  file: string;
  qname: string;
}
export interface DiagramNode {
  id: string;
  parent: string | null;
  shape: Shape;
  /** SysML keyword, drawn as «keyword». */
  keyword: string | null;
  /** Declared name (without quotes), or a group's label. */
  name: string;
  type: string | null;
  /** A step's or decision's text; an agent's display name. */
  text: string | null;
  compartments: Compartment[];
  /** Shown by the inspector, in order. */
  attributes: [string, string][];
  sysml: SysmlRef[];
  /** Disabled, or an unresolved reference. */
  muted: boolean;
  /** A reference, not a declaration of this view. */
  dashed: boolean;
}
export type EdgeKind =
  | "connection"
  | "succession"
  | "handoff"
  | "escalation"
  | "owner"
  | "target"
  /** A tool allocated to an agent: its grants, on one layer or both. */
  | "grant";
export interface DiagramEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  label: string | null;
  /** Shown by the inspector, in order. */
  attributes: [string, string][];
  sysml: SysmlRef[];
}
/** The elements a view shows as a table instead of drawing them, by id. */
export type ViewTable =
  /** A SysML allocation matrix: rows (origin groups, providers, tools) by
   * columns (agents); each cell is a `grant` edge from a column to a row. */
  | { kind: "matrix"; columns: string[]; rows: string[]; cells: string[] }
  /** Elements in rows, some of their attributes as columns. */
  | {
    kind: "elements";
    title: string;
    rows: string[];
    columns: string[];
    /** A column whose values filter the rows, or null. */
    facet: string | null;
  };
export interface DiagramView {
  id: string;
  title: string;
  group: "Structure" | "Cases" | "Behaviour";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  table: ViewTable | null;
}

export const INSTANCE_FILE = "OpenClawInstance.sysml";
export const INFERRED_FILE = "OpenClawInferred.sysml";
const inst = (...path: string[]): SysmlRef => ({
  file: INSTANCE_FILE,
  qname: ["OpenClawInstance", ...path].join("::"),
});
const inferred = (...path: string[]): SysmlRef => ({
  file: INFERRED_FILE,
  qname: ["OpenClawInferred", ...path].join("::"),
});

/** Line ranges (1-based, inclusive) of the named declarations of an emitted
 * file, by qualified name as written (`Pkg::part::'quoted name'`). The emitter
 * indents each body by four spaces and closes it alone on its own line, or
 * opens and closes it on one line. */
export function declarations(text: string): Map<string, [number, number]> {
  const lines = text.split("\n"), found = new Map<string, [number, number]>();
  const path: string[] = [];
  const header =
    /^( *)(?:(?:ref|abstract)\s+)?(?:package|part|item|connection|action|requirement)(?:\s+def)?\s+(?::>>\s*)?('(?:[^'\\]|\\.)*'|[A-Za-z_]\w*)[^{]*\{(.*)$/;
  lines.forEach((line, i) => {
    const m = line.match(header);
    if (!m || m[1].length % 4) return;
    const depth = m[1].length / 4;
    path.length = depth;
    path[depth] = m[2];
    let end = i;
    if (!m[3].trimEnd().endsWith("}")) {
      const close = `${m[1]}}`;
      while (end + 1 < lines.length && lines[end + 1] !== close) end++;
      end++;
    }
    found.set(path.join("::"), [i + 1, Math.min(end, lines.length - 1) + 1]);
  });
  return found;
}

function node(
  n: Partial<DiagramNode> & Pick<DiagramNode, "id" | "shape" | "name">,
): DiagramNode {
  return {
    parent: null,
    keyword: null,
    type: null,
    text: null,
    compartments: [],
    attributes: [],
    sysml: [],
    muted: false,
    dashed: false,
    ...n,
  };
}
const quoted = (v: string) => JSON.stringify(v);
const list = (values: string[]) => values.length ? values.join(", ") : "none";
const ORIGIN_LABEL = {
  builtin: "built-in",
  plugin: "plugin",
  mcp: "MCP",
  cli: "CLI",
} as const;
const byId = <T extends { id: string }>(values: T[]) =>
  [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A schedule in words when it is a plain daily or weekly cron; otherwise null. */
export function scheduleText(
  kind: string,
  expression: string | null,
  everyMs: number | null,
): string | null {
  if (kind === "every" && everyMs) {
    return everyMs % 3600000 === 0
      ? `every ${everyMs / 3600000} h`
      : everyMs % 60000 === 0
      ? `every ${everyMs / 60000} min`
      : `every ${everyMs / 1000} s`;
  }
  const f = (expression ?? "").trim().split(/\s+/);
  const nums = (s: string, max: number) =>
    /^\d+(,\d+)*$/.test(s) && s.split(",").every((n) => +n <= max)
      ? s.split(",").map(Number).sort((a, b) => a - b)
      : null;
  if (kind !== "cron" || f.length !== 5 || f[2] !== "*" || f[3] !== "*") {
    return null;
  }
  const minutes = nums(f[0], 59), hours = nums(f[1], 23);
  const days = f[4] === "*" ? [] : nums(f[4], 7);
  if (!minutes || !hours || !days || hours.length * minutes.length > 4) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const times = hours.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`));
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return `${days.length ? days.map((d) => names[d]).join(", ") : "daily"} at ${
    times.join(", ")
  }`;
}

const layersOf = (granted: Grant[]) =>
  [...new Set(granted.map((g) => g.layer))].sort();

function agentBlock(a: Agent, granted: Grant[]): DiagramNode {
  const { search, daily, otherCount } = a.memory;
  const curated = a.workspace.instructions.some((f) => f.path === "MEMORY.md");
  const memory = [
    search.enabled ? `search ${search.provider ?? "on"}` : "search off",
    ...(curated ? ["MEMORY.md"] : []),
    `${daily.count} daily note${daily.count === 1 ? "" : "s"}`,
    ...(otherCount ? [`${otherCount} other`] : []),
  ].join(" · ");
  const layers = layersOf(granted);
  const tools = ORIGINS.flatMap((origin) => {
    const ids = [
      ...new Set(
        granted.filter((g) => g.tool.origin === origin).map((g) =>
          g.tool.toolId
        ),
      ),
    ].sort();
    return ids.length
      ? [`${ORIGIN_LABEL[origin]} (${ids.length}): ${ids.join(", ")}`]
      : [];
  });
  const skills = a.workspace.skills.map((s) => s.id);
  return node({
    id: `agent:${a.id}`,
    shape: "block",
    keyword: "part",
    name: `agent_${a.id}`,
    type: `Agent_${a.id}`,
    compartments: [
      {
        title: "attributes",
        rows: [
          `displayName = ${quoted(a.name)}`,
          ...(a.model.primary
            ? [`primaryModel = ${quoted(a.model.primary)}`]
            : []),
        ],
      },
      {
        title: "context",
        rows: [
          `instructions: ${list(a.workspace.instructions.map((f) => f.path))}`,
          `skills (${skills.length}): ${list(skills)}`,
          `memory: ${memory}`,
        ],
      },
      {
        title: `tools${layers.length ? ` · ${layers.join(", ")}` : ""}`,
        rows: tools.length ? tools : ["none"],
      },
    ],
    attributes: [
      ["id", a.id],
      ["displayName", a.name],
      ...(a.emoji ? [["emoji", a.emoji] as [string, string]] : []),
      ["primaryModel", a.model.primary ?? "—"],
      ["fallbackModels", list(a.model.fallbacks)],
      ["sandbox", a.sandbox.mode],
      [
        "exec",
        `${a.execution.effective.security} · ask ${a.execution.effective.ask}`,
      ],
      ["delegates to", list(a.delegation)],
      ["instructions", list(a.workspace.instructions.map((f) => f.path))],
      ["skills", list(skills)],
      ["memory", memory],
      ["grants", `${granted.length} (${list(layers)})`],
    ],
    sysml: [
      inst("Operators", name("Agent", a.id)),
      inst("Operators", name("agent", a.id)),
    ],
  });
}

function systemView(s: Snapshot, granted: Map<string, Grant[]>): DiagramView {
  const nodes = byId(s.agents).map((a) => agentBlock(a, granted.get(a.id)!));
  for (const channel of [...new Set(s.accounts.map((a) => a.channel))]) {
    nodes.push(node({
      id: `channel:${channel}`,
      shape: "group",
      name: `channel = ${quoted(channel)}`,
    }));
  }
  for (const acc of s.accounts) {
    nodes.push(node({
      id: `account:${acc.id}`,
      parent: `channel:${acc.channel}`,
      shape: "block",
      keyword: "part",
      name: `account_${acc.id}`,
      type: "ChannelAccount",
      compartments: [{
        title: "attributes",
        rows: [
          ...(acc.dmPolicy ? [`dmPolicy = ${quoted(acc.dmPolicy)}`] : []),
          ...(acc.groupPolicy
            ? [`groupPolicy = ${quoted(acc.groupPolicy)}`]
            : []),
          ...(acc.enabled ? [] : ["enabled = false"]),
        ],
      }],
      attributes: [
        ["channel", acc.channel],
        ["accountId", acc.accountId],
        ["enabled", String(acc.enabled)],
        ["dmPolicy", acc.dmPolicy ?? "—"],
        ["groupPolicy", acc.groupPolicy ?? "—"],
      ],
      sysml: [inst("Entries", name("account", acc.id))],
      muted: !acc.enabled,
    }));
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: DiagramEdge[] = s.bindings
    .filter((b) =>
      ids.has(`agent:${b.agentId}`) && ids.has(`account:${b.account}`)
    )
    .map((b) => ({
      id: `binding:${b.id}`,
      kind: "connection",
      source: `agent:${b.agentId}`,
      target: `account:${b.account}`,
      label: b.peerKind,
      attributes: [],
      sysml: [inst("Entries", name("binding", b.id))],
    }));
  return {
    id: "system",
    title: "System",
    group: "Structure",
    nodes,
    edges,
    table: null,
  };
}

/** The Tools package as a SysML allocation matrix: the catalog's tools,
 * grouped by origin and provider, allocated to agents by their grants. */
function toolsView(s: Snapshot, granted: Map<string, Grant[]>): DiagramView {
  const agents = byId(s.agents);
  const holders = new Map<string, Map<string, Grant[]>>();
  const catalog = new Map<string, Grant["tool"]>();
  for (const a of agents) {
    for (const g of granted.get(a.id)!) {
      catalog.set(g.tool.key, g.tool);
      const byAgent = holders.get(g.tool.key) ?? new Map();
      byAgent.set(a.id, [...byAgent.get(a.id) ?? [], g]);
      holders.set(g.tool.key, byAgent);
    }
  }
  const columns = agents.map((a) => {
    const mine = granted.get(a.id)!;
    const count = (layer: string) =>
      new Set(mine.filter((g) => g.layer === layer).map((g) => g.tool.key))
        .size;
    return node({
      id: `agent:${a.id}`,
      shape: "block",
      keyword: "part",
      name: `agent_${a.id}`,
      type: `Agent_${a.id}`,
      text: a.name,
      attributes: [
        ["displayName", a.name],
        ["host grants", String(count("host"))],
        ["sandbox grants", String(count("sandbox"))],
      ],
      sysml: [inst("Operators", name("Agent", a.id))],
    });
  });
  const rows: DiagramNode[] = [], cells: DiagramEdge[] = [];
  const group = (origin: typeof ORIGINS[number]) => {
    rows.push(node({
      id: `origin:${origin}`,
      shape: "group",
      name: `origin = ${origin}`,
    }));
    return `origin:${origin}`;
  };
  const tool = (t: Grant["tool"], parent: string) => {
    const byAgent = holders.get(t.key)!;
    rows.push(node({
      id: `tool:${t.key}`,
      parent,
      shape: "tool",
      name: t.toolId,
      type: "OpenClawTool",
      attributes: [
        ["toolId", t.toolId],
        ["origin", t.origin],
        ["provider", t.provider ?? "—"],
        ["optional", String(t.optional)],
        ...agents.filter((a) => byAgent.has(a.id)).map((a) =>
          [`grant ${a.id}`, layersOf(byAgent.get(a.id)!).join(", ")] as [
            string,
            string,
          ]
        ),
      ],
      sysml: [inst("Tools", "toolCatalog", name("tool", t.key))],
    }));
    for (const a of agents.filter((a) => byAgent.has(a.id))) {
      const mine = byAgent.get(a.id)!, layers = layersOf(mine).join(", ");
      cells.push({
        id: `grant:${a.id}:${t.key}`,
        kind: "grant",
        source: `agent:${a.id}`,
        target: `tool:${t.key}`,
        label: layers,
        attributes: [["layer", layers]],
        sysml: mine.map((g) =>
          inst("Authority", name("grant", `${a.id}:${g.id}`))
        ),
      });
    }
  };
  const ghost = (toolId: string, parent: string) =>
    rows.push(node({
      id: `${parent}:${toolId}`,
      parent,
      shape: "tool",
      name: toolId,
      attributes: [["toolId", toolId], ["granted", "to no agent"]],
      muted: true,
      dashed: true,
    }));
  const tools = [...catalog.values()].sort((a, b) =>
    a.toolId < b.toolId ? -1 : a.toolId > b.toolId ? 1 : 0
  );
  const of = (origin: string, provider?: string) =>
    tools.filter((t) =>
      t.origin === origin && (provider === undefined || t.provider === provider)
    );
  if (of("builtin").length) {
    const g = group("builtin");
    for (const t of of("builtin")) tool(t, g);
  }
  if (s.plugins?.length) {
    const g = group("plugin");
    for (const p of s.plugins) {
      const id = `plugin:${p.id}`;
      rows.push(node({
        id,
        parent: g,
        shape: "frame",
        keyword: "part",
        name: `plugin_${p.id}`,
        type: "OpenClawPlugin",
        attributes: [
          ["pluginId", p.id],
          ["enabled", String(p.enabled)],
          ["tools", list(p.tools)],
          ["optionalTools", list(p.optionalTools)],
        ],
        sysml: [inst("Tools", name("plugin", p.id))],
        muted: !p.enabled,
      }));
      for (const t of of("plugin", p.id)) tool(t, id);
      for (const t of p.tools) if (!catalog.has(t)) ghost(t, id);
    }
  }
  if (s.mcpServers.length) {
    const g = group("mcp");
    for (const m of s.mcpServers) {
      const id = `mcp:${m.id}`;
      rows.push(node({
        id,
        parent: g,
        shape: "frame",
        keyword: "part",
        name: `mcp_${m.id}`,
        type: "McpServer",
        attributes: [
          ["serverId", m.id],
          ["toolPrefix", m.toolPrefix],
          ["enabled", String(m.enabled)],
          ["transport", m.transport],
        ],
        sysml: [inst("Tools", name("mcp", m.id))],
        muted: !m.enabled,
      }));
      for (const t of of("mcp", m.id)) tool(t, id);
      if (!of("mcp", m.id).length) ghost(`${m.toolPrefix}__*`, id);
    }
  }
  if (of("cli").length) {
    const g = group("cli");
    for (const t of of("cli")) tool(t, g);
  }
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  return {
    id: "tools",
    title: "Tools",
    group: "Structure",
    nodes: [...columns, ...rows],
    edges: cells,
    table: {
      kind: "matrix",
      columns: ids(columns),
      rows: ids(rows),
      cells: ids(cells),
    },
  };
}

function schedulesView(s: Snapshot): DiagramView | null {
  const agents = byId(s.agents);
  const known = new Set(agents.map((a) => a.id));
  const nodes: DiagramNode[] = [], edges: DiagramEdge[] = [];
  const targets = new Set<string>();
  const wake = (id: string, agentId: string | null) => {
    if (agentId === null) return;
    targets.add(agentId);
    edges.push({
      id: `wakes:${id}`,
      kind: known.has(agentId) ? "owner" : "target",
      source: id,
      target: `agent:${agentId}`,
      label: null,
      attributes: [],
      sysml: [],
    });
  };
  for (const a of agents) {
    if (!a.heartbeat) continue;
    const id = `heartbeat:${a.id}`;
    nodes.push(node({
      id,
      shape: "block",
      keyword: "part",
      name: `heartbeat_${a.id}`,
      type: "ScheduledCase",
      compartments: [{
        title: "attributes",
        rows: [
          `schedule = ${scheduleText("every", null, a.heartbeat.everyMs)}`,
          ...(a.heartbeat.everyMs > 0 ? [] : ["enabled = false"]),
        ],
      }],
      attributes: [
        ["every", scheduleText("every", null, a.heartbeat.everyMs) ?? "—"],
        ["everyMs", String(a.heartbeat.everyMs)],
        ["envelope", "reassessment"],
        ["target", a.heartbeat.target],
        ["prompt", a.heartbeat.prompt?.path ?? "—"],
      ],
      sysml: [inst("Cases", name("heartbeat", a.id))],
      muted: a.heartbeat.everyMs <= 0,
    }));
    wake(id, a.id);
  }
  for (const j of s.cron) {
    const id = `cron:${j.id}`, sc = j.schedule;
    const raw = sc.kind === "every"
      ? `every ${sc.everyMs} ms`
      : `${sc.kind} ${quoted(sc.expression ?? "")}`;
    const words = scheduleText(sc.kind, sc.expression, sc.everyMs);
    nodes.push(node({
      id,
      shape: "block",
      keyword: "part",
      name: `cron_${j.id}`,
      type: "ScheduledCase",
      compartments: [{
        title: "attributes",
        rows: [
          `displayName = ${quoted(j.name)}`,
          `schedule = ${raw}${sc.timezone ? ` ${sc.timezone}` : ""}`,
          ...(words ? [`  ${words}`] : []),
          ...(j.enabled ? [] : ["enabled = false"]),
        ],
      }],
      attributes: [
        ["displayName", j.name],
        ["enabled", String(j.enabled)],
        ["schedule", `${raw}${sc.timezone ? ` (${sc.timezone})` : ""}`],
        ["envelope", "deterministic"],
        ...(words ? [["in words", words] as [string, string]] : []),
        ["targetAgent", j.agentId ?? "—"],
        ["session", j.sessionTarget],
        ["wake mode", j.wakeMode],
        ["payload", j.payloadKind],
        ["last run", j.runtime.lastRunStatus ?? "—"],
      ],
      sysml: [inst("Cases", name("cron", j.id))],
      muted: !j.enabled,
    }));
    wake(id, j.agentId);
  }
  if (!nodes.length) return null;
  for (const id of [...targets].sort()) {
    const a = agents.find((x) => x.id === id);
    nodes.push(
      a
        ? node({
          id: `agent:${id}`,
          shape: "block",
          keyword: "part",
          name: `agent_${id}`,
          type: `Agent_${id}`,
          compartments: [{
            title: "attributes",
            rows: [`displayName = ${quoted(a.name)}`],
          }],
          attributes: [["displayName", a.name]],
          sysml: [inst("Operators", name("agent", id))],
        })
        : node({
          id: `agent:${id}`,
          shape: "block",
          keyword: "ref part",
          name: id,
          compartments: [{
            title: "unresolved",
            rows: ["no agent with this id"],
          }],
          attributes: [["targetAgent", id], ["agent", "not in this instance"]],
          muted: true,
          dashed: true,
        }),
    );
  }
  return {
    id: "schedules",
    title: "Scheduled tasks",
    group: "Cases",
    nodes,
    edges,
    table: null,
  };
}

const flowName = (agentId: string, id: string) =>
  name(agentId, id.replaceAll("-", "_"));
const stepName = (id: string) => name("step", id.replaceAll("-", "_"));
const plain = (n: string) =>
  n.startsWith("'") ? n.slice(1, -1).replace(/\\(.)/g, "$1") : n;

function behaviourView(
  s: Snapshot,
  agent: Agent,
  inference: Inference["agents"][number],
): DiagramView {
  const nodes: DiagramNode[] = [], edges: DiagramEdge[] = [];
  const targets = new Set<string>();
  const cite = (src: { file: string; fromLine: number; toLine: number }) =>
    `${src.file}:${src.fromLine}${
      src.toLine > src.fromLine ? `-${src.toLine}` : ""
    }`;
  for (const p of inference.procedures) {
    const proc = flowName(agent.id, p.id);
    const frame = `procedure:${p.id}`;
    nodes.push(node({
      id: frame,
      shape: "frame",
      keyword: "action def",
      name: plain(proc),
      text: p.title,
      compartments: [{ title: "trigger", rows: [p.trigger] }],
      attributes: [
        ["title", p.title],
        ["trigger", p.trigger],
        ["source", cite(p.source)],
      ],
      sysml: [inferred(proc)],
    }));
    const start = `${frame}:start`, end = `${frame}:end`;
    nodes.push(
      node({ id: start, parent: frame, shape: "initial", name: "start" }),
    );
    let previous = start;
    for (const step of p.steps) {
      const id = `step:${step.id}`;
      const shape = step.kind === "decision"
        ? "decision"
        : step.kind === "action"
        ? "action"
        : "send";
      nodes.push(node({
        id,
        parent: frame,
        shape,
        keyword: shape === "send" ? step.kind : null,
        name: plain(stepName(step.id)),
        text: step.text,
        attributes: [
          ["kind", step.kind],
          ["text", step.text],
          ...(step.target ? [["target", step.target] as [string, string]] : []),
        ],
        sysml: [inferred(proc, stepName(step.id))],
      }));
      edges.push(succession(previous, id));
      previous = id;
      if (step.target) {
        targets.add(step.target);
        edges.push({
          id: `${step.kind}:${step.id}`,
          kind: step.kind === "escalation" ? "escalation" : "handoff",
          source: id,
          target: `party:${step.target}`,
          label: step.kind === "escalation" ? "escalate" : "hand off",
          attributes: [],
          sysml: [],
        });
      }
    }
    nodes.push(node({ id: end, parent: frame, shape: "final", name: "done" }));
    edges.push(succession(previous, end));
  }
  for (const target of [...targets].sort()) {
    const a = s.agents.find((x) => x.id === target);
    nodes.push(
      a
        ? node({
          id: `party:${target}`,
          shape: "block",
          keyword: "part",
          name: `agent_${target}`,
          type: `Agent_${target}`,
          compartments: [{
            title: "attributes",
            rows: [`displayName = ${quoted(a.name)}`],
          }],
          attributes: [["displayName", a.name]],
          sysml: [inst("Operators", name("agent", target))],
          dashed: true,
        })
        : node({
          id: `party:${target}`,
          shape: "actor",
          name: target,
          attributes: [["party", target]],
        }),
    );
  }
  for (const r of inference.rules) {
    const rule = flowName(agent.id, r.id);
    nodes.push(node({
      id: `rule:${r.id}`,
      shape: "requirement",
      keyword: "requirement def",
      name: plain(rule),
      attributes: [
        ["kind", r.kind],
        ["text", r.text],
        ["source", cite(r.source)],
      ],
      sysml: [inferred(rule)],
    }));
  }
  return {
    id: `behaviour:${agent.id}`,
    title: `Behaviour · ${agent.name}`,
    group: "Behaviour",
    nodes,
    edges,
    table: inference.rules.length
      ? {
        kind: "elements",
        title: "Rules",
        rows: inference.rules.map((r) => `rule:${r.id}`),
        columns: ["kind", "text", "source"],
        facet: "kind",
      }
      : null,
  };
}

function succession(source: string, target: string): DiagramEdge {
  return {
    id: `then:${source}:${target}`,
    kind: "succession",
    source,
    target,
    label: null,
    attributes: [],
    sysml: [],
  };
}

/** The views of one version, in picker order. Behaviour views exist only
 * with inference, one per agent with at least one procedure or rule. */
export function diagramViews(
  snapshot: Snapshot,
  inference: Inference | null,
): DiagramView[] {
  const granted = new Map(
    snapshot.agents.map((a) => [a.id, grants(snapshot, a)]),
  );
  const views = [systemView(snapshot, granted), toolsView(snapshot, granted)];
  const cases = schedulesView(snapshot);
  if (cases) views.push(cases);
  const inferred = [...inference?.agents ?? []].sort((a, b) =>
    a.agentId < b.agentId ? -1 : 1
  );
  for (const a of inferred) {
    const agent = snapshot.agents.find((x) => x.id === a.agentId);
    if (agent && (a.procedures.length || a.rules.length)) {
      views.push(behaviourView(snapshot, agent, a));
    }
  }
  return views;
}
