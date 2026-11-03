import assert from "node:assert/strict";
import {
  admitApeProgram,
  ApeStageError,
  evaluateApeRules,
  materializeApeViews,
  persistedApeReport,
} from "../src/ape-rules.ts";
import { recordDiagnosticError } from "../src/error.ts";
import { initOxigraph, namedNode, Store } from "../src/oxigraph.ts";
import { checkApe } from "../src/ape.ts";
import {
  readShaclProgram,
  ShaclStageError,
  SHAPES_GRAPH,
  validateShacl,
} from "../src/shacl.ts";

const prefixes = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ape: <urn:ase:ape:v1:> .
@prefix ex: <urn:test:> .`;
const shape = `${prefixes}
ex:Shape a sh:NodeShape; sh:targetSubjectsOf ape:agentId;
  ape:code "TEST_RULE"; ape:pattern "4.2"; ape:finding "absent"; ape:recovery "Review the modeled entry.";
  sh:sparql ex:Constraint .
ex:Constraint sh:severity sh:Warning;
  sh:message "Cycle with {$relatedAgentId}; again {$relatedAgentId}.";
  sh:select """SELECT DISTINCT $this ?value ?relatedAgentId WHERE {
    $this <urn:ase:ape:v1:related> ?value . ?value <urn:ase:ape:v1:agentId> ?relatedAgentId
  }""" .`;
function load(store: Store, shapes: string) {
  store.load(shapes, {
    format: "text/turtle",
    to_graph_name: namedNode(SHAPES_GRAPH),
  });
  return readShaclProgram(store, SHAPES_GRAPH, "rules/ape/ape.ttl");
}
function dispose(store: Store) {
  (store as Store & { free(): void }).free();
}

Deno.test("APE report mapping groups sorted related IDs and preserves replacement characters", async () => {
  await initOxigraph();
  const store = new Store();
  try {
    const program = load(store, shape);
    store.load(
      `${prefixes}
      ex:a ape:agentId "a:1"; ape:related ex:b, ex:c, ex:d .
      ex:b ape:agentId "$&" . ex:c ape:agentId "$'" . ex:d ape:agentId "$$" .`,
      { format: "text/turtle" },
    );
    const admitted = admitApeProgram(store, program);
    const report = evaluateApeRules(store, admitted);
    assert.deepEqual(report.findings, [{
      code: "APE_TEST_RULE",
      subject: "agent:a:1",
      severity: "warning",
      pattern: "4.2",
      finding: "absent",
      context: "Cycle with $$, $&, $'; again $$, $&, $'.",
      recovery: "Review the modeled entry.",
    }]);
    assert.equal(report.queries[0].findings, 1);
    assert.match(report.validationReport, /ValidationReport/);
    assert.match(report.validationReport, /resultMessage/);
    // Admitted annotations are retained; evaluation does not read/admit them again.
    store.load(`${prefixes} ex:Shape ape:pattern "changed after admission" .`, {
      format: "text/turtle",
      to_graph_name: namedNode(SHAPES_GRAPH),
    });
    assert.equal(
      evaluateApeRules(store, admitted).validationReport,
      report.validationReport,
    );
  } finally {
    dispose(store);
  }
});

Deno.test("APE annotations and agent IDs are required at the adapter boundary", async () => {
  await initOxigraph();
  for (
    const broken of [
      shape.replace('ape:pattern "4.2";', ""),
      shape.replace('ape:finding "absent"', 'ape:finding "indeterminate"'),
    ]
  ) {
    const store = new Store();
    try {
      const program = load(store, broken);
      assert.throws(
        () => admitApeProgram(store, program),
        (e) =>
          e instanceof ApeStageError && /annotation/.test(e.toJSON().cause),
      );
    } finally {
      dispose(store);
    }
  }
  const store = new Store();
  try {
    const program = load(store, shape);
    store.load(
      `${prefixes} ex:a ape:agentId "a"; ape:related ex:b . ex:b ape:agentId ex:invalid .`,
      { format: "text/turtle" },
    );
    assert.throws(
      () => evaluateApeRules(store, admitApeProgram(store, program)),
      (e) => e instanceof ApeStageError && /agentId/.test(e.toJSON().cause),
    );
  } finally {
    dispose(store);
  }
});

Deno.test("global rules follow only numeric order and expose prior views without metadata", async () => {
  await initOxigraph();
  const store = new Store();
  try {
    const program = load(
      store,
      `${prefixes}
ex:Second a sh:SPARQLRule; sh:runOnce true; sh:order 20; ape:name "second"; ape:graph ex:second;
  sh:construct "CONSTRUCT { <urn:test:a> <urn:test:p> <urn:test:c> } WHERE { GRAPH <urn:test:first> { <urn:test:a> <urn:test:p> <urn:test:b> } }" .
ex:First a sh:SPARQLRule; sh:runOnce true; sh:order 10; ape:name "first"; ape:graph ex:first;
  sh:construct "CONSTRUCT { <urn:test:a> <urn:test:p> <urn:test:b> } WHERE { FILTER NOT EXISTS { GRAPH ?g { ?s a <http://www.w3.org/ns/shacl#SPARQLRule> } } }" .`,
    );
    const result = materializeApeViews(store, program);
    assert.deepEqual(result.views.map((view) => [view.graph, view.quads]), [[
      "urn:test:first",
      1,
    ], ["urn:test:second", 1]]);
    assert.equal(result.derivedQuads, 2);
  } finally {
    dispose(store);
  }
});

Deno.test("bounded profile rejects unsupported Core instead of silently dropping it", async () => {
  await initOxigraph();
  for (
    const text of [
      `${prefixes} ex:S a sh:NodeShape; sh:targetNode ex:a; sh:class ex:C .`,
      `${prefixes} ex:S a sh:PropertyShape; sh:path ex:p .`,
      `${prefixes} ex:S a sh:NodeShape; sh:targetObjectsOf ex:p .`,
      `${prefixes} ex:S a sh:NodeShape; sh:sparql ex:C . ex:C sh:ask "ASK {}" .`,
      `${prefixes} ex:R a sh:SPARQLRule; sh:construct "CONSTRUCT {} WHERE {}" .`,
    ]
  ) {
    const store = new Store();
    try {
      assert.throws(() => load(store, text), ShaclStageError);
    } finally {
      dispose(store);
    }
  }
});

Deno.test("schema admission ignores expected reports but validates query, message and order types", async () => {
  await initOxigraph();
  const store = new Store();
  try {
    const program = load(
      store,
      `${prefixes}
      ex:S a sh:NodeShape; sh:targetNode ex:a; sh:sparql ex:C .
      ex:C sh:select "SELECT $this WHERE {}"; sh:message "A message"@en .
      ex:Report a sh:ValidationReport; sh:conforms false; sh:result ex:Result .
      ex:Result a sh:ValidationResult; sh:focusNode ex:a; sh:resultSeverity sh:Violation; sh:sourceShape ex:S .`,
    );
    assert.equal(validateShacl(store, program).results.length, 1);
  } finally {
    dispose(store);
  }
  for (
    const broken of [
      `${prefixes} ex:S a sh:NodeShape, <http://www.w3.org/2000/01/rdf-schema#Class>; sh:targetNode ex:a .`,
      `${prefixes} ex:S sh:targetNode ex:a; sh:sparql ex:C . ex:C sh:select "SELECT $this WHERE {}"@en .`,
      `${prefixes} ex:S sh:targetNode ex:a; sh:sparql ex:C . ex:C sh:select "SELECT $this WHERE {}"; sh:message 12 .`,
    ]
  ) {
    const store = new Store();
    try {
      assert.throws(() => load(store, broken), ShaclStageError);
    } finally {
      dispose(store);
    }
  }
  const globalRule = (order: string) =>
    `${prefixes}
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    ex:R a sh:SPARQLRule; sh:runOnce true; sh:order ${order};
      ape:name "synthetic"; ape:graph ex:view;
      sh:construct "CONSTRUCT { <urn:a> <urn:p> <urn:b> } WHERE {}" .`;
  for (
    const [term, expected] of [
      ['"+10"^^xsd:integer', 10],
      ['"-1.5"^^xsd:decimal', -1.5],
      ['".5"^^xsd:decimal', 0.5],
      ['"10."^^xsd:decimal', 10],
    ] as const
  ) {
    const store = new Store();
    try {
      assert.equal(load(store, globalRule(term)).rules[0].order, expected);
    } finally {
      dispose(store);
    }
  }
  for (
    const term of [
      '"10"^^xsd:float',
      '"10"^^xsd:double',
      '""^^xsd:integer',
      '" "^^xsd:decimal',
      '" 10 "^^xsd:integer',
      '"NaN"^^xsd:decimal',
      '"INF"^^xsd:decimal',
      '"1e1"^^xsd:decimal',
      '"1.5"^^xsd:integer',
      '"."^^xsd:decimal',
      '"+"^^xsd:integer',
      `"${"9".repeat(400)}"^^xsd:integer`,
    ]
  ) {
    const store = new Store();
    try {
      assert.throws(() => load(store, globalRule(term)), (error) => {
        assert(error instanceof ShaclStageError);
        assert.match(String(error.cause), /sh:order/);
        return true;
      });
    } finally {
      dispose(store);
    }
  }
});

Deno.test("constraint failures remain runner failures with separate stage and file", async () => {
  await initOxigraph();
  const store = new Store();
  try {
    const program = load(
      store,
      `${prefixes} ex:S a sh:NodeShape; sh:targetNode ex:a; sh:sparql ex:C .
      ex:C sh:select "SELECT $this ?failure WHERE { BIND(true AS ?failure) }" .`,
    );
    assert.throws(() => validateShacl(store, program), (error) => {
      assert.ok(error instanceof ShaclStageError);
      assert.equal(error.stage, "rule");
      assert.equal(error.file, "rules/ape/ape.ttl#urn:test:C");
      assert.match(String(error.cause), /failure=true/);
      return true;
    });
  } finally {
    dispose(store);
  }
});

Deno.test("APE preparation failure is reported separately from compiler diagnostics", async () => {
  const report = await checkApe({
    toFullJson: () => "invalid JSON",
    rows: () => {
      throw new Error("should not need catalog rows");
    },
  });
  assert.equal(report.status, "failed");
  assert.equal(report.code, "APE_GRAPH_FAILED");
  assert.equal(report.stage, "projection");
  assert.ok(report.cause);
  assert.deepEqual(report.findings, []);
  assert.ok(report.context && report.recovery);
});

Deno.test("diagnostic serialization preserves error identity and sanitizes graph input", () => {
  const original = Object.assign(
    new Error(
      `Parser error at line 3 in /private/input.nq: <urn:synthetic:subject> <urn:predicate> "sensitive input" .\n"multiline\npayload"`,
    ),
    {
      code: "RDF_DUPLICATE_NATIVE_ID",
      context: {
        nativeId: "duplicate-native-id",
        locations: ["C:\\private\\input.nq"],
      },
    },
  );
  const failure = new ApeStageError(
    "projection",
    original,
    "/private/query.rq",
  );
  assert.equal(failure.cause, original);
  assert.equal(failure.context, original.context);
  const recorded = failure.toJSON();
  assert.equal(recorded.code, original.code);
  assert.match(recorded.cause, /line 3/);
  assert.doesNotMatch(
    JSON.stringify(recorded),
    /private|urn:synthetic|sensitive input|multiline|payload/,
  );
  assert.equal(
    recordDiagnosticError(new Error("Failure reading /private/input.json"))
      .message,
    "Failure reading [path]",
  );
});

Deno.test("APE reports persist counts without timings or duplicated RDF and free their store", async () => {
  const prototype = Store.prototype as Store & { free(): void };
  const free = prototype.free;
  const query = prototype.query;
  let freed = 0;
  prototype.free = function () {
    freed++;
    free.call(this);
  };
  const session = { toFullJson: () => "[]", rows: () => "[]" };
  try {
    const report = await checkApe(session);
    assert.equal(report.status, "completed", JSON.stringify(report));
    assert.equal(freed, 1);
    assert.ok(report.validationReport);
    const persisted = persistedApeReport(report);
    assert.deepEqual(persistedApeReport(persisted), persisted);
    assert.ok(report.metrics);
    assert.deepEqual(
      persistedApeReport({
        ...report,
        metrics: {
          ...report.metrics,
          totalMs: 999,
          views: report.metrics.views.map((view) => ({ ...view, ms: 999 })),
          queries: report.metrics.queries.map((query) => ({
            ...query,
            ms: 999,
          })),
        },
      }),
      persisted,
    );
    assert.doesNotMatch(JSON.stringify(persisted), /Ms|"ms"|validationReport/);
    prototype.query = () => {
      throw new Error("synthetic query failure");
    };
    assert.equal((await checkApe(session)).status, "failed");
    assert.equal(freed, 2);
  } finally {
    prototype.free = free;
    prototype.query = query;
  }
});
