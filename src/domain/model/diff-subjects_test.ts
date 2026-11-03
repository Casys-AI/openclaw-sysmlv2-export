import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { diff } from "./diff.ts";
import { diffSubjects } from "./diff-subjects.ts";
import { elementLabels } from "./labels.ts";
import { groupFiles } from "../export/file-groups.ts";
import { canonical } from "../../infrastructure/canonical-json.ts";
import { parseSnapshot } from "../../infrastructure/snapshot-codec.ts";

const snapshot = parseSnapshot(
  JSON.parse(
    await readFile(
      new URL("../../../test/golden/snapshot.json", import.meta.url),
      "utf8",
    ),
  ),
);

Deno.test("changes read as bullets per element, under readable names", () => {
  const next = structuredClone(snapshot);
  const agent = next.agents[0];
  agent.name = "Renamed";
  agent.model.fallbacks.push("x/y");
  agent.grants.push({ id: "g", tool: "t", layer: "host" });
  next.accounts[0].enabled = !next.accounts[0].enabled;
  const removed = next.bindings.pop()!;
  next.cron[0].schedule.expression = "0 0 * * *";
  next.memoryBackend.slot = "none";
  const subjects = diffSubjects(
    diff(snapshot, next, canonical),
    { before: elementLabels(snapshot), after: elementLabels(next) },
    canonical,
  );
  const of = (id: string) => subjects.find((s) => s.id === id)!;
  assert.equal(subjects[0].id, "instance");
  assert.deepEqual(subjects[0].bullets, [
    { kind: "memory.backend", field: "slot", before: "—", after: "none" },
  ]);
  assert.equal(of(`agent:${agent.id}`).label, "Renamed");
  assert.deepEqual(of(`agent:${agent.id}`).bullets, [
    { kind: "agent.grants", added: ["g"] },
    { kind: "agent.model", field: "fallbacks", added: ["x/y"] },
    { kind: "agent.name", before: "Client", after: "Renamed" },
  ]);
  assert.deepEqual(of(`account:${next.accounts[0].id}`).bullets, [
    {
      kind: "account.changed",
      field: "enabled",
      before: "true",
      after: "false",
    },
  ]);
  assert.deepEqual(of(`cron:${next.cron[0].id}`).bullets, [{
    kind: "cron.schedule",
    field: "expression",
    before: "30 7 * * *",
    after: "0 0 * * *",
  }]);
  // A removal is known by the previous version's element and name.
  const gone = of(`binding:${removed.id}`);
  assert.deepEqual(gone.bullets, [{ kind: "binding.removed" }]);
  assert.ok(gone.label.endsWith(` → ${removed.account}`));
});

Deno.test("the changed files are grouped by what they hold", () => {
  assert.deepEqual(
    groupFiles([
      "validation.json",
      "snapshot.json",
      "OpenClawImport.sysml",
      "OpenClawInstance.sysml",
      "OpenClawInferred.sysml",
      "ape-report.ttl",
    ]),
    [
      { group: "instance", files: ["OpenClawInstance.sysml"] },
      { group: "inferred", files: ["OpenClawInferred.sysml"] },
      { group: "library", files: ["OpenClawImport.sysml"] },
      { group: "data", files: ["snapshot.json"] },
      { group: "diagnostics", files: ["ape-report.ttl", "validation.json"] },
    ],
  );
});
