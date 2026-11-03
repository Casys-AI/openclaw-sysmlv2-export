import assert from "node:assert/strict";
import {
  type ElementProjectionMeasurement,
  measureModelProjection,
  type ModelProjectionInput,
  projectModelToNQuadBatches,
  projectModelToNQuads,
} from "../src/ape-rdf.ts";
import { initOxigraph, Store } from "../src/oxigraph.ts";

Deno.test("RDF projection preserves deterministic native identities, references and list occurrences", async () => {
  const input: ModelProjectionInput = {
    build: { repositoryId: "trial:repo", artifactDigest: "a".repeat(64) },
    libraryNativeIds: ["lib:Type"],
    elements: [
      {
        "@id": "user:one",
        "@type": "PartUsage",
        declaredName: "same name",
        type: { "@id": "lib:Type" },
        ownedMember: [
          { "@id": "lib:Type" },
          { "@id": "user:two" },
          { "@id": "lib:Type" },
        ],
        empty: [],
        note: 'line\n"quoted"',
      },
      { "@id": "user:two", "@type": "PartUsage", declaredName: "same name" },
      {
        "@id": "lib:Type",
        "@type": "PartDefinition",
        declaredName: "Type",
        isLibraryElement: true,
      },
    ],
  };
  const projected = projectModelToNQuads(input);
  const permuted = {
    ...input,
    elements: [...input.elements].reverse().map((element) =>
      Object.fromEntries(Object.entries(element).reverse())
    ),
  };
  assert.deepEqual(projectModelToNQuads(permuted), projected);
  assert.deepEqual(input.elements[0].ownedMember, [
    { "@id": "lib:Type" },
    { "@id": "user:two" },
    { "@id": "lib:Type" },
  ]);

  const graph = `<urn:ase:build:${"a".repeat(64)}>`;
  const user = "<urn:ase:model:trial%3Arepo:user%3Aone>";
  const second = "<urn:ase:model:trial%3Arepo:user%3Atwo>";
  const library = "<urn:ase:library:lib%3AType>";
  const lines = projected.nquads.trimEnd().split("\n");
  assert.equal(projected.quadCount, lines.length);
  assert(
    lines.includes(`${user} <urn:ase:vocab:prop:type> ${library} ${graph} .`),
  );
  for (const identity of [user, second]) {
    assert(
      lines.includes(`${identity} <urn:ase:vocab:name> "same name" ${graph} .`),
    );
  }
  const occurrences = lines.filter((line) =>
    line.includes(" <urn:ase:vocab:value> ")
  );
  assert.equal(occurrences.length, 3);
  assert.equal(occurrences.filter((line) => line.includes(library)).length, 2);
  assert.equal(occurrences.filter((line) => line.includes(second)).length, 1);
  for (const index of [0, 1, 2]) {
    assert(lines.some((line) =>
      line.includes(
        ` <urn:ase:vocab:index> "${index}"^^<http://www.w3.org/2001/XMLSchema#integer> `,
      )
    ));
  }
  assert(lines.some((line) => line.includes(" <urn:ase:vocab:list:empty> ")));
  // Byte reference checked against Assembly's original synchronous projector
  // at 9493e33d, including escaped literals and blank labels.
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(projected.nquads),
    ),
  );
  assert.equal(
    [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    "12d68985237b9eab02b5f8d67bd7e591bdea8813d48b5cf2040344e937c37f41",
  );
});

Deno.test("element batches load the same graph, preserving cross-element references and complete occurrence lists", async () => {
  const input: ModelProjectionInput = {
    build: { repositoryId: "batch", artifactDigest: "b".repeat(64) },
    libraryNativeIds: ["lib"],
    elements: [
      {
        "@id": "one",
        "@type": "PartUsage",
        links: [{ "@id": "two" }, { "@id": "lib" }, { "@id": "two" }],
        details: { label: "nested", values: ["a", "a", "b"] },
      },
      { "@id": "two", "@type": "PartUsage", links: [{ "@id": "one" }] },
      { "@id": "lib", "@type": "PartDefinition", links: [] },
    ],
  };
  const full = projectModelToNQuads(input);
  // A tiny target exercises the documented oversized-element behavior.
  const batches = [...projectModelToNQuadBatches(input, 1)];
  assert.equal(batches.length, input.elements.length);
  assert.equal(
    batches.reduce((sum, batch) => sum + batch.quadCount, 0),
    full.quadCount,
  );
  assert.equal(
    batches.flatMap((batch) => batch.nquads.trimEnd().split("\n")).sort().join(
      "\n",
    ) + "\n",
    full.nquads,
  );
  const measuredElements: ElementProjectionMeasurement[] = [];
  const measured = measureModelProjection(
    input,
    (element) => measuredElements.push(element),
  );
  assert.equal(measured.quadCount, full.quadCount);
  assert.equal(measured.chars, full.nquads.length);
  assert.equal(
    measured.maxElementChars,
    Math.max(...batches.map((batch) => batch.nquads.length)),
  );
  const bounded = [
    ...projectModelToNQuadBatches(input, measured.maxElementChars),
  ];
  assert(
    bounded.every((batch) => batch.nquads.length <= measured.maxElementChars),
  );
  assert.equal(
    Object.values(measured.byPredicate).reduce((a, b) => a + b),
    full.quadCount,
  );
  assert.equal(
    Object.values(measured.byProperty).reduce((a, b) => a + b),
    full.quadCount,
  );
  assert.equal(
    measuredElements.reduce((sum, element) => sum + element.chars, 0),
    measured.chars,
  );

  await initOxigraph();
  const single = new Store();
  single.load(full.nquads, { format: "application/n-quads" });
  const batched = new Store();
  for (const batch of batches) {
    batched.load(batch.nquads, { format: "application/n-quads" });
  }
  assert.equal(batched.size, single.size);
  const query = `SELECT ?owner ?index ?value WHERE {
    GRAPH ?graph {
      ?owner <urn:ase:vocab:list:links> ?list .
      ?list <urn:ase:vocab:occurrence> ?occurrence .
      ?occurrence <urn:ase:vocab:index> ?index; <urn:ase:vocab:value> ?value .
      ?owner <urn:ase:vocab:prop:links> ?value .
      ?value <urn:ase:vocab:nativeId> ?nativeId .
    }
  } ORDER BY ?owner ?index`;
  const rows = (store: Store) =>
    (store.query(query) as Map<string, { value: string }>[]).map((row) =>
      [...row].map(([key, value]) => [key, value.value])
    );
  assert.deepEqual(rows(batched), rows(single));
  assert.equal(rows(batched).length, 4);
  const nested = `SELECT ?index ?value WHERE { GRAPH ?graph {
    <urn:ase:model:batch:one> <urn:ase:vocab:prop:details> ?details .
    ?details <urn:ase:vocab:prop:label> "nested"; <urn:ase:vocab:list:values> ?list .
    ?list <urn:ase:vocab:occurrence> ?occurrence .
    ?occurrence <urn:ase:vocab:index> ?index; <urn:ase:vocab:value> ?value .
  } } ORDER BY ?index`;
  const nestedRows = (store: Store) =>
    (store.query(nested) as Map<string, { value: string }>[]).map((
      row,
    ) => [row.get("index")!.value, row.get("value")!.value]);
  assert.deepEqual(nestedRows(batched), nestedRows(single));
  assert.deepEqual(nestedRows(batched), [["0", "a"], ["1", "a"], ["2", "b"]]);
});

Deno.test("measurement exactly deduplicates embedded reference fields across source elements", () => {
  const input: ModelProjectionInput = {
    build: { repositoryId: "embedded", artifactDigest: "c".repeat(64) },
    libraryNativeIds: [],
    elements: [
      { "@id": "target", "@type": "PartUsage", declaredName: "target" },
      {
        "@id": "one",
        "@type": "PartUsage",
        ref: { "@id": "target", declaredName: "target" },
      },
      {
        "@id": "two",
        "@type": "PartUsage",
        ref: { "@id": "target", declaredName: "target" },
      },
    ],
  };
  const full = projectModelToNQuads(input);
  const batches = [...projectModelToNQuadBatches(input, 1)];
  const raw = batches.flatMap((batch) => batch.nquads.trimEnd().split("\n"));
  assert.equal(new Set(raw).size, raw.length);
  assert.equal(
    raw.filter((line) => line.includes("<urn:ase:vocab:prop:declaredName>"))
      .length,
    1,
  );
  const measured = measureModelProjection(input);
  assert.equal(measured.quadCount, full.quadCount);
  assert.equal(measured.chars, full.nquads.length);
  assert.equal(measured.byPredicate["urn:ase:vocab:prop:declaredName"], 1);
  assert.equal(measured.byProperty.ref, 2);
  // Canonical bytes remain independent of which source first states a fact.
  assert.equal(
    projectModelToNQuads({ ...input, elements: [...input.elements].reverse() })
      .nquads,
    full.nquads,
  );
});

Deno.test("batch admission rejects duplicate native identities before yielding and handles empty graphs", () => {
  const input: ModelProjectionInput = {
    build: { repositoryId: "admission", artifactDigest: "d".repeat(64) },
    libraryNativeIds: [],
    elements: [{ "@id": "one", "@type": "PartUsage" }, {
      "@id": "one",
      "@type": "PartUsage",
    }],
  };
  assert.throws(
    () => projectModelToNQuadBatches(input, 1).next(),
    /duplicate element @id/,
  );
  assert.throws(
    () => projectModelToNQuadBatches(input, 0).next(),
    /maxBatchChars/,
  );
  assert.deepEqual(
    [...projectModelToNQuadBatches({ ...input, elements: [] })],
    [],
  );
  assert.equal(measureModelProjection({ ...input, elements: [] }).quadCount, 0);
});
