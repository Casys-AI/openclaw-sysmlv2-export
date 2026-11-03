import type { ApeFinding } from "./ape.ts";
import { ruleName } from "./checks.ts";
import { findingIdentity, sourceOf } from "./groups.ts";
import type { InputsVerdict } from "../inputs.ts";

/** A version's findings with what lets them be compared: the rules that ran
 * (`ran`, by code without `APE_`) and the collector's notes. */
export interface Judged {
  findings: ApeFinding[];
  ran: ReadonlySet<string>;
  collector: ReadonlySet<string>;
}
export interface DeltaFinding {
  code: string;
  severity: ApeFinding["severity"];
  subject: string;
  label: string;
}
/** What changed in the findings since the last version whose checks ran.
 * `new` and `resolved` hold only findings of rules that ran on both sides:
 * - `new`: present now, absent then;
 * - `resolved`: present then, absent now;
 * - `newRule`: present now, its rule did not run then;
 * - `notComparable`: present then, its rule did not run now. */
export interface FindingsDelta {
  /** The version compared against. */
  against: string;
  /** How the configuration and inference compare to that version's. */
  inputs: InputsVerdict;
  new: DeltaFinding[];
  resolved: DeltaFinding[];
  newRule: DeltaFinding[];
  notComparable: DeltaFinding[];
}

/** Findings of `from` that `other` lacks, as a multiset on `key`. */
function absentFrom(
  from: ApeFinding[],
  other: ApeFinding[],
  key: (f: ApeFinding) => string,
): ApeFinding[] {
  const left = new Map<string, number>();
  for (const f of other) left.set(key(f), (left.get(key(f)) ?? 0) + 1);
  return from.filter((f) => {
    const n = left.get(key(f)) ?? 0;
    if (n) left.set(key(f), n - 1);
    return !n;
  });
}

export function findingsDelta(
  now: Judged,
  before: Judged,
  { against, inputs, labels }: {
    against: string;
    inputs: InputsVerdict;
    labels: Record<string, string>;
  },
): FindingsDelta {
  const ran = (side: Judged, f: ApeFinding) =>
    sourceOf(f, side.collector) === "collector" ||
    side.ran.has(ruleName(f.code));
  const entry = ({ code, severity, subject }: ApeFinding): DeltaFinding => ({
    code,
    severity,
    subject,
    label: labels[subject] ?? subject,
  });
  // A finding whose text alone changed (a rule reworded by a newer plugin)
  // keeps its code and subject: it is neither new nor resolved.
  const place = (f: ApeFinding) => JSON.stringify([f.code, f.subject]);
  const added = absentFrom(now.findings, before.findings, findingIdentity);
  const removed = absentFrom(before.findings, now.findings, findingIdentity);
  const appeared = absentFrom(added, removed, place);
  const gone = absentFrom(removed, added, place);
  return {
    against,
    inputs,
    new: appeared.filter((f) => ran(before, f)).map(entry),
    resolved: gone.filter((f) => ran(now, f)).map(entry),
    newRule: appeared.filter((f) => !ran(before, f)).map(entry),
    notComparable: gone.filter((f) => !ran(now, f)).map(entry),
  };
}
