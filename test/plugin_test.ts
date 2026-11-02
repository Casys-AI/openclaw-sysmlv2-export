import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExport } from "../plugin/core.ts";
import { ASSEMBLY_LIBRARY } from "../src/library.ts";
import { createFixture } from "./support/fixture.ts";

/** One inferred rule for `field`, nothing for the other agents. */
const complete = (_prompt: string, agentId: string) =>
  Promise.resolve({
    text: JSON.stringify({
      agentId,
      role: "Helps.",
      procedures: [],
      rules: agentId === "field"
        ? [{
          id: "no-payments",
          text: "Never pay.",
          kind: "prohibition",
          source: { file: "SOUL.md", fromLine: 1, toLine: 1 },
        }]
        : [],
    }),
  });

Deno.test("plugin runs are kept as versions", async (t) => {
  const fixture = await createFixture({ git: true, backups: 2 });
  const out = await mkdtemp(join(tmpdir(), "openclaw-plugin-test-"));
  try {
    const first = await runExport(
      fixture.home,
      out,
      null,
      new Date("2026-11-02T10:15:00.250Z"),
    );
    const config = join(fixture.home, "openclaw.json");
    await writeFile(
      config,
      (await readFile(config, "utf8")).replace("Field Assistant", "Field Lead"),
    );
    const second = await runExport(
      fixture.home,
      out,
      complete,
      new Date("2026-11-02T10:20:00Z"),
    );

    await t.step("versions.json lists the runs newest first", async () => {
      assert.equal(first.outDir, join(out, "2026-11-02T10-15-00Z"));
      assert.equal(second.version, "2026-11-02T10-20-00Z");
      const findings = { error: 7, warning: 14, info: 25 };
      assert.deepEqual(
        JSON.parse(await readFile(join(out, "versions.json"), "utf8")),
        [{
          id: "2026-11-02T10-20-00Z",
          createdAt: "2026-11-02T10:20:00.000Z",
          agents: 6,
          findings,
          inferred: { procedures: 0, rules: 1, failed: 0 },
        }, {
          id: "2026-11-02T10-15-00Z",
          createdAt: "2026-11-02T10:15:00.250Z",
          agents: 6,
          findings,
          inferred: null,
        }],
      );
    });

    await t.step(
      "a version directory carries the Assembly library",
      async () => {
        assert.deepEqual((await readdir(second.outDir)).sort(), [
          "OpenClawImport.sysml",
          "OpenClawInferred.sysml",
          "OpenClawInstance.sysml",
          "cases.sysml",
          "core.sysml",
          "findings.json",
          "inference.json",
          "skills.sysml",
          "snapshot.json",
        ]);
        for (const [name, text] of ASSEMBLY_LIBRARY) {
          assert.match(text, /^\/\/ Copied from Assembly apps\/live-builder/);
          assert.equal(await readFile(join(second.outDir, name), "utf8"), text);
        }
      },
    );

    await t.step(
      "the viewer shows a line changed since the previous version",
      async () => {
        assert.equal(second.viewer, join(out, "index.html"));
        const page = await readFile(second.viewer, "utf8");
        const data = JSON.parse(
          page.match(
            /<script id="data" type="application\/json">(.*?)<\/script>/s,
          )![1],
        );
        assert.deepEqual(data.versions.map((v: { id: string }) => v.id), [
          second.version,
          first.version,
        ]);
        assert.equal(data.versions[1].changes, null);
        const instance = data.versions[0].changes.find((c: { file: string }) =>
          c.file === "OpenClawInstance.sysml"
        );
        const lines = instance.hunks.flatMap((h: { lines: string[] }) =>
          h.lines
        );
        assert.ok(
          lines.includes(
            '-        attribute :>> displayName = "Field Assistant";',
          ),
        );
        assert.ok(
          lines.includes('+        attribute :>> displayName = "Field Lead";'),
        );
      },
    );
  } finally {
    await fixture.cleanup();
    await rm(out, { recursive: true, force: true });
  }
});
