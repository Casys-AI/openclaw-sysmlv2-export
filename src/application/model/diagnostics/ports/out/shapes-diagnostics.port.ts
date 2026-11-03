import type {
  ApeReport,
  ApeStage,
} from "../../../../../domain/model/diagnostics/ape.ts";
import type { ModelGraphStore } from "../../../semantic/ports/out/rdf-projector.port.ts";

export interface ModelShapesDiagnostics<
  Store extends ModelGraphStore,
  Program,
> {
  readProgram(store: Store): Promise<Program>;
  materialize(
    store: Store,
    program: Program,
  ): {
    derivedQuads: number;
    views: { file: string; graph: string; ms: number; quads: number }[];
  };
  evaluate(
    store: Store,
    program: Program,
  ): {
    findings: ApeReport["findings"];
    queries: { code: string; ms: number; findings: number }[];
    validationReport: string;
  };
  failure(
    stage: ApeStage,
    error: unknown,
  ): Omit<ApeReport, "status" | "findings">;
}

export interface ApeTechnicalServices {
  now(): number;
  artifactDigest(elements: readonly Record<string, unknown>[]): string;
}
