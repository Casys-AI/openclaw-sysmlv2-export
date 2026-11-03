import type { Finding } from "./snapshot.ts";
import type { ValidationSummary } from "./validate.ts";

export type FindingSummary = Record<Finding["severity"], number>;

/** One plugin export run, as listed in versions.json (newest first). */
export interface VersionEntry {
  id: string;
  createdAt: string;
  validation?: ValidationSummary;
  findings?: FindingSummary;
  agents: number;
  inferred: { procedures: number; rules: number; failed: number } | null;
}

/** A run's directory name: its UTC start time to the second, path-safe. */
export function versionId(now: Date): string {
  return `${now.toISOString().slice(0, 19).replaceAll(":", "-")}Z`;
}

/** Adds a run to the list, newest first. */
export function withVersion(
  versions: VersionEntry[],
  entry: VersionEntry,
): VersionEntry[] {
  return [entry, ...versions].sort((a, b) => a.id < b.id ? 1 : -1);
}
