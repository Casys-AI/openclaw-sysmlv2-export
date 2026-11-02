import assert from "node:assert/strict";
import { collect } from "../src/collect.ts";
import { diff } from "../src/diff.ts";
import { canonical } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

Deno.test("diff reports structural mutations and additions/removals deterministically", async () => {
  const fixture = await createFixture();
  try {
    const before = await collect(fixture.home);
    assert.deepEqual(diff(before, structuredClone(before)), []);
    const after = structuredClone(before);
    const agent = after.agents.find((a) =>
      a.workspace.skills.length && a.workspace.instructions.length
    )!;
    agent.model.primary = "test/model";
    agent.grants.push({ id: "test-grant", tool: "test-tool", layer: "host" });
    agent.sandbox.network = "none";
    agent.workspace.skills[0].sha256 = "a".repeat(64);
    agent.workspace.instructions[0].sha256 = "b".repeat(64);
    const removedSkill = agent.workspace.skills.pop()!;
    agent.workspace.skills.push({ ...removedSkill, id: "new-skill" });
    after.bindings[0].peerKind = "group";
    after.cron[0].schedule.expression = "0 0 * * *";
    after.cron[0].enabled = !after.cron[0].enabled;
    const removed = after.agents.pop()!;
    after.agents.push({ ...structuredClone(removed), id: "new-agent" });
    const removedCron = after.cron.pop()!;
    after.cron.push({ ...removedCron, id: "new-cron" });
    const changes = diff(before, after);
    const kinds = new Set(changes.map((change) => change.kind));
    for (
      const kind of [
        "agent.model",
        "agent.grants",
        "agent.sandbox",
        "binding.changed",
        "skill.digest",
        "instruction.digest",
        "cron.schedule",
        "cron.job",
        "agent.added",
        "agent.removed",
        "cron.added",
        "cron.removed",
        `skill:${agent.id}.added`,
        `skill:${agent.id}.removed`,
      ]
    ) {
      assert.ok(kinds.has(kind), `missing ${kind}`);
    }
    assert.equal(canonical(changes), canonical(diff(before, after)));
    assert.doesNotMatch(canonical(changes), /CANARY-/);
    const modelChange = changes.find((change) =>
      change.kind === "agent.model"
    )!;
    assert.deepEqual(
      modelChange.before,
      before.agents.find((a) => a.id === agent.id)!.model,
    );
    assert.deepEqual(modelChange.after, agent.model);
  } finally {
    await fixture.cleanup();
  }
});
