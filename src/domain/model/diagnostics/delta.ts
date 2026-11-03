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

/** Findings of `from` that `other` lacks, as a multiset on (code, subject,
 * context). */
function absentFrom(from: ApeFinding[], other: ApeFinding[]): ApeFinding[] {
  const left = new Map<string, number>();
  for (const f of other) {
    const key = findingIdentity(f);
    left.set(key, (left.get(key) ?? 0) + 1);
  }
  return from.filter((f) => {
    const key = findingIdentity(f), n = left.get(key) ?? 0;
    if (n) left.set(key, n - 1);
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
  const appeared = absentFrom(now.findings, before.findings);
  const gone = absentFrom(before.findings, now.findings);
  return {
    against,
    inputs,
    new: appeared.filter((f) => ran(before, f)).map(entry),
    resolved: gone.filter((f) => ran(now, f)).map(entry),
    newRule: appeared.filter((f) => !ran(before, f)).map(entry),
    notComparable: gone.filter((f) => !ran(now, f)).map(entry),
  };
}
