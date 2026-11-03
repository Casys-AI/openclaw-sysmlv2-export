import type { Diagnostics } from "../../../../../domain/model/diagnostics/validation.ts";

export interface ToolkitValidationPort {
  validate(files: Map<string, string>, stateDir: string): Promise<Diagnostics>;
}
