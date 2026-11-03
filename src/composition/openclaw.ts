import { runExport as run } from "../application/export/export-instance.ts";
import type { Complete } from "../application/export/export-instance.ts";
import { collect } from "../adapters/out/openclaw/collector.ts";
import * as instructions from "../adapters/out/openclaw/instruction-reader.ts";
import { exportFiles } from "../adapters/out/filesystem/export-files.ts";
import { emit } from "../adapters/out/sysml/emitter.ts";
import { ASSEMBLY_LIBRARY } from "../adapters/out/sysml/library.ts";
import { emitInferred } from "../adapters/out/sysml/inferred.ts";
import { parseAgentInference } from "../adapters/out/llm/inference.ts";
import { canonical } from "../infrastructure/canonical-json.ts";
import { modelError } from "../infrastructure/model-error.ts";
import { validationReport } from "./model-validation.ts";
import { viewerPage } from "./viewer.ts";
import { pluginList } from "../application/export/export-instance.ts";
export { pluginList };
export type {
  Complete,
  ExportSummary,
} from "../application/export/export-instance.ts";
import {
  bundledToolkit,
  toolkitStatus as status,
} from "../adapters/out/sysml-toolkit/bundled.ts";
export const toolkitStatus = () => status(bundledToolkit);

/** `toolkit` is the Toolkit directory: the one bundled with the plugin, unless
 * a test supplies another. */
export function runExport(
  stateDir: string,
  plugins: unknown,
  outDir: string,
  complete: Complete | null,
  now: Date,
  toolkit = bundledToolkit,
) {
  return run(
    {
      collect,
      serialize: canonical,
      modelError,
      instructions,
      inference: { parse: parseAgentInference },
      sysml: { emit, library: ASSEMBLY_LIBRARY, emitInferred },
      output: exportFiles,
      validationReport: (files) => validationReport(files, toolkit),
      viewerPage,
    },
    stateDir,
    plugins,
    outDir,
    complete,
    now,
  );
}

import { createPluginEntry as createEntry } from "../adapters/in/openclaw/plugin.mjs";
import { completeWith } from "../adapters/out/llm/openclaw.mjs";
/** Preserve the SDK-facing plugin factory while binding the export services. */
export function createPluginEntry(
  definePluginEntry: Parameters<typeof createEntry>[0],
) {
  return createEntry(definePluginEntry, {
    pluginList,
    runExport,
    toolkitStatus,
    completeWith,
  });
}
