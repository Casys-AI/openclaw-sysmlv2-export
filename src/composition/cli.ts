import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collect } from "../adapters/out/openclaw/collector.ts";
import { doctor } from "../domain/model/diagnostics/doctor.ts";
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
  doctor,
  diff: (a, b) => domainDiff(a, b, canonical),
  emit,
  ASSEMBLY_LIBRARY,
  canonical,
  parseSnapshot,
});
