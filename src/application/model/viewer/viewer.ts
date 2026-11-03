import type { ViewerPresentation } from "./ports/out/viewer.port.ts";
export type { FileChange } from "../../../domain/model/presentation.ts";
import {
  type PersistedApeReport,
  persistedApeReport,
} from "../../../domain/model/diagnostics/ape.ts";
import { compareFindings } from "../../../domain/model/diagnostics/findings.ts";
import { elementId } from "../../../domain/model/element-id.ts";
import { isRecord } from "../../../domain/primitives/error.ts";
import type { Inference } from "../../../domain/model/inference.ts";
import type { Scene } from "../../../domain/model/presentation.ts";
import type { Finding, Snapshot } from "../../../domain/model/snapshot.ts";
import {
  drawing,
  type TableData,
  tableData,
} from "../../../domain/model/tables.ts";
import type { VersionEntry } from "../../../domain/export/versions.ts";
import {
  declarations,
  diagramViews,
  type SysmlRef,
} from "../../../domain/model/views.ts";

/** A kept run: its versions.json entry and its directory's files by name. */
export interface ViewerVersion {
  entry: VersionEntry;
  files: Record<string, string>;
}

export function createViewer(
  { layoutView, changes, canonical, parseSnapshot, renderPage }:
    ViewerPresentation,
) {
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
  /** Findings belong to their saved version; missing archives retain collector notes only. */
  function findingsOf(version: ViewerVersion, snapshot: Snapshot | null) {
    let persisted: Finding[] = [];
    if (Object.hasOwn(version.files, "findings.json")) {
      try {
        const value: unknown = JSON.parse(version.files["findings.json"]);
        if (
          !Array.isArray(value) || value.some((row) => {
            if (
              !isRecord(row) ||
              !["error", "warning", "info"].includes(String(row.severity)) ||
              ["code", "subject", "context", "recovery"].some((field) =>
                typeof row[field] !== "string" || !row[field]
              )
            ) return true;
            const metadata = row.pattern !== undefined ||
              row.finding !== undefined;
            return ((row.code as string).startsWith("APE_") || metadata) && (
              typeof row.pattern !== "string" || !row.pattern ||
              !["present", "absent", "indeterminate"].includes(
                String(row.finding),
              )
            );
          })
        ) throw new Error("Expected an array of valid findings");
        persisted = value as Finding[];
      } catch {
        persisted = [{
          code: "VIEWER_FINDINGS_INVALID",
          severity: "warning",
          subject: elementId("instance"),
          context:
            `Version ${version.entry.id}: Findings in findings.json are unreadable.`,
          recovery:
            "Restore this version's findings.json as a valid findings array, then rebuild the viewer.",
        }];
      }
    }
    if (Object.hasOwn(version.files, "findings.json")) {
      return persisted.sort(compareFindings);
    }
    return snapshot
      ? snapshot.ambiguities.map((finding) => ({ ...finding })).sort(
        compareFindings,
      )
      : null;
  }

  /** Admit only the APE fields consumed by the counts-only archival normalizer. */
  function archivedApe(value: unknown): value is PersistedApeReport {
    if (
      !isRecord(value) ||
      !["completed", "failed", "skipped"].includes(String(value.status)) ||
      !Array.isArray(value.findings)
    ) return false;
    const metrics = value.metrics;
    return metrics === undefined || isRecord(metrics) &&
        ["elements", "baseQuads", "derivedQuads", "batches"].every((key) =>
          typeof metrics[key] === "number"
        ) &&
        (metrics.sourceElements === undefined ||
          typeof metrics.sourceElements === "number") &&
        Array.isArray(metrics.views) && metrics.views.every((view) =>
          isRecord(view) && typeof view.file === "string" &&
          typeof view.graph === "string" &&
          typeof view.quads === "number"
        ) &&
        Array.isArray(metrics.queries) && metrics.queries.every((query) =>
          isRecord(query) && typeof query.code === "string" &&
          typeof query.findings === "number"
        );
  }

  /** Normalize legacy APE timings only in page data; archived files stay intact. */
  function viewerFiles(files: Record<string, string>): Record<string, string> {
    try {
      const report: unknown = JSON.parse(files["validation.json"]);
      if (!isRecord(report) || !archivedApe(report.ape)) return files;
      return {
        ...files,
        "validation.json": canonical({
          ...report,
          ape: persistedApeReport(report.ape),
        }),
      };
    } catch {
      return files;
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
   * schema): its files and persisted findings remain available. */
  async function versionViews(
    files: Record<string, string>,
    scenes: Map<string, Scene>,
    snapshot: Snapshot | null,
  ): Promise<VersionView[] | null> {
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
  async function viewerPage(versions: ViewerVersion[]): Promise<string> {
    versions = versions.map((version) => ({
      ...version,
      files: viewerFiles(version.files),
    }));
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
    const snapshots = versions.map((v) => snapshotOf(v.files));
    const findings = versions.map((v, i) => findingsOf(v, snapshots[i]));
    const views: (VersionView[] | null)[] = [];
    for (const [i, v] of versions.entries()) {
      views.push(await versionViews(v.files, scenes, snapshots[i]));
    }
    const data = {
      texts,
      views: payloads,
      versions: versions.map((v, i) => {
        const previous = versions[i + 1], before = views[i + 1];
        return {
          ...v.entry,
          findings: findings[i],
          files: Object.fromEntries(
            Object.entries(v.files).sort(([a], [b]) => a < b ? -1 : 1)
              .map(([name, text]) => [name, ref(text)]),
          ),
          changes: previous ? changes(previous.files, v.files) : null,
          views: views[i]?.map((view) => ({
            view: keep(view.data),
            delta: before
              ? viewChanges(
                view,
                before.find((p) => p.data.id === view.data.id),
              )
              : null,
          })) ?? null,
        };
      }),
    };
    // "<" as <: the data can neither close its script nor open a comment.
    return renderPage(data);
  }

  return { viewerPage };
}
