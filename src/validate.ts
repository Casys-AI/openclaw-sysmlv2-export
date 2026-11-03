import { Worker } from "node:worker_threads";
import { ExportError } from "./error.ts";
import type { ApeReport } from "./ape-rules.ts";

export interface Diagnostic {
  code: string;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
}
export interface Diagnostics {
  errors: Diagnostic[];
  warnings: Diagnostic[];
  ape?: ApeReport;
}
export interface ValidationSummary {
  status: "passed" | "failed" | "skipped";
  errors: number;
  code?: string;
  recovery?: string;
}
export interface ValidationRequest {
  stateDir: string;
  sources: { name: string; text: string }[];
}
export type ValidationResponse =
  | { diagnostics: Diagnostics }
  | { error: { code: string; context: string; recovery: string } };

const workerUrl = new URL(
  import.meta.url.endsWith(".ts")
    ? "./toolkit-worker.ts"
    : "./toolkit-worker.mjs",
  import.meta.url,
);
const toolkitFailure = () =>
  new ExportError(
    "TOOLKIT_VALIDATION_FAILED",
    "The Toolkit worker could not complete validation",
    "Check the Toolkit installation and retry the export.",
  );

/** Compile exactly these sources, including the export's own library files.
 * Every call owns a worker; even a synchronous WASM hang can be interrupted. */
export async function validate(
  files: Map<string, string>,
  stateDir: string,
  options: {
    timeoutMs?: number;
    /** Allows the deadline test to observe a real worker's termination. */
    createWorker?: (url: URL, request: ValidationRequest) => Worker;
  } = {},
): Promise<Diagnostics> {
  const request = {
    stateDir,
    sources: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, text]) => ({ name, text })),
  };
  const timeoutMs = options.timeoutMs ?? 60_000;
  const worker = options.createWorker
    ? options.createWorker(workerUrl, request)
    : new Worker(workerUrl, { workerData: request });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Diagnostics>((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ExportError(
              "TOOLKIT_TIMEOUT",
              `Toolkit validation exceeded ${timeoutMs} ms`,
              "Retry the export; inspect the sources if validation keeps timing out.",
            ),
          ),
        timeoutMs,
      );
      worker.once("message", (response: ValidationResponse) => {
        if ("error" in response) {
          const { code, context, recovery } = response.error;
          reject(new ExportError(code, context, recovery));
        } else resolve(response.diagnostics);
      });
      worker.once("error", () => reject(toolkitFailure()));
      worker.once("exit", () => reject(toolkitFailure()));
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

/** Validation is information: an unavailable compiler never loses an export. */
export async function validationReport(
  files: Map<string, string>,
  stateDir: string,
): Promise<
  { validation: ValidationSummary; diagnostics: Diagnostics; ape: ApeReport }
> {
  try {
    const { ape, ...diagnostics } = await validate(files, stateDir);
    if (!ape) throw toolkitFailure();
    return {
      validation: {
        status: diagnostics.errors.length ? "failed" : "passed",
        errors: diagnostics.errors.length,
      },
      diagnostics,
      ape,
    };
  } catch (e) {
    const error = e instanceof ExportError ? e : toolkitFailure();
    const skipped = error.code === "TOOLKIT_NOT_INSTALLED";
    return {
      ape: {
        status: error.code.startsWith("APE_") ? "failed" : "skipped",
        code: error.code,
        findings: [],
      },
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
