import { Buffer } from "node:buffer";
import { parentPort, workerData } from "node:worker_threads";
import { gunzipSync } from "node:zlib";
import { ExportError } from "./error.ts";
import { readToolkit } from "./toolkit-install.ts";
import type {
  Diagnostic,
  Diagnostics,
  ValidationRequest,
  ValidationResponse,
} from "./validate.ts";

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
      free(): void;
    };
  };
}

async function compile(request: ValidationRequest): Promise<Diagnostics> {
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
      } finally {
        session.free();
      }
    } finally {
      library.free();
    }
  }
  const result: Diagnostics = { errors: [], warnings: [] };
  for (const finding of findings) {
    const diagnostic: Diagnostic = {
      code: `TOOLKIT_${finding.stage.toUpperCase()}`,
      message: finding.message,
      file: finding.unit ?? null,
      line: finding.line ?? null,
      column: finding.col ?? null,
    };
    // Unresolved references in exported sources cannot count as a valid model.
    const error = finding.severity === "error" ||
      finding.stage === "referential" &&
        request.sources.some((s) => s.name === finding.unit);
    result[error ? "errors" : "warnings"].push(diagnostic);
  }
  return result;
}

try {
  parentPort!.postMessage(
    { diagnostics: await compile(workerData) } satisfies ValidationResponse,
  );
} catch (e) {
  const error = e instanceof ExportError ? e : new ExportError(
    "TOOLKIT_VALIDATION_FAILED",
    "The Toolkit could not compile the supplied sources",
    "Check the Toolkit installation and the exported sources, then retry.",
  );
  parentPort!.postMessage(
    { error: error.toJSON() } satisfies ValidationResponse,
  );
}
