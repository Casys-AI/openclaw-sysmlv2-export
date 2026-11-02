import assert from "node:assert/strict";
import { collect } from "../src/collect.ts";
import { doctor } from "../src/doctor.ts";
import type { Snapshot } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

let cached: Promise<Snapshot> | undefined;
function baseline(): Promise<Snapshot> {
  return cached ??= (async () => {
    const fixture = await createFixture();
    try {
      return await collect(fixture.home);
    } finally {
      await fixture.cleanup();
    }
  })();
}

const rules: [string, (s: Snapshot, positive: boolean) => void][] = [
  ["EXEC_WITHOUT_APPROVAL", (s, yes) => {
    for (const a of s.agents) a.execution.ask = "always";
    const a = s.agents[0];
    a.grants.push({ id: "test-exec", tool: "exec", layer: "host" });
    a.execution.security = "full";
    a.execution.ask = yes ? "off" : "always";
  }],
  ["AGENT_WITHOUT_SANDBOX", (s, yes) => {
    for (const a of s.agents) a.sandbox.mode = "all";
    const a = s.agents[0];
    a.grants.push({ id: "test-exec", tool: "exec", layer: "host" });
    a.sandbox.mode = yes ? "off" : "all";
  }],
  ["EXTERNAL_BIND_SOURCES", (s, yes) => {
    for (const a of s.agents) {
      a.sandbox.dangerouslyAllowExternalBindSources = false;
    }
    s.agents[0].sandbox.dangerouslyAllowExternalBindSources = yes;
  }],
  ["AGENT_TO_AGENT_WILDCARD", (s, yes) => {
    s.messaging.allowedTargets = yes ? ["*"] : ["lead"];
  }],
  ["PLAINTEXT_SECRET_IN_CONFIG", (s, yes) => {
    s.plaintextSecretCount = yes ? 1 : 0;
  }],
  ["CRON_FAILING", (s, yes) => {
    for (const job of s.cron) job.runtime.consecutiveErrors = 2;
    s.cron[0].runtime.consecutiveErrors = yes ? 3 : 2;
  }],
  ["WORKSPACE_UNVERSIONED", (s, yes) => {
    for (const a of s.agents) a.workspace.versioned = true;
    s.agents[0].workspace.versioned = !yes;
  }],
  ["MANUAL_CONFIG_BACKUPS", (s, yes) => {
    s.backupCount = yes ? 1 : 0;
  }],
  ["MALFORMED_SKILLS_DIR", (s, yes) => {
    for (const a of s.agents) a.workspace.malformedSkills = [];
    s.agents[0].workspace.malformedSkills = yes ? ["skills/SKILL.md"] : [];
  }],
];

for (const [code, arrange] of rules) {
  Deno.test(`doctor ${code}: positive and negative`, async () => {
    for (const positive of [false, true]) {
      const snapshot = structuredClone(await baseline());
      snapshot.ambiguities = [];
      arrange(snapshot, positive);
      const findings = doctor(snapshot);
      assert.equal(findings.some((finding) => finding.code === code), positive);
      assert.doesNotMatch(JSON.stringify(findings), /CANARY-/);
    }
  });
}
