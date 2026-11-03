import { flags, keyword } from "./presentation.ts";
import type {
  DiagramNode,
  DiagramView,
  Figure,
  Shape,
  ViewTable,
  WeekRow,
} from "./views.ts";

/** The table of a view, shaped at export time as layout.ts shapes its
 * diagram, so the page only renders it: rows in order with their SysML
 * headers, and the cells of a matrix by row and column. */

/** An element as a table shows it: its SysML header. */
export interface Head {
  id: string;
  shape: Shape;
  kw?: string;
  name: string;
  type?: string;
  parent?: string;
  muted?: true;
  dashed?: true;
}
/** How many of a matrix's columns hold a tool: all of them, several, one, or
 * none (a tool declared but granted to no agent). */
export type Held = "all" | "shared" | "one" | "none";

export type TableData =
  | {
    kind: "matrix";
    columns: (Head & { title: string })[];
    /** A tool row has its holders; a group or provider row is `host` when a
     * tool under it is granted on the host layer. */
    rows: (Head & {
      depth: number;
      holders?: number;
      held?: Held;
      host?: true;
    })[];
    /** [row, column, glyph, cell id]; the glyph is h(ost), s(andbox) or b(oth). */
    cells: [number, number, string, string][];
  }
  | {
    kind: "elements";
    title: string;
    columns: string[];
    facet: string | null;
    /** Each row's values, column by column ("—" for an attribute it lacks),
     * its display name, and the other views that show it. */
    rows: (Head & {
      values: string[];
      /** The counts behind the values that state some, by column. */
      figures?: Record<string, Figure>;
      title?: string;
      views?: string[];
    })[];
    summary: Head | null;
  }
  | { kind: "week"; rows: WeekRow[] };

function head(n: DiagramNode): Head {
  const kw = keyword(n);
  return {
    id: n.id,
    shape: n.shape,
    ...(kw ? { kw } : {}),
    name: n.name,
    ...(n.type ? { type: ` : ${n.type}` } : {}),
    ...flags(n),
  };
}

/** The elements a table shows instead of the diagram; a week's rows are
 * drawn cases. */
function tabled(table: ViewTable | null): Set<string> {
  switch (table?.kind) {
    case "matrix":
      return new Set([...table.columns, ...table.rows, ...table.cells]);
    case "elements":
      return new Set([...table.rows, ...table.summary ? [table.summary] : []]);
    default:
      return new Set();
  }
}

/** The view without the elements its table shows: what layout.ts draws. */
export function drawing(view: DiagramView): DiagramView {
  const shown = tabled(view.table);
  return {
    ...view,
    nodes: view.nodes.filter((n) => !shown.has(n.id)),
    edges: view.edges.filter((e) => !shown.has(e.id)),
    table: null,
  };
}

const held = (holders: number, columns: number): Held =>
  holders === 0
    ? "none"
    : holders === columns
    ? "all"
    : holders === 1
    ? "one"
    : "shared";

const GLYPH: Record<string, string> = {
  host: "h",
  sandbox: "s",
  "host, sandbox": "b",
};

/** A view's table as the page shows it, or null. */
export function tableData(view: DiagramView): TableData | null {
  const t = view.table;
  if (!t) return null;
  if (t.kind === "week") return t;
  const nodes = new Map(view.nodes.map((n) => [n.id, n]));
  if (t.kind === "elements") {
    return {
      kind: "elements",
      title: t.title,
      columns: t.columns,
      facet: t.facet,
      rows: t.rows.map((id) => {
        const n = nodes.get(id)!, values = new Map(n.attributes);
        return {
          ...head(n),
          values: t.columns.map((c) => values.get(c) ?? "—"),
          ...(n.figures ? { figures: n.figures } : {}),
          ...(n.text ? { title: n.text } : {}),
          ...(t.views ? { views: t.views[id] } : {}),
        };
      }),
      summary: t.summary ? head(nodes.get(t.summary)!) : null,
    };
  }
  const edges = new Map(view.edges.map((e) => [e.id, e]));
  const depth = (n: DiagramNode): number =>
    n.parent ? 1 + depth(nodes.get(n.parent)!) : 0;
  const row = new Map(t.rows.map((id, i) => [id, i]));
  const column = new Map(t.columns.map((id, i) => [id, i]));
  const cells = t.cells.map((id): [number, number, string, string] => {
    const e = edges.get(id)!;
    return [row.get(e.target)!, column.get(e.source)!, GLYPH[e.label!], id];
  });
  const holders = new Array<number>(t.rows.length).fill(0);
  const host = new Set<number>();
  for (const [r, , glyph] of cells) {
    holders[r]++;
    if (glyph !== "s") {
      for (
        let n: DiagramNode | undefined = nodes.get(t.rows[r])!;
        n?.parent;
        n = nodes.get(n.parent)
      ) host.add(row.get(n.parent)!);
    }
  }
  return {
    kind: "matrix",
    columns: t.columns.map((id) => {
      const n = nodes.get(id)!;
      return { ...head(n), title: n.text ?? n.name };
    }),
    rows: t.rows.map((id, i) => {
      const n = nodes.get(id)!;
      return {
        ...head(n),
        depth: depth(n),
        ...(n.shape === "tool"
          ? { holders: holders[i], held: held(holders[i], t.columns.length) }
          : {}),
        ...(host.has(i) ? { host: true as const } : {}),
      };
    }),
    cells,
  };
}
