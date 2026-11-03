import { ExportError } from "../../../domain/primitives/error.ts";
import type { ApeReport } from "../../../domain/model/diagnostics/ape.ts";
import type {
  CompileDiagnostics,
  ValidationSummary,
} from "../../../domain/model/diagnostics/validation.ts";

import type { ToolkitValidationPort } from "./ports/out/toolkit-validation.port.ts";

/** Validation is information: an unavailable compiler never loses an export. */
export async function validationReport(
  toolkit: ToolkitValidationPort,
  failure: (cause: unknown) => ExportError,
  files: Map<string, string>,
  stateDir: string,
): Promise<
  {
    validation: ValidationSummary;
    diagnostics: CompileDiagnostics;
    ape: ApeReport;
  }
> {
  try {
    const { ape, ...diagnostics } = await toolkit.validate(files, stateDir);
    return {
      validation: {
        status: diagnostics.errors.length ? "failed" : "passed",
        errors: diagnostics.errors.length,
      },
      diagnostics,
      ape,
    };
  } catch (e) {
    const error = e instanceof ExportError ? e : failure(e);
    const skipped = error.code === "TOOLKIT_NOT_INSTALLED";
    return {
      ape: { status: "skipped", code: error.code, findings: [] },
      validation: {
        status: skipped ? "skipped" : "failed",
        errors: skipped ? 0 : 1,
        code: error.code,
        recovery: error.recovery,
      },
      diagnostics: {
        errors: skipped ? [] : [{
          code: error.code,
          message: error.context,
          file: null,
          line: null,
          column: null,
        }],
        warnings: [],
      },
    };
  }
}
