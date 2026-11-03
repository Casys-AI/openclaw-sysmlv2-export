import assert from "node:assert/strict";
import {
  ApeStageError,
  evaluateApeRules,
  materializeApeViews,
  parseApeRule,
} from "../src/ape-rules.ts";
import { initOxigraph, Store } from "../src/oxigraph.ts";
import { checkApe } from "../src/ape.ts";

const rule = `# code: TEST_RULE
# severity: warning
# pattern: 4.2
# finding: absent
# context: Synthetic rule for the runner boundary.
# recovery: Review the modeled entry.

SELECT ?agentId WHERE { VALUES ?agentId { "z" "a:1" } }`;

Deno.test("rule data produces ordered, marked findings with shared element IDs", async () => {
  await initOxigraph();
  const result = evaluateApeRules(new Store(), [parseApeRule(rule)]);
  assert.deepEqual(
    result.findings.map((f) => ({
      code: f.code,
      subject: f.subject,
      pattern: f.pattern,
      finding: f.finding,
    })),
    [
      {
        code: "APE_TEST_RULE",
        subject: "agent:a:1",
        pattern: "4.2",
        finding: "absent",
      },
      {
        code: "APE_TEST_RULE",
        subject: "agent:z",
        pattern: "4.2",
        finding: "absent",
      },
    ],
  );
  assert.equal(result.queries[0].findings, 2);
});

Deno.test("a rule naming {related} gives one finding per agent, related agents sorted", async () => {
  await initOxigraph();
  const related = rule.replace(
    "Synthetic rule for the runner boundary.",
    "Cycle with {related}.",
  ).replace(
    'SELECT ?agentId WHERE { VALUES ?agentId { "z" "a:1" } }',
    'SELECT ?agentId ?relatedAgentId WHERE { VALUES (?agentId ?relatedAgentId) { ("a" "c") ("a" "b") ("a" "b") } }',
  );
  const result = evaluateApeRules(new Store(), [parseApeRule(related)]);
  assert.deepEqual(result.findings.map((f) => [f.subject, f.context]), [
    ["agent:a", "Cycle with b, c."],
  ]);
  assert.throws(
    () =>
      evaluateApeRules(new Store(), [
        parseApeRule(rule.replace("boundary.", "{related}.")),
      ]),
    (e) => e instanceof ApeStageError && /relatedAgentId/.test(e.cause),
  );
});

Deno.test("malformed rule metadata fails at the data boundary", () => {
  assert.throws(
    () =>
      parseApeRule(
        rule.replace("# severity: warning", "# severity: high"),
        "rules/ape/malformed.rq",
      ),
    {
      code: "APE_RULE_FAILED",
      stage: "rule",
      file: "rules/ape/malformed.rq",
      cause: "Invalid APE rule header",
    },
  );
  assert.throws(
    () =>
      parseApeRule(
        rule.replace("# finding: absent", "# finding: indeterminate"),
      ),
    { code: "APE_RULE_FAILED", stage: "rule" },
  );
});

Deno.test("a rule result without the required literal subject fails explicitly", async () => {
  await initOxigraph();
  assert.throws(() =>
    evaluateApeRules(new Store(), [{
      ...parseApeRule(rule, "rules/ape/wrong-subject.rq"),
      query: "SELECT ?agentId WHERE { BIND(<urn:test:agent> AS ?agentId) }",
    }]), {
    code: "APE_RULE_FAILED",
    stage: "rule",
    file: "rules/ape/wrong-subject.rq",
    cause: "APE rule TEST_RULE must SELECT a literal ?agentId",
  });
});

Deno.test("views materialize in order into their named graphs without changing query text", async () => {
  await initOxigraph();
  const store = new Store();
  const views = [
    {
      name: "agents",
      file: "rules/ape/views/agents.rq",
      graph: "urn:ase:ape:v1:view:agents",
      query:
        'CONSTRUCT { <urn:test:agent> <urn:ase:ape:v1:agentId> "synthetic" } WHERE {}',
    },
    {
      name: "delegation",
      file: "rules/ape/views/delegation.rq",
      graph: "urn:ase:ape:v1:view:delegation",
      query: `CONSTRUCT { ?agent <urn:ase:ape:v1:delegatesTo> <urn:test:other> }
WHERE { GRAPH <urn:ase:ape:v1:view:agents> { ?agent <urn:ase:ape:v1:agentId> "synthetic" } }`,
    },
  ];
  const text = views.map((view) => view.query);
  const result = materializeApeViews(store, views);
  assert.deepEqual(views.map((view) => view.query), text);
  assert.equal(result.derivedQuads, 2);
  assert.deepEqual(result.views.map((view) => [view.graph, view.quads]), [
    [views[0].graph, 1],
    [views[1].graph, 1],
  ]);
  assert.equal(
    store.query(`ASK { GRAPH <${views[1].graph}> {
    <urn:test:agent> <urn:ase:ape:v1:delegatesTo> <urn:test:other>
  } }`),
    true,
  );
  assert.equal(store.query("ASK { ?s ?p ?o }"), false);
});

Deno.test("query syntax failures preserve the stage, file and parser cause", async () => {
  await initOxigraph();
  const store = new Store();
  const invalidQuery = "deliberately invalid SPARQL";
  for (const stage of ["view", "rule"] as const) {
    const file = `rules/ape/${stage}-syntax.rq`;
    const run = stage === "view"
      ? () =>
        materializeApeViews(store, [{
          name: "bad",
          file,
          graph: "urn:test:view",
          query: invalidQuery,
        }])
      : () =>
        evaluateApeRules(store, [{
          ...parseApeRule(rule, file),
          query: invalidQuery,
        }]);
    assert.throws(run, (error: unknown) => {
      assert.ok(error instanceof ApeStageError);
      assert.equal(error.stage, stage);
      assert.equal(error.file, file);
      assert.match(error.cause, /error|expected/i);
      assert.ok(error.context.endsWith(error.cause));
      return true;
    });
  }
});

Deno.test("a non-quad view result fails before materializing any statements", async () => {
  await initOxigraph();
  const store = new Store();
  assert.throws(() =>
    materializeApeViews(store, [{
      name: "bad",
      file: "rules/ape/views/not-construct.rq",
      graph: "urn:test:view",
      query: 'SELECT ?value WHERE { VALUES ?value { "synthetic" } }',
    }]), {
    code: "APE_VIEW_FAILED",
    stage: "view",
    file: "rules/ape/views/not-construct.rq",
    cause: "APE view must CONSTRUCT RDF quads",
  });
  assert.equal(store.size, 0);
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
