import type {
  ApeReport,
  ApeStage,
} from "../../../domain/model/diagnostics/ape.ts";
import type {
  ApeTechnicalServices,
  ModelShapesDiagnostics,
} from "./ports/out/shapes-diagnostics.port.ts";
import type {
  ElementSession,
  ToolkitElementsPort,
} from "./ports/out/toolkit-elements.port.ts";
import type {
  ModelGraphStore,
  RdfProjector,
} from "../semantic/ports/out/rdf-projector.port.ts";

/** Called only inside the validation worker, after a successful Toolkit check. */
export async function checkApe<Store extends ModelGraphStore, Program>(
  session: ElementSession,
  toolkit: ToolkitElementsPort,
  rdf: RdfProjector<Store>,
  shapes: ModelShapesDiagnostics<Store, Program>,
  technical: ApeTechnicalServices,
): Promise<ApeReport> {
  const started = technical.now();
  let stage: ApeStage = "projection";
  let store: Store | undefined;
  try {
    const prepared = toolkit.prepare(session);
    const preparationMs = technical.now() - started;
    const projectionStart = technical.now();
    const artifactDigest = technical.artifactDigest(prepared.elements);
    const batches = rdf.project({
      ...prepared,
      build: { artifactDigest },
    });
    let projectionMs = technical.now() - projectionStart;
    stage = "loading";
    const loadStart = technical.now();
    store = await rdf.createStore();
    let loadMs = technical.now() - loadStart;
    let baseQuads = 0;
    let batchCount = 0;
    while (true) {
      stage = "projection";
      const projectStart = technical.now();
      const next = batches.next();
      projectionMs += technical.now() - projectStart;
      if (next.done) break;
      stage = "loading";
      const batchStart = technical.now();
      store.load(next.value.nquads);
      loadMs += technical.now() - batchStart;
      baseQuads += next.value.quadCount;
      batchCount++;
    }
    stage = "loading";
    const program = await shapes.readProgram(store);
    stage = "view";
    const materialized = shapes.materialize(store, program);
    stage = "rule";
    const { findings, queries, validationReport } = shapes.evaluate(
      store,
      program,
    );
    return {
      status: "completed",
      findings,
      validationReport,
      metrics: {
        elements: prepared.elements.length,
        sourceElements: prepared.sourceElementCount,
        baseQuads,
        derivedQuads: materialized.derivedQuads,
        batches: batchCount,
        totalMs: technical.now() - started,
        preparationMs,
        projectionMs,
        loadMs,
        views: materialized.views,
        queries,
      },
    };
  } catch (error) {
    const failure = shapes.failure(stage, error);
    return { status: "failed", ...failure, findings: [] };
  } finally {
    // The pinned Oxigraph runtime exports free(), omitted from its .d.ts.
    if (store) store.free();
  }
}
