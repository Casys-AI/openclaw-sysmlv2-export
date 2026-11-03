import { Worker } from "node:worker_threads";
import {
  ExportError,
  recordDiagnosticError,
} from "../../../infrastructure/error.ts";
import type { ApeReport } from "../../../domain/model/diagnostics/ape.ts";

import type {
  CompileDiagnostics,
  Diagnostics,
} from "../../../domain/model/diagnostics/validation.ts";
export type {
  CompileDiagnostics,
  Diagnostic,
  Diagnostics,
  ValidationSummary,
} from "../../../domain/model/diagnostics/validation.ts";

export interface ValidationRequest {
  /** Directory holding the pinned Toolkit files. */
  toolkit: string;
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
  import.meta.url.endsWith(".ts") ? "./worker.ts" : "./toolkit-worker.mjs",
  import.meta.url,
);
export const toolkitFailure = (cause: unknown) => {
  const error = new ExportError(
    "TOOLKIT_VALIDATION_FAILED",
    `The Toolkit worker could not complete validation: ${
      recordDiagnosticError(cause).message
    }`,
    "Check the bundled Toolkit and retry the export.",
  );
  error.cause = cause;
  return error;
};

/** Each call owns a worker. Compilation has 60 seconds, then APE gets 10 seconds;
 * even a synchronous WASM hang can be interrupted without losing a compile. */
export async function validate(
  files: Map<string, string>,
  toolkit: string,
  options: {
    timeoutMs?: number;
    apeTimeoutMs?: number;
    /** Allows the deadline test to observe a real worker's termination. */
    createWorker?: (url: URL, request: ValidationRequest) => Worker;
  } = {},
): Promise<Diagnostics> {
  const request = {
    toolkit,
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
