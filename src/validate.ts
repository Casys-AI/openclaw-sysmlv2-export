import { Worker } from "node:worker_threads";
import { ExportError, recordDiagnosticError } from "./error.ts";
import type { ApeReport } from "./ape-rules.ts";

export interface Diagnostic {
  code: string;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
}
export interface CompileDiagnostics {
  errors: Diagnostic[];
  warnings: Diagnostic[];
}
export interface Diagnostics extends CompileDiagnostics {
  ape: ApeReport;
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
  | { phase: "compiled"; diagnostics: CompileDiagnostics }
  | { phase: "ape"; ape: ApeReport }
  | {
    phase: "error";
    error: { code: string; context: string; recovery: string; cause: string };
  };

const workerUrl = new URL(
  import.meta.url.endsWith(".ts")
    ? "./toolkit-worker.ts"
    : "./toolkit-worker.mjs",
  import.meta.url,
);
const toolkitFailure = (cause: unknown) => {
  const error = new ExportError(
    "TOOLKIT_VALIDATION_FAILED",
    `The Toolkit worker could not complete validation: ${
      recordDiagnosticError(cause).message
    }`,
    "Check the Toolkit installation and retry the export.",
  );
  error.cause = cause;
  return error;
};

/** Each call owns a worker. Compilation has 60 seconds, then APE gets 10 seconds;
 * even a synchronous WASM hang can be interrupted without losing a compile. */
export async function validate(
  files: Map<string, string>,
  stateDir: string,
  options: {
    timeoutMs?: number;
    apeTimeoutMs?: number;
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
  const apeTimeoutMs = options.apeTimeoutMs ?? 10_000;
  const worker = options.createWorker
    ? options.createWorker(workerUrl, request)
    : new Worker(workerUrl, { workerData: request });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<Diagnostics>((resolve, reject) => {
      let compiled: CompileDiagnostics | undefined;
      const failApe = (code: string, message: string) => {
        resolve({
          ...compiled!,
          ape: {
            status: "failed",
            code,
            context: message,
            cause: message,
            findings: [],
          },
        });
      };
      const fail = (cause: unknown) => {
        if (compiled) {
          failApe("APE_WORKER_FAILED", recordDiagnosticError(cause).message);
        } else reject(toolkitFailure(cause));
      };
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
      worker.on("message", (response: ValidationResponse) => {
        switch (response.phase) {
          case "compiled": {
            compiled = response.diagnostics;
            clearTimeout(timer);
            timer = setTimeout(() => {
              failApe(
                "APE_TIMEOUT",
                `APE analysis exceeded ${apeTimeoutMs} ms`,
              );
            }, apeTimeoutMs);
            worker.postMessage({ phase: "run-ape" });
            break;
          }
          case "ape":
            resolve({ ...compiled!, ape: response.ape });
            break;
          case "error": {
            const { code, context, recovery, cause } = response.error;
            if (compiled) failApe("APE_WORKER_FAILED", cause);
            else {
              const error = new ExportError(code, context, recovery);
              error.cause = new Error(cause);
              reject(error);
            }
            break;
          }
        }
      });
      worker.once("error", fail);
      worker.once("exit", (code) => {
        fail(new Error(`The Toolkit worker exited with code ${code}`));
      });
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
  {
    validation: ValidationSummary;
    diagnostics: CompileDiagnostics;
    ape: ApeReport;
  }
> {
  try {
    const { ape, ...diagnostics } = await validate(files, stateDir);
    return {
      validation: {
        status: diagnostics.errors.length ? "failed" : "passed",
        errors: diagnostics.errors.length,
      },
      diagnostics,
      ape,
    };
  } catch (e) {
    const error = e instanceof ExportError ? e : toolkitFailure(e);
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
