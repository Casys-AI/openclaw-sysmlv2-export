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

/** A view of a version as the page shows it, and what each of its elements is
 * compared by against the previous version. */
interface VersionView {
  data: ViewData;
  signatures: Map<string, string>;
}

/** A version's views, laid out, each element located in the version's own
 * SysML files; null when this viewer cannot read its snapshot (an older
 * schema): the page then shows its files only. */
async function versionViews(
  files: Record<string, string>,
  scenes: Map<string, Scene>,
): Promise<VersionView[] | null> {
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
  const lines = new Map<string, string[]>();
  const text = ([file, from, to]: [string, number, number]) => {
    if (!lines.has(file)) lines.set(file, files[file].split("\n"));
    return lines.get(file)!.slice(from - 1, to).join("\n");
  };
  const out: VersionView[] = [];
  for (const view of diagramViews(snapshot, inferenceOf(files))) {
    const drawn = drawing(view), key = JSON.stringify(drawn);
    if (drawn.nodes.length && !scenes.has(key)) {
      scenes.set(key, await layoutView(drawn));
    }
    const elements: ViewData["elements"] = Object.fromEntries([
      ...view.nodes.map((
        n,
      ) => [n.id, { a: n.attributes, s: locate(n.sysml) }]),
      ...view.edges.filter((e) => e.sysml.length).map((e) => [
        e.id,
        { a: e.attributes, s: locate(e.sysml) },
      ]),
    ]);
    // A drawn container compares by its attributes, as its SysML spans its
    // contents; a row that sums declarations up, by their SysML, as its
    // figures follow from them; any other element, by both.
    const containers = new Set(
      drawn.nodes.filter((n) => n.shape === "frame" || n.shape === "group")
        .map((n) => n.id),
    );
    const t = view.table;
    const derived = new Set(
      t?.kind === "elements" && t.derived
        ? [...t.rows, ...t.summary ? [t.summary] : []]
        : [],
    );
    out.push({
      data: {
        id: view.id,
        title: view.title,
        group: view.group,
        scene: scenes.get(key) ?? null,
        table: tableData(view),
        elements,
      },
      signatures: new Map(
        Object.entries(elements).map(([id, e]) => [
          id,
          JSON.stringify(
            containers.has(id)
              ? e.a
              : derived.has(id)
              ? e.s.map(text)
              : [e.a, e.s.map(text)],
          ),
        ]),
      ),
    });
  }
  return out;
}

/** What changed in a view since the previous version: the elements added, the
 * elements whose signature changed (see versionViews: a change inside a frame
 * marks that element and not the frame), and the elements removed, drawn or in
 * its table. A view the previous version did not have is new. */
function viewChanges(now: VersionView, before: VersionView | undefined) {
  if (!before) return { isNew: true, added: [], changed: [], removed: [] };
  const view = now.data, previous = before.data;
  // Every node is drawn or in the table, and so is every edge with SysML;
  // drawn edges are never listed as removed.
  const lines = (v: ViewData) => v.scene?.edges.map((e) => e.id) ?? [];
  const ids = (v: ViewData) => [
    ...new Set([...Object.keys(v.elements), ...lines(v)]),
  ];
  const shown = (v: ViewData) => {
    const drawn = new Set(lines(v));
    return Object.keys(v.elements).filter((id) => !drawn.has(id));
  };
  const earlier = new Set(ids(previous)), current = new Set(ids(view));
  return {
    isNew: false,
    added: [...current].filter((id) => !earlier.has(id)),
    changed: [...current].filter((id) => {
      const a = now.signatures.get(id), b = before.signatures.get(id);
      return a !== undefined && b !== undefined && a !== b;
    }),
    removed: shown(previous).filter((id) => !current.has(id)),
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
  const views: (VersionView[] | null)[] = [];
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
          view: keep(view.data),
          delta: before
            ? viewChanges(view, before.find((p) => p.data.id === view.data.id))
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
