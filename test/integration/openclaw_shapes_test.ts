import assert from "node:assert/strict";
import { parseSnapshot } from "../../src/infrastructure/snapshot-codec.ts";
import { extractToolkit } from "../../src/adapters/out/sysml-toolkit/extract.ts";
import { prepareApeElements } from "../../src/adapters/out/sysml-toolkit/compilation/ape-elements.ts";
import {
  BUILD_GRAPH_PREFIX,
  projectModelToNQuadBatches,
} from "../../src/adapters/out/oxigraph/rdf.ts";
import {
  initOxigraph,
  namedNode,
  Store,
} from "../../src/adapters/out/oxigraph/store.ts";
import {
  evaluateApeRules,
  materializeApeViews,
  readApeProgram,
} from "../../src/adapters/out/shacl/diagnostics.ts";
import { withToolkitModel } from "../support/toolkit-model.ts";
import { compileOpenSysml } from "../support/opensysml.ts";
import {
  MIGRATED_CODES,
  openclawShapesCases,
  openclawShapesSources,
} from "../support/openclaw-shapes-fixture.ts";
const archive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");
const oracle = Deno.env.get("OPENSYSML_ARCHIVE");
const rows = (
  findings: {
    code: string;
    subject: string;
    severity: string;
    context: string;
    recovery: string;
  }[],
) =>
  findings.filter((f) => MIGRATED_CODES.has(f.code)).map((
    { code, subject, severity, context, recovery },
  ) => ({ code, subject, severity, context, recovery })).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
Deno.test({
  name:
    "compiled OpenClaw shapes match reviewed golden findings for all seventeen check codes",
  ignore: !archive,
  async fn(t) {
    const dir = await Deno.makeTempDir({ prefix: "openclaw-shapes-" });
    try {
      await extractToolkit(archive, dir);
      await initOxigraph();
      const baseline = parseSnapshot(
        JSON.parse(
          await Deno.readTextFile(
            new URL("../golden/snapshot.json", import.meta.url),
          ),
        ),
      );
      const expectedCases = JSON.parse(
        await Deno.readTextFile(
          new URL("../golden/openclaw-findings.json", import.meta.url),
        ),
      );
      for (const [name, snapshot, inferred] of openclawShapesCases(baseline)) {
        await t.step(name, async () => {
          const sources = openclawShapesSources(snapshot, inferred);
          const expected = rows(expectedCases[name]);
          if (name === "extended") {
            assert.deepEqual(
              new Set(expected.map((f) => f.code)),
              MIGRATED_CODES,
            );
          }
          const check = async (store: Store) => {
            const program = await readApeProgram(store);
            materializeApeViews(store, program);
            const actual = rows(evaluateApeRules(store, program).findings);
            assert.deepEqual(actual, expected);
            console.log(
              name,
              JSON.stringify(
                Object.fromEntries(
                  [...MIGRATED_CODES].map((code) => [
                    code,
                    actual.filter((f) => f.code === code).length,
                  ]),
                ),
              ),
            );
          };
          const store = new Store();
          try {
            await withToolkitModel(dir, sources, (session) => {
              for (
                const batch of projectModelToNQuadBatches({
                  ...prepareApeElements(session),
                  build: { artifactDigest: "8".repeat(64) },
                })
              ) store.load(batch.nquads, { format: "application/n-quads" });
            });
            await check(store);
          } finally {
            (store as Store & { free(): void }).free();
          }
          if (oracle) {
            const native = new Store();
            try {
              native.load(await compileOpenSysml(sources, oracle), {
                format: "text/turtle",
                to_graph_name: namedNode(BUILD_GRAPH_PREFIX + "8".repeat(64)),
              });
              await check(native);
            } finally {
              (native as Store & { free(): void }).free();
            }
          }
        });
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
