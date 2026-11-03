import assert from "node:assert/strict";
import { materializeApeViews, readApeViews } from "../src/ape-rules.ts";
import { projectModelToNQuads } from "../src/ape-rdf.ts";
import {
  initOxigraph,
  literal,
  namedNode,
  quad,
  Store,
} from "../src/oxigraph.ts";

Deno.test("actual views preserve unknown exec posture, scope wildcards and resolve named messaging references", async () => {
  const elements = new Map<string, Record<string, unknown>>();
  const ref = (id: string) => ({ "@id": id });
  const add = (id: string, type: string, props = {}) => {
    elements.set(id, { "@id": id, "@type": type, ...props });
  };
  const field = (
    owner: string,
    role: string,
    value: string | boolean,
    reference = false,
    subset = false,
  ) => {
    role = `OpenClawImport::${role}`;
    const id = `${owner}-${role.split("::").at(-1)}-${value}`;
    const members = elements.get(owner)!.ownedMember as unknown[] | undefined;
    elements.get(owner)!.ownedMember = [...(members ?? []), ref(id)];
    if (!elements.has(role)) {
      add(role, "AttributeUsage", { qualifiedName: role });
    }
    add(`${id}-relation`, subset ? "Subsetting" : "Redefinition", {
      [subset ? "subsettedFeature" : "redefinedFeature"]: ref(role),
    });
    add(id, "AttributeUsage", {
      [subset ? "ownedSubsetting" : "ownedRedefinition"]: [
        ref(`${id}-relation`),
      ],
      ownedMember: [ref(`${id}-value`)],
    });
    add(
      `${id}-value`,
      reference ? "FeatureReferenceExpression" : "LiteralString",
      {
        [reference ? "referent" : "value"]: reference
          ? ref(String(value))
          : value,
      },
    );
    return `${id}-value`;
  };
  add("root", "Namespace");
  for (const scope of ["scope", "other-scope"]) {
    add(scope, "Package", { owner: ref("root") });
  }
  add("agent-base", "PartDefinition", {
    qualifiedName: "OpenClawImport::OpenClawAgent",
  });
  for (const id of ["known", "unknown", "local", "remote"]) {
    add(`${id}-type`, "PartDefinition", {
      ownedSpecialization: [ref(`${id}-specialization`)],
    });
    add(`${id}-specialization`, "Subclassification", {
      general: ref("agent-base"),
    });
    field(`${id}-type`, "OpenClawAgent::id", id);
    add(id, "PartUsage", {
      definition: [ref(`${id}-type`)],
      owner: ref(id === "remote" ? "other-scope" : "scope"),
    });
  }
  add("grant-type", "ItemDefinition", {
    qualifiedName: "OpenClawImport::ToolGrant",
  });
  add("execution-type", "PartDefinition", {
    qualifiedName: "OpenClawImport::ExecutionPosture",
  });
  add("builtin", "EnumerationUsage", {
    qualifiedName: "OpenClawImport::ToolOrigin::builtin",
  });
  add("tool", "PartUsage");
  field("tool", "OpenClawTool::toolId", "exec");
  field("tool", "OpenClawTool::origin", "builtin", true);
  let unknownAsk = "";
  for (const id of ["known", "unknown"]) {
    add(`${id}-grant`, "ItemUsage");
    field(`${id}-grant`, "ToolGrant::tool", "tool", true);
    field(`${id}-grant`, "ToolGrant::layer", "host");
    add(`${id}-grant-ref`, "ReferenceUsage", {
      definition: [ref("grant-type")],
      ownedMember: [ref(`${id}-grant-expression`)],
    });
    add(`${id}-grant-expression`, "FeatureReferenceExpression", {
      referent: ref(`${id}-grant`),
    });
    (elements.get(`${id}-type`)!.ownedMember as unknown[]).push(
      ref(`${id}-grant-ref`),
    );
    add(`${id}-posture`, "PartUsage", { definition: [ref("execution-type")] });
    elements.get(id)!.ownedMember = [ref(`${id}-posture`)];
    field(`${id}-posture`, "ExecutionPosture::host", "gateway");
    field(`${id}-posture`, "ExecutionPosture::effectiveSecurity", "full");
    const ask = field(
      `${id}-posture`,
      "ExecutionPosture::effectiveAsk",
      id === "known" ? "off" : "future-unknown",
    );
    if (id === "unknown") unknownAsk = ask;
  }
  add("delegation-type", "PartDefinition", {
    qualifiedName: "OpenClawImport::DelegationPolicy",
  });
  add("delegation", "PartUsage", {
    definition: [ref("delegation-type")],
    owner: ref("scope"),
  });
  field("delegation", "DelegationPolicy::fromAgent", "known", true);
  field("delegation", "DelegationPolicy::wildcardTargets", true);
  add("messaging-type", "PartDefinition", {
    qualifiedName: "OpenClawImport::MessagingPolicy",
  });
  for (const policy of ["named", "wildcard"]) {
    add(policy, "PartUsage", {
      definition: [ref("messaging-type")],
      owner: ref("scope"),
    });
    field(policy, "MessagingPolicy::enabled", true);
    field(policy, "MessagingPolicy::wildcardTargets", policy === "wildcard");
  }
  field("named", "MessagingPolicy::targets", "known", true, true);
  field("named", "MessagingPolicy::targets", "remote", true, true);

  await initOxigraph();
  const store = new Store();
  const graph = namedNode(`urn:ase:build:${"e".repeat(64)}`);
  store.load(
    projectModelToNQuads({
      build: { repositoryId: "view-test", artifactDigest: "e".repeat(64) },
      elements: [...elements.values()],
      libraryNativeIds: [],
    }).nquads,
    { format: "application/n-quads" },
  );
  const views = await readApeViews();
  materializeApeViews(store, views);
  const node = (id: string) =>
    namedNode(`urn:ase:model:view-test:${encodeURIComponent(id)}`);
  const values = (view: string, id: string, predicate: string) =>
    store.match(
      node(id),
      namedNode(`urn:ase:ape:v1:${predicate}`),
      null,
      namedNode(`urn:ase:ape:v1:view:${view}`),
    ).map((statement) => statement.object.value).sort();
  const localAgents = ["known", "local", "unknown"].map((id) => node(id).value)
    .sort();
  assert.deepEqual(values("exec", "known", "unapprovedHostExec"), ["true"]);
  assert.deepEqual(values("exec", "unknown", "unapprovedHostExec"), []);
  assert.deepEqual(values("exec", "local", "unapprovedHostExec"), ["false"]);
  assert.deepEqual(values("delegation", "known", "delegatesTo"), localAgents);
  assert.deepEqual(values("delegation", "delegation", "wildcardTargets"), [
    "true",
  ]);
  assert.deepEqual(
    values("messaging", "wildcard", "messageTarget"),
    localAgents,
  );
  assert.deepEqual(values("messaging", "wildcard", "wildcardTargets"), [
    "true",
  ]);
  assert.deepEqual(values("messaging", "named", "messageTarget"), [
    node("known").value,
  ]);
  assert.deepEqual(values("messaging", "named", "from"), [node("known").value]);
  assert.deepEqual(values("messaging", "known", "canMessage"), localAgents);
  assert.deepEqual(values("messaging", "remote", "canMessage"), []);

  // Resolve only the unknown enum literal; the actual exec query now proves false.
  const askQuad = store.match(
    node(unknownAsk),
    namedNode("urn:ase:vocab:prop:value"),
    null,
    graph,
  )[0];
  store.delete(askQuad);
  store.add(quad(askQuad.subject, askQuad.predicate, literal("always"), graph));
  materializeApeViews(store, views.filter((view) => view.name === "exec"));
  assert.deepEqual(values("exec", "unknown", "unapprovedHostExec"), ["false"]);
});
