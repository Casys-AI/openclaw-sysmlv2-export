import type { Finding } from "../model/snapshot.ts";
import type { ValidationSummary } from "../model/diagnostics/validation.ts";

export type FindingSummary = Record<Finding["severity"], number>;

/** One plugin export run, as listed in versions.json (newest first). */
export interface VersionEntry {
  id: string;
  createdAt: string;
  validation?: ValidationSummary;
  findings?: FindingSummary;
  agents: number;
  /** Null when inference did not run for this version. */
  inferred: {
    procedures: number;
    rules: number;
    failed: number;
    /** Agents that kept an earlier inference because what the model is sent
     * did not change, and the versions whose runs made those inferences. */
    reused?: { agents: number; from: string[] };
  } | null;
  /** Plugin version that wrote the entry; absent in older entries. */
  plugin?: string;
  /** Digest of the shipped shape files that checked it, to tell a new rule
   * from a new finding; absent in older entries. */
  shapes?: string;
}

/** What produced a run: the plugin and the checks it shipped. */
export interface Producer {
  plugin: string;
  shapes: string;
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
