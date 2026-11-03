import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { collect } from "../../src/adapters/out/openclaw/collector.ts";
import { diff } from "../../src/domain/model/diff.ts";
import { ExportError } from "../../src/infrastructure/error.ts";
import { canonical } from "../../src/infrastructure/canonical-json.ts";
import { createFixture } from "../support/fixture.ts";

Deno.test("collector selects the versioned catalog and reports unknown versions", async () => {
  const f = await createFixture();
  try {
    for (
      const version of [
        "2026.10.9",
        "2026.10.12",
        "2026.6.10",
        "2027.1.1",
        undefined,
      ]
    ) {
      await writeFile(
        join(f.home, "openclaw.json"),
        JSON.stringify({
          meta: { lastTouchedVersion: version },
          tools: { profile: "messaging" },
        }),
      );
      const s = await collect(f.home);
      assert.equal(
        s.agents[0].grants.some((g) => g.tool === "sessions_search"),
        version?.startsWith("2026.10.") ?? false,
      );
      assert.equal(
        s.ambiguities.some((f) => f.code === "OPENCLAW_VERSION_UNVERIFIED"),
        version === undefined || version === "2027.1.1",
      );
      assert.equal(s.openclawVersion, version ?? "unknown");
      assert.equal(s.schema, "openclaw-snapshot/5");
    }
  } finally {
    await f.cleanup();
  }
});

Deno.test("manifest profiles reach policy while unlisted tools and private metadata do not", async () => {
  const f = await createFixture();
  try {
    for (const profile of ["coding", "messaging"]) {
      await writeFile(
        join(f.home, "openclaw.json"),
        JSON.stringify({
          meta: { lastTouchedVersion: "2026.10.9" },
          tools: { profile },
        }),
      );
      const s = await collect(f.home, f.plugins);
      assert.equal(
        s.agents[0].grants.some((g) => g.tool === "stock_quote"),
        profile === "coding",
      );
      assert.deepEqual(
        s.plugins!.find((p) => p.id === "stock-quotes")!.toolProfiles,
        [{ id: "stock_quote", profiles: ["coding"] }],
      );
      assert.doesNotMatch(canonical(s), /CANARY-|undeclared_tool/);
    }
  } finally {
    await f.cleanup();
  }
});

Deno.test("malformed manifest profile attachments fail with a sanitized coded error", async () => {
  const f = await createFixture();
  try {
    const inventory = f.plugins as {
      plugins: { id: string; rootDir: string }[];
    };
    const path = join(
      inventory.plugins.find((p) => p.id === "stock-quotes")!.rootDir,
      "openclaw.plugin.json",
    );
    const manifest = JSON.parse(await readFile(path, "utf8"));
    for (const profiles of [["CANARY-PROFILE"], "coding", [null]]) {
      manifest.toolMetadata.stock_quote.profiles = profiles;
      await writeFile(path, JSON.stringify(manifest));
      await assert.rejects(() => collect(f.home, f.plugins), (e: unknown) => {
        assert.ok(e instanceof ExportError);
        assert.equal(e.code, "INVALID_INPUT");
        assert.doesNotMatch(JSON.stringify(e), /CANARY-/);
        return true;
      });
    }
  } finally {
    await f.cleanup();
  }
});

Deno.test("SQLite host policy tightens exec and preserves each side in snapshot diffs", async () => {
  const f = await createFixture();
  try {
    const config = {
      meta: { lastTouchedVersion: "2026.10.9" },
      tools: { profile: "full", exec: { mode: "full" } },
    };
    await writeFile(join(f.home, "openclaw.json"), JSON.stringify(config));
    const db = new DatabaseSync(join(f.home, "state", "openclaw.sqlite"));
    const store = (policy: unknown) =>
      db.prepare(
        "UPDATE exec_approvals_config SET raw_json = ? WHERE config_key = 'current'",
      ).run(JSON.stringify(policy));
    try {
      store({ defaults: { security: "full", ask: "off" } });
      const open = await collect(f.home);
      store({
        defaults: { security: "deny", ask: "off" },
        agents: { "*": { security: "allowlist" }, main: { ask: "always" } },
      });
      const guarded = await collect(f.home);
      const ex = guarded.agents[0].execution;
      assert.equal(ex.mode, "full");
      assert.equal(ex.security, "full");
      assert.equal(ex.ask, "off");
      assert.deepEqual(ex.approvals, { security: "allowlist", ask: "always" });
      assert.deepEqual(ex.effective, ex.approvals);
      const hostChange = diff(open, guarded, canonical).find((d) =>
        d.kind === "agent.execution"
      )!;
      assert.deepEqual(hostChange.before, open.agents[0].execution);
      assert.deepEqual(hostChange.after, ex);
      config.tools.exec.mode = "allowlist";
      await writeFile(join(f.home, "openclaw.json"), JSON.stringify(config));
      const restricted = await collect(f.home);
      assert.deepEqual(restricted.agents[0].execution.effective, ex.effective);
      assert.ok(
        diff(guarded, restricted, canonical).some((d) =>
          d.kind === "agent.execution"
        ),
      );
      store({ agents: { main: { ask: "CANARY-ASK" } } });
      await assert.rejects(
        () => collect(f.home),
        (e: unknown) =>
          e instanceof ExportError && e.code === "INVALID_INPUT" &&
          !JSON.stringify(e).includes("CANARY-"),
      );
    } finally {
      db.close();
    }
  } finally {
    await f.cleanup();
  }
});
