import {
  flags,
  keyword,
  type Scene,
  type SceneNode,
} from "../../../domain/model/presentation.ts";
export {
  flags,
  keyword,
  type Scene,
  type SceneEdge,
  type SceneLabel,
  type SceneNode,
} from "../../../domain/model/presentation.ts";
import * as elkjs from "elkjs/lib/elk.bundled.js";
import type { ELK, ElkNode } from "elkjs/lib/elk.bundled.js";
import type { DiagramNode, DiagramView } from "../../../domain/model/views.ts";

/** Positioned geometry of a view, computed at export time so the page only
 * draws SVG. Text is measured with Helvetica's metrics: the page draws
 * diagrams in Helvetica or its metric twins (Arial, Liberation Sans). Rows that
 * do not fit are cut with an ellipsis; the inspector keeps the full values.
 * ELK's algorithms are deterministic, and coordinates are rounded, so the same
 * view always gives the same scene. */

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
type Role = "kw" | "name" | "type" | "sect" | "row" | "text" | "edge";
/** Font size and weight of each text role; the page's CSS uses the same. */
const FONT: Record<Role, [number, boolean]> = {
  kw: [10, false],
  name: [12.5, true],
  type: [12.5, false],
  sect: [10, false],
  row: [11.5, false],
  text: [12, false],
  edge: [10.5, false],
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
} as const;
const M = METRICS;
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Sized {
  w: number;
  h: number;
  scene: Omit<SceneNode, "id" | "x" | "y" | "w" | "h">;
  label?: string[];
}

/** A block's header and compartments, rows cut to the widest allowed. A type
 * that does not fit beside the name goes on its own line. */
function block(n: DiagramNode, max: number): Sized {
  const kw = keyword(n);
  const type = n.type ? ` : ${n.type}` : "";
  const inner = max - 2 * M.padX;
  const comps = n.compartments.map((c) =>
    [c.title, c.rows.map((r) => fit(r, "row", inner))] as [string, string[]]
  );
  const name = fit(n.name, "name", inner);
  const full = n.text ?? n.name;
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
    ) + M.padBottom;
  return {
    w,
    h,
    scene: {
      shape: n.shape,
      kw,
      name,
      ...(full === name ? {} : { title: full }),
      ...(type ? { type: fit(split ? type.trim() : type, "type", inner) } : {}),
      ...(split ? { split: true as const } : {}),
      comps,
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
  /** Top-level frames wrap into rows to fit a screen (see `layoutView`). */
  wrap?: true;
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
    // Cases above the agent they wake, each agent's cluster packed into rows
    // as wide as the strip of canvas the week table leaves.
    return {
      max: 300,
      options: {
        ...BASE,
        "elk.direction": "DOWN",
        "elk.aspectRatio": "3.5",
        "elk.spacing.nodeNode": "16",
        "elk.spacing.componentComponent": "48",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
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
    wrap: true,
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
 * pieces that the scene joins again. Top-level nodes given a row go in it, as
 * ELK partitions. */
function build(
  view: DiagramView,
  { options, max, layer, width }: Settings,
  rows?: Map<string, number>,
): { graph: ElkNode; scenes: Map<string, Sized["scene"]> } {
  const row = (n: DiagramNode): Record<string, string> =>
    rows && n.parent === null
      ? { "elk.partitioning.partition": String(rows.get(n.id)) }
      : {};
  const scenes = new Map<string, Sized["scene"]>();
  const kids = new Map<string | null, DiagramNode[]>();
  for (const n of view.nodes) {
    kids.set(n.parent, [...kids.get(n.parent) ?? [], n]);
  }
  const elkNodes = new Map<string, ElkNode>();
  // Nodes of one layer line up on their top: every view is laid out downward.
  const align = "TOP";
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
          ...row(n),
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
        ...row(n),
      },
    };
  };
  const graph: ElkNode = {
    id: "root",
    layoutOptions: rows
      ? { ...options, "elk.partitioning.activate": "true" }
      : options,
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
        ...(edge.mutual ? { mutual: true as const } : {}),
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

async function laidOut(
  view: DiagramView,
  s: Settings,
  rows?: Map<string, number>,
): Promise<Scene> {
  const { graph, scenes } = build(view, s, rows);
  elk ??= engine();
  return sceneOf(view, scenes, await elk.layout(graph));
}

/** The canvas of a 1600 × 1000 window, and the table under a diagram: a bar
 * and a header, a row, and at most the share of the height that page.ts gives
 * it. */
const CANVAS = { w: 1528, h: 880 };
const TABLE = { head: 80, row: 28, share: 0.42 };
/** The aspect of the canvas a diagram gets once its table has taken its room.
 * With no table this is about a 16:9 screen; a table of ten rows or more
 * leaves 3:1. */
function canvasAspect(tableRows: number): number {
  const table = tableRows
    ? Math.min(TABLE.share * CANVAS.h, TABLE.head + TABLE.row * tableRows)
    : 0;
  return CANVAS.w / (CANVAS.h - table);
}
/** The scale at which a scene fits a viewport of that aspect and height 1. */
const shown = (s: Scene, aspect: number) => Math.min(aspect / s.w, 1 / s.h);
/** Top-level frames in `count` rows, in order and as even as can be, the
 * other top-level nodes in a row below them. */
function rowsOf(view: DiagramView, count: number): Map<string, number> {
  const top = view.nodes.filter((n) => n.parent === null);
  const frames = top.filter((n) => n.shape === "frame");
  return new Map(top.map((n) => [
    n.id,
    n.shape === "frame"
      ? Math.floor(frames.indexOf(n) * count / frames.length)
      : count,
  ]));
}

/** Places a view's drawn elements (see tables.ts) as a layered graph: System,
 * Scheduled tasks, and a Behaviour view's procedures as flows above the
 * parties they hand work to, in as many rows as make it show largest in the
 * canvas that the `tableRows` rows of its table leave. */
export async function layoutView(
  view: DiagramView,
  tableRows = 0,
): Promise<Scene> {
  const s = settings(view), aspect = canvasAspect(tableRows);
  let scene = await laidOut(view, s);
  const frames = s.wrap
    ? view.nodes.filter((n) => n.parent === null && n.shape === "frame").length
    : 0;
  for (let rows = 2; rows <= frames; rows++) {
    const next = await laidOut(view, s, rowsOf(view, rows));
    if (shown(next, aspect) <= shown(scene, aspect)) break;
    scene = next;
  }
  return { ...moved(scene, 24, 24), w: r1(scene.w + 48), h: r1(scene.h + 48) };
}
