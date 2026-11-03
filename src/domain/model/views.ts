import { name } from "./sysml-name.ts";
import { elementId } from "./element-id.ts";
import { type Grant, grants, ORIGINS } from "../openclaw/tool-grants.ts";
import { capabilityGroups } from "../openclaw/policy.ts";
import type { Inference } from "./inference.ts";
import {
  type Authority,
  authority,
  authorityAttributes,
  postureAttributes,
  runsOn,
} from "./posture.ts";
import type { Agent, Cron, Snapshot } from "./snapshot.ts";

/** Diagram model of one version: the viewer's views (Overview, System, Tools,
 * Scheduled tasks and, with inference, one Behaviour view per agent) as nodes
 * and edges, built from the snapshot and inference the emitter reads. Each element names
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
/** A count that an Overview row states, for the page to align and annotate. */
export interface Figure {
  /** The number to align: a count, or the enabled count when `of` is given.
   * Absent when the figure only splits (context). */
  n?: number;
  /** The count it is out of. */
  of?: number;
  /** Its split, in order: tools by origin, channel accounts by channel. */
  parts?: [label: string, n: number][];
  /** What the count stands for, for a tooltip: the fallback models. */
  names?: string[];
  /** Codes for glyphs: what memory holds (`search`, `curated`, `daily`). */
  flags?: string[];
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
  /** A step's or decision's text; the display name of an agent, a task or a
   * hook, which reads better than its declared name. */
  text: string | null;
  compartments: Compartment[];
  /** Shown by the inspector, in order. */
  attributes: [string, string][];
  /** An Overview row's counts by column, beside the text the table shows. */
  figures?: Record<string, Figure>;
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
  | "grant"
  /** An agent that may delegate to another (a `DelegationRule`). */
  | "delegation"
  /** A hook that starts an agent. */
  | "trigger";
export interface DiagramEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  label: string | null;
  /** A delegation edge that stands for both directions: the rule exists from
   * `source` to `target` and from `target` to `source`. */
  mutual?: true;
  /** Shown by the inspector, in order. */
  attributes: [string, string][];
  sysml: SysmlRef[];
}
/** When a scheduled case fires in a week, in its schedule's own time zone. */
export interface WeekRow {
  /** The scheduled case's node. */
  node: string;
  /** The agent it wakes, or null. */
  agent: string | null;
  label: string;
  when: string;
  enabled: boolean;
  /** A cron schedule's time zone; null for the gateway host's. */
  zone: string | null;
  /** The task's own model, or null. */
  model: string | null;
  /** Status of its last run (runtime state, not configuration), or null. */
  lastRun: string | null;
  /** [hour of the week from Monday 00:00, times it fires in that hour], or
   * null unless it repeats weekly (see `cronWeek`). */
  fires: [number, number][] | null;
  /** An interval's period; its start is unknown. */
  everyMs: number | null;
}
/** The elements a view shows as a table instead of drawing them, by id, or
 * the week in which its drawn scheduled cases fire. */
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
    /** Per row, the other views that show it, or null. */
    views: Record<string, string[]> | null;
    /** An element whose attributes sum the rows up, or null. */
    summary: string | null;
    /** The rows' (and summary's) figures follow from the declarations they
     * name: they change when those do, not when a figure that comes from
     * elsewhere (inference) does. */
    derived: boolean;
  }
  | { kind: "week"; rows: WeekRow[] };
/** A procedure of a Behaviour view, listed beside its drawing. */
export interface ProcedureItem {
  /** The id of its frame, which the page frames. */
  id: string;
  title: string;
  trigger: string;
  steps: number;
}
export interface DiagramView {
  id: string;
  title: string;
  group: "Structure" | "Cases" | "Behaviour";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  table: ViewTable | null;
  /** A Behaviour view's procedures, in drawing order. */
  procedures?: ProcedureItem[];
  /** A Behaviour view's agent: what its configuration lets it do. */
  authority?: Authority;
}

/** Attribute names that state runtime state, not configuration: the inspector
 * shows them, but a change in them is not a change of the element. */
export const RUNTIME_ATTRIBUTES: readonly string[] = ["last run"];

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
 * opens and closes it on one line, or ends a declaration with a semicolon. */
export function declarations(text: string): Map<string, [number, number]> {
  const lines = text.split("\n"), found = new Map<string, [number, number]>();
  const path: string[] = [];
  const header =
    /^( *)(?:(?:ref|abstract)\s+)?(?:package|part|item|connection|action|requirement)(?:\s+def)?\s+(?::>>\s*)?('(?:[^'\\]|\\.)*'|[A-Za-z_]\w*)[^\n{;]*(?:\{(.*)|;)$/;
  lines.forEach((line, i) => {
    const m = line.match(header);
    if (!m || m[1].length % 4) return;
    const depth = m[1].length / 4;
    path.length = depth;
    path[depth] = m[2];
    let end = i;
    if (m[3] !== undefined && !m[3].trimEnd().endsWith("}")) {
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
/** Capability groups of the built-in tools, those that reach furthest first
 * (OpenClaw's hardened baseline denies automation, runtime, fs and sessions). */
const CAPABILITY_ORDER = [
  "runtime",
  "fs",
  "automation",
  "sessions",
  "messaging",
  "nodes",
  "web",
  "memory",
  "ui",
  "agents",
  "media",
];
const ORIGIN_LABEL = {
  builtin: "built-in",
  plugin: "plugin",
  mcp: "MCP",
  cli: "CLI",
} as const;
const byId = <T extends { id: string }>(values: T[]) =>
  [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
/** The values of a cron field made of numbers, ranges, steps and lists, or
 * null for anything else or a value above `max`. */
function cronField(field: string, max: number): number[] | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const m = part.match(/^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/);
    if (!m) return null;
    const from = m[1] === undefined ? 0 : +m[1];
    const to = m[2] !== undefined
      ? +m[2]
      : m[1] === undefined || m[3] !== undefined
      ? max
      : from;
    const step = m[3] === undefined ? 1 : +m[3];
    if (to > max || from > to || step < 1) return null;
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return [...values].sort((a, b) => a - b);
}
/** A day-of-week field with its day names as numbers; a range that ends on
 * SUN ends on 7. */
const cronDays = (field: string) =>
  field.toUpperCase().replace(/-SUN\b/g, "-7").replace(
    /[A-Z]+/g,
    (d) => String(WEEKDAYS.indexOf(d)),
  );
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
  if (kind !== "cron" || f.length !== 5 || f[2] !== "*" || f[3] !== "*") {
    return null;
  }
  const minutes = cronField(f[0], 59), hours = cronField(f[1], 23);
  const days = f[4] === "*" ? [] : cronField(cronDays(f[4]), 7);
  if (!minutes || !hours || !days || hours.length * minutes.length > 4) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const times = hours.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`));
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const week = [...new Set(days.map((d) => (d + 6) % 7))].sort((a, b) => a - b);
  return `${week.length ? week.map((d) => names[d]).join(", ") : "daily"} at ${
    times.join(", ")
  }`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const enabledOf = (flags: boolean[]) =>
  flags.length
    ? `${flags.filter(Boolean).length} of ${flags.length} enabled`
    : "none";
const layersOf = (granted: Grant[]) =>
  [...new Set(granted.map((g) => g.layer))].sort();

function memoryText(a: Agent): string {
  const { search, daily, otherCount } = a.memory;
  const curated = a.workspace.instructions.some((f) => f.path === "MEMORY.md");
  return [
    search.enabled ? `search ${search.provider ?? "on"}` : "search off",
    ...(curated ? ["MEMORY.md"] : []),
    plural(daily.count, "daily note"),
    ...(otherCount ? [`${otherCount} other`] : []),
  ].join(" · ");
}
/** The distinct tools of some grants by origin, leaving out empty origins. */
function toolsByOrigin(granted: Grant[]): [string, string[]][] {
  return ORIGINS.map((origin): [string, string[]] => [
    ORIGIN_LABEL[origin],
    [
      ...new Set(
        granted.filter((g) => g.tool.origin === origin).map((g) =>
          g.tool.toolId
        ),
      ),
    ].sort(),
  ]).filter(([, ids]) => ids.length);
}
/** A count of tools with its split by origin: `16 · built-in 12, CLI 4`. */
function toolCount(granted: Grant[]): string {
  const origins = toolsByOrigin(granted);
  const total = origins.reduce((sum, [, ids]) => sum + ids.length, 0);
  return total
    ? `${total} · ${
      origins.map(([origin, ids]) => `${origin} ${ids.length}`).join(", ")
    }`
    : "none";
}

/** When a cron expression fires in a week: [hour of the week from Monday
 * 00:00, times in that hour], in the expression's own time zone. Null unless
 * it repeats weekly: five fields (or six, seconds first), day of month and
 * month `*` or `?`, the others numbers, ranges, steps, lists or day names. */
export function cronWeek(expression: string): [number, number][] | null {
  const f = expression.trim().toUpperCase().split(/\s+/);
  if (f.length === 5) f.unshift("0");
  if (f.length !== 6 || ![f[3], f[4]].every((x) => x === "*" || x === "?")) {
    return null;
  }
  const days = f[5] === "?" ? "*" : cronDays(f[5]);
  const [seconds, minutes, hours, weekdays] = [
    cronField(f[0], 59),
    cronField(f[1], 59),
    cronField(f[2], 23),
    cronField(days, 7),
  ];
  if (!seconds || !minutes || !hours || !weekdays) return null;
  const times = seconds.length * minutes.length;
  // Sunday is 0 or 7; the week starts on Monday.
  return [...new Set(weekdays.map((d) => (d + 6) % 7))].sort((a, b) => a - b)
    .flatMap((day) =>
      hours.map((h): [number, number] => [day * 24 + h, times])
    );
}

function agentBlock(a: Agent, granted: Grant[]): DiagramNode {
  const memory = memoryText(a);
  const layers = layersOf(granted);
  const tools = toolsByOrigin(granted).map(([origin, ids]) =>
    `${origin} (${ids.length}): ${ids.join(", ")}`
  );
  const skills = a.workspace.skills.map((s) => s.id);
  return node({
    id: elementId("agent", a.id),
    shape: "block",
    keyword: "part",
    name: `agent_${a.id}`,
    type: `Agent_${a.id}`,
    text: a.name,
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
      ...postureAttributes(a),
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

/** The instance's totals, as the Overview's summary. */
function instanceTotals(
  s: Snapshot,
  granted: Map<string, Grant[]>,
  inference: Inference | null,
): DiagramNode {
  const sum = (count: (a: Inference["agents"][number]) => number) =>
    inference!.agents.reduce((n, a) => n + count(a), 0);
  const sandboxed = s.agents.filter((a) => a.sandbox.mode !== "off");
  return node({
    id: elementId("instance"),
    shape: "block",
    keyword: "package",
    name: "OpenClawInstance",
    attributes: [
      ["agents", String(s.agents.length)],
      ["tools", toolCount([...granted.values()].flat())],
      ...(s.plugins?.length
        ? [["plugins", enabledOf(s.plugins.map((p) => p.enabled))] as [
          string,
          string,
        ]]
        : []),
      ...(s.mcpServers.length
        ? [[
          "MCP servers",
          enabledOf(s.mcpServers.map((m) => m.enabled)),
        ] as [string, string]]
        : []),
      ["channel accounts", enabledOf(s.accounts.map((a) => a.enabled))],
      ...(s.hooks.length
        ? [["hook mappings", String(s.hooks.length)] as [string, string]]
        : []),
      [
        "scheduled tasks",
        enabledOf([
          ...s.agents.flatMap((a) =>
            a.heartbeat ? [a.heartbeat.everyMs > 0] : []
          ),
          ...s.cron.map((j) => j.enabled),
        ]),
      ],
      ...(sandboxed.length
        ? [[
          "elevated exec",
          `${
            sandboxed.filter((a) => a.execution.elevated).length
          } of ${sandboxed.length} sandboxed`,
        ] as [string, string]]
        : []),
      ...(inference
        ? [[
          "inferred",
          inferredText(
            sum((a) => a.procedures.length),
            sum((a) => a.rules.length),
          ),
        ] as [string, string]]
        : []),
    ],
    // What the instance-level findings stand on: the inventory, the policies
    // and the providers that no agent row names.
    sysml: [
      inst("inventory"),
      inst("Authority", "messaging"),
      ...(s.execApprovals ? [inst("Authority", "execApprovals")] : []),
      inst("Context", "memoryBackend"),
      ...s.providers.map((p) => inst("Operators", name("provider", p.id))),
    ],
  });
}
const inferredText = (procedures: number, rules: number) =>
  `${plural(procedures, "procedure")} · ${plural(rules, "rule")}`;

/** The instance at a glance: one row per agent summing up what the other
 * views show of it, each naming the declarations it sums up, and the
 * instance's totals. */
function overviewView(
  s: Snapshot,
  granted: Map<string, Grant[]>,
  inference: Inference | null,
  others: DiagramView[],
): DiagramView {
  const agents = byId(s.agents);
  const bound = (agentId: string) =>
    s.bindings.filter((b) => b.agentId === agentId).flatMap((b) => {
      const acc = s.accounts.find((x) => x.id === b.account);
      return acc ? [{ binding: b, account: acc }] : [];
    });
  const cases = (agentId: string) => [
    ...s.agents.filter((a) => a.id === agentId && a.heartbeat).map((a) => ({
      enabled: a.heartbeat!.everyMs > 0,
      ref: inst("Cases", name("heartbeat", a.id)),
    })),
    ...s.cron.filter((j) => j.agentId === agentId).map((j) => ({
      enabled: j.enabled,
      ref: inst("Cases", name("cron", j.id)),
    })),
  ];
  const inferredOf = (agentId: string) =>
    inference?.agents.find((x) => x.agentId === agentId);
  const rows = agents.map((a) => {
    const id = elementId("agent", a.id), inferred = inferredOf(a.id);
    const accounts = bound(a.id), tasks = cases(a.id);
    const hooks = s.hooks.filter((h) => h.agentId === a.id);
    const mine = granted.get(a.id)!, origins = toolsByOrigin(mine);
    const channels = new Map<string, number>();
    for (const { account } of accounts) {
      channels.set(account.channel, (channels.get(account.channel) ?? 0) + 1);
    }
    return node({
      id,
      shape: "block",
      keyword: "part",
      name: `agent_${a.id}`,
      type: `Agent_${a.id}`,
      text: a.name,
      attributes: [
        [
          "model",
          [
            a.model.primary ?? "—",
            ...(a.model.fallbacks.length
              ? [plural(a.model.fallbacks.length, "fallback")]
              : []),
          ].join(" · "),
        ],
        ["runs on", runsOn(a)],
        ["tools", toolCount(mine)],
        [
          "channels",
          list(
            accounts.map(({ account }) =>
              `${account.id}${account.enabled ? "" : " (disabled)"}`
            ),
          ),
        ],
        ["scheduled tasks", enabledOf(tasks.map((c) => c.enabled))],
        [
          "context",
          `${plural(a.workspace.instructions.length, "instruction")} · ${
            plural(a.workspace.skills.length, "skill")
          } · memory ${memoryText(a)}`,
        ],
        ...(inferred
          ? [
            [
              "inferred",
              inferredText(inferred.procedures.length, inferred.rules.length),
            ] as [string, string],
            ["inferred role", inferred.role] as [string, string],
          ]
          : []),
        ...(a.model.fallbacks.length
          ? [["fallback models", list(a.model.fallbacks)] as [string, string]]
          : []),
        ...postureAttributes(a),
      ],
      figures: {
        model: { n: a.model.fallbacks.length, names: a.model.fallbacks },
        tools: {
          n: origins.reduce((sum, [, ids]) => sum + ids.length, 0),
          parts: origins.map(([origin, ids]) => [origin, ids.length]),
        },
        channels: {
          n: accounts.filter(({ account }) => account.enabled).length,
          of: accounts.length,
          parts: [...channels],
        },
        "scheduled tasks": {
          n: tasks.filter((c) => c.enabled).length,
          of: tasks.length,
        },
        context: {
          parts: [
            ["instructions", a.workspace.instructions.length],
            ["skills", a.workspace.skills.length],
            ["daily notes", a.memory.daily.count],
          ],
          flags: [
            ...(a.memory.search.enabled ? ["search"] : []),
            ...(a.workspace.instructions.some((f) => f.path === "MEMORY.md")
              ? ["curated"]
              : []),
            ...(a.memory.daily.count ? ["daily"] : []),
          ],
        },
      },
      sysml: [
        inst("Operators", name("Agent", a.id)),
        inst("Operators", name("agent", a.id)),
        ...accounts.flatMap(({ binding, account }) => [
          inst("Entries", name("binding", binding.id)),
          inst("Entries", name("account", account.id)),
        ]),
        ...hooks.map((h) => inst("Entries", name("hook", h.id))),
        ...tasks.map((c) => c.ref),
      ],
    });
  });
  const totals = instanceTotals(s, granted, inference);
  return {
    id: "overview",
    title: "Overview",
    group: "Structure",
    nodes: [...rows, totals],
    edges: [],
    table: {
      kind: "elements",
      title: "Agents",
      rows: rows.map((n) => n.id),
      columns: [
        "model",
        "runs on",
        "tools",
        "channels",
        "scheduled tasks",
        "context",
        ...(inference ? ["inferred"] : []),
      ],
      facet: "runs on",
      views: Object.fromEntries(
        agents.map((a) => [
          elementId("agent", a.id),
          others.filter((v) =>
            v.id === `behaviour:${a.id}` ||
            v.nodes.some((n) => n.id === elementId("agent", a.id))
          ).map((v) => v.id),
        ]),
      ),
      summary: totals.id,
      derived: true,
    },
  };
}

/** An agent id that no agent of the instance has, drawn as a dashed reference. */
function missingAgent(id: string): DiagramNode {
  return node({
    id: elementId("agent", id),
    shape: "block",
    keyword: "ref part",
    name: id,
    compartments: [{ title: "unresolved", rows: ["no agent with this id"] }],
    attributes: [["targetAgent", id], ["agent", "not in this instance"]],
    muted: true,
    dashed: true,
  });
}

/** The hook mappings: a block per hook and an edge from it to the agent it
 * starts, or to a dashed reference when the instance has no such agent. A
 * hook delivers to a channel but is not part of one. */
function hookParts(s: Snapshot, known: Set<string>, parent: string | null) {
  const nodes: DiagramNode[] = [], edges: DiagramEdge[] = [];
  const absent = new Set<string>();
  for (const h of s.hooks) {
    const id = elementId("hook", h.id),
      ref = inst("Entries", name("hook", h.id));
    nodes.push(node({
      id,
      parent,
      shape: "block",
      keyword: "part",
      name: `hook_${h.id}`,
      type: "ExternalTrigger",
      text: h.name,
      compartments: [{
        title: "attributes",
        rows: [
          `name = ${quoted(h.name)}`,
          ...(h.channel ? [`deliveryChannel = ${quoted(h.channel)}`] : []),
        ],
      }],
      attributes: [
        ["name", h.name],
        ["target agent", h.agentId],
        ["delivery channel", h.channel ?? "last (default)"],
        ...(h.template
          ? [
            [
              "message template",
              `${h.template.path} · ${h.template.bytes} bytes`,
            ] as [
              string,
              string,
            ],
          ]
          : []),
      ],
      sysml: [ref],
    }));
    const resolved = known.has(h.agentId);
    if (!resolved && !absent.has(h.agentId)) {
      absent.add(h.agentId);
      nodes.push(missingAgent(h.agentId));
    }
    edges.push({
      id: `trigger:${h.id}`,
      kind: resolved ? "trigger" : "target",
      source: id,
      target: elementId("agent", h.agentId),
      label: null,
      attributes: [],
      sysml: [ref],
    });
  }
  return { nodes, edges };
}

function systemView(s: Snapshot, granted: Map<string, Grant[]>): DiagramView {
  const nodes = byId(s.agents).map((a) => agentBlock(a, granted.get(a.id)!));
  for (const channel of [...new Set(s.accounts.map((a) => a.channel))]) {
    nodes.push(node({
      id: elementId("channel", channel),
      shape: "group",
      name: `channel = ${quoted(channel)}`,
    }));
  }
  for (const acc of s.accounts) {
    nodes.push(node({
      id: elementId("account", acc.id),
      parent: elementId("channel", acc.channel),
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
      ids.has(elementId("agent", b.agentId)) &&
      ids.has(elementId("account", b.account))
    )
    .map((b) => ({
      id: elementId("binding", b.id),
      kind: "connection",
      source: elementId("agent", b.agentId),
      target: elementId("account", b.account),
      label: b.peerKind,
      attributes: [],
      sysml: [inst("Entries", name("binding", b.id))],
    }));
  if (s.hooks.length) {
    nodes.push(node({
      id: elementId("hooks"),
      shape: "group",
      name: "hook mappings",
    }));
    const hooks = hookParts(
      s,
      new Set(s.agents.map((a) => a.id)),
      elementId("hooks"),
    );
    nodes.push(...hooks.nodes);
    edges.push(...hooks.edges);
  }
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
      id: elementId("agent", a.id),
      shape: "block",
      keyword: "part",
      name: `agent_${a.id}`,
      type: `Agent_${a.id}`,
      text: a.name,
      attributes: [
        ["displayName", a.name],
        ["host grants", String(count("host"))],
        ["sandbox grants", String(count("sandbox"))],
        ...postureAttributes(a),
      ],
      sysml: [inst("Operators", name("Agent", a.id))],
    });
  });
  const rows: DiagramNode[] = [], cells: DiagramEdge[] = [];
  const group = (origin: typeof ORIGINS[number]) => {
    rows.push(node({
      id: elementId("origin", origin),
      shape: "group",
      name: `origin = ${origin}`,
    }));
    return elementId("origin", origin);
  };
  const tool = (t: Grant["tool"], parent: string) => {
    const byAgent = holders.get(t.key)!;
    const server = t.origin === "mcp"
      ? s.mcpServers.find((m) => m.id === t.provider)
      : undefined;
    const exposed = (names: string[]) =>
      names.map((n) => `${server!.toolPrefix}__${n}`).join(", ");
    rows.push(node({
      id: elementId("tool", t.key),
      parent,
      shape: "tool",
      name: t.toolId,
      type: "OpenClawTool",
      attributes: [
        ["toolId", t.toolId],
        ["origin", t.origin],
        ["provider", t.provider ?? "—"],
        ["optional", String(t.optional)],
        // The grant stays the whole server's: a filter narrows what it exposes.
        ...(server?.toolFilter.include.length
          ? [["exposed", exposed(server.toolFilter.include)] as [
            string,
            string,
          ]]
          : []),
        ...(server?.toolFilter.exclude.length
          ? [["excluded", exposed(server.toolFilter.exclude)] as [
            string,
            string,
          ]]
          : []),
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
        id: elementId("grant", a.id, t.key),
        kind: "grant",
        source: elementId("agent", a.id),
        target: elementId("tool", t.key),
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
    const g = group("builtin"), left = new Set(of("builtin"));
    // Built-in tools by the capability groups their OpenClaw version names,
    // the ones that reach furthest first; a tool joins the first group naming it.
    const named = new Map(capabilityGroups(s.openclawVersion));
    const names = [
      ...CAPABILITY_ORDER.filter((n) => named.has(`group:${n}`)),
      ...[...named.keys()].map((k) => k.slice(6)).filter((n) =>
        !CAPABILITY_ORDER.includes(n)
      ),
      "other",
    ];
    for (const n of names) {
      const members = named.get(`group:${n}`);
      const here = of("builtin").filter((t) =>
        left.has(t) && (members ? members.includes(t.toolId) : true)
      );
      if (!here.length) continue;
      const id = elementId("capability", n);
      rows.push(
        node({ id, parent: g, shape: "group", name: `capability = ${n}` }),
      );
      for (const t of here) {
        left.delete(t);
        tool(t, id);
      }
    }
  }
  if (s.plugins?.length) {
    const g = group("plugin");
    for (const p of s.plugins) {
      const id = elementId("plugin", p.id);
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
          ...(p.toolProfiles.length
            ? [[
              "toolProfiles",
              p.toolProfiles.map((t) => `${t.id}: ${t.profiles.join(", ")}`)
                .join("; "),
            ] as [string, string]]
            : []),
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
      const id = elementId("mcp", m.id);
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
          ["oauth", String(m.oauth)],
          ...(m.oauthIdentity
            ? [["oauthIdentity", m.oauthIdentity] as [string, string]]
            : []),
          ...(m.toolFilter.include.length
            ? [["toolInclude", list(m.toolFilter.include)] as [string, string]]
            : []),
          ...(m.toolFilter.exclude.length
            ? [["toolExclude", list(m.toolFilter.exclude)] as [string, string]]
            : []),
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

/** Where a task's result goes: its mode and the channel, with the account. */
function deliveryText(d: Cron["delivery"]): string {
  const channel = d.channel && d.accountId
    ? `${d.channel}:${d.accountId}`
    : d.channel;
  return [d.mode, channel].filter(Boolean).join(" · ") || "—";
}

function schedulesView(s: Snapshot): DiagramView | null {
  const agents = byId(s.agents);
  const known = new Set(agents.map((a) => a.id));
  const nodes: DiagramNode[] = [], edges: DiagramEdge[] = [];
  const week: WeekRow[] = [];
  const targets = new Set<string>();
  const wake = (id: string, agentId: string | null) => {
    if (agentId === null) return;
    targets.add(agentId);
    edges.push({
      id: `wakes:${id}`,
      kind: known.has(agentId) ? "owner" : "target",
      source: id,
      target: elementId("agent", agentId),
      label: null,
      attributes: [],
      sysml: [],
    });
  };
  for (const a of agents) {
    if (!a.heartbeat) continue;
    const id = elementId("heartbeat", a.id);
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
    week.push({
      node: id,
      agent: a.id,
      label: "heartbeat",
      when: scheduleText("every", null, a.heartbeat.everyMs) ?? "never",
      enabled: a.heartbeat.everyMs > 0,
      zone: null,
      model: null,
      lastRun: null,
      fires: null,
      everyMs: a.heartbeat.everyMs > 0 ? a.heartbeat.everyMs : null,
    });
    wake(id, a.id);
  }
  for (const j of s.cron) {
    const id = elementId("cron", j.id), sc = j.schedule;
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
      text: j.name,
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
        ["primaryModel", j.model ?? "—"],
        ["delivery", deliveryText(j.delivery)],
        ["session", j.sessionTarget],
        ["wake mode", j.wakeMode],
        ["payload", j.payloadKind],
        ["last run", j.runtime.lastRunStatus ?? "—"],
      ],
      sysml: [inst("Cases", name("cron", j.id))],
      muted: !j.enabled,
    }));
    week.push({
      node: id,
      agent: j.agentId,
      label: j.name,
      when: words ?? raw,
      enabled: j.enabled,
      zone: sc.kind === "cron" ? sc.timezone : null,
      model: j.model,
      lastRun: j.runtime.lastRunStatus,
      fires: sc.kind === "cron" ? cronWeek(sc.expression ?? "") : null,
      everyMs: sc.kind === "every" ? sc.everyMs : null,
    });
    wake(id, j.agentId);
  }
  if (!nodes.length) return null;
  for (const id of [...targets].sort()) {
    const a = agents.find((x) => x.id === id);
    nodes.push(
      a
        ? node({
          id: elementId("agent", id),
          shape: "block",
          keyword: "part",
          name: `agent_${id}`,
          type: `Agent_${id}`,
          text: a.name,
          compartments: [{
            title: "attributes",
            rows: [`displayName = ${quoted(a.name)}`],
          }],
          attributes: [["displayName", a.name]],
          sysml: [inst("Operators", name("agent", id))],
        })
        : missingAgent(id),
    );
  }
  return {
    id: "schedules",
    title: "Scheduled tasks",
    group: "Cases",
    nodes,
    edges,
    table: { kind: "week", rows: week },
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
  const auth = authority(agent);
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
        ...(r.concern ? [["concern", r.concern] as [string, string]] : []),
        ...authorityAttributes(auth),
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
    procedures: inference.procedures.map((p) => ({
      id: `procedure:${p.id}`,
      title: p.title,
      trigger: p.trigger,
      steps: p.steps.length,
    })),
    authority: auth,
    table: inference.rules.length
      ? {
        kind: "elements",
        title: "Rules",
        rows: inference.rules.map((r) => `rule:${r.id}`),
        columns: ["kind", "text", "source"],
        facet: "kind",
        views: null,
        summary: null,
        derived: false,
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

/** Who can reach whom: the agents with their posture, the delegation between
 * them (one double-ended edge for a pair that delegates both ways), the hooks
 * that start them, and the instance-wide messaging policy as a block of its
 * own. A view of its own, not part of System, whose agents are all in the
 * first layer. Null when nothing links an agent to anything. */
function reachView(s: Snapshot): DiagramView | null {
  const agents = byId(s.agents), known = new Set(agents.map((a) => a.id));
  const wants = new Map(agents.map((a) => [
    a.id,
    new Set(a.delegation.filter((t) => t !== a.id && known.has(t))),
  ]));
  const rule = (from: string, to: string) =>
    inst("Authority", name("delegation", `${from}:${to}`));
  const edges: DiagramEdge[] = [];
  for (const a of agents) {
    for (const to of [...wants.get(a.id)!].sort()) {
      const both = wants.get(to)!.has(a.id);
      if (both && to < a.id) continue;
      edges.push({
        id: elementId("delegation", a.id, to),
        kind: "delegation",
        source: elementId("agent", a.id),
        target: elementId("agent", to),
        label: null,
        ...(both ? { mutual: true as const } : {}),
        attributes: [
          ["from", a.id],
          ["to", to],
          ...(both ? [["both ways", "yes"] as [string, string]] : []),
        ],
        sysml: [rule(a.id, to), ...(both ? [rule(to, a.id)] : [])],
      });
    }
  }
  const nodes = agents.map((a) => {
    const channels = s.bindings.filter((b) => b.agentId === a.id).length;
    const tasks = (a.heartbeat ? 1 : 0) +
      s.cron.filter((j) => j.agentId === a.id).length;
    const hooks = s.hooks.filter((h) => h.agentId === a.id).length;
    const unknown = a.delegation.filter((t) =>
      t !== "*" && t !== a.id && !known.has(t)
    );
    const delegatedBy = agents.filter((x) => wants.get(x.id)!.has(a.id))
      .map((x) => x.id);
    return node({
      id: elementId("agent", a.id),
      shape: "block",
      keyword: "part",
      name: `agent_${a.id}`,
      type: `Agent_${a.id}`,
      text: a.name,
      compartments: [
        {
          title: "posture",
          rows: postureAttributes(a).map(([k, v]) => `${k}: ${v}`),
        },
        {
          title: "inputs",
          rows: [`${plural(channels, "channel")} · ${plural(tasks, "task")}`],
        },
        ...(a.delegation.includes("*") || unknown.length
          ? [{
            title: "delegates to",
            rows: [
              ...(a.delegation.includes("*") ? ["any agent (*)"] : []),
              ...(unknown.length ? [`unknown: ${unknown.join(", ")}`] : []),
            ],
          }]
          : []),
      ],
      attributes: [
        ["id", a.id],
        ["displayName", a.name],
        ...postureAttributes(a),
        ["delegates to", list(a.delegation.filter((t) => t !== a.id))],
        ["delegated by", list(delegatedBy)],
        ["channels", String(channels)],
        ["scheduled tasks", String(tasks)],
        ["hooks", String(hooks)],
      ],
      sysml: [
        inst("Operators", name("Agent", a.id)),
        inst("Operators", name("agent", a.id)),
        inst("Authority", name("delegationPolicy", a.id)),
      ],
    });
  });
  const hooks = hookParts(s, known, null);
  const messaging = s.messaging.enabled
    ? [node({
      id: elementId("messaging"),
      shape: "block",
      keyword: "part",
      name: "messaging",
      type: "MessagingPolicy",
      compartments: [{
        title: "attributes",
        rows: [`allowedTargets = ${list(s.messaging.allowedTargets)}`],
      }],
      attributes: [
        ["enabled", "true"],
        ["allowedTargets", list(s.messaging.allowedTargets)],
        ["scope", "instance-wide"],
      ],
      sysml: [inst("Authority", "messaging")],
    })]
    : [];
  const wildcard = agents.some((a) => a.delegation.includes("*"));
  if (!edges.length && !hooks.nodes.length && !messaging.length && !wildcard) {
    return null;
  }
  return {
    id: "reach",
    title: "Reach",
    group: "Structure",
    nodes: [...nodes, ...hooks.nodes, ...messaging],
    edges: [...edges, ...hooks.edges],
    table: null,
  };
}

/** The views of one version, in picker order, the Overview first. Behaviour
 * views exist only with inference, one per agent with at least one procedure
 * or rule. */
export function diagramViews(
  snapshot: Snapshot,
  inference: Inference | null,
): DiagramView[] {
  const granted = new Map(
    snapshot.agents.map((a) => [a.id, grants(snapshot, a)]),
  );
  const views = [systemView(snapshot, granted)];
  const reach = reachView(snapshot);
  if (reach) views.push(reach);
  views.push(toolsView(snapshot, granted));
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
  return [overviewView(snapshot, granted, inference, views), ...views];
}
