import type { DiagramNode, EdgeKind, Shape } from "./views.ts";
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
  /** A frame's title; on a block, the name to show whole (the display name,
   * else the declared name) when `name` is cut or differs. */
  title?: string;
  head?: string[];
  comps?: [string, string[]][];
  /** Wrapped text of a step. */
  lines?: string[];
  /** A decision's text, beside its diamond. */
  label?: SceneLabel;
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
  /** Delegation both ways: draw an arrowhead at each end. */
  mutual?: true;
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

export const keyword = (n: DiagramNode) =>
  n.keyword ? `«${n.keyword}»` : undefined;

export const flags = (n: DiagramNode) => ({
  ...(n.parent ? { parent: n.parent } : {}),
  ...(n.muted ? { muted: true as const } : {}),
  ...(n.dashed ? { dashed: true as const } : {}),
});

/** One file's unified diff hunks against the previous version. */
export interface FileChange {
  file: string;
  status: "added" | "removed" | "changed";
  hunks: { header: string; lines: string[] }[];
}
