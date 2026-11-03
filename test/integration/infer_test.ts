import assert from "node:assert/strict";
import { collect } from "../src/collect.ts";
import { ExportError } from "../src/error.ts";
import {
  emitInferred,
  inferencePrompt,
  parseAgentInference,
} from "../src/infer.ts";
import { createFixture } from "./support/fixture.ts";

const step = (id: string, kind = "action", target: string | null = null) => ({
  id,
  text: `Step ${id}`,
  kind,
  target,
});
const valid = {
  agentId: "field",
  role: "Assists in the field.",
  procedures: [{
    id: "handle-request",
    title: "Handle a request",
    trigger: "A message arrives",
    steps: [step("read"), step("escalate", "escalation", "lead")],
    source: { file: "AGENTS.md", fromLine: 1, toLine: 3 },
  }],
  rules: [{
    id: "no-payments",
    text: "Never change a payment method */ injected",
    kind: "prohibition",
    source: { file: "SOUL.md", fromLine: 2, toLine: 2 },
  }],
};

async function snapshot() {
  const fixture = await createFixture();
  try {
    return await collect(fixture.home);
  } finally {
    await fixture.cleanup();
  }
}

Deno.test("inference is validated against the snapshot at the trust boundary", async () => {
  const s = await snapshot();
  assert.equal(
    parseAgentInference(valid, s, "field").procedures[0].steps.length,
    2,
  );
  for (
    const bad of [
      { ...valid, agentId: "ghost" },
      { ...valid, agentId: "lead" },
      {
        ...valid,
        rules: [{
          ...valid.rules[0],
          source: { file: "SECRET.md", fromLine: 1, toLine: 1 },
        }],
      },
      {
        ...valid,
        procedures: [{
          ...valid.procedures[0],
          steps: [step("a", "handoff", "stranger")],
        }],
      },
      { ...valid, rules: [{ ...valid.rules[0], id: "handle-request" }] },
    ]
  ) {
    assert.throws(() => parseAgentInference(bad, s, "field"), ExportError);
  }
});

Deno.test("inferred SysML is a separate, deterministic package linked to source digests", async () => {
  const s = await snapshot();
  const inference = {
    schema: "openclaw-inference/1" as const,
    model: "test",
    agents: [parseAgentInference(valid, s, "field")],
  };
  const text = emitInferred(s, inference).get("OpenClawInferred.sysml")!;
  assert.equal(text, emitInferred(s, inference).get("OpenClawInferred.sysml"));
  assert.match(text, /^package OpenClawInferred \{/);
  assert.match(text, /first step_read then step_escalate;/);
  assert.match(text, /escalation → lead/);
  const sha = s.agents.find((a) => a.id === "field")!.workspace.instructions
    .find((f) => f.path === "AGENTS.md")!.sha256;
  assert.ok(text.includes(`sha256 ${sha}`));
  assert.doesNotMatch(text, /\*\/ injected/);
});

Deno.test("the prompt numbers lines and carries the JSON schema", () => {
  const prompt = inferencePrompt("field", [{
    path: "AGENTS.md",
    text: "one\ntwo",
  }], [{ id: "field", name: "Field" }, { id: "lead", name: "lead" }]);
  assert.match(prompt, /### AGENTS.md\n1: one\n2: two/);
  assert.match(prompt, /field \(Field\), lead, owner, customer/);
  assert.match(prompt, /"required":\["agentId","role","procedures","rules"\]/);
});

Deno.test("contact details and tokens copied by the model are masked", async () => {
  const s = await snapshot();
  const leaked = parseAgentInference(
    {
      ...valid,
      role: "Writes to sam@example.com or +33 6 12 34 56 78 with key " +
        "abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    },
    s,
    "field",
  );
  assert.equal(
    leaked.role,
    "Writes to [redacted] or [redacted] with key [redacted]",
  );
});

Deno.test("long texts are shortened and citations stay within the files sent", async () => {
  const s = await snapshot();
  const long = parseAgentInference(
    { ...valid, role: "word ".repeat(80) },
    s,
    "field",
  );
  assert.equal(long.role.length, 300);
  assert.ok(long.role.endsWith("…"));
  assert.throws(
    () => parseAgentInference(valid, s, "field", ["AGENTS.md"]),
    ExportError,
  );
});
