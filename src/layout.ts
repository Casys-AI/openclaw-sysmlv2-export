import * as elkjs from "elkjs/lib/elk.bundled.js";
import type { ELK, ElkNode } from "elkjs/lib/elk.bundled.js";
import type { DiagramNode, DiagramView, EdgeKind, Shape } from "./views.ts";

/** Positioned geometry of a view, computed at export time so the page only
 * draws SVG. Text is measured with Helvetica's metrics: the page draws
 * diagrams in Helvetica or its metric twins (Arial, Liberation Sans). Rows that
 * do not fit are cut with an ellipsis; the inspector keeps the full values.
 * ELK's algorithms are deterministic, and coordinates are rounded, so the same
 * view always gives the same scene. */

export interface SceneLabel {
  x: number;
  y: number;
  lines: string[];
}
export interface SceneNode {
  id: string;
  /** The containing frame or group, if any. */
  parent?: string;
  shape: Shape;
  x: number;
  y: number;
  w: number;
  h: number;
  kw?: string;
  name?: string;
  type?: string;
  /** A frame's tab width, and a procedure's title and trigger lines. */
  tab?: number;
  title?: string;
  head?: string[];
  comps?: [string, string[]][];
  /** Wrapped text of a step. */
  lines?: string[];
  /** A decision's text, beside its diamond. */
  label?: SceneLabel;
  slots?: string;
  /** The type is drawn on its own line, under the name. */
  split?: true;
  muted?: true;
  dashed?: true;
}
export interface SceneEdge {
  id: string;
  kind: EdgeKind;
  s: string;
  t: string;
  /** One polyline per section, as [x0, y0, x1, y1, …]. */
  pts: number[][];
  label?: SceneLabel;
}
export interface Scene {
  w: number;
  h: number;
  /** Containers before their contents: drawing order is painting order. */
  nodes: SceneNode[];
  edges: SceneEdge[];
}

// Helvetica advance widths (1/1000 em) for U+0020…U+007E, regular and bold.
const REGULAR = [
  278,
  278,
  355,
  556,
  556,
  889,
  667,
  191,
  333,
  333,
  389,
  584,
  278,
  333,
  278,
  278,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  278,
  278,
  584,
  584,
  584,
  556,
  1015,
  667,
  667,
  722,
  722,
  667,
  611,
  778,
  722,
  278,
  500,
  667,
  556,
  833,
  722,
  778,
  667,
  778,
  722,
  667,
  611,
  722,
  667,
  944,
  667,
  667,
  611,
  278,
  278,
  278,
  469,
  556,
  333,
  556,
  556,
  500,
  556,
  556,
  278,
  556,
  556,
  222,
  222,
  500,
  222,
  833,
  556,
  556,
  556,
  556,
  333,
  500,
  278,
  556,
  500,
  722,
  500,
  500,
  500,
  334,
  260,
  334,
  584,
];
const BOLD = [
  278,
  333,
  474,
  556,
  556,
  889,
  722,
  238,
  333,
  333,
  389,
  584,
  278,
  333,
  278,
  278,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  333,
  333,
  584,
  584,
  584,
  611,
  975,
  722,
  722,
  722,
  722,
  667,
  611,
  778,
  722,
  278,
  556,
  722,
  611,
  833,
  722,
  778,
  667,
  778,
  722,
  667,
  611,
  722,
  667,
  944,
  667,
  667,
  611,
  333,
  278,
  333,
  584,
  556,
  333,
  556,
  611,
  556,
  611,
  556,
  333,
  611,
  611,
  278,
  278,
  556,
  278,
  889,
  611,
  611,
  611,
  611,
  389,
  556,
  333,
  611,
  556,
  778,
  556,
  556,
  500,
  389,
  280,
  389,
  584,
];
type Role = "kw" | "name" | "type" | "sect" | "row" | "text" | "edge" | "tool";
/** Font size and weight of each text role; the page's CSS uses the same. */
const FONT: Record<Role, [number, boolean]> = {
  kw: [10, false],
  name: [12.5, true],
  type: [12.5, false],
  sect: [10, false],
  row: [11.5, false],
  text: [12, false],
  edge: [10.5, false],
  tool: [11.5, false],
};
function advance(c: string, bold: boolean): number {
  const code = c.codePointAt(0)!;
  if (code >= 32 && code <= 126) return (bold ? BOLD : REGULAR)[code - 32];
  // Combining marks, zero-width joiners and variation selectors.
  if (
    (code >= 0x300 && code <= 0x36f) || (code >= 0x200b && code <= 0x200d) ||
    (code >= 0xfe00 && code <= 0xfe0f)
  ) return 0;
  if (code === 0xab || code === 0xbb) return 556; // « »
  if (code === 0xb7 || code === 0x2018 || code === 0x2019) return 278;
  if (code === 0x2026 || code === 0x2014 || code === 0x2192) return 1000;
  if (code > 0xffff) return 1250;
  return code >= 0x2e80 ? 1000 : 600;
}
/** Width in pixels, with a small margin for kerning and hinting. */
export function measure(text: string, role: Role): number {
  const [size, bold] = FONT[role];
  let units = 0;
  for (const c of text) units += advance(c, bold);
  return units * size / 1000 * 1.04;
}
function fit(text: string, role: Role, max: number): string {
  if (measure(text, role) <= max) return text;
  const chars = [...text];
  while (chars.length && measure(`${chars.join("")}…`, role) > max) {
    chars.pop();
  }
  return `${chars.join("").trimEnd()}…`;
}
function wrap(text: string, role: Role, max: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, role) > max) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  const kept = out.slice(0, lines).map((l) => fit(l, role, max));
  if (out.length > lines) {
    kept[lines - 1] = fit(`${kept[lines - 1]} …`, role, max);
  }
  return kept;
}

/** Drawing metrics shared with the page's renderer. */
export const METRICS = {
  padX: 12,
  padTop: 8,
  kwH: 13,
  nameH: 17,
  rowH: 16,
  sectH: 15,
  sectGap: 5,
  padBottom: 8,
  tabH: 24,
  headH: 16,
  lineH: 15,
  slot: 9,
  slotGap: 3,
} as const;
const M = METRICS;
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Sized {
  w: number;
  h: number;
  scene: Omit<SceneNode, "id" | "x" | "y" | "w" | "h">;
  label?: string[];
}

const keyword = (n: DiagramNode) => n.keyword ? `«${n.keyword}»` : undefined;
const stripWidth = (slots: string) =>
  slots.length * (M.slot + M.slotGap) - M.slotGap;

/** A block's header and compartments, rows cut to the widest allowed. A type
 * that does not fit beside the name goes on its own line. A legend block
 * (Tools) ends with the agent's grant slot. */
function block(n: DiagramNode, max: number): Sized {
  const kw = keyword(n);
  const type = n.type ? ` : ${n.type}` : "";
  const inner = max - 2 * M.padX;
  const comps = n.compartments.map((c) =>
    [c.title, c.rows.map((r) => fit(r, "row", inner))] as [string, string[]]
  );
  const name = fit(n.name, "name", inner);
  const split = measure(name, "name") + measure(type, "type") > inner;
  const head = split
    ? Math.max(measure(name, "name"), measure(type.trim(), "type"))
    : measure(name, "name") + measure(type, "type");
  const w = Math.min(
    max,
    Math.max(
      150,
      (kw ? measure(kw, "kw") : 0) + 2 * M.padX,
      head + 2 * M.padX,
      n.slots ? stripWidth(n.slots) + 2 * M.padX : 0,
      ...comps.flatMap(([t, rows]) => [
        measure(t, "sect") + 2 * M.padX,
        ...rows.map((r) => measure(r, "row") + 2 * M.padX),
      ]),
    ),
  );
  const h = M.padTop + (kw ? M.kwH : 0) + M.nameH * (split ? 2 : 1) + 4 +
    comps.reduce(
      (sum, [, rows]) => sum + M.sectGap + M.sectH + rows.length * M.rowH,
      0,
    ) + M.padBottom + (n.slots ? M.slot + 8 : 0);
  return {
    w,
    h,
    scene: {
      shape: n.shape,
      kw,
      name,
      ...(type ? { type: fit(split ? type.trim() : type, "type", inner) } : {}),
      ...(split ? { split: true as const } : {}),
      comps,
      ...(n.slots ? { slots: n.slots } : {}),
    },
  };
}

/** Size of a leaf element and what the page draws inside it. */
function leaf(n: DiagramNode, max: number): Sized {
  switch (n.shape) {
    case "initial":
      return { w: 16, h: 16, scene: { shape: n.shape } };
    case "final":
      return { w: 20, h: 20, scene: { shape: n.shape } };
    case "decision":
      return {
        w: 28,
        h: 28,
        scene: { shape: n.shape },
        label: wrap(n.text ?? "", "text", 190, 4),
      };
    case "action":
    case "send": {
      const lines = wrap(n.text ?? "", "text", 200, 4);
      const kw = keyword(n);
      const text = Math.max(
        ...lines.map((l) => measure(l, "text")),
        kw ? measure(kw, "kw") : 0,
      );
      return {
        w: Math.max(150, text + 32) + (n.shape === "send" ? 14 : 0),
        h: lines.length * M.lineH + (kw ? M.kwH : 0) + 24,
        scene: { shape: n.shape, ...(kw ? { kw } : {}), lines },
      };
    }
    case "actor":
      return {
        w: Math.max(64, measure(n.name, "name") + 12),
        h: 66,
        scene: { shape: n.shape, name: n.name },
      };
    case "requirement":
      return block({
        ...n,
        compartments: [
          {
            title: n.compartments[0].title,
            rows: wrap(n.text ?? "", "row", max - 2 * M.padX, 5),
          },
          { title: "source", rows: n.compartments[0].rows },
        ],
      }, max);
    default:
      return block(n, max);
  }
}

/** A container's header: its tab (or a group's label) and, for a procedure,
 * its title and trigger; `top` is the space they take. */
function header(
  n: DiagramNode,
): { scene: Sized["scene"]; top: number; w: number } {
  if (n.shape === "group") {
    return {
      scene: { shape: "group", name: n.name },
      top: 30,
      w: measure(n.name, "sect") + 24,
    };
  }
  const kw = keyword(n)!, type = n.type ? ` : ${n.type}` : "";
  const tab = Math.round(
    measure(`${kw} `, "kw") + measure(n.name, "name") + measure(type, "type") +
      28,
  );
  const title = n.text ? fit(n.text, "name", 320) : undefined;
  const head = n.compartments.flatMap((c) =>
    c.rows.flatMap((r) => wrap(`${c.title}: ${r}`, "sect", 300, 2))
  );
  const lines = (title ? 1 : 0) + head.length;
  return {
    scene: {
      shape: "frame",
      kw,
      name: n.name,
      ...(type ? { type } : {}),
      tab,
      ...(title ? { title } : {}),
      ...(head.length ? { head } : {}),
    },
    top: M.tabH + 14 + lines * M.headH + (lines ? 12 : 0),
    w: Math.max(
      tab,
      title ? measure(title, "name") + 32 : 0,
      ...head.map((l) => measure(l, "sect") + 32),
    ),
  };
}
const flags = (n: DiagramNode) => ({
  ...(n.parent ? { parent: n.parent } : {}),
  ...(n.muted ? { muted: true as const } : {}),
  ...(n.dashed ? { dashed: true as const } : {}),
});

const BASE: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.spacing.nodeNode": "30",
  "elk.layered.spacing.nodeNodeBetweenLayers": "54",
  "elk.spacing.edgeNode": "18",
  "elk.spacing.edgeEdge": "11",
  "elk.layered.spacing.edgeNodeBetweenLayers": "20",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "11",
  "elk.spacing.labelNode": "8",
  "elk.spacing.edgeLabel": "4",
};
interface Settings {
  options: Record<string, string>;
  /** The widest block. */
  max: number;
  /** A layer constraint for a node, so that rows read as one kind each. */
  layer?: (n: DiagramNode) => "FIRST" | "LAST" | undefined;
  /** The widest block, for nodes narrower than `max`. */
  width?: (n: DiagramNode) => number | undefined;
}
function settings(view: DiagramView): Settings {
  if (view.id === "system") {
    return {
      max: 290,
      options: {
        ...BASE,
        "elk.direction": "DOWN",
        "elk.separateConnectedComponents": "false",
        "elk.spacing.nodeNode": "20",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      },
      layer: (n) => n.shape === "group" ? "LAST" : "FIRST",
      width: (n) => n.id.startsWith("account:") ? 226 : undefined,
    };
  }
  if (view.id === "schedules") {
    return {
      max: 300,
      options: {
        ...BASE,
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "16",
        "elk.spacing.componentComponent": "48",
        "elk.layered.spacing.nodeNodeBetweenLayers": "96",
      },
    };
  }
  return {
    max: 300,
    options: {
      ...BASE,
      "elk.direction": "DOWN",
      "elk.separateConnectedComponents": "false",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "34",
      "elk.layered.spacing.edgeNodeBetweenLayers": "14",
    },
  };
}

function engine() {
  // ELK's bundle runs in a worker when `self` exists without `document`, as in
  // Deno; hiding `self` while it is built keeps it in this thread.
  const g = globalThis as { self?: unknown };
  const self = Object.getOwnPropertyDescriptor(globalThis, "self");
  if (self) delete g.self;
  try {
    // elkjs is CommonJS: its default export is the constructor.
    return new (elkjs.default as unknown as new () => ELK)();
  } finally {
    if (self) Object.defineProperty(globalThis, "self", self);
  }
}
let elk: ReturnType<typeof engine> | undefined;

const IN = "~in", OUT = "~out";
/** The ELK graph of a view. Containers lay their contents out on their own,
 * so containers of one level line up; an edge from inside a container to an
 * element outside leaves through a port on the container's bottom side, as two
 * pieces that the scene joins again. */
function build(
  view: DiagramView,
  { options, max, layer, width }: Settings,
): { graph: ElkNode; scenes: Map<string, Sized["scene"]> } {
  const scenes = new Map<string, Sized["scene"]>();
  const kids = new Map<string | null, DiagramNode[]>();
  for (const n of view.nodes) {
    kids.set(n.parent, [...kids.get(n.parent) ?? [], n]);
  }
  const elkNodes = new Map<string, ElkNode>();
  // Nodes of one layer line up on the side the layer starts from.
  const align = options["elk.direction"] === "RIGHT" ? "LEFT" : "TOP";
  const make = (n: DiagramNode): ElkNode => {
    const children = kids.get(n.id) ?? [];
    if (n.shape === "frame" || n.shape === "group") {
      const head = header(n);
      scenes.set(n.id, { ...head.scene, ...flags(n) });
      const constraint = layer?.(n);
      const node: ElkNode = {
        id: n.id,
        layoutOptions: {
          ...options,
          "elk.alignment": align,
          ...(constraint
            ? { "elk.layered.layering.layerConstraint": constraint }
            : {}),
          "elk.padding": `[top=${head.top},left=20,bottom=20,right=20]`,
          "elk.portConstraints": "FIXED_SIDE",
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": `(${Math.round(head.w)}, ${head.top + 24})`,
        },
        ports: [],
        children: children.map(make),
        edges: [],
      };
      elkNodes.set(n.id, node);
      return node;
    }
    const size = leaf(n, width?.(n) ?? max);
    scenes.set(n.id, { ...size.scene, ...flags(n) });
    const constraint = layer?.(n);
    return {
      id: n.id,
      width: Math.round(size.w),
      height: Math.round(size.h),
      ...(size.label
        ? {
          labels: [{
            text: size.label.join("\n"),
            width: Math.round(
              Math.max(...size.label.map((l) => measure(l, "text"))) + 4,
            ),
            height: size.label.length * M.lineH + 2,
          }],
        }
        : {}),
      layoutOptions: {
        "elk.alignment": align,
        ...(size.label
          ? { "elk.nodeLabels.placement": "OUTSIDE V_CENTER H_RIGHT" }
          : {}),
        ...(constraint
          ? { "elk.layered.layering.layerConstraint": constraint }
          : {}),
      },
    };
  };
  const graph: ElkNode = {
    id: "root",
    layoutOptions: options,
    children: (kids.get(null) ?? []).map(make),
    edges: [],
  };
  const parent = new Map(view.nodes.map((n) => [n.id, n.parent]));
  for (const e of view.edges) {
    const from = parent.get(e.source) ?? null,
      to = parent.get(e.target) ?? null;
    const labels = e.label
      ? [{
        text: e.label,
        width: Math.round(measure(e.label, "edge") + 6),
        height: 14,
      }]
      : undefined;
    const edge = (id: string, source: string, target: string) => ({
      id,
      sources: [source],
      targets: [target],
    });
    if (from === to) {
      (from ? elkNodes.get(from)! : graph).edges!.push({
        ...edge(e.id, e.source, e.target),
        ...(labels ? { labels } : {}),
      });
    } else if (!parent.get(from ?? to!) && (!from || !to)) {
      // One end inside a top-level container, the other outside it: the edge
      // crosses the container's bottom side (going out) or top side (going in).
      const box = elkNodes.get((from ?? to)!)!, port = `${e.id}~port`;
      box.ports!.push({
        id: port,
        width: 1,
        height: 1,
        layoutOptions: { "elk.port.side": from ? "SOUTH" : "NORTH" },
      });
      box.edges!.push(
        from
          ? edge(`${e.id}${IN}`, e.source, port)
          : edge(`${e.id}${OUT}`, port, e.target),
      );
      graph.edges!.push({
        ...edge(e.id, from ? port : e.source, from ? e.target : port),
        ...(labels ? { labels } : {}),
      });
    } else {
      throw new Error(`Unsupported edge across containers: ${e.id}`);
    }
  }
  return { graph, scenes };
}

/** Absolute coordinates: ELK keeps shapes relative to their parent and edge
 * sections relative to the container that holds the edge. */
function sceneOf(
  view: DiagramView,
  scenes: Map<string, Sized["scene"]>,
  laid: ElkNode,
): Scene {
  const scene: Scene = {
    w: r1(laid.width ?? 0),
    h: r1(laid.height ?? 0),
    nodes: [],
    edges: [],
  };
  const origin = new Map<string, { x: number; y: number }>();
  const walk = (n: ElkNode, ox: number, oy: number) => {
    const x = ox + (n.x ?? 0), y = oy + (n.y ?? 0);
    origin.set(n.id, { x, y });
    const s = scenes.get(n.id);
    if (s) {
      const label = n.labels?.[0];
      scene.nodes.push({
        id: n.id,
        ...s,
        x: r1(x),
        y: r1(y),
        w: r1(n.width ?? 0),
        h: r1(n.height ?? 0),
        ...(label
          ? {
            label: {
              x: r1(x + (label.x ?? 0)),
              y: r1(y + (label.y ?? 0)),
              lines: label.text!.split("\n"),
            },
          }
          : {}),
      });
    }
    for (const c of n.children ?? []) walk(c, x, y);
  };
  walk(laid, 0, 0);
  const declared = new Map(view.edges.map((e) => [e.id, e]));
  const pieces = new Map<string, number[][]>();
  const collect = (n: ElkNode) => {
    for (const e of n.edges ?? []) {
      const off = origin.get(n.id)!;
      const pts = (e.sections ?? []).map((s) =>
        [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].flatMap((p) => [
          r1(p.x + off.x),
          r1(p.y + off.y),
        ])
      );
      if (e.id.endsWith(IN) || e.id.endsWith(OUT)) {
        pieces.set(e.id, pts);
        continue;
      }
      const edge = declared.get(e.id)!, label = e.labels?.[0];
      scene.edges.push({
        id: e.id,
        kind: edge.kind,
        s: edge.source,
        t: edge.target,
        pts,
        ...(label
          ? {
            label: {
              x: r1(off.x + (label.x ?? 0)),
              y: r1(off.y + (label.y ?? 0)),
              lines: [label.text!],
            },
          }
          : {}),
      });
    }
    for (const c of n.children ?? []) collect(c);
  };
  collect(laid);
  for (const e of scene.edges) {
    e.pts = [
      ...pieces.get(`${e.id}${IN}`) ?? [],
      ...e.pts,
      ...pieces.get(`${e.id}${OUT}`) ?? [],
    ];
  }
  return scene;
}

function moved(scene: Scene, dx: number, dy: number): Scene {
  const at = <T extends { x: number; y: number }>(p: T) => ({
    ...p,
    x: r1(p.x + dx),
    y: r1(p.y + dy),
  });
  return {
    ...scene,
    nodes: scene.nodes.map((n) => ({
      ...at(n),
      ...(n.label ? { label: at(n.label) } : {}),
    })),
    edges: scene.edges.map((e) => ({
      ...e,
      pts: e.pts.map((p) => p.map((v, i) => r1(v + (i % 2 ? dy : dx)))),
      ...(e.label ? { label: at(e.label) } : {}),
    })),
  };
}
/** Scenes side by side or one under the other, `gap` apart, top-left aligned. */
function stack(parts: Scene[], gap: number, side: "down" | "right"): Scene {
  const out: Scene = { w: 0, h: 0, nodes: [], edges: [] };
  let at = 0;
  for (const part of parts) {
    const m = side === "down" ? moved(part, 0, at) : moved(part, at, 0);
    out.nodes.push(...m.nodes);
    out.edges.push(...m.edges);
    at += (side === "down" ? part.h : part.w) + gap;
    out.w = r1(side === "down" ? Math.max(out.w, part.w) : at - gap);
    out.h = r1(side === "down" ? at - gap : Math.max(out.h, part.h));
  }
  return out;
}

async function laidOut(view: DiagramView, s: Settings): Promise<Scene> {
  const { graph, scenes } = build(view, s);
  elk ??= engine();
  return sceneOf(view, scenes, await elk.layout(graph));
}

/** A laid-out subtree: its size, and its nodes once placed. */
interface Box {
  w: number;
  h: number;
  place(x: number, y: number): SceneNode[];
}
/** Boxes left to right, wrapping at `width`; each row as tall as its tallest. */
function flow(boxes: Box[], width: number, gap: number): Box {
  const rows: Box[][] = [];
  let used = 0;
  for (const b of boxes) {
    if (!rows.length || used + gap + b.w > width) {
      rows.push([]);
      used = -gap;
    }
    rows.at(-1)!.push(b);
    used += gap + b.w;
  }
  const rowW = (row: Box[]) => row.reduce((s, b) => s + b.w + gap, -gap);
  const rowH = (row: Box[]) => Math.max(...row.map((b) => b.h));
  return {
    w: Math.max(0, ...rows.map(rowW)),
    h: rows.reduce((s, row) => s + rowH(row) + gap, -gap),
    place: (x, y) =>
      rows.flatMap((row) => {
        let cx = x;
        const placed = row.flatMap((b) => {
          const nodes = b.place(cx, y);
          cx += b.w + gap;
          return nodes;
        });
        y += rowH(row) + gap;
        return placed;
      }),
  };
}

/** The Tools view, packed on shelves: a row of agents whose slots key the
 * grant strips, then the Tools package with built-in tools on the left and
 * plugins, MCP servers and CLI commands stacked on the right. No edge links
 * them, so a layered layout has nothing to order; ELK's box packing does not
 * keep the origins in order. */
function toolsScene(view: DiagramView): Scene {
  const kids = new Map<string | null, DiagramNode[]>();
  for (const n of view.nodes) {
    kids.set(n.parent, [...kids.get(n.parent) ?? [], n]);
  }
  const tools = view.nodes.filter((n) => n.shape === "tool");
  const chipW = Math.ceil(Math.max(
    100,
    ...tools.map((n) =>
      Math.max(measure(n.name, "tool"), stripWidth(n.slots ?? "")) +
      2 * M.padX
    ),
  ));
  const chipH = 42, gap = 8;
  const chip = (n: DiagramNode): Box => ({
    w: chipW,
    h: chipH,
    place: (x, y) => [{
      id: n.id,
      shape: "tool",
      x,
      y,
      w: chipW,
      h: chipH,
      name: fit(n.name, "tool", chipW - 2 * M.padX),
      ...(n.slots ? { slots: n.slots } : {}),
      ...flags(n),
    }],
  });
  const container = (n: DiagramNode, content: Box, minW = 0, minH = 0): Box => {
    const head = header(n), pad = 16;
    const w = Math.round(Math.max(head.w, content.w + 2 * pad, minW));
    const h = Math.round(Math.max(head.top + content.h + pad, minH));
    return {
      w,
      h,
      place: (x, y) => [
        { id: n.id, ...head.scene, ...flags(n), x, y, w, h },
        ...content.place(x + pad, y + head.top),
      ],
    };
  };
  const grid = (chips: DiagramNode[], cols: number) =>
    flow(chips.map(chip), cols * chipW + (cols - 1) * gap, gap);
  const group = (n: DiagramNode, cols: number, minW = 0, minH = 0): Box => {
    const inside = kids.get(n.id) ?? [];
    const leaves = inside.filter((k) => k.shape === "tool");
    const frames = inside.filter((k) => k.shape !== "tool").map((f) => {
      const chips = kids.get(f.id) ?? [];
      return container(f, grid(chips, Math.min(chips.length, 2)));
    });
    const content = frames.length
      ? flow(frames, Math.max(...frames.map((f) => f.w)) * 3 + 24, 12)
      : grid(leaves, Math.max(1, Math.min(cols, leaves.length)));
    return container(n, content, minW, minH);
  };
  const pkg = view.nodes.find((n) => n.id === "package:Tools")!;
  const groups = kids.get(pkg.id) ?? [];
  const left = groups.find((g) => g.id === "origin:builtin");
  const right = groups.filter((g) => g !== left);
  const column = (boxes: Box[]): Box => ({
    w: Math.max(0, ...boxes.map((b) => b.w)),
    h: boxes.reduce((s, b) => s + b.h + 16, -16),
    place: (x, y) =>
      boxes.flatMap((b) => {
        const nodes = b.place(x, y);
        y += b.h + 16;
        return nodes;
      }),
  });
  const rightW = Math.max(0, ...right.map((g) => group(g, 4).w));
  const rightBox = column(right.map((g) => group(g, 4, rightW)));
  // Built-in tools take as few columns as keep them no taller than the rest.
  let cols = 4;
  while (left && cols < 8 && group(left, cols).h > rightBox.h) cols++;
  const leftBox = left
    ? group(left, cols, 0, rightBox.h)
    : { w: 0, h: 0, place: () => [] };
  const body = flow(
    [leftBox, rightBox].filter((b) => b.w > 0),
    Infinity,
    16,
  );
  const catalog = container(pkg, body);
  const agents = view.nodes.filter((n) => n.parent === null && n !== pkg)
    .map((n) => {
      const size = leaf(n, 260);
      return {
        w: Math.round(size.w),
        h: Math.round(size.h),
        place: (x: number, y: number) => [{
          id: n.id,
          ...size.scene,
          ...flags(n),
          x,
          y,
          w: Math.round(size.w),
          h: Math.round(size.h),
        }],
      };
    });
  const legend = flow(agents, Math.max(catalog.w, 900), 14);
  const nodes = [...legend.place(0, 0), ...catalog.place(0, legend.h + 28)];
  return {
    w: Math.max(legend.w, catalog.w),
    h: legend.h + 28 + catalog.h,
    nodes,
    edges: [],
  };
}

/** Places a view. System and Scheduled tasks are layered graphs; Tools is
 * packed on shelves; a Behaviour view lays its procedures out as flows above
 * the parties they hand work to, with its rules beside or under them. */
export async function layoutView(view: DiagramView): Promise<Scene> {
  const margin = (s: Scene) => {
    const m = moved(s, 24, 24);
    return { ...m, w: r1(s.w + 48), h: r1(s.h + 48) };
  };
  if (view.id === "tools") return margin(toolsScene(view));
  const s = settings(view);
  if (!view.id.startsWith("behaviour:")) return margin(await laidOut(view, s));
  const rules = view.nodes.filter((n) => n.shape === "requirement");
  const flows = {
    ...view,
    nodes: view.nodes.filter((n) => !rules.includes(n)),
  };
  const parts: Scene[] = [];
  if (flows.nodes.length) parts.push(await laidOut(flows, s));
  if (rules.length) {
    const boxes = rules.map((n) => {
      const size = leaf(n, s.max);
      return {
        w: s.max,
        h: Math.round(size.h),
        place: (x: number, y: number) => [{
          id: n.id,
          ...size.scene,
          ...flags(n),
          x,
          y,
          w: s.max,
          h: Math.round(size.h),
        }],
      };
    });
    const block = (width: number): Scene => {
      const grid = flow(boxes, width, 14);
      return { w: grid.w, h: grid.h, nodes: grid.place(0, 0), edges: [] };
    };
    // Rules beside the flows in one to n columns, or under them as wide as
    // they are: the arrangement that shows largest on a screen wins.
    const [laid] = parts;
    const arrangements = [
      ...rules.map((_, i) =>
        stack([...parts, block((i + 1) * s.max + i * 14)], 56, "right")
      ),
      ...(laid
        ? [stack([laid, block(Math.max(laid.w, s.max))], 56, "down")]
        : []),
    ];
    return margin(
      arrangements.reduce((best, a) => shown(a) > shown(best) ? a : best),
    );
  }
  return margin(stack(parts, 56, "right"));
}

/** The aspect ratio a view is fitted into: a common screen. */
const SCREEN = 16 / 9;
/** The scale at which a scene fits a SCREEN-shaped viewport of height 1. */
const shown = (s: Scene) => Math.min(SCREEN / s.w, 1 / s.h);
