import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginList, runExport } from "../plugin/core.ts";
import { doctor } from "../src/doctor.ts";
import { ExportError } from "../src/error.ts";
import { ASSEMBLY_LIBRARY } from "../src/library.ts";
import { canonical, parseSnapshot } from "../src/snapshot.ts";
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
      fixture.plugins,
      out,
      null,
      new Date("2026-11-02T10:15:00.250Z"),
    );
    const skipped = {
      status: "skipped",
      errors: 0,
      code: "TOOLKIT_NOT_INSTALLED",
      recovery: "openclaw sysmlv2-toolkit install",
    };
    assert.deepEqual(first.validation, skipped);
    assert.deepEqual(first.ape, {
      status: "skipped",
      count: 0,
      code: "TOOLKIT_NOT_INSTALLED",
    });
    const findings = doctor(parseSnapshot(
      JSON.parse(await readFile(join(first.outDir, "snapshot.json"), "utf8")),
    ));
    assert.equal(
      await readFile(join(first.outDir, "findings.json"), "utf8"),
      canonical(findings),
    );
    assert.deepEqual(first.findings, { error: 0, warning: 21, info: 34 });
    assert.deepEqual(
      JSON.parse(await readFile(join(first.outDir, "validation.json"), "utf8")),
      {
        validation: skipped,
        errors: [],
        warnings: [],
        ape: { status: "skipped", code: "TOOLKIT_NOT_INSTALLED", findings: [] },
      },
    );
    const config = join(fixture.home, "openclaw.json");
    await writeFile(
      config,
      (await readFile(config, "utf8")).replace("Field Assistant", "Field Lead"),
    );
    const second = await runExport(
      fixture.home,
      fixture.plugins,
      out,
      complete,
      new Date("2026-11-02T10:20:00Z"),
    );

    await t.step("versions.json lists the runs newest first", async () => {
      assert.equal(first.outDir, join(out, "2026-11-02T10-15-00Z"));
      assert.equal(second.version, "2026-11-02T10-20-00Z");
      assert.deepEqual(second.findings, first.findings);
      assert.deepEqual(
        JSON.parse(await readFile(join(out, "versions.json"), "utf8")),
        [{
          id: "2026-11-02T10-20-00Z",
          createdAt: "2026-11-02T10:20:00.000Z",
          agents: 6,
          validation: skipped,
          findings: first.findings,
          inferred: { procedures: 0, rules: 1, failed: 0 },
        }, {
          id: "2026-11-02T10-15-00Z",
          createdAt: "2026-11-02T10:15:00.250Z",
          agents: 6,
          validation: skipped,
          findings: first.findings,
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
          "validation.json",
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
        assert.deepEqual(data.versions[1].findings, findings);
        const instance = data.versions[0].changes.find((c: { file: string }) =>
          c.file === "OpenClawInstance.sysml"
        );
        const lines = instance.hunks.flatMap((h: { lines: string[] }) =>
          h.lines
        );
        assert.ok(
          lines.includes(
            '-            attribute :>> displayName = "Field Assistant";',
          ),
        );
        assert.ok(
          lines.includes(
            '+            attribute :>> displayName = "Field Lead";',
          ),
        );
      },
    );
  } finally {
    await fixture.cleanup();
    await rm(out, { recursive: true, force: true });
  }
});

Deno.test("the plugin inventory command must succeed and print JSON", () => {
  assert.deepEqual(pluginList({ code: 0, stdout: '{"plugins":[]}' }), {
    plugins: [],
  });
  for (const result of [{ code: 1, stdout: "{}" }, { code: 0, stdout: "x" }]) {
    assert.throws(
      () => pluginList(result),
      (error: unknown) =>
        error instanceof ExportError &&
        ["PLUGIN_LIST_FAILED", "INVALID_INPUT"].includes(error.code),
    );
  }
});

Deno.test("the plugin summary names combined counts and the APE execution status", async () => {
  const source = await readFile(
    new URL("../plugin/index.mjs", import.meta.url),
    "utf8",
  );
  // Exercise the entry's actual formatter without loading the OpenClaw SDK.
  const summarize = new Function(
    source.slice(
      source.indexOf("function summarize(s)"),
      source.indexOf("export default"),
    ) +
      ";return summarize;",
  )();
  const summary = {
    agents: 1,
    outDir: "out",
    viewer: "index.html",
    inferred: null,
    validation: { status: "skipped", errors: 0 },
    ape: { status: "completed", count: 12 },
  };
  assert.match(
    summarize({
      ...summary,
      findings: { error: 0, warning: 0, info: 0 },
      ape: { status: "completed", count: 1 },
    }),
    /APE: completed \(1 finding\)/,
  );
  for (
    const [findings, expected] of [
      [
        { error: 1, warning: 4, info: 30 },
        "Findings: 1 error, 4 warnings, 30 notes",
      ],
      [{ error: 0, warning: 1, info: 0 }, "Findings: 1 warning"],
      [{ error: 0, warning: 0, info: 1 }, "Findings: 1 note"],
      [{ error: 0, warning: 0, info: 0 }, "Findings: no finding"],
    ]
  ) {
    assert.equal(
      summarize({ ...summary, findings }).split("\n").find((line: string) =>
        line.startsWith("Findings:")
      ),
      expected,
    );
    assert.match(
      summarize({ ...summary, findings }),
      /APE: completed \(12 findings\)/,
    );
  }
});
