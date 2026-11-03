import type { Finding } from "../snapshot.ts";

export interface ApeFinding extends Finding {
  pattern?: string;
  finding?: "present" | "absent" | "indeterminate";
  /** The agents the context names (`agent:<id>`, sorted): a cycle's other
   * members, the agent whose host exec a delegation reaches. Only the rules
   * whose message has a related agent set it. */
  related?: string[];
}
export type ApeStage = "projection" | "loading" | "view" | "rule";
export interface ApeReport {
  status: "completed" | "skipped" | "failed";
  code?: string;
  context?: string | Record<string, unknown>;
  recovery?: string;
  stage?: ApeStage;
  file?: string;
  cause?: string;
  findings: ApeFinding[];
  validationReport?: string;
  metrics?: {
    elements: number;
    sourceElements?: number;
    baseQuads: number;
    derivedQuads: number;
    batches: number;
    totalMs: number;
    preparationMs: number;
    projectionMs: number;
    loadMs: number;
    views: { file: string; graph: string; ms: number; quads: number }[];
    queries: { code: string; ms: number; findings: number }[];
  };
}
export type ApeSummary = Pick<ApeReport, "status" | "code"> & { count: number };

export type PersistedApeReport =
  & Omit<ApeReport, "metrics" | "validationReport">
  & {
    metrics?:
      & Pick<
        NonNullable<ApeReport["metrics"]>,
        "elements" | "sourceElements" | "baseQuads" | "derivedQuads" | "batches"
      >
      & {
        views: { file: string; graph: string; quads: number }[];
        queries: { code: string; findings: number }[];
      };
  };

/** Persist counts and identities; timings remain available only in memory. */
export function persistedApeReport(
  report: ApeReport | PersistedApeReport,
): PersistedApeReport {
  const { metrics, validationReport: _validationReport, ...stable } =
    report as ApeReport;
  return {
    ...stable,
    ...(metrics
      ? {
        metrics: {
          elements: metrics.elements,
          ...(metrics.sourceElements !== undefined
            ? { sourceElements: metrics.sourceElements }
            : {}),
          baseQuads: metrics.baseQuads,
          derivedQuads: metrics.derivedQuads,
          batches: metrics.batches,
          views: metrics.views.map(({ file, graph, quads }) => ({
            file,
            graph,
            quads,
          })),
          queries: metrics.queries.map(({ code, findings }) => ({
            code,
            findings,
          })),
        },
      }
      : {}),
  };
}
