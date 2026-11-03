import type { ApeFinding } from "./ape.ts";
import { FINDINGS_INVALID } from "./checks.ts";

/** Where a finding comes from: `rule` is a model check (error or warning),
 * `note` an informative model check, `collector` a limit of the export noted
 * while collecting (the snapshot's `ambiguities`, or the viewer's own note). */
export type FindingSource = "rule" | "note" | "collector";

/** What makes two findings the same one: its code, subject and context. */
export const findingIdentity = (f: ApeFinding) =>
  JSON.stringify([f.code, f.subject, f.context]);

/** The collector's notes of a snapshot, to tell them from the checks that
 * the same findings.json holds. */
export function collectorNotes(ambiguities: ApeFinding[]): Set<string> {
  return new Set(ambiguities.map(findingIdentity));
}

export function sourceOf(
  f: ApeFinding,
  collector: ReadonlySet<string>,
): FindingSource {
  return collector.has(findingIdentity(f)) || f.code === FINDINGS_INVALID
    ? "collector"
    : f.severity === "info"
    ? "note"
    : "rule";
}

/** One subject of a group, with the context of its own finding. */
export interface DoctorSubject {
  id: string;
  /** The subject's readable name (its id when it has none). */
  label: string;
  context: string;
  related?: string[];
}
/** The findings of one code and one recovery at one severity. */
export interface DoctorGroup {
  severity: ApeFinding["severity"];
  code: string;
  source: FindingSource;
  /** The APE pattern the rule checks, when it checks one. */
  pattern?: string;
  recovery: string;
  subjects: DoctorSubject[];
}

const RANK = { error: 0, warning: 1, info: 2 };

/** Findings grouped by severity (worst first), code, recovery and source;
 * subjects keep the findings' order. */
export function doctorGroups(
  findings: ApeFinding[],
  labels: Record<string, string>,
  collector: ReadonlySet<string>,
): DoctorGroup[] {
  const groups = new Map<string, DoctorGroup>();
  for (const f of findings) {
    const source = sourceOf(f, collector);
    const key = JSON.stringify([f.severity, f.code, f.recovery, source]);
    if (!groups.has(key)) {
      groups.set(key, {
        severity: f.severity,
        code: f.code,
        source,
        ...(f.pattern ? { pattern: f.pattern } : {}),
        recovery: f.recovery,
        subjects: [],
      });
    }
    groups.get(key)!.subjects.push({
      id: f.subject,
      label: labels[f.subject] ?? f.subject,
      context: f.context,
      ...(f.related ? { related: f.related } : {}),
    });
  }
  return [...groups.values()].sort((a, b) =>
    RANK[a.severity] - RANK[b.severity] ||
    (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  );
}
