import { createPluginEntry } from "../../src/adapters/in/openclaw/plugin.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pluginList, runExport } from "../../src/composition/openclaw.ts";
import { ExportError } from "../../src/infrastructure/error.ts";
import { ASSEMBLY_LIBRARY } from "../../src/adapters/out/sysml/library.ts";
import { canonical } from "../../src/infrastructure/canonical-json.ts";
import { parseSnapshot } from "../../src/infrastructure/snapshot-codec.ts";
import { createFixture } from "../support/fixture.ts";

const unexpected = () => {
  throw new Error("Unexpected service call");
};
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
    // No Toolkit there: the export is kept and its validation says why it failed.
    const absent = join(out, "absent-toolkit");
    const first = await runExport(
      fixture.home,
      fixture.plugins,
      out,
      null,
      new Date("2026-11-02T10:15:00.250Z"),
      absent,
    );
    const failed = {
      status: "failed",
      errors: 1,
      code: "TOOLKIT_INTEGRITY",
      recovery: first.validation.recovery,
    };
    assert.match(failed.recovery!, /^Reinstall the plugin/);
    assert.deepEqual(first.validation, failed);
    assert.deepEqual(first.ape, {
      status: "skipped",
      count: 0,
      code: "TOOLKIT_INTEGRITY",
    });
    const findings = parseSnapshot(
      JSON.parse(await readFile(join(first.outDir, "snapshot.json"), "utf8")),
    ).ambiguities.sort((a, b) =>
      a.code.localeCompare(b.code) || a.subject.localeCompare(b.subject) ||
      a.context.localeCompare(b.context)
    );
    assert.equal(
      await readFile(join(first.outDir, "findings.json"), "utf8"),
      canonical(findings),
    );
    assert.deepEqual(first.findings, {
      error: 0,
      warning: 0,
      info: findings.length,
    });
    assert.deepEqual(
      JSON.parse(await readFile(join(first.outDir, "validation.json"), "utf8")),
      {
        validation: failed,
        errors: [{
          code: "TOOLKIT_INTEGRITY",
          message:
            "Toolkit file is missing, unreadable or modified: sysmlv2.js",
          file: null,
          line: null,
          column: null,
        }],
        warnings: [],
        ape: { status: "skipped", code: "TOOLKIT_INTEGRITY", findings: [] },
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
      absent,
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
          validation: failed,
          findings: first.findings,
          inferred: { procedures: 0, rules: 1, failed: 0 },
        }, {
          id: "2026-11-02T10-15-00Z",
          createdAt: "2026-11-02T10:15:00.250Z",
          agents: 6,
          validation: failed,
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

Deno.test("the plugin summary names combined counts and the model checks status", async () => {
  const source = await readFile(
    new URL("../../src/adapters/in/openclaw/plugin.mjs", import.meta.url),
    "utf8",
  );
  // Exercise the entry's actual formatter without loading the OpenClaw SDK.
  const summarize = new Function(
    source.slice(
      source.indexOf("function summarize(s)"),
      source.indexOf("export function createPluginEntry"),
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
    /Checks: completed \(1 finding\)/,
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
      /Checks: completed \(12 findings\)/,
    );
  }
});

Deno.test("plugin owner tool binds the injected inventory parser", async () => {
  const inventory = { code: 0, stdout: '{"plugins":[]}' };
  const plugins = { plugins: [] };
  const calls: unknown[] = [];
  let toolFactory: (context: unknown) => { execute(): Promise<unknown> };
  const entry = createPluginEntry((definition: unknown) => definition, {
    toolkitStatus: unexpected,
    completeWith: unexpected,
    pluginList(result: unknown) {
      assert.equal(result, inventory);
      calls.push("inventory");
      return plugins;
    },
    runExport(
      stateDir: string,
      selected: unknown,
      outDir: string,
      complete: unknown,
      now: Date,
    ) {
      assert.equal(stateDir, "/fake/state");
      assert.equal(selected, plugins);
      assert.equal(outDir, "/fake/state/sysmlv2-export");
      assert.equal(complete, null);
      assert(now instanceof Date);
      calls.push("export");
      return Promise.resolve({
        outDir,
        viewer: `${outDir}/index.html`,
        version: "version",
        agents: 1,
        inferred: null,
        findings: { error: 0, warning: 0, info: 0 },
        validation: { status: "skipped", errors: 0 },
        ape: { status: "skipped", count: 0 },
      });
    },
  });
  entry.register({
    runtime: {
      state: { resolveStateDir: () => "/fake/state" },
      system: { runCommandWithTimeout: () => Promise.resolve(inventory) },
    },
    registerCommand() {},
    registerTool(factory: typeof toolFactory) {
      toolFactory = factory;
    },
    registerCli() {},
  });
  await toolFactory!({ senderIsOwner: true, sandboxed: false }).execute();
  assert.deepEqual(calls, ["inventory", "export"]);
});

Deno.test("the toolkit command only verifies the bundled files", async () => {
  const commands: string[] = [], actions = new Map<string, () => unknown>();
  const node = (path: string) => {
    commands.push(path);
    const self = {
      command: (name: string) => node(`${path} ${name}`.trim()),
      description: () => self,
      option: () => self,
      action: (run: () => unknown) => (actions.set(path, run), self),
    };
    return self;
  };
  let setup: (context: { program: ReturnType<typeof node> }) => void;
  let descriptors: { name: string }[] = [];
  const status = {
    version: "0.10.10",
    path: "/plugin/toolkit",
    verified: true,
  };
  const entry = createPluginEntry((definition: unknown) => definition, {
    pluginList: unexpected,
    runExport: unexpected,
    completeWith: unexpected,
    toolkitStatus: () => Promise.resolve(status),
  });
  entry.register({
    registerCommand() {},
    registerTool() {},
    registerCli(
      register: typeof setup,
      options: { descriptors: typeof descriptors },
    ) {
      setup = register;
      descriptors = options.descriptors;
    },
  });
  setup!({ program: node("") });
  assert.deepEqual(commands.slice(1), [
    "sysmlv2-toolkit",
    "sysmlv2-toolkit status",
    "sysmlv2-export",
  ]);
  assert.deepEqual(descriptors.map((d) => d.name), [
    "sysmlv2-export",
    "sysmlv2-toolkit",
  ]);
  const write = process.stdout.write;
  let printed = "";
  process.stdout.write =
    ((text: string) => (printed += text, true)) as typeof write;
  try {
    await actions.get("sysmlv2-toolkit status")!();
  } finally {
    process.stdout.write = write;
  }
  assert.deepEqual(JSON.parse(printed), status);
});
