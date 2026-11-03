import assert from "node:assert/strict";
import {
  admitConstruct,
  admitSelect,
  bindFocus,
  ShaclQueryError,
} from "../src/shacl-query.ts";
import { initOxigraph, Store } from "../src/oxigraph.ts";

function rows(store: Store, query: string): string[] {
  const result = store.query(query);
  assert(Array.isArray(result));
  return result.map((row) => {
    assert(row instanceof Map);
    return JSON.stringify(
      [...row].map(([name, term]) => [name, term.toString()]).sort(),
    );
  }).sort();
}

Deno.test("SHACL prebinding reaches nested scopes from W3C 001-005 and 007", async () => {
  await initOxigraph();
  const store = new Store();
  store.load('<urn:invalid> <urn:property> "Label" .', {
    format: "text/turtle",
  });
  const cases = [
    "FILTER (?this = <urn:invalid>)",
    "{ FILTER(false) } UNION { FILTER (?this = <urn:invalid>) }",
    "{ { FILTER (?this = <urn:invalid>) } FILTER(bound(?this)) } FILTER(true)",
    "BIND (?this AS ?that) FILTER (?that = <urn:invalid>)",
    '{ FILTER(bound(?this)) } ?this <urn:property> "Label" FILTER(bound(?this))',
    "{ SELECT ?this WHERE { FILTER (?this = <urn:invalid>) } }",
  ];
  for (const pattern of cases) {
    const compiled = admitSelect(`SELECT ?this WHERE { ${pattern} }`);
    const result = store.query(
      bindFocus(compiled, ["urn:invalid", "urn:valid"]),
    );
    assert(Array.isArray(result));
    assert.deepEqual(
      result.map((row) => {
        assert(row instanceof Map);
        return row.get("this")?.value;
      }),
      ["urn:invalid"],
    );
  }
});

Deno.test("one batch agrees with independent substitution across OPTIONAL and NOT EXISTS", async () => {
  await initOxigraph();
  const store = new Store();
  store.load(
    `
    <urn:a> <urn:p> 1 .
    <urn:b> <urn:p> 2 ; <urn:q> 2 .
    <urn:d> <urn:p> 3 .
  `,
    { format: "text/turtle" },
  );
  const focus = ["urn:a", "urn:b", "urn:absent", "urn:d"];
  const pattern = `
    OPTIONAL { ?this <urn:p> ?v }
    FILTER NOT EXISTS { ?this <urn:q> ?v }
    FILTER (!BOUND(?v) || ?v < 3)
  `;
  const compiled = admitSelect(
    `SELECT DISTINCT ?this ?v WHERE { ${pattern} } ORDER BY ?this`,
  );
  const batched = rows(store, bindFocus(compiled, focus));
  // Independent oracle: substitute fixed RDF terms into the original pattern;
  // BIND only restores the result label and is not used to prebind inner scopes.
  const independent = focus.flatMap((iri) =>
    rows(
      store,
      `SELECT DISTINCT ?this ?v WHERE {
      BIND (<${iri}> AS ?this)
      ${pattern.replaceAll("?this", `<${iri}>`)}
    }`,
    )
  ).sort();
  assert.deepEqual(batched, independent);
  assert.equal(batched.length, 2);
  assert(batched.some((row) => row.includes("urn:absent")));
  // Reusing the admitted AST must not retain previous batch scopes or focuses.
  assert.deepEqual(rows(store, bindFocus(compiled, ["urn:a", "urn:a"])), [
    batched.find((row) => row.includes("urn:a>")),
  ]);
  assert.deepEqual(rows(store, bindFocus(compiled, [])), []);
});

Deno.test("SHACL scope injection handles EXISTS expressions and GRAPH scopes", async () => {
  await initOxigraph();
  const store = new Store();
  store.load('<urn:a> <urn:p> "1" <urn:g> .', {
    format: "application/n-quads",
  });
  for (
    const source of [
      "SELECT ?this WHERE { GRAPH <urn:g> { FILTER(bound(?this)) ?this <urn:p> ?v } }",
      "SELECT ?this WHERE { FILTER(EXISTS { GRAPH <urn:g> { ?this <urn:p> ?v } }) }",
      "SELECT ?this (EXISTS { GRAPH <urn:g> { ?this <urn:p> ?v } } AS ?present) WHERE {}",
    ]
  ) {
    const result = store.query(
      bindFocus(admitSelect(source), ["urn:a", "urn:b"]),
    );
    assert(Array.isArray(result));
    if (source.includes("AS ?present")) {
      assert.deepEqual(
        result.map((row) => {
          assert(row instanceof Map);
          return [row.get("this")?.value, row.get("present")?.value];
        }).sort(),
        [["urn:a", "true"], ["urn:b", "false"]],
      );
    } else {
      assert.deepEqual(
        result.map((row) => {
          assert(row instanceof Map);
          return row.get("this")?.value;
        }),
        ["urn:a"],
      );
    }
  }
});

Deno.test("admission rejects forbidden AST constructs at every nesting depth", () => {
  const rejected = [
    "ASK {}",
    "INSERT DATA { <urn:a> <urn:b> <urn:c> }",
    "SELECT * WHERE {}",
    "SELECT ?this WHERE { { SELECT * WHERE {} } }",
    "SELECT ?this WHERE { { SELECT ?other WHERE {} } }",
    "SELECT ?this WHERE { FILTER NOT EXISTS { ?this ?p ?o MINUS { ?this ?p 1 } } }",
    "SELECT ?this WHERE { SERVICE <https://example.com/> { ?this ?p ?o } }",
    "SELECT ?this WHERE { VALUES ?this { <urn:a> } }",
    "SELECT ?this WHERE {} VALUES (?other ?this) { (1 UNDEF) }",
    "SELECT ?this WHERE { VALUES ?this {} }",
    "SELECT ?this WHERE { VALUES ?other {} }",
    "SELECT ?this WHERE { BIND (true AS ?this) }",
    "SELECT (true AS ?this) WHERE {}",
    "SELECT ?this FROM <urn:data> WHERE {}",
    "SELECT ?this WHERE {} LIMIT 0",
    "SELECT ?this WHERE { { SELECT ?this WHERE {} OFFSET 1 } }",
    "SELECT ?this (COUNT(?v) AS ?count) WHERE { ?this <urn:p> ?v } GROUP BY ?this",
    "SELECT ?this WHERE {} GROUP BY ?this HAVING (true)",
    "SELECT ?this WHERE { BIND(RAND() AS ?v) }",
    "SELECT ?this WHERE { BIND(UUID() AS ?v) }",
    "SELECT ?this WHERE { BIND(STRUUID() AS ?v) }",
    "SELECT ?this WHERE { BIND(NOW() AS ?v) }",
    "SELECT ?this WHERE { BIND(BNODE() AS ?v) }",
    "SELECT ?this WHERE { BIND(<urn:custom>(?this) AS ?v) }",
  ];
  for (const source of rejected) {
    assert.throws(() => admitSelect(source), ShaclQueryError, source);
  }
  assert.throws(() => admitSelect("SELECT ?this WHERE {"), (error) => {
    assert(error instanceof ShaclQueryError);
    assert.equal(error.code, "SHACL_QUERY_PARSE");
    assert(error.cause instanceof Error);
    assert(error.message.includes(error.cause.message));
    return true;
  });
});

Deno.test("unrelated VALUES is allowed under SHACL 1.2 despite legacy unsupported002", async () => {
  // The 2017 unsupported-sparql-002 expects Failure for VALUES ?any {true}.
  // Its legacy expectation is intentionally not applied: SHACL 1.2 only bans
  // VALUES mentioning a potentially pre-bound variable (this in this profile).
  await initOxigraph();
  const store = new Store();
  const compiled = admitSelect(
    "SELECT ?this ?any WHERE { VALUES ?any { true UNDEF } }",
  );
  assert.equal(rows(store, bindFocus(compiled, ["urn:a"])).length, 2);
});

Deno.test("AST admission ignores forbidden words in literals, IRIs and comments", async () => {
  await initOxigraph();
  const compiled = admitSelect(`
    # MINUS SERVICE VALUES ?this BIND(1 AS ?this)
    SELECT DISTINCT ?this ?text WHERE {
      BIND ("MINUS SERVICE VALUES AS ?this" AS ?text)
      FILTER (?this = <urn:SERVICE:MINUS>)
    } ORDER BY ?this
  `);
  assert.deepEqual(compiled.projectedVariables, ["this", "text"]);
  assert.equal(
    rows(new Store(), bindFocus(compiled, ["urn:SERVICE:MINUS"])).length,
    1,
  );
  const prefixed = admitSelect("SELECT ?this WHERE { FILTER(?this = ex:a) }", {
    ex: "urn:test:",
  });
  assert.equal(
    rows(new Store(), bindFocus(prefixed, ["urn:test:a"])).length,
    1,
  );
});

Deno.test("focus serialization rejects injection and unsupported RDF term kinds", () => {
  const compiled = admitSelect("SELECT ?this WHERE {}");
  for (
    const value of [
      "_:blank",
      "relative",
      '"literal"',
      "urn:x> } SERVICE <https://example.com/> {} #",
      "urn:with space",
      "urn:with\\backslash",
      "urn:with\nnewline",
      "urn:bad\ud800",
    ]
  ) {
    assert.throws(() => bindFocus(compiled, [value]), {
      code: "SHACL_FOCUS_INVALID",
    });
  }
  // A unicode escape in query text must not turn into an unsafe decoded IRI
  // when the parsed query is subsequently serialized by SPARQLjs.
  assert.throws(
    () => admitSelect("SELECT ?this WHERE { ?this <urn:x\\u003E> ?v }"),
    ShaclQueryError,
  );
  assert.throws(
    () =>
      bindFocus({ queryType: "SELECT", projectedVariables: ["this"] }, [
        "urn:a",
      ]),
    ShaclQueryError,
  );
});

Deno.test("global CONSTRUCT admission parses once without prebinding or projection rules", async () => {
  await initOxigraph();
  const query = admitConstruct(
    `CONSTRUCT { ?this ex:p ?v } WHERE {
    VALUES ?this { <urn:a> }
    BIND (1 AS ?v)
    { SELECT ?other WHERE { VALUES ?other { 1 } } }
  }`,
    { ex: "urn:test:" },
  );
  const result = new Store().query(query);
  assert(Array.isArray(result));
  assert.equal(result.length, 1);
  for (
    const source of [
      "SELECT ?this WHERE {}",
      "CONSTRUCT { ?s ?p ?o } FROM <urn:data> WHERE { ?s ?p ?o }",
      "CONSTRUCT { ?s ?p ?o } WHERE { SERVICE <https://example.com/> { ?s ?p ?o } }",
      "CONSTRUCT { <urn:a> <urn:p> ?v } WHERE { BIND(RAND() AS ?v) }",
      "CONSTRUCT { _:created <urn:p> ?v } WHERE { VALUES ?v { 1 } }",
      "CONSTRUCT { <urn:a> <urn:p> [] } WHERE {}",
      "CONSTRUCT { <urn:a> <urn:p> [ <urn:q> 1 ] } WHERE {}",
    ]
  ) assert.throws(() => admitConstruct(source), ShaclQueryError);
  // Blank-node labels used only to match existing data do not create nodes.
  assert.doesNotThrow(() =>
    admitConstruct(
      "CONSTRUCT { <urn:a> <urn:p> ?v } WHERE { _:existing <urn:q> ?v }",
    )
  );
});
