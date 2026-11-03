import { validationReport as report } from "../application/model/diagnostics/validate-model.ts";
import {
  toolkitFailure,
  validate,
} from "../adapters/out/sysml-toolkit/worker-client.ts";
/** `toolkit` is the directory holding the pinned Toolkit files. */
export function validationReport(files: Map<string, string>, toolkit: string) {
  return report(
    { validate: (sources) => validate(sources, toolkit) },
    toolkitFailure,
    files,
  );
}
