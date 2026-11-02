import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../cli.ts";
import { createFixture } from "./support/fixture.ts";

Deno.test({
  name: "pinned Toolkit compiles an export directory alone with zero errors",
  ignore: !Deno.env.get("SYSML_TOOLKIT_DIR"),
  async fn() {
    const fixture = await createFixture({ git: true, backups: 2 });
    const output = await mkdtemp(join(tmpdir(), "openclaw-toolkit-test-"));
    try {
      const snapshot = join(output, "snapshot.json"), dir = join(output, "out");
      await run([
        "collect",
        "--home",
        fixture.home,
        "--plugins",
        fixture.pluginsFile,
        "--out",
        snapshot,
      ]);
      await run(["export", "--snapshot", snapshot, "--out", dir]);
      const files = new Map<string, string>();
      for (const name of await readdir(dir)) {
        files.set(name, await readFile(join(dir, name), "utf8"));
      }
      const { validate } = await import("../src/validate.ts");
      const diagnostics = await validate(files);
      assert.equal(diagnostics.errors.length, 0, JSON.stringify(diagnostics));
      const invalid = await validate(
        new Map([["invalid.sysml", "package Broken { part def ]"]]),
      );
      assert.equal(invalid.errors.length, 1);
      assert.equal(invalid.errors[0].code, "TOOLKIT_VALIDATION_FAILED");
    } finally {
      await fixture.cleanup();
      await rm(output, { recursive: true, force: true });
    }
  },
});
