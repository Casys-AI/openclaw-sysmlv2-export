import { createHash } from "node:crypto";
import { type ElementSession, prepareApeElements } from "./ape-elements.ts";
import { projectModelToNQuadBatches } from "./ape-rdf.ts";
import {
  type ApeReport,
  type ApeStage,
  ApeStageError,
  evaluateApeRules,
  materializeApeViews,
  readApeRules,
  readApeViews,
} from "./ape-rules.ts";
import { initOxigraph, Store } from "./oxigraph.ts";

/** Called only inside the validation worker, after a successful Toolkit check. */
export async function checkApe(session: ElementSession): Promise<ApeReport> {
  const started = performance.now();
  let stage: ApeStage = "projection";
  try {
    const prepared = prepareApeElements(session);
    const preparationMs = performance.now() - started;
    const projectionStart = performance.now();
    const hash = createHash("sha256").update("[");
    prepared.elements.forEach((element, index) => {
      if (index) hash.update(",");
      hash.update(JSON.stringify(element));
    });
    const artifactDigest = hash.update("]").digest("hex");
    const batches = projectModelToNQuadBatches({
      ...prepared,
      build: { repositoryId: "openclaw-export", artifactDigest },
    });
    let projectionMs = performance.now() - projectionStart;
    stage = "loading";
    const loadStart = performance.now();
    await initOxigraph();
    const store = new Store();
    let loadMs = performance.now() - loadStart;
    let baseQuads = 0;
    let batchCount = 0;
    while (true) {
      stage = "projection";
      const projectStart = performance.now();
      const next = batches.next();
      projectionMs += performance.now() - projectStart;
      if (next.done) break;
      stage = "loading";
      const batchStart = performance.now();
      store.load(next.value.nquads, { format: "application/n-quads" });
      loadMs += performance.now() - batchStart;
      baseQuads += next.value.quadCount;
      batchCount++;
    }
    stage = "view";
    const [views, rules] = await Promise.all([readApeViews(), readApeRules()]);
    const materialized = materializeApeViews(store, views);
    stage = "rule";
    const { findings, queries } = evaluateApeRules(store, rules);
    return {
      status: "completed",
      findings,
      metrics: {
        elements: prepared.elements.length,
        sourceElements: prepared.sourceElementCount,
        quads: baseQuads,
        baseQuads,
        derivedQuads: materialized.derivedQuads,
        batches: batchCount,
        totalMs: performance.now() - started,
        preparationMs,
        projectionMs,
        loadMs,
        views: materialized.views,
        queries,
      },
    };
  } catch (error) {
    const failure = error instanceof ApeStageError
      ? error
      : new ApeStageError(stage, error);
    return { status: "failed", ...failure.toJSON(), findings: [] };
  }
}
