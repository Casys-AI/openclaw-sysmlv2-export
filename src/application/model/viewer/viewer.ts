import type { ViewerPresentation } from "./ports/out/viewer.port.ts";
export type { FileChange } from "../../../domain/model/presentation.ts";
import {
  type ApeFinding,
  type PersistedApeReport,
  persistedApeReport,
} from "../../../domain/model/diagnostics/ape.ts";
import {
  type Checks,
  checksOf,
  FINDINGS_INVALID,
  FINDINGS_INVALID_RECOVERY,
  rulesRan,
} from "../../../domain/model/diagnostics/checks.ts";
import {
  type FindingsDelta,
  findingsDelta,
} from "../../../domain/model/diagnostics/delta.ts";
import { compareFindings } from "../../../domain/model/diagnostics/findings.ts";
import {
  collectorNotes,
  type DoctorGroup,
  doctorGroups,
} from "../../../domain/model/diagnostics/groups.ts";
import { diff } from "../../../domain/model/diff.ts";
import { diffSubjects } from "../../../domain/model/diff-subjects.ts";
import { elementId } from "../../../domain/model/element-id.ts";
import { isRecord } from "../../../domain/primitives/error.ts";
import type { Inference } from "../../../domain/model/inference.ts";
import {
  type InputsVerdict,
  inputsVerdict,
} from "../../../domain/model/inputs.ts";
import { elementLabels } from "../../../domain/model/labels.ts";
import type { Scene } from "../../../domain/model/presentation.ts";
import type { Snapshot } from "../../../domain/model/snapshot.ts";
import {
  drawing,
  type TableData,
  tableData,
} from "../../../domain/model/tables.ts";
import { groupFiles } from "../../../domain/export/file-groups.ts";
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
  /** Findings belong to their saved version; missing archives retain collector
   * notes only. A findings.json this viewer cannot read gives one note of
   * its own, and `unreadable`. */
  function findingsOf(version: ViewerVersion, snapshot: Snapshot | null) {
    if (!Object.hasOwn(version.files, "findings.json")) {
      return {
        rows: snapshot
          ? snapshot.ambiguities.map((finding) => ({ ...finding })).sort(
            compareFindings,
          )
          : null,
        unreadable: false,
      };
    }
    try {
      const value: unknown = JSON.parse(version.files["findings.json"]);
      if (
        !Array.isArray(value) || value.some((row) => {
          if (
            !isRecord(row) ||
            !["error", "warning", "info"].includes(String(row.severity)) ||
            ["code", "subject", "context", "recovery"].some((field) =>
              typeof row[field] !== "string" || !row[field]
            ) ||
            row.related !== undefined && (!Array.isArray(row.related) ||
                row.related.some((id) => typeof id !== "string" || !id))
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
      return {
        rows: (value as ApeFinding[]).sort(compareFindings),
        unreadable: false,
      };
    } catch {
      return {
        rows: [{
          code: FINDINGS_INVALID,
          severity: "warning" as const,
          subject: elementId("instance"),
          context:
            `Version ${version.entry.id}: Findings in findings.json are unreadable.`,
          recovery: FINDINGS_INVALID_RECOVERY,
        }],
        unreadable: true,
      };
    }
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

  /** The APE report of validation.json, or null when it is missing, unreadable
   * or not an APE report. */
  function apeOf(files: Record<string, string>): PersistedApeReport | null {
    try {
      const report: unknown = JSON.parse(files["validation.json"]);
      return isRecord(report) && archivedApe(report.ape) ? report.ape : null;
    } catch {
      return null;
    }
  }

  /** Normalize legacy APE timings only in page data; archived files stay intact. */
  function viewerFiles(files: Record<string, string>): Record<string, string> {
    const ape = apeOf(files);
    return ape
      ? {
        ...files,
        "validation.json": canonical({
          ...JSON.parse(files["validation.json"]),
          ape: persistedApeReport(ape),
        }),
      }
      : files;
  }

  function inferenceOf(files: Record<string, string>): Inference | null {
    try {
      const value = JSON.parse(files["inference.json"]);
      return value?.schema === "openclaw-inference/1" ? value : null;
    } catch {
      return null;
    }
  }

  /** What a view's element shows, and what its SysML says. */
  interface Signature {
    shown: string;
    sysml: string;
  }
  /** A view of a version as the page shows it, and what each of its elements is
   * compared by against the previous version. */
  interface VersionView {
    data: ViewData;
    signatures: Map<string, Signature>;
    /** Elements that mark a position, not a thing: never listed. */
    unlisted: Set<string>;
  }

  /** The attributes the inference fills in (`inferred…`) do not mark the
   * element that shows them: the version's inputs verdict says the inference
   * changed. */
  const configured = (attributes: [string, string][]) =>
    attributes.filter(([name]) => !name.startsWith("inferred"));

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
      // What an element shows is what its node or edge draws and lists.
      const shown = new Map<string, string>([
        ...view.nodes.map((n): [string, string] => [
          n.id,
          JSON.stringify([
            n.keyword,
            n.name,
            n.type,
            n.text,
            n.muted,
            n.dashed,
            n.compartments,
            configured(n.attributes),
          ]),
        ]),
        ...view.edges.map((e): [string, string] => [
          e.id,
          JSON.stringify([e.label, configured(e.attributes)]),
        ]),
      ]);
      // A drawn container's SysML spans its contents: it has none of its own.
      const containers = new Set(
        drawn.nodes.filter((n) => n.shape === "frame" || n.shape === "group")
          .map((n) => n.id),
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
          Object.entries(elements).map(([id, e]) => [id, {
            shown: shown.get(id)!,
            sysml: containers.has(id) ? "" : JSON.stringify(e.s.map(text)),
          }]),
        ),
        unlisted: new Set(
          view.nodes.filter((n) => n.shape === "initial" || n.shape === "final")
            .map((n) => n.id),
        ),
      });
    }
    return out;
  }

  /** What changed in a view since the previous version, as lists of element
   * ids:
   * - `added` and `removed`: the id is new or gone;
   * - `changed`: a value the element shows differs (its name, attributes or
   *   compartments, an Overview row's name included);
   * - `touched`: only the SysML text differs (a drawn container, whose SysML
   *   spans its contents, never is).
   * Drawn edges are listed for the diagram to mark (never as removed, never as
   * touched); `count` leaves them out, as the panel does, and so counts what
   * the picker and the rail show: added, changed and removed. Initial and
   * final nodes are in no list. A view the previous version did not have is
   * new. */
  function viewChanges(now: VersionView, before: VersionView | undefined) {
    if (!before) {
      return {
        isNew: true,
        added: [],
        changed: [],
        touched: [],
        removed: [],
        count: 0,
      };
    }
    const lines = (v: ViewData) => v.scene?.edges.map((e) => e.id) ?? [];
    const ids = (v: VersionView) =>
      [...new Set([...Object.keys(v.data.elements), ...lines(v.data)])]
        .filter((id) => !v.unlisted.has(id));
    // Every node is drawn or in the table, and so is every edge with SysML;
    // drawn edges are never listed as removed.
    const shown = (v: VersionView) => {
      const drawn = new Set(lines(v.data));
      return ids(v).filter((id) => !drawn.has(id));
    };
    const earlier = new Set(ids(before)), current = ids(now);
    const drawn = new Set(lines(now.data)), present = new Set(current);
    const added = current.filter((id) => !earlier.has(id));
    const changed: string[] = [], touched: string[] = [];
    for (const id of current) {
      const [a, b] = [now.signatures.get(id), before.signatures.get(id)];
      if (!earlier.has(id) || !a || !b) continue;
      if (a.shown !== b.shown) changed.push(id);
      else if (a.sysml !== b.sysml && !drawn.has(id)) touched.push(id);
    }
    const removed = shown(before).filter((id) => !present.has(id));
    return {
      isNew: false,
      added,
      changed,
      touched,
      removed,
      count: [...added, ...changed].filter((id) => !drawn.has(id)).length +
        removed.length,
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
    const inferences = versions.map((v) => inferenceOf(v.files));
    const findings = versions.map((v, i) => findingsOf(v, snapshots[i]));
    const apes = versions.map((v) => apeOf(v.files));
    const labels = snapshots.map((s) => s ? elementLabels(s) : {});
    const recorded = versions.map((v) =>
      Object.hasOwn(v.files, "findings.json")
    );
    const checks: Checks[] = versions.map((v, i) =>
      checksOf({
        ape: apes[i],
        findings: findings[i].unreadable
          ? "unreadable"
          : recorded[i]
          ? "recorded"
          : "missing",
        validation: v.entry.validation,
        inferenceFailed: v.entry.inferred?.failed ?? 0,
      })
    );
    const collectors = snapshots.map((s) =>
      collectorNotes(s?.ambiguities ?? [])
    );
    // The version a delta of findings is set against: the last older one whose
    // findings are recorded and readable and whose analysis completed.
    const comparable = (i: number) =>
      recorded[i] && !findings[i].unreadable && rulesRan(apes[i]) !== null;
    const verdict = (now: number, before: number): InputsVerdict =>
      inputsVerdict(
        { snapshot: snapshots[before], inference: inferences[before] },
        { snapshot: snapshots[now], inference: inferences[now] },
        canonical,
      );
    const doctor = (i: number): {
      groups: DoctorGroup[];
      delta: FindingsDelta | null;
    } => {
      const rows = findings[i].rows;
      const j = comparable(i)
        ? versions.findIndex((_, k) => k > i && comparable(k))
        : -1;
      const judged = (k: number) => ({
        findings: findings[k].rows!,
        ran: rulesRan(apes[k])!,
        collector: collectors[k],
      });
      return {
        groups: rows ? doctorGroups(rows, labels[i], collectors[i]) : [],
        delta: j < 0 ? null : findingsDelta(judged(i), judged(j), {
          against: versions[j].entry.id,
          inputs: verdict(i, j),
          labels: { ...labels[j], ...labels[i] },
        }),
      };
    };
    const views: (VersionView[] | null)[] = [];
    for (const [i, v] of versions.entries()) {
      views.push(await versionViews(v.files, scenes, snapshots[i]));
    }
    const data = {
      texts,
      views: payloads,
      versions: versions.map((v, i) => {
        const previous = versions[i + 1], before = views[i + 1];
        const fileChanges = previous ? changes(previous.files, v.files) : null;
        return {
          ...v.entry,
          findings: findings[i].rows,
          checks: checks[i],
          inputs: previous ? verdict(i, i + 1) : null,
          labels: labels[i],
          doctor: doctor(i),
          files: Object.fromEntries(
            Object.entries(v.files).sort(([a], [b]) => a < b ? -1 : 1)
              .map(([name, text]) => [name, ref(text)]),
          ),
          changes: fileChanges,
          diff: fileChanges && {
            subjects: snapshots[i] && snapshots[i + 1]
              ? diffSubjects(
                diff(snapshots[i + 1]!, snapshots[i]!, canonical),
                { before: labels[i + 1], after: labels[i] },
                canonical,
              )
              : null,
            groups: groupFiles(fileChanges.map((c) => c.file)),
          },
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
