import assert from "node:assert/strict";
import {
  ApeStageError,
  evaluateApeRules,
  materializeApeViews,
  parseApeRule,
  persistedApeReport,
  readApeRules,
} from "../src/ape-rules.ts";
import { recordDiagnosticError } from "../src/error.ts";
import { pathToFileURL } from "node:url";
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
    "Cycle with {related}; again {related}.",
  ).replace(
    'SELECT ?agentId WHERE { VALUES ?agentId { "z" "a:1" } }',
    () =>
      `SELECT ?agentId ?relatedAgentId WHERE { VALUES (?agentId ?relatedAgentId) { ("a" "$&") ("a" "$'") ("a" "$$") ("a" "$$") } }`,
  );
  const result = evaluateApeRules(new Store(), [parseApeRule(related)]);
  assert.deepEqual(result.findings.map((f) => [f.subject, f.context]), [
    ["agent:a", "Cycle with $$, $&, $'; again $$, $&, $'."],
  ]);
  assert.throws(
    () =>
      evaluateApeRules(new Store(), [
        parseApeRule(rule.replace("boundary.", "{related}.")),
      ]),
    (e) =>
      e instanceof ApeStageError && /relatedAgentId/.test(e.toJSON().cause),
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
      cause: new Error("Invalid APE rule header field: severity"),
    },
  );
  assert.throws(
    () =>
      parseApeRule(
        rule.replace("# finding: absent", "# finding: indeterminate"),
      ),
    { cause: new Error("Invalid APE rule header field: finding") },
  );
  for (
    const [text, reason] of [
      [
        rule.replace("# pattern: 4.2\n", ""),
        "Missing APE rule header field: pattern",
      ],
      [
        rule.replace("# pattern: 4.2", "# pattern: "),
        "Invalid APE rule header field: pattern",
      ],
      [
        rule.replace("# pattern: 4.2", "# pattern: 4.2\n# pattern: 4.3"),
        "Duplicate APE rule header field: pattern",
      ],
    ]
  ) assert.throws(() => parseApeRule(text), { cause: new Error(reason) });
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
    cause: new Error("APE rule TEST_RULE must SELECT a literal ?agentId"),
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
      assert.ok(error.cause instanceof Error);
      assert.match(error.toJSON().cause, /error|expected/i);
      assert.equal(error.toJSON().context, `APE ${stage} (${file})`);
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
    cause: new Error("APE view must CONSTRUCT RDF quads"),
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

Deno.test("rule discovery reads only root query files in sorted order", async () => {
  const directory = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${directory}/z.rq`,
      rule.replace("TEST_RULE", "Z_RULE"),
    );
    await Deno.writeTextFile(
      `${directory}/a.rq`,
      rule.replace("TEST_RULE", "A_RULE"),
    );
    await Deno.writeTextFile(`${directory}/notes.txt`, "not a query");
    await Deno.mkdir(`${directory}/views`);
    await Deno.writeTextFile(
      `${directory}/views/ignored.rq`,
      "not a root rule",
    );
    assert.deepEqual(
      (await readApeRules(pathToFileURL(`${directory}/`))).map((r) => r.code),
      ["A_RULE", "Z_RULE"],
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("diagnostic serialization preserves native error identity and removes paths and graph input", () => {
  const original = Object.assign(
    new Error(
      `Parser error at line 3 column 8 in /private/input.nq: <urn:synthetic:subject> <urn:predicate> "sensitive input" .\n"multiline\npayload"`,
    ),
    {
      code: "RDF_DUPLICATE_NATIVE_ID",
      context: {
        nativeId: "duplicate-native-id",
        locations: ["C:\\private\\input.nq", "file:///private/input.nq"],
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
  assert.equal(
    (recorded.context as Record<string, unknown>).nativeId,
    "duplicate-native-id",
  );
  assert.match(recorded.cause, /line 3 column 8/);
  assert.doesNotMatch(
    JSON.stringify(recorded),
    /private|urn:synthetic|sensitive input|multiline|payload/,
  );
  assert.equal(
    recordDiagnosticError(new Error("Failure reading /private/input.json"))
      .message,
    "Failure reading [path]",
  );
  assert.equal(
    recordDiagnosticError(
      new Error("parse failed\nprivate graph line without brackets"),
    ).message,
    "parse failed",
  );
  for (
    const path of [
      "/private/First Last/input.nq",
      "C:\\private\\First Last\\input.nq",
      "file:///private/First Last/input.nq",
    ]
  ) {
    assert.equal(
      recordDiagnosticError(new Error(`reading "${path}"`)).message,
      "reading [path]",
    );
  }
});

Deno.test("APE reports persist only stable metrics and free the store on completion and failure", async () => {
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
    assert.equal(report.status, "completed");
    assert.equal(freed, 1);
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
    assert.doesNotMatch(JSON.stringify(persisted), /Ms|"ms"/);
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
