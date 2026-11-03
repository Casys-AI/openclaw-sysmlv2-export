import { checkApe as check } from "../application/model/diagnostics/check-ape.ts";
import type { ElementSession } from "../application/model/diagnostics/ports/out/toolkit-elements.port.ts";
import { prepareApeElements } from "../adapters/out/sysml-toolkit/compilation/ape-elements.ts";
import { projectModelToNQuadBatches } from "../adapters/out/oxigraph/rdf.ts";
import { createModelGraphStore } from "../adapters/out/oxigraph/store.ts";
import {
  type ApeProgram,
  shapesDiagnostics,
} from "../adapters/out/shacl/diagnostics.ts";
import { artifactDigest } from "../infrastructure/artifact-digest.ts";

export function checkApe(session: ElementSession) {
  return check<Awaited<ReturnType<typeof createModelGraphStore>>, ApeProgram>(
    session,
    { prepare: prepareApeElements },
    {
      project: projectModelToNQuadBatches,
      createStore: createModelGraphStore,
    },
    shapesDiagnostics,
    { now: () => performance.now(), artifactDigest },
  );
}
