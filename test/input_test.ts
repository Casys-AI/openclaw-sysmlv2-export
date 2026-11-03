import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collect } from "../src/collect.ts";
import { ExportError } from "../src/error.ts";
import { plaintextSecretCount } from "../src/redaction.ts";
import { canonical } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

Deno.test("absent agents.list uses only implicit main and the default workspace", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    delete config.agents.list;
    await writeFile(path, JSON.stringify(config));
    const snapshot = await collect(fixture.home);
    assert.deepEqual(snapshot.agents.map((agent) => agent.id), ["main"]);
    assert.equal(snapshot.agents[0].implicit, true);
    assert.equal(snapshot.agents[0].workspace.path, "workspace");
    assert.ok(snapshot.agents[0].workspace.instructions.length > 0);
    assert.ok(snapshot.cron.some((job) => job.agentId === "lead"));
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("collector preserves complete account, binding and bundled skill identities", async () => {
  const fixture = await createFixture();
  try {
    const snapshot = await collect(fixture.home);
    assert.equal(snapshot.accounts.length, 10);
    assert.ok(
      snapshot.accounts.some((account) =>
        account.channel === "whatsapp" && account.accountId === "secretary"
      ),
    );
    assert.equal(snapshot.bindings.length, 10);
    assert.ok(
      snapshot.bundledSkills.some((skill) =>
        skill.id === "1password" && !skill.enabled
      ),
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("collector rejects malformed known shapes and unsupported policy values", async () => {
  const fixture = await createFixture();
  try {
    const path = join(fixture.home, "openclaw.json");
    const original = JSON.parse(await readFile(path, "utf8"));
    const malformed = structuredClone(original);
    malformed.agents.list = {};
    const invalidProfile = structuredClone(original);
    invalidProfile.tools.profile = "CANARY-UNSUPPORTED-PROFILE";
    for (const config of [malformed, invalidProfile]) {
      await writeFile(path, JSON.stringify(config));
      await assert.rejects(() => collect(fixture.home), (error: unknown) => {
        assert.ok(error instanceof ExportError);
        assert.ok(error.code.length > 0);
        assert.doesNotMatch(JSON.stringify(error), /CANARY-/);
        return true;
      });
    }
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("unknown fields are excluded and plaintext counting recognizes references", async () => {
  assert.equal(
    plaintextSecretCount({
      password: "x",
      env: { PLAIN: "secret", REF: "${ENV}" },
      mcp: {
        servers: {
          docs: {
            headers: {
              Authorization: "secret",
              Referenced: "${ENV}",
              Empty: "",
              SecretRef: { source: "env", provider: "default", id: "HEADER" },
            },
          },
        },
      },
      apiKey: { source: "env", provider: "default", id: "KEY" },
      accounts: { secretary: { enabled: true } },
    }),
    3,
  );
  const fixture = await createFixture();
  try {
    const before = await collect(fixture.home);
    const path = join(fixture.home, "openclaw.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.unrecognizedExtension = { privateValue: "CANARY-UNKNOWN-FIELD" };
    await writeFile(path, JSON.stringify(config));
    const after = await collect(fixture.home);
    assert.equal(canonical(after), canonical(before));
    assert.doesNotMatch(canonical(after), /CANARY-/);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("instruction body edits change only referenced digest and never expose body", async () => {
  const fixture = await createFixture();
  try {
    const before = await collect(fixture.home);
    await writeFile(
      join(fixture.home, "workspace", "AGENTS.md"),
      "CANARY-CHANGED-INSTRUCTION-BODY",
    );
    const after = await collect(fixture.home);
    const instructions = (snapshot: typeof before) =>
      snapshot.agents.find((agent) => agent.id === "lead")!.workspace
        .instructions;
    const original = instructions(before).find((file) =>
      file.path.endsWith("AGENTS.md")
    )!;
    const changed = instructions(after).find((file) =>
      file.path.endsWith("AGENTS.md")
    )!;
    assert.ok(original && changed);
    assert.notEqual(changed.sha256, original.sha256);
    assert.equal(
      changed.bytes,
      new TextEncoder().encode("CANARY-CHANGED-INSTRUCTION-BODY").length,
    );
    assert.doesNotMatch(canonical(after), /CANARY-/);
  } finally {
    await fixture.cleanup();
  }
});
