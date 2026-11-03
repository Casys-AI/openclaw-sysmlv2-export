import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Inference } from "./inference.ts";
import { type Inputs, inputsVerdict } from "./inputs.ts";
import { canonical } from "../../infrastructure/canonical-json.ts";
import { parseSnapshot } from "../../infrastructure/snapshot-codec.ts";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const snapshot = parseSnapshot(
  await read("../../../test/golden/snapshot.json"),
);
const inference: Inference = await read(
  "../../../test/fixtures/inference.json",
);
const verdict = (before: Inputs, after: Inputs) =>
  inputsVerdict(before, after, canonical);
const base: Inputs = { snapshot, inference };

Deno.test("the inputs verdict ignores what the export observes and separates inference from configuration", () => {
  // Runtime state, the collector's notes, bindings' positions and a credential
  // list that was not collected before are not configuration.
  const observed = structuredClone(snapshot);
  observed.cron[0].runtime.lastRunStatus = "error";
  observed.agents[0].memory.daily.count += 1;
  observed.agents[0].memory.otherCount += 1;
  observed.backupCount += 1;
  observed.ambiguities.pop();
  observed.bindings.reverse().forEach((b, i) => b.id = `binding-moved-${i}`);
  const before = structuredClone(snapshot);
  before.plaintextCredentialPaths = null;
  assert.equal(
    verdict({ snapshot: before, inference }, { snapshot: observed, inference }),
    "same",
  );

  const reinferred = structuredClone(inference);
  reinferred.agents[0].role = "Another role.";
  assert.equal(
    verdict(base, { snapshot, inference: reinferred }),
    "inference",
  );
  // Run metadata is not behaviour.
  assert.equal(
    verdict(base, { snapshot, inference: { ...inference, model: "other" } }),
    "same",
  );

  const reconfigured = structuredClone(snapshot);
  reconfigured.agents[0].sandbox.network = "host";
  assert.equal(
    verdict(base, { snapshot: reconfigured, inference: reinferred }),
    "changed",
  );
  const leaked = structuredClone(snapshot);
  leaked.plaintextCredentialPaths = [
    ...snapshot.plaintextCredentialPaths!,
    "/x",
  ];
  assert.equal(verdict(base, { snapshot: leaked, inference }), "changed");

  assert.equal(verdict(base, { snapshot: null, inference }), "schema");
});
