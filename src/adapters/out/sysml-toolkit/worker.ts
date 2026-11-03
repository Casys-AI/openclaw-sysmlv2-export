import { Buffer } from "node:buffer";
import { parentPort, workerData } from "node:worker_threads";
import { gunzipSync } from "node:zlib";
import { checkApe } from "../../../composition/ape.ts";
import {
  ExportError,
  recordDiagnosticError,
} from "../../../infrastructure/error.ts";
import { readToolkit } from "./install.ts";
import type {
  CompileDiagnostics,
  Diagnostic,
  ValidationRequest,
  ValidationResponse,
} from "./worker-client.ts";

interface Finding {
  severity: string;
  stage: string;
  message: string;
  unit?: string;
  line?: number;
  col?: number;
}
interface Library {
  free(): void;
}
interface ToolkitModule {
  initSync(input: { module: Uint8Array }): void;
  checkSyntax(sources: string): string;
  PreparedLibrary: {
    fromSnapshot(
      bytes: Uint8Array,
      sources: string,
      cache: Uint8Array,
    ): Library;
  };
  Session: {
    fromSourcesWithPreparedLibrary(sources: string, library: Library): {
      check(): string;
      toFullJson(includeLibrary: boolean): string;
      rows(ids: string, fields: string): string;
      free(): void;
    };
  };
}

async function compile(request: ValidationRequest): Promise<void> {
  const files = await readToolkit(request.stateDir);
  // Import and instantiate the bytes that passed the hashes, without rereading disk.
  const module: ToolkitModule = await import(
    `data:text/javascript;base64,${
      Buffer.from(files.get("sysmlv2.js")!).toString("base64")
    }`
  );
  module.initSync({ module: files.get("sysmlv2_bg.wasm")! });
  const syntax: Finding[] = JSON.parse(
    module.checkSyntax(JSON.stringify(request.sources)),
  );
  const broken = new Set(
    syntax.filter((d) => d.stage === "parse").map((d) => d.unit),
  );
  const sources = request.sources.filter((s) => !broken.has(s.name));
  let findings = syntax;
  const isError = (finding: Finding) =>
    finding.severity === "error" ||
    finding.stage === "referential" &&
      request.sources.some((s) => s.name === finding.unit);
  const report = async (
    findings: Finding[],
    session?: Parameters<typeof checkApe>[0],
  ) => {
    const diagnostics: CompileDiagnostics = { errors: [], warnings: [] };
    for (const finding of findings) {
      const diagnostic: Diagnostic = {
        code: `TOOLKIT_${finding.stage.toUpperCase()}`,
        message: finding.message,
        file: finding.unit ?? null,
        line: finding.line ?? null,
        column: finding.col ?? null,
      };
      diagnostics[isError(finding) ? "errors" : "warnings"].push(diagnostic);
    }
    parentPort!.postMessage(
      { phase: "compiled", diagnostics } satisfies ValidationResponse,
    );
    // APE starts only once the parent has retained compilation and armed its budget.
    await new Promise<void>((resolve) =>
      parentPort!.once("message", () => resolve())
    );
    const ape = diagnostics.errors.length || !session
      ? { status: "skipped" as const, code: "APE_INVALID_MODEL", findings: [] }
      : await checkApe(session);
    parentPort!.postMessage({ phase: "ape", ape } satisfies ValidationResponse);
  };
  if (sources.length) {
    const expand = (name: string) =>
      gunzipSync(files.get(`stdlib/sysml-library.${name}.gz`)!);
    const library = module.PreparedLibrary.fromSnapshot(
      expand("prepared"),
      expand("json").toString("utf8"),
      expand("libcache"),
    );
    try {
      const session = module.Session.fromSourcesWithPreparedLibrary(
        JSON.stringify(sources),
        library,
      );
      try {
        // Session.check includes context checks, but omits parse failures.
        findings = [
          ...syntax.filter((d) => d.stage === "parse"),
          ...JSON.parse(session.check()),
        ];
        await report(findings, session);
      } finally {
        session.free();
      }
    } finally {
      library.free();
    }
  } else await report(findings);
}

try {
  await compile(workerData);
} catch (cause) {
  const error = cause instanceof ExportError ? cause : new ExportError(
    "TOOLKIT_VALIDATION_FAILED",
    "The Toolkit could not compile the supplied sources",
    "Check the Toolkit installation and the exported sources, then retry.",
  );
  if (error !== cause) error.cause = cause;
  const recorded = recordDiagnosticError(error);
  parentPort!.postMessage(
    {
      phase: "error",
      error: {
        code: error.code,
        context: typeof recorded.context === "string"
          ? recorded.context
          : recorded.message,
        recovery: error.recovery,
        cause: recordDiagnosticError(cause).message,
      },
    } satisfies ValidationResponse,
  );
}
