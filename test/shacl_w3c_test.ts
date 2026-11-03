import assert from "node:assert/strict";
import { initOxigraph, namedNode, Store, type Term } from "../src/oxigraph.ts";
import { ShaclQueryError } from "../src/shacl-query.ts";
import {
  readShaclProgram,
  SH,
  ShaclStageError,
  SHAPES_GRAPH,
  validateShacl,
} from "../src/shacl.ts";

const MF = "http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#";
const SHT = "http://www.w3.org/ns/shacl-test#";
const FIXTURES = new URL("./fixtures/shacl-w3c/", import.meta.url);

// The unchanged W3C corpus predates SHACL 1.2. These cases are intentionally
// inapplicable; ignored tests below keep them distinct from successful cases.
export const skippedW3cCases = [
  [
    "pre-binding/unsupported-sparql-002.ttl",
    "SHACL 1.0 forbade all VALUES; SHACL 1.2 permits VALUES on unrelated variables",
  ],
  [
    "pre-binding/unsupported-sparql-006.ttl",
    "Custom ASK constraint components are outside the SELECT-only profile",
  ],
  [
    "pre-binding/shapesGraph-001.ttl",
    "$shapesGraph and $currentShape prebinding are outside this profile",
  ],
  [
    "sparql/property/sparql-001.ttl",
    "Property shapes and PATH substitution are outside this profile",
  ],
  [
    "sparql/component/nodeValidator-001.ttl",
    "Custom constraint components and node validators are outside this profile",
  ],
  [
    "sparql/component/optional-001.ttl",
    "Custom constraint components and optional parameters are outside this profile",
  ],
  [
    "sparql/component/propertyValidator-select-001.ttl",
    "Custom property validators and property shapes are outside this profile",
  ],
  [
    "sparql/component/validator-001.ttl",
    "Custom constraint components and ASK validators are outside this profile",
  ],
] as const;

const applicableW3cCases = [
  ...Array.from(
    { length: 7 },
    (_, index) => `pre-binding/pre-binding-00${index + 1}.ttl`,
  ),
  ...[1, 3, 4, 5].map((index) =>
    `pre-binding/unsupported-sparql-00${index}.ttl`
  ),
  ...[1, 2, 3].map((index) => `sparql/node/sparql-00${index}.ttl`),
  "sparql/node/prefixes-001.ttl",
];

function select(store: Store, source: string): Map<string, Term>[] {
  const result = store.query(source);
  assert(Array.isArray(result));
  assert(result.every((row) => row instanceof Map));
  return result as Map<string, Term>[];
}

function normalize(rows: Map<string, Term>[]): string[] {
  return rows.map((row) =>
    JSON.stringify(
      [...row].map(([key, value]) => [key, value.toString()]).sort(),
    )
  ).sort();
}

function reportResults(store: Store, reportPattern: string): string[] {
  return normalize(select(
    store,
    `
    PREFIX sh: <${SH}>
    SELECT ?focus ?shape ?constraint ?component ?path ?value ?severity WHERE {
      ${reportPattern}
      ?report sh:result ?result .
      ?result a sh:ValidationResult ;
        sh:focusNode ?focus ; sh:sourceShape ?shape ;
        sh:sourceConstraint ?constraint ; sh:sourceConstraintComponent ?component ;
        sh:resultSeverity ?severity .
      OPTIONAL { ?result sh:resultPath ?path }
      OPTIONAL { ?result sh:value ?value }
    }
  `,
  ));
}

async function fixtureCases(
  directory = FIXTURES,
  prefix = "",
): Promise<string[]> {
  const cases: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isDirectory) {
      cases.push(
        ...await fixtureCases(
          new URL(`${entry.name}/`, directory),
          `${prefix}${entry.name}/`,
        ),
      );
    } else if (entry.name.endsWith(".ttl") && entry.name !== "manifest.ttl") {
      cases.push(prefix + entry.name);
    }
  }
  return cases.sort();
}

Deno.test("unchanged W3C SHACL corpus: 15 applicable cases, 8 explicitly skipped", async (t) => {
  await initOxigraph();
  assert.equal(applicableW3cCases.length, 15);
  assert.equal(skippedW3cCases.length, 8);
  assert.deepEqual(
    await fixtureCases(),
    [
      ...applicableW3cCases,
      ...skippedW3cCases.map(([file]) => file),
    ].sort(),
    "every public non-manifest case must be applied or explicitly skipped",
  );
  for (const file of applicableW3cCases) {
    await t.step(file, async () => {
      const source = await Deno.readTextFile(new URL(file, FIXTURES));
      // Original public .test document IRIs resolve <> and declared prefixes;
      // parsing into two graphs leaves every original fixture byte untouched.
      const publicPath = file.replace(/^sparql\//, "").replace(
        /\.ttl$/,
        ".test",
      );
      const base_iri = `http://datashapes.org/sh/tests/sparql/${publicPath}`;
      const store = new Store();
      store.load(source, { format: "text/turtle", base_iri });
      store.load(source, {
        format: "text/turtle",
        base_iri,
        to_graph_name: namedNode(SHAPES_GRAPH),
      });
      const expected = select(
        store,
        `SELECT ?expected WHERE { ?test <${MF}result> ?expected }`,
      );
      assert.equal(expected.length, 1);
      if (expected[0].get("expected")!.value === SHT + "Failure") {
        assert.throws(() => {
          const program = readShaclProgram(store, SHAPES_GRAPH, file);
          validateShacl(store, program);
        }, (error) => {
          // A forbidden SPARQL AST must cause the failure, rather than an
          // unrelated error reading the expected-report metadata in this file.
          return error instanceof ShaclStageError &&
            error.cause instanceof ShaclQueryError;
        });
        return;
      }
      const program = readShaclProgram(store, SHAPES_GRAPH, file);
      const actual = validateShacl(store, program);
      const report = new Store();
      report.load(actual.validationReport, { format: "text/turtle" });
      const expectedPattern = `?test <${MF}result> ?report .`;
      const actualPattern = `?report a <${SH}ValidationReport> .`;
      assert.deepEqual(
        reportResults(report, actualPattern),
        reportResults(store, expectedPattern),
      );
      assert.deepEqual(
        normalize(
          select(
            report,
            `SELECT ?conforms WHERE { ?report a <${SH}ValidationReport> ; <${SH}conforms> ?conforms }`,
          ),
        ),
        normalize(
          select(
            store,
            `SELECT ?conforms WHERE { ${expectedPattern} ?report <${SH}conforms> ?conforms }`,
          ),
        ),
      );
      // Compare expected messages when supplied. A generated message absent
      // from a W3C expectation is allowed because messages are SHOULD fields.
      const messages = (target: Store, pattern: string) =>
        normalize(select(
          target,
          `
        SELECT ?focus ?constraint ?value ?message WHERE {
          ${pattern}
          ?report <${SH}result> ?result .
          ?result <${SH}focusNode> ?focus ; <${SH}sourceConstraint> ?constraint ;
            <${SH}resultMessage> ?message .
          OPTIONAL { ?result <${SH}value> ?value }
        }
      `,
        ));
      const actualMessages = messages(report, actualPattern);
      for (const expectedMessage of messages(store, expectedPattern)) {
        assert(actualMessages.includes(expectedMessage));
      }
      assert.equal(
        actual.queries.length,
        program.shapes.reduce(
          (sum, shape) => sum + shape.constraints.length,
          0,
        ),
      );
      assert.equal(
        actual.results.length,
        reportResults(report, actualPattern).length,
      );
      if (file === "sparql/node/sparql-001.ttl") {
        const targets = select(
          store,
          `SELECT ?focus WHERE { ?shape <${SH}targetNode> ?focus }`,
        );
        assert.equal(targets.length, 3);
        assert.equal(
          actual.queries.length,
          1,
          "three focus nodes must share one constraint query",
        );
        assert.equal(
          actual.results.length,
          3,
          "two invalid nodes produce three label bindings",
        );
      }
    });
  }
});

for (const [file, reason] of skippedW3cCases) {
  Deno.test({ name: `W3C skipped ${file}: ${reason}`, ignore: true, fn() {} });
}
