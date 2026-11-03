import assert from "node:assert/strict";
import {
  type Element,
  prepareApeElements,
  RdfProjectionError,
  selectApeElements,
} from "./ape-elements.ts";
import { ExportError } from "../../../../infrastructure/error.ts";

Deno.test("APE slice preserves retained values for unordered projection while omitting unused nodes and properties", () => {
  const ordered = [
    { "@id": "omitted" },
    { "@id": "kept" },
    { "@id": "omitted" },
    null,
  ];
  const retained = {
    "@id": "kept",
    "@type": "PartUsage",
    isLibraryElement: false,
    declaredName: "SysML::UserName",
    owner: { "@id": "omitted" },
    ownedMember: ordered,
    ownedSpecialization: [{ "@id": "specialization" }],
    definition: [{ "@id": "definition" }],
    redefinedFeature: { "@id": "old" },
    sourceFeature: [{ "@id": "source" }],
    targetFeature: [{ "@id": "target" }],
    value: { "@id": "expression", extra: [null, "unchanged"] },
  };
  const source: Element[] = [
    {
      ...retained,
      qualifiedName: null,
      relatedFeature: [],
      unused: ["discard"],
    },
    { "@id": "omitted", "@type": "Comment", isLibraryElement: true },
    {
      "@id": "expression",
      "@type": "LiteralString",
      value: "",
      isLibraryElement: false,
    },
    {
      "@id": "boolean",
      "@type": "LiteralBoolean",
      value: false,
      isLibraryElement: false,
    },
  ];
  const selected = selectApeElements(source);
  assert.deepEqual(selected, [retained, source[2], source[3]]);
  assert.notEqual(selected[0], source[0]);
  assert.equal(selected[0].ownedMember, ordered);
  assert.deepEqual(source[0].relatedFeature, []);
  assert.equal(source[0].qualifiedName, null);
});

Deno.test("source admission rejects invalid and duplicate native identities before projection", () => {
  const valid = { "@id": "one", "@type": "PartUsage", isLibraryElement: false };
  const prepare = (elements: unknown[]) =>
    prepareApeElements({
      toFullJson: () => JSON.stringify(elements),
      rows: () => {
        throw new Error("unexpected catalog read");
      },
    });
  assert.throws(() => prepare([valid, { ...valid }]), (error: unknown) => {
    assert.ok(error instanceof RdfProjectionError);
    assert.equal(error.code, "RDF_PROJECTION_INVALID");
    assert.deepEqual(error.context, {
      reason: "duplicate element @id",
      nativeId: "one",
    });
    return true;
  });
  for (
    const nativeId of [
      null,
      "",
      "a".repeat(2049),
      "bad\0id",
      "lib:Type",
      "a.b",
      "with space",
      "with\nnewline",
      "élement",
      "bad/id",
      "percent%20",
      "<bad>",
    ]
  ) {
    assert.throws(() => prepare([{ ...valid, "@id": nativeId }]), {
      code: "RDF_PROJECTION_INVALID",
    });
    assert.throws(() => prepare([{ ...valid, owner: { "@id": nativeId } }]), {
      code: "RDF_PROJECTION_INVALID",
    });
  }
  assert.throws(() => prepare([{ ...valid, "@type": "" }]), {
    context: {
      reason: "element @type is not a non-empty string",
      nativeId: "one",
    },
  });
  assert.throws(() => prepare([null]), {
    context: { reason: "element is not an object" },
  });
  // The full source boundary admits IDs even for nodes outside the APE slice.
  assert.throws(
    () => prepare([{ ...valid, "@id": "bad:id", "@type": "Comment" }]),
    {
      code: "RDF_PROJECTION_INVALID",
    },
  );
  for (
    const nativeId of [
      "14c0aa22-5489-59b5-b438-ded26e83ba31",
      "User_1-2",
      "a".repeat(2048),
    ]
  ) {
    const prepared = prepare([{
      ...valid,
      "@id": nativeId,
      owner: { "@id": nativeId },
    }]);
    assert.equal(prepared.elements[0]["@id"], nativeId);
    assert.deepEqual(prepared.elements[0].owner, { "@id": nativeId });
  }
});

Deno.test("catalog completion fetches only absent references retained by the slice and classifies native IDs explicitly", () => {
  const raw = [
    {
      "@id": "user",
      "@type": "PartUsage",
      isLibraryElement: false,
      declaredName: "SysML::LooksLikeALibraryName",
      ownedMember: [{ "@id": "omitted-lib" }, { "@id": "omitted-user" }, {
        "@id": "external",
      }],
      ignored: { "@id": "never-fetch" },
    },
    {
      "@id": "omitted-lib",
      "@type": "FunctionDefinition",
      isLibraryElement: true,
    },
    {
      "@id": "omitted-user",
      "@type": "Comment",
      isLibraryElement: false,
      owner: { "@id": "also-never-fetch" },
    },
  ];
  const calls: string[][] = [];
  const prepared = prepareApeElements({
    toFullJson(includeLibrary) {
      assert.equal(includeLibrary, false);
      return JSON.stringify(raw);
    },
    rows(ids, fields) {
      const requested = JSON.parse(ids);
      calls.push(requested);
      assert.deepEqual(JSON.parse(fields), [
        "name",
        "qualifiedName",
        "metaclass",
        "isLibraryElement",
        "owner",
      ]);
      return JSON.stringify(requested.map((id: string) => ({
        name: id,
        qualifiedName: `Native::${id}`,
        metaclass: id === "external" ? "DataType" : "Package",
        isLibraryElement: true,
        owner: id === "external" ? "scope" : "omitted-lib",
      })));
    },
  });
  assert.deepEqual(calls, [["external"], ["scope"]]);
  assert.equal(prepared.sourceElementCount, 3);
  assert.deepEqual(prepared.elements.map((element) => element["@id"]), [
    "user",
    "external",
    "scope",
  ]);
  assert.deepEqual(prepared.elements[0].ownedMember, raw[0].ownedMember);
  assert.equal(prepared.elements[1]["@type"], "DataType");
  assert.equal(prepared.elements[1].isLibraryElement, true);
  assert.equal(prepared.elements[1].declaredName, "external");
  assert.equal(prepared.elements[1].qualifiedName, "Native::external");
  assert.equal(prepared.elements[2].isLibraryElement, true);
  assert.deepEqual(prepared.elements[2].owner, { "@id": "omitted-lib" });
  assert.equal(prepared.elements[0].isLibraryElement, false);
  assert.equal(prepared.elements[0].ignored, undefined);
});

Deno.test("catalog owner identities pass the same native-ID admission boundary", () => {
  assert.throws(() =>
    prepareApeElements({
      toFullJson: () =>
        JSON.stringify([{
          "@id": "user",
          "@type": "PartUsage",
          isLibraryElement: false,
          definition: [{ "@id": "library" }],
        }]),
      rows: () =>
        JSON.stringify([{
          name: "Type",
          metaclass: "PartDefinition",
          isLibraryElement: true,
          owner: "unsafe:owner",
        }]),
    }), (error: unknown) => {
    assert(error instanceof RdfProjectionError);
    assert.equal(error.code, "RDF_PROJECTION_INVALID");
    assert.equal(error.context.nativeId, "unsafe:owner");
    assert.match(error.message, /Flexo-safe/);
    return true;
  });
});

Deno.test("preparation preserves the source exception and distinguishes malformed native interchange", () => {
  const cause = new Error("synthetic Toolkit extraction failed");
  assert.throws(() =>
    prepareApeElements({
      toFullJson() {
        throw cause;
      },
      rows() {
        throw new Error("unexpected catalog read");
      },
    }), (error: unknown) => {
    assert(error instanceof ExportError);
    assert.equal(error.cause, cause);
    assert(error.context.includes(cause.message));
    return true;
  });
  assert.throws(() =>
    prepareApeElements({
      toFullJson() {
        return '[{"@id":"bad","@type":"PartUsage"}]';
      },
      rows() {
        throw new Error("unexpected catalog read");
      },
    }), (error: unknown) => {
    assert(error instanceof ExportError);
    assert.equal(
      error.context,
      "Malformed Toolkit full interchange for the APE graph",
    );
    return true;
  });
});
