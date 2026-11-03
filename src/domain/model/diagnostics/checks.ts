import type { ValidationSummary } from "./validation.ts";
import type { PersistedApeReport } from "./ape.ts";

/** Whether a version's model checks ran, so an empty Doctor is never mistaken
 * for a clean one:
 * - `verified`: the checks ran (the APE analysis completed, or, in an archive
 *   written before it existed, the findings were recorded);
 * - `not-run`: the APE analysis was skipped (`code` says why, for example
 *   `TOOLKIT_NOT_INSTALLED`);
 * - `failed`: it started and failed (`APE_TIMEOUT`, `APE_WORKER_FAILED`…);
 * - `unrecorded`: the archive holds no result, or one this viewer cannot read. */
export interface Checks {
  state: "verified" | "not-run" | "failed" | "unrecorded";
  code?: string;
  /** What to do about it, when the export recorded one. */
  recovery?: string;
  /** How many rules ran; only when the analysis completed. */
  rules?: number;
  /** Agents whose inference failed in this run. */
  inferenceFailed: number;
}

/** A skipped analysis on an invalid model leaves no recovery of its own. */
const INVALID_MODEL_RECOVERY =
  "Fix the compile errors in validation.json, then export again.";

export const FINDINGS_INVALID = "VIEWER_FINDINGS_INVALID";
export const FINDINGS_INVALID_RECOVERY =
  "Restore this version's findings.json as a valid findings array, then rebuild the viewer.";

export function checksOf(
  { ape, findings, validation, inferenceFailed }: {
    ape: PersistedApeReport | null;
    /** What the version holds of findings.json. */
    findings: "recorded" | "missing" | "unreadable";
    validation?: ValidationSummary;
    inferenceFailed: number;
  },
): Checks {
  const base = { inferenceFailed };
  if (findings === "unreadable") {
    return {
      state: "unrecorded",
      code: FINDINGS_INVALID,
      recovery: FINDINGS_INVALID_RECOVERY,
      ...base,
    };
  }
  if (!ape) {
    return {
      state: findings === "recorded" ? "verified" : "unrecorded",
      ...base,
    };
  }
  if (ape.status === "completed") {
    return {
      state: "verified",
      ...(ape.metrics ? { rules: ape.metrics.queries.length } : {}),
      ...base,
    };
  }
  const recovery = ape.recovery ?? validation?.recovery ??
    (ape.code === "APE_INVALID_MODEL" ? INVALID_MODEL_RECOVERY : undefined);
  return {
    state: ape.status === "skipped" ? "not-run" : "failed",
    ...(ape.code ? { code: ape.code } : {}),
    ...(recovery ? { recovery } : {}),
    ...base,
  };
}

/** The rules that ran, by code without the `APE_` prefix (the queries of the
 * first APE exports carry none); null unless the analysis completed. */
export function rulesRan(ape: PersistedApeReport | null): Set<string> | null {
  return ape?.status === "completed" && ape.metrics
    ? new Set(ape.metrics.queries.map((q) => ruleName(q.code)))
    : null;
}
export const ruleName = (code: string) => code.replace(/^APE_/, "");
