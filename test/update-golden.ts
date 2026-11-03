/** Regenerate reviewed fixture goldens with the pinned Toolkit archive. */
import { mkdir, writeFile } from "node:fs/promises";
import { collect } from "../src/adapters/out/openclaw/collector.ts";
import { emit } from "../src/adapters/out/sysml/emitter.ts";
import { extractToolkit } from "../src/adapters/out/sysml-toolkit/extract.ts";
import { validate } from "../src/adapters/out/sysml-toolkit/worker-client.ts";
import { compareFindings } from "../src/domain/model/diagnostics/findings.ts";
import { canonical } from "../src/infrastructure/canonical-json.ts";
import { createFixture } from "./support/fixture.ts";
import {
  MIGRATED_CODES,
  openclawShapesCases,
  openclawShapesSources,
} from "./support/openclaw-shapes-fixture.ts";

const archive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");
if (!archive) throw new Error("SYSML_TOOLKIT_WASM_ARCHIVE is required");
const fixture = await createFixture({ git: true, backups: 2 });
const state = await Deno.makeTempDir({ prefix: "golden-toolkit-" });
try {
  await extractToolkit(archive, state);
  const snapshot = await collect(fixture.home, fixture.plugins);
  const cases: Record<string, unknown> = {};
  let baseFindings: unknown;
  for (const [name, input, inferred] of openclawShapesCases(snapshot)) {
    const result = await validate(
      openclawShapesSources(input, inferred),
      state,
    );
    if (result.errors.length || result.ape.status !== "completed") {
      throw new Error(
        `Golden validation failed for ${name}: ${JSON.stringify(result)}`,
      );
    }
    const findings = result.ape.findings;
    cases[name] = findings.filter((f) => MIGRATED_CODES.has(f.code)).map(
      ({ code, subject, severity, context, recovery }) => ({
        code,
        subject,
        severity,
        context,
        recovery,
      }),
    ).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (name === "baseline") {
      baseFindings = [...input.ambiguities, ...findings].sort(compareFindings);
    }
  }
  const outputs = new Map([
    ["snapshot.json", canonical(snapshot)],
    ...emit(snapshot),
    ["findings.json", canonical(baseFindings)],
    ["openclaw-findings.json", canonical(cases)],
  ]);
  const directory = new URL("./golden/", import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [name, content] of outputs) {
    await writeFile(new URL(name, directory), content);
  }
} finally {
  await fixture.cleanup();
  await Deno.remove(state, { recursive: true });
}
