import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collect } from "../adapters/out/openclaw/collector.ts";
import { validationReport } from "./model-validation.ts";
import { persistedApeReport } from "../domain/model/diagnostics/ape.ts";
import { diff as domainDiff } from "../domain/model/diff.ts";
import { emit } from "../adapters/out/sysml/emitter.ts";
import { ASSEMBLY_LIBRARY } from "../adapters/out/sysml/library.ts";
import { canonical } from "../infrastructure/canonical-json.ts";
import { parseSnapshot } from "../infrastructure/snapshot-codec.ts";

import { createCli } from "../adapters/in/cli/cli.ts";
export const { run, main } = createCli({
  readFile,
  writeFile,
  mkdir,
  join,
  collect,
  async diagnose(directory, toolkit) {
    const sources = new Map<string, string>();
    for (
      const entry of (await readdir(directory, { withFileTypes: true })).sort((
        a,
        b,
      ) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    ) {
      if (entry.isFile() && entry.name.endsWith(".sysml")) {
        sources.set(
          entry.name,
          await readFile(join(directory, entry.name), "utf8"),
        );
      }
    }
    const { validation, diagnostics, ape } = await validationReport(
      sources,
      toolkit,
    );
    return { validation, ...diagnostics, ape: persistedApeReport(ape) };
  },
  diff: (a, b) => domainDiff(a, b, canonical),
  emit,
  ASSEMBLY_LIBRARY,
  canonical,
  parseSnapshot,
});
