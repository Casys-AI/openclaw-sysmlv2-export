import assert from "node:assert/strict";
import {
  APE_PROJECTION_VERSION,
  BUILD_GRAPH_PREFIX,
  type ModelProjectionInput,
  projectModelToNQuadBatches,
} from "../src/ape-rdf.ts";
import { initOxigraph, Store } from "../src/oxigraph.ts";

const SYSML = "https://www.omg.org/spec/SysML#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const element = (id: string) => `<urn:sysmlv2:element:${id}>`;
const literal = (value: string, type = "string") =>
  `"${value}"^^<${XSD}${type}>`;
const digest = "a".repeat(64);
const graph = `<${BUILD_GRAPH_PREFIX}${digest}>`;
const linesOf = (input: ModelProjectionInput, maxBatchChars?: number) =>
  [...projectModelToNQuadBatches(input, maxBatchChars)].flatMap((batch) =>
    batch.nquads.trimEnd().split("\n")
  );
const quad = (id: string, property: string, object: string) =>
  `${element(id)} <${SYSML}${property}> ${object} ${graph} .`;

Deno.test("RDF projection uses OpenMBEE vocabulary, native identity and typed retained values without derived aliases", async () => {
  const libraryId = "14c0aa22-5489-59b5-b438-ded26e83ba31";
  const input: ModelProjectionInput = {
    build: { artifactDigest: digest },
    elements: [
      {
        "@id": "user_one",
        "@type": "PartUsage",
        isLibraryElement: false,
        declaredName: "same name",
        qualifiedName: "Demo::one",
        definition: [{ "@id": libraryId }, { "@id": libraryId }],
        ownedMember: [{ "@id": "user-two" }, null, { "@id": "user-two" }],
        relatedFeature: [],
        owner: null,
        value: ["", false, true, 0, -7, 2.5, 'line\n"quoted"\\end\t\r\u0001'],
      },
      {
        "@id": "user-two",
        "@type": "PartUsage",
        declaredName: "same name",
        name: "compiled name",
      },
      {
        "@id": libraryId,
        "@type": "PartDefinition",
        declaredName: "Type",
        qualifiedName: "Native::Type",
        owner: { "@id": "native_scope" },
        isLibraryElement: true,
      },
      {
        "@id": "native_scope",
        "@type": "Package",
        isLibraryElement: true,
      },
    ],
  };
  const original = structuredClone(input);
  const lines = linesOf(input);
  const output = lines.join("\n");
  assert.equal(APE_PROJECTION_VERSION, "openmbee-v1");
  assert.equal(BUILD_GRAPH_PREFIX, "urn:ase:ape:openmbee:v1:build:");
  assert.deepEqual(input, original);
  for (const item of input.elements) {
    const id = item["@id"] as string;
    assert(lines.includes(quad(id, "elementId", literal(id))));
    assert(
      lines.includes(
        `${element(id)} <${RDF_TYPE}> <${SYSML}${item["@type"]}> ${graph} .`,
      ),
    );
  }
  assert(lines.includes(quad("user_one", "definition", element(libraryId))));
  assert(lines.includes(quad(libraryId, "owner", element("native_scope"))));
  assert(
    lines.includes(
      quad(libraryId, "isLibraryElement", literal("true", "boolean")),
    ),
  );
  assert(
    lines.includes(
      quad("user_one", "isLibraryElement", literal("false", "boolean")),
    ),
  );
  assert(
    lines.includes(quad("user_one", "declaredName", literal("same name"))),
  );
  assert(lines.includes(quad("user-two", "name", literal("compiled name"))));
  assert(
    !lines.some((line) =>
      line.startsWith(`${element("user_one")} <${SYSML}name>`)
    ),
  );
  assert(
    !lines.some((line) =>
      line.startsWith(`${element("user_one")} <${SYSML}owner>`)
    ),
  );
  assert(!output.includes(`${SYSML}relatedFeature`));
  for (
    const [value, type] of [
      ["", "string"],
      ["false", "boolean"],
      ["true", "boolean"],
      ["0", "integer"],
      ["-7", "integer"],
      ["2.5", "double"],
    ]
  ) {
    assert(lines.includes(quad("user_one", "value", literal(value, type))));
  }
  assert(
    lines.includes(
      quad(
        "user_one",
        "value",
        literal('line\\n\\"quoted\\"\\\\end\\t\\r\\u0001'),
      ),
    ),
  );
  assert.equal(
    lines.filter((line) =>
      line.startsWith(`${element("user_one")} <${SYSML}ownedMember>`)
    ).length,
    1,
  );
  assert.equal(new Set(lines).size, lines.length);
  assert(!output.includes("urn:ase:vocab:"));
  assert(!output.includes("urn:sysmlv2:annotation:json:"));
  assert(!output.includes("_:"));
  assert(!output.includes(`${SYSML}metaclass`));
  assert(!output.includes(`${SYSML}nativeId`));
  assert(!output.includes(`${SYSML}isAbstract`));
  for (const line of lines) {
    assert(line.endsWith(` ${graph} .`));
    assert(line.startsWith("<urn:sysmlv2:element:"));
  }

  // All explicit typed literals, including escaped control characters, must load.
  await initOxigraph();
  const store = new Store();
  store.load(`${output}\n`, { format: "application/n-quads" });
  assert.equal(store.size, lines.length);
});

Deno.test("unordered arrays and property/element permutations yield the same deterministic graph", () => {
  const input: ModelProjectionInput = {
    build: { artifactDigest: digest },
    elements: [
      {
        "@id": "one",
        "@type": "PartUsage",
        definition: [{ "@id": "two" }, { "@id": "lib" }, { "@id": "two" }],
        value: ["b", null, "a", "b"],
      },
      { "@id": "two", "@type": "PartUsage", declaredName: "target" },
      { "@id": "lib", "@type": "PartDefinition", isLibraryElement: true },
    ],
  };
  const permuted: ModelProjectionInput = {
    ...input,
    elements: [...input.elements].reverse().map((item) =>
      Object.fromEntries(
        Object.entries(item).reverse().map((
          [key, value],
        ) => [key, Array.isArray(value) ? [...value].reverse() : value]),
      )
    ),
  };
  assert.deepEqual(linesOf(permuted).sort(), linesOf(input).sort());
  assert.deepEqual(linesOf(input), linesOf(input));
  assert.equal(
    linesOf(input).filter((line) =>
      line.startsWith(`${element("one")} <${SYSML}value>`)
    ).length,
    2,
  );
});

Deno.test("complete-element batches load an identical graph and deduplicate enriched-reference facts", async () => {
  const input: ModelProjectionInput = {
    build: { artifactDigest: digest },
    elements: [
      {
        "@id": "one",
        "@type": "PartUsage",
        definition: [{ "@id": "two" }, { "@id": "lib" }, { "@id": "two" }],
        referent: {
          "@id": "two",
          "@type": "PartUsage",
          declaredName: "target",
        },
      },
      {
        "@id": "two",
        "@type": "PartUsage",
        owner: { "@id": "one" },
        declaredName: "target",
      },
      {
        "@id": "lib",
        "@type": "PartDefinition",
        isLibraryElement: true,
        referent: { "@id": "two", declaredName: "target" },
      },
    ],
  };
  const [full] = [
    ...projectModelToNQuadBatches(input, Number.MAX_SAFE_INTEGER),
  ];
  const batches = [...projectModelToNQuadBatches(input, 1)];
  assert.equal(batches.length, input.elements.length);
  assert.equal(
    batches.reduce((sum, batch) => sum + batch.quadCount, 0),
    full.quadCount,
  );
  const raw = linesOf(input, 1);
  assert.equal(new Set(raw).size, raw.length);
  assert.deepEqual(raw.sort(), linesOf(input).sort());
  assert.equal(
    raw.filter((line) => line.includes(`<${SYSML}declaredName>`)).length,
    1,
  );
  for (const batch of batches) {
    assert.equal(batch.nquads.split("\n").length - 1, batch.quadCount);
  }
  const bounded = [
    ...projectModelToNQuadBatches(
      input,
      batches[0].nquads.length + batches[1].nquads.length,
    ),
  ];
  assert.equal(bounded.length, 2);
  assert.equal(
    bounded[0].quadCount,
    batches[0].quadCount + batches[1].quadCount,
  );

  await initOxigraph();
  const single = new Store();
  single.load(full.nquads, { format: "application/n-quads" });
  const batched = new Store();
  for (const batch of batches) {
    batched.load(batch.nquads, { format: "application/n-quads" });
  }
  assert.equal(batched.size, single.size);
  assert.equal(batched.size, full.quadCount);
  const query = `SELECT ?subject ?predicate ?value WHERE { GRAPH ?graph {
    ?subject ?predicate ?value
  } } ORDER BY ?subject ?predicate ?value`;
  const rows = (store: Store) =>
    (store.query(query) as Map<
      string,
      { value: string; termType: string; datatype?: { value: string } }
    >[]).map((row) =>
      [...row].map((
        [key, value],
      ) => [key, value.termType, value.value, value.datatype?.value])
    );
  assert.deepEqual(rows(batched), rows(single));
  const linked = batched.query(`SELECT ?target WHERE { GRAPH ?graph {
    ${element("one")} <${SYSML}definition> ?target .
    ?target <${SYSML}elementId> ?nativeId .
  } }`) as Map<string, { value: string }>[];
  assert.equal(linked.length, 2);
});

Deno.test("projection omits absent values and rejects unsupported compound and numeric values explicitly", () => {
  const input: ModelProjectionInput = {
    build: { artifactDigest: digest },
    elements: [{
      "@id": "one",
      "@type": "PartUsage",
      owner: null,
      definition: [],
      value: [null, null],
    }],
  };
  assert.equal(linesOf(input).length, 2);
  for (
    const value of [
      { name: "object" },
      [["nested"]],
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]
  ) {
    assert.throws(
      () => linesOf({ ...input, elements: [{ ...input.elements[0], value }] }),
      { code: "RDF_PROJECTION_UNSUPPORTED" },
    );
  }
});

Deno.test("projection validates build and batch inputs and handles empty graphs", () => {
  const input: ModelProjectionInput = {
    build: { artifactDigest: digest },
    elements: [],
  };
  for (const size of [0, -1, 0.5, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => projectModelToNQuadBatches(input, size).next(),
      /maxBatchChars/,
    );
  }
  for (const artifactDigest of ["invalid", "A".repeat(64), "a".repeat(63)]) {
    assert.throws(
      () =>
        projectModelToNQuadBatches({ ...input, build: { artifactDigest } })
          .next(),
      /artifactDigest/,
    );
  }
  assert.deepEqual([...projectModelToNQuadBatches(input)], []);
});
