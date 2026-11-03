import { validationReport as report } from "../application/model/diagnostics/validate-model.ts";
import {
  toolkitFailure,
  validate,
} from "../adapters/out/sysml-toolkit/worker-client.ts";
export function validationReport(files: Map<string, string>, stateDir: string) {
  return report({ validate }, toolkitFailure, files, stateDir);
}
