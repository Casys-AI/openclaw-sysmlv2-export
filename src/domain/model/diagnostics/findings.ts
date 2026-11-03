import type { Finding } from "../snapshot.ts";

/** Stable domain ordering, including distinct diagnostics on one subject. */
export function compareFindings(a: Finding, b: Finding): number {
  for (const key of ["code", "subject", "context"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}
