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
  OPENCLAW_CODES,
  openclawFindingRows,
  openclawShapesCases,
  openclawShapesSources,
} from "../support/openclaw-shapes-fixture.ts";
const archive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");
const oracle = Deno.env.get("OPENSYSML_ARCHIVE");

const newFindings = {
  baseline: [
    "SELF_SCHEDULING agent:lead info",
    ...["client", "coach", "devbox", "field", "lead", "secretary"].map(
      (id) => `SELF_WRITABLE_CONTEXT agent:${id} warning C2`,
    ),
  ],
  extended: [
    "DELEGATION_WILDCARD agent:client warning A3",
    "OPEN_SENDER_POLICY account:telegram:public-dm warning",
    "OPEN_SENDER_POLICY account:telegram:public-group info",
    "OPEN_SENDER_POLICY account:telegram:public-group warning",
    "SELF_SCHEDULING agent:lead info",
    ...["client", "field", "lead", "secretary"].map(
      (id) => `SELF_WRITABLE_CONTEXT agent:${id} warning C2`,
    ),
  ],
  "unverified-and-negative": [
    "OPEN_SENDER_POLICY account:telegram:public-dm info",
    "OPEN_SENDER_POLICY account:telegram:public-group info",
    "OPEN_SENDER_POLICY account:telegram:public-group warning",
    "SELF_SCHEDULING agent:lead info",
    ...["field", "lead", "secretary"].map(
      (id) => `SELF_WRITABLE_CONTEXT agent:${id} warning C2`,
    ),
  ],
};
const newCodes = new Set(
  newFindings.extended.map((row) => row.split(" ")[0]),
);

Deno.test({
  name:
    "compiled OpenClaw shapes match reviewed golden findings for all 21 check codes",
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
          const expected = openclawFindingRows(expectedCases[name]);
          if (name === "extended") {
            assert.deepEqual(
              new Set(expected.map((f) => f.code)),
              OPENCLAW_CODES,
            );
          }
          const check = async (store: Store) => {
            const program = await readApeProgram(store);
            materializeApeViews(store, program);
            const actual = openclawFindingRows(
              evaluateApeRules(store, program).findings,
            );
            assert.deepEqual(actual, expected);
            assert.deepEqual(
              actual.filter((row) => newCodes.has(row.code)).map(
                ({ code, subject, severity, principle, pattern }) =>
                  [code, subject, severity, principle, pattern].filter(Boolean)
                    .join(" "),
              ).sort(),
              [...newFindings[name]].sort(),
            );
            console.log(
              name,
              JSON.stringify(
                Object.fromEntries(
                  [...OPENCLAW_CODES].map((code) => [
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
