import assert from "node:assert/strict";
import {
  type ModelProjectionInput,
  projectModelToNQuadBatches,
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
  const projected = [...projectModelToNQuadBatches(input)];
  const lines = projected.flatMap((batch) => batch.nquads.trimEnd().split("\n"))
    .sort();
  const canonical = `${lines.join("\n")}\n`;
  const permuted = {
    ...input,
    elements: [...input.elements].reverse().map((element) =>
      Object.fromEntries(Object.entries(element).reverse())
    ),
  };
  assert.equal(
    [...projectModelToNQuadBatches(permuted)].flatMap((batch) =>
      batch.nquads.trimEnd().split("\n")
    ).sort().join("\n") + "\n",
    canonical,
  );
  assert.deepEqual(input.elements[0].ownedMember, [
    { "@id": "lib:Type" },
    { "@id": "user:two" },
    { "@id": "lib:Type" },
  ]);

  const graph = `<urn:ase:build:${"a".repeat(64)}>`;
  const user = "<urn:ase:model:trial%3Arepo:user%3Aone>";
  const second = "<urn:ase:model:trial%3Arepo:user%3Atwo>";
  const library = "<urn:ase:library:lib%3AType>";
  assert.equal(
    projected.reduce((sum, batch) => sum + batch.quadCount, 0),
    lines.length,
  );
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
  // in src/adapters/out/oxigraph/rdf.ts, 3 November 2026. Includes escaped literals and blank labels.
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
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
        ref: { "@id": "two", declaredName: "target" },
      },
      {
        "@id": "two",
        "@type": "PartUsage",
        links: [{ "@id": "one" }],
        declaredName: "target",
      },
      {
        "@id": "lib",
        "@type": "PartDefinition",
        links: [],
        ref: { "@id": "two", declaredName: "target" },
      },
    ],
  };
  const [full] = [
    ...projectModelToNQuadBatches(input, Number.MAX_SAFE_INTEGER),
  ];
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
    full.nquads.trimEnd().split("\n").sort().join("\n") + "\n",
  );
  const raw = batches.flatMap((batch) => batch.nquads.trimEnd().split("\n"));
  assert.equal(new Set(raw).size, raw.length);
  assert.equal(
    raw.filter((line) => line.includes("<urn:ase:vocab:prop:declaredName>"))
      .length,
    1,
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

Deno.test("projection validates its build and batch inputs and handles empty graphs", () => {
  const input: ModelProjectionInput = {
    build: { repositoryId: "admission", artifactDigest: "d".repeat(64) },
    libraryNativeIds: [],
    elements: [],
  };
  assert.throws(
    () => projectModelToNQuadBatches(input, 0).next(),
    /maxBatchChars/,
  );
  assert.throws(
    () =>
      projectModelToNQuadBatches({
        ...input,
        build: { ...input.build, repositoryId: "" },
      }).next(),
    /repositoryId/,
  );
  assert.throws(
    () =>
      projectModelToNQuadBatches({
        ...input,
        build: { ...input.build, artifactDigest: "invalid" },
      }).next(),
    /artifactDigest/,
  );
  assert.deepEqual([...projectModelToNQuadBatches(input)], []);
});
