import assert from "node:assert/strict";
import { installToolkit } from "../../src/adapters/out/sysml-toolkit/install.ts";
import { emit } from "../../src/adapters/out/sysml/emitter.ts";
import { ASSEMBLY_LIBRARY } from "../../src/adapters/out/sysml/library.ts";
import { parseSnapshot } from "../../src/infrastructure/snapshot-codec.ts";
import { prepareApeElements } from "../../src/adapters/out/sysml-toolkit/compilation/ape-elements.ts";
import {
  BUILD_GRAPH_PREFIX,
  projectModelToNQuadBatches,
} from "../../src/adapters/out/oxigraph/rdf.ts";
import {
  initOxigraph,
  namedNode,
  Store,
  type Term,
} from "../../src/adapters/out/oxigraph/store.ts";
import {
  evaluateApeRules,
  materializeApeViews,
  readApeProgram,
} from "../../src/adapters/out/shacl/diagnostics.ts";
import { REPORT_GRAPH, SH } from "../../src/adapters/out/shacl/engine.ts";
import { compileOpenSysml } from "../support/opensysml.ts";
import { withToolkitModel } from "../support/toolkit-model.ts";

const toolkitArchive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");
const oracleArchive = Deno.env.get("OPENSYSML_ARCHIVE");
const BUILD_DIGEST = "7".repeat(64);
const APE = "urn:ase:ape:v1:";
const sortTuples = (tuples: (string | null)[][]) =>
  tuples.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function expectedTuples(extended: boolean) {
  const tuples: (string | null)[][] = [];
  for (
    const component of [["client", "coach"], [
      "devbox",
      "field",
      "lead",
      "secretary",
    ]]
  ) {
    for (const agent of component) {
      for (const related of component) {
        if (agent !== related) tuples.push(["APE_LINK_CYCLE", agent, related]);
      }
    }
  }
  if (extended) {
    tuples.push(
      ["APE_GRANT_WIDENS_PARENT", "bridge", "host"],
      ["APE_GRANT_WIDENS_PARENT", "parent", "host"],
      ["APE_UNREACHABLE_OPERATOR", "orphan", "orphan"],
      ["APE_UNREACHABLE_OPERATOR", "self", "self"],
    );
  }
  return sortTuples(tuples);
}

function evaluate(store: Store) {
  return readApeProgram(store).then((program) => {
    materializeApeViews(store, program);
    const evaluated = evaluateApeRules(store, program);
    // Compare report solutions by domain identity, never compiler-specific IRIs.
    const rows = store.query(
      `SELECT DISTINCT ?code ?agentId ?relatedAgentId WHERE {
      GRAPH <${REPORT_GRAPH}> {
        ?result a <${SH}ValidationResult>; <${SH}sourceShape> ?shape;
          <${SH}focusNode> ?focus; <${SH}value> ?value .
      }
      GRAPH <urn:ase:ape:v1:shapes> { ?shape <${APE}code> ?code }
      FILTER(STRSTARTS(STR(?code), "APE_"))
      ?focus <${APE}agentId> ?agentId .
      OPTIONAL { ?value <${APE}agentId> ?relatedAgentId }
    }`,
      {
        ...program.dataOptions,
        named_graphs: [
          namedNode(REPORT_GRAPH),
          namedNode("urn:ase:ape:v1:shapes"),
        ],
      },
    );
    assert.ok(Array.isArray(rows));
    const tuples = (rows as Map<string, Term>[]).map((
      row,
    ) => [
      row.get("code")!.value,
      row.get("agentId")!.value,
      row.get("relatedAgentId")?.value ?? null,
    ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {
      findings: evaluated.findings,
      tuples,
      queries: evaluated.queries.map(({ code, findings }) => ({
        code,
        findings,
      })),
    };
  });
}

Deno.test({
  name:
    "Toolkit 0.10.10 and OpenSysML 0.11.0 give identical shipped model findings on the same sources",
  ignore: !oracleArchive,
  async fn(t) {
    assert.ok(
      toolkitArchive,
      "SYSML_TOOLKIT_WASM_ARCHIVE is required with OPENSYSML_ARCHIVE",
    );
    const dir = await Deno.makeTempDir({ prefix: "ape-compiler-parity-" });
    try {
      await installToolkit(dir, { from: toolkitArchive });
      await initOxigraph();
      for (const extended of [false, true]) {
        await t.step(
          extended
            ? "extended trial exercises all three rules"
            : "baseline has six cycle findings",
          async () => {
            const snapshot = parseSnapshot(
              JSON.parse(
                await Deno.readTextFile(
                  new URL("../golden/snapshot.json", import.meta.url),
                ),
              ),
            );
            if (extended) snapshot.messaging.enabled = false;
            const sources = new Map([...emit(snapshot), ...ASSEMBLY_LIBRARY]);
            if (extended) {
              sources.set(
                "ApeTrial.sysml",
                await Deno.readTextFile(
                  new URL("../fixtures/ape-trial.sysml", import.meta.url),
                ),
              );
            }
            const toolkit = new Store(), oracle = new Store();
            try {
              await withToolkitModel(dir, sources, (session) => {
                const prepared = prepareApeElements(session);
                for (
                  const batch of projectModelToNQuadBatches({
                    ...prepared,
                    build: { artifactDigest: BUILD_DIGEST },
                  })
                ) {
                  toolkit.load(batch.nquads, { format: "application/n-quads" });
                }
              });
              // Oracle TTL is loaded verbatim: no RDF adapter or semantic normalization.
              oracle.load(await compileOpenSysml(sources, oracleArchive!), {
                format: "text/turtle",
                to_graph_name: namedNode(
                  BUILD_GRAPH_PREFIX + BUILD_DIGEST,
                ),
              });
              const actual = await evaluate(toolkit),
                expected = await evaluate(oracle);
              assert.deepEqual(
                actual,
                expected,
                "complete findings, report tuples and query counts must agree",
              );
              assert.deepEqual(actual.tuples, expectedTuples(extended));
              console.log(
                JSON.stringify({
                  fixture: extended ? "extended" : "baseline",
                  queries: actual.queries,
                  reportTuples: actual.tuples.length,
                }),
              );
            } finally {
              (toolkit as Store & { free(): void }).free();
              (oracle as Store & { free(): void }).free();
            }
          },
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
