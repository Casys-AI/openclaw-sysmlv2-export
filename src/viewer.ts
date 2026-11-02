import { structuredPatch } from "diff";
import type { Inference } from "./infer.ts";
import { layoutView, METRICS, type Scene } from "./layout.ts";
import { parseSnapshot } from "./snapshot.ts";
import { drawing, type TableData, tableData } from "./tables.ts";
import type { VersionEntry } from "./versions.ts";
import { PAGE } from "./viewer_page.ts";
import { declarations, diagramViews, type SysmlRef } from "./views.ts";

/** A kept run: its versions.json entry and its directory's files by name. */
export interface ViewerVersion {
  entry: VersionEntry;
  files: Record<string, string>;
}

/** One file's unified diff hunks against the previous version. */
export interface FileChange {
  file: string;
  status: "added" | "removed" | "changed";
  hunks: { header: string; lines: string[] }[];
}

/** Files that differ between two versions, with their unified diff. */
export function changes(
  older: Record<string, string>,
  newer: Record<string, string>,
): FileChange[] {
  const names = [...new Set([...Object.keys(older), ...Object.keys(newer)])]
    .sort().filter((n) => older[n] !== newer[n]);
  return names.map((file) => ({
    file,
    status: !Object.hasOwn(older, file)
      ? "added"
      : !Object.hasOwn(newer, file)
      ? "removed"
      : "changed",
    hunks: structuredPatch(file, file, older[file] ?? "", newer[file] ?? "")
      .hunks.map((h) => ({
        header:
          `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
        lines: h.lines,
      })),
  }));
}

/** One view of one version, as the page draws and inspects it. */
interface ViewData {
  id: string;
  title: string;
  group: string;
  /** Its drawn elements; null when it is only a table. */
  scene: Scene | null;
  table: TableData | null;
  /** Per node or edge: its attributes and the [file, from, to] of its SysML. */
  elements: Record<
    string,
    { a: [string, string][]; s: [string, number, number][] }
  >;
}

function snapshotOf(files: Record<string, string>) {
  try {
    return parseSnapshot(JSON.parse(files["snapshot.json"]));
  } catch {
    return null;
  }
}
function inferenceOf(files: Record<string, string>): Inference | null {
  try {
    const value = JSON.parse(files["inference.json"]);
    return value?.schema === "openclaw-inference/1" ? value : null;
  } catch {
    return null;
  }
}

/** A version's views, laid out, each element located in the version's own
 * SysML files; null when this viewer cannot read its snapshot (an older
 * schema): the page then shows its files only. */
async function versionViews(
  files: Record<string, string>,
  scenes: Map<string, Scene>,
): Promise<ViewData[] | null> {
  const snapshot = snapshotOf(files);
  if (!snapshot) return null;
  const index = new Map<string, Map<string, [number, number]>>();
  const locate = (refs: SysmlRef[]) =>
    refs.flatMap((r) => {
      if (!Object.hasOwn(files, r.file)) return [];
      if (!index.has(r.file)) index.set(r.file, declarations(files[r.file]));
      const at = index.get(r.file)!.get(r.qname);
      return at ? [[r.file, ...at] as [string, number, number]] : [];
    });
  const out: ViewData[] = [];
  for (const view of diagramViews(snapshot, inferenceOf(files))) {
    const drawn = drawing(view), key = JSON.stringify(drawn);
    if (drawn.nodes.length && !scenes.has(key)) {
      scenes.set(key, await layoutView(drawn));
    }
    out.push({
      id: view.id,
      title: view.title,
      group: view.group,
      scene: scenes.get(key) ?? null,
      table: tableData(view),
      elements: Object.fromEntries([
        ...view.nodes.map((
          n,
        ) => [n.id, { a: n.attributes, s: locate(n.sysml) }]),
        ...view.edges.filter((e) => e.sysml.length).map((e) => [
          e.id,
          { a: e.attributes, s: locate(e.sysml) },
        ]),
      ]),
    });
  }
  return out;
}

/** What changed in a view since the previous version: the elements added, the
 * elements whose attributes or SysML text changed (containers by attributes
 * only, so a change inside a frame marks that element and not the frame), and
 * the elements removed, drawn or in its table. A view the previous version did
 * not have is new. */
function viewChanges(
  view: ViewData,
  files: Record<string, string>,
  previous: ViewData | undefined,
  previousFiles: Record<string, string>,
) {
  if (!previous) return { isNew: true, added: [], changed: [], removed: [] };
  const containers = new Set(
    (view.scene?.nodes ?? []).filter((n) =>
      n.shape === "frame" || n.shape === "group"
    ).map((n) => n.id),
  );
  const slice = (
    f: Record<string, string>,
    [file, from, to]: [string, number, number],
  ) => f[file].split("\n").slice(from - 1, to).join("\n");
  const signature = (v: ViewData, f: Record<string, string>, id: string) => {
    const e = v.elements[id];
    return JSON.stringify(
      containers.has(id) ? e.a : [e.a, e.s.map((s) => slice(f, s))],
    );
  };
  // Every node is drawn or in the table, and so is every edge with SysML;
  // only nodes and table elements can be listed as removed.
  const shown = (v: ViewData) => {
    const lines = new Set(v.scene?.edges.map((e) => e.id));
    return Object.keys(v.elements).filter((id) => !lines.has(id));
  };
  const ids = (v: ViewData) => [
    ...new Set([...shown(v), ...v.scene?.edges.map((e) => e.id) ?? []]),
  ];
  const before = new Set(ids(previous)), now = new Set(ids(view));
  return {
    isNew: false,
    added: [...now].filter((id) => !before.has(id)),
    changed: [...now].filter((id) =>
      before.has(id) && view.elements[id] && previous.elements[id] &&
      signature(view, files, id) !== signature(previous, previousFiles, id)
    ),
    removed: shown(previous).filter((id) => !now.has(id)),
  };
}

/** One self-contained page (no network, works from file://) that draws each
 * version's SysML views from the geometry computed here, highlights what
 * changed since the previous version, and lists the version's files and their
 * diffs. File texts and views shared by several versions are stored once. */
export async function viewerPage(versions: ViewerVersion[]): Promise<string> {
  const texts: string[] = [], seen = new Map<string, number>();
  const ref = (text: string) => {
    if (!seen.has(text)) seen.set(text, texts.push(text) - 1);
    return seen.get(text)!;
  };
  const payloads: ViewData[] = [], kept = new Map<string, number>();
  const keep = (v: ViewData) => {
    const key = JSON.stringify(v);
    if (!kept.has(key)) kept.set(key, payloads.push(v) - 1);
    return kept.get(key)!;
  };
  const scenes = new Map<string, Scene>();
  const views: (ViewData[] | null)[] = [];
  for (const v of versions) views.push(await versionViews(v.files, scenes));
  const data = {
    texts,
    views: payloads,
    versions: versions.map((v, i) => {
      const previous = versions[i + 1], before = views[i + 1];
      return {
        ...v.entry,
        files: Object.fromEntries(
          Object.entries(v.files).sort(([a], [b]) => a < b ? -1 : 1)
            .map(([name, text]) => [name, ref(text)]),
        ),
        changes: previous ? changes(previous.files, v.files) : null,
        views: views[i]?.map((view) => ({
          view: keep(view),
          delta: before
            ? viewChanges(
              view,
              v.files,
              before.find((p) => p.id === view.id),
              previous.files,
            )
            : null,
        })) ?? null,
      };
    }),
  };
  // "<" as <: the data can neither close its script nor open a comment.
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return PAGE.replace("__METRICS__", JSON.stringify(METRICS))
    .replace("__DATA__", () => json);
}
