import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../cli.ts";
import { runExport } from "../plugin/core.ts";
import { ExportError } from "../src/error.ts";
import { installToolkit, toolkitPath } from "../src/toolkit-install.ts";
import { validate } from "../src/validate.ts";
import { emitInferred } from "../src/infer.ts";
import { parseSnapshot } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

const archive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");

Deno.test({
  name:
    "pinned Toolkit compiles an export directory alone, inferred package included, with zero errors",
  ignore: !archive,
  async fn() {
    const fixture = await createFixture({ git: true, backups: 2 });
    const output = await mkdtemp(join(tmpdir(), "openclaw-toolkit-test-"));
    try {
      await installToolkit(fixture.home, { from: archive });
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
      const started = performance.now();
      assert.equal((await validate(files, fixture.home)).errors.length, 0);
      console.log(
        `Fixture validation (worker, hashes, init, library, check): ${
          (performance.now() - started).toFixed(1)
        } ms`,
      );
      // The plugin writes OpenClawInferred.sysml into the same directory.
      const source = { file: "AGENTS.md", fromLine: 1, toLine: 2 };
      const inferred = emitInferred(
        parseSnapshot(JSON.parse(await readFile(snapshot, "utf8"))),
        {
          schema: "openclaw-inference/1",
          model: "test",
          agents: [{
            agentId: "field",
            role: "Assists in the field.",
            procedures: [{
              id: "handle-request",
              title: "Handle a request",
              trigger: "A message arrives",
              steps: [
                { id: "read", text: "Read it", kind: "action", target: null },
                {
                  id: "escalate",
                  text: "Escalate",
                  kind: "escalation",
                  target: "lead",
                },
              ],
              source,
            }],
            rules: [{
              id: "no-payments",
              text: "Never change a payment method",
              kind: "prohibition",
              source,
            }],
          }],
        },
      );
      for (const [name, text] of inferred) files.set(name, text);
      const diagnostics = await validate(files, fixture.home);
      assert.equal(diagnostics.errors.length, 0, JSON.stringify(diagnostics));
      const invalid = await validate(
        new Map([["invalid.sysml", "package Broken { part def ]"]]),
        fixture.home,
      );
      assert.ok(invalid.errors.length > 0);
      assert.deepEqual(invalid.errors[0], {
        code: "TOOLKIT_PARSE",
        file: "invalid.sysml",
        line: 1,
        column: 27,
        message: "expected `;` or `{`, found `]`",
      });
      const unresolved = await validate(
        new Map([["unknown.sysml", "package Unknown { part p : Missing; }"]]),
        fixture.home,
      );
      assert.ok(
        unresolved.errors.some((d) => d.code === "TOOLKIT_REFERENTIAL"),
      );

      const versionOut = join(output, "versions");
      const summary = await runExport(
        fixture.home,
        fixture.plugins,
        versionOut,
        (_prompt, agentId) =>
          Promise.resolve({
            text: JSON.stringify({
              agentId,
              role: "Helps.",
              procedures: [],
              rules: [{
                id: "no-payments",
                text: "Never pay.",
                kind: "prohibition",
                source: { file: "SOUL.md", fromLine: 1, toLine: 1 },
              }],
            }),
          }),
        new Date("2026-11-02T10:15:00Z"),
      );
      assert.deepEqual(summary.validation, { status: "passed", errors: 0 });
      assert.ok(summary.inferred!.rules > 0);
      assert.deepEqual(
        JSON.parse(
          await readFile(join(summary.outDir, "validation.json"), "utf8"),
        ),
        {
          validation: summary.validation,
          errors: [],
          warnings: [],
        },
      );
      await writeFile(
        join(toolkitPath(fixture.home), "sysmlv2.js"),
        "tampered",
      );
      await assert.rejects(
        validate(files, fixture.home),
        (e: unknown) =>
          e instanceof ExportError && e.code === "TOOLKIT_INTEGRITY",
      );
      const damaged = await runExport(
        fixture.home,
        fixture.plugins,
        versionOut,
        null,
        new Date("2026-11-02T10:16:00Z"),
      );
      assert.equal(damaged.validation.status, "failed");
      assert.equal(damaged.validation.code, "TOOLKIT_INTEGRITY");
      assert.ok(
        (await readFile(join(damaged.outDir, "OpenClawInstance.sysml"), "utf8"))
          .length,
      );
      const versions = JSON.parse(
        await readFile(join(versionOut, "versions.json"), "utf8"),
      );
      assert.deepEqual(
        versions.map((v: { validation: unknown }) => v.validation),
        [damaged.validation, summary.validation],
      );
    } finally {
      await fixture.cleanup();
      await rm(output, { recursive: true, force: true });
    }
  },
});
