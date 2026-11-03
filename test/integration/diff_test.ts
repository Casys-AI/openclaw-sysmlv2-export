import assert from "node:assert/strict";
import { collect } from "../../src/adapters/out/openclaw/collector.ts";
import { diff as domainDiff } from "../../src/domain/model/diff.ts";
import { canonical } from "../../src/infrastructure/canonical-json.ts";
import { createFixture } from "../support/fixture.ts";

Deno.test("diff reports structural mutations and additions/removals deterministically", async () => {
  const fixture = await createFixture();
  try {
    const before = await collect(fixture.home, fixture.plugins);
    assert.deepEqual(diff(before, structuredClone(before)), []);
    // The instance running, the collector's notes and a binding's position are
    // not configuration.
    const ran = structuredClone(before);
    ran.cron[0].runtime.lastRunStatus = "error";
    ran.agents[0].memory.daily.count += 1;
    ran.agents[0].memory.otherCount += 1;
    ran.backupCount += 1;
    ran.ambiguities.pop();
    ran.bindings.reverse().forEach((b, i) => b.id = `binding-moved-${i}`);
    assert.deepEqual(diff(before, ran), []);
    const after = structuredClone(before);
    const agent = after.agents.find((a) =>
      a.workspace.skills.length && a.workspace.instructions.length
    )!;
    agent.model.primary = "test/model";
    agent.grants.push({ id: "test-grant", tool: "test-tool", layer: "host" });
    agent.sandbox.network = "none";
    agent.execution.commands.push({
      id: "name:diff-test",
      command: "diff-test",
      kind: "name",
      argsRestricted: false,
    });
    agent.memory.search.enabled = !agent.memory.search.enabled;
    agent.workspace.skills[0].sha256 = "a".repeat(64);
    agent.workspace.instructions[0].sha256 = "b".repeat(64);
    const removedSkill = agent.workspace.skills.pop()!;
    agent.workspace.skills.push({ ...removedSkill, id: "new-skill" });
    after.bindings[0].peerKind = "group";
    after.accounts[0].dmPolicy = "open";
    after.hooks[0].agentId = "elsewhere";
    after.providers[0].models.push("new-model");
    after.messaging.enabled = !after.messaging.enabled;
    agent.name = "Renamed";
    agent.policy.agent.deny.push("exec");
    after.openclawVersion = "2099.1.1";
    after.plugins![0].enabled = false;
    after.mcpServers[0].enabled = !after.mcpServers[0].enabled;
    const removedMcp = after.mcpServers.pop()!;
    after.mcpServers.push({ ...removedMcp, id: "new-server" });
    after.execApprovals!.defaults.ask = "always";
    after.memoryBackend.slot = "none";
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
        "agent.execution",
        "agent.memory",
        "binding.added",
        "binding.removed",
        "account.changed",
        "hook.changed",
        "provider.changed",
        "messaging",
        "agent.name",
        "agent.policy",
        "instance.version",
        "plugin.changed",
        "mcp.changed",
        "mcp.added",
        "mcp.removed",
        "exec.approvals",
        "memory.backend",
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

const diff = (
  a: Parameters<typeof domainDiff>[0],
  b: Parameters<typeof domainDiff>[1],
) => domainDiff(a, b, canonical);
