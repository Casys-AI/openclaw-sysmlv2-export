import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../cli.ts";
import { runExport } from "../plugin/core.ts";
import { ExportError } from "../src/error.ts";
import { installToolkit, toolkitPath } from "../src/toolkit-install.ts";
import { validate } from "../src/validate.ts";
import { emit } from "../src/emit.ts";
import { ASSEMBLY_LIBRARY } from "../src/library.ts";
import { emitInferred } from "../src/infer.ts";
import { parseSnapshot } from "../src/snapshot.ts";
import { initOxigraph, namedNode, Store } from "../src/oxigraph.ts";
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
      const base = await validate(files, fixture.home);
      assert.equal(base.errors.length, 0);
      assert.equal(base.ape.status, "completed");
      assert.deepEqual(
        base.ape.metrics!.queries.map((q) => [q.code, q.findings]),
        [
          ["GRANT_WIDENS_PARENT", 0],
          ["LINK_CYCLE", 6],
          ["UNREACHABLE_OPERATOR", 0],
        ],
      );
      assert.deepEqual(
        base.ape.findings.filter((f) => f.code === "APE_LINK_CYCLE").map((f) =>
          f.subject
        ),
        [
          "agent:client",
          "agent:coach",
          "agent:devbox",
          "agent:field",
          "agent:lead",
          "agent:secretary",
        ],
      );
      console.log("APE base fixture counts:", JSON.stringify(base.ape.metrics));
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
      // Add only synthetic cases. Rules see these SysML bytes, never this snapshot.
      const extended = parseSnapshot(
        JSON.parse(await readFile(snapshot, "utf8")),
      );
      extended.messaging.enabled = false;
      const trial = new Map([...emit(extended), ...ASSEMBLY_LIBRARY]);
      trial.set(
        "ApeTrial.sysml",
        await readFile(
          new URL("./fixtures/ape-trial.sysml", import.meta.url),
          "utf8",
        ),
      );
      const cases = await validate(trial, fixture.home);
      assert.equal(cases.errors.length, 0, JSON.stringify(cases.errors));
      const byCode = (code: string) =>
        cases.ape.findings.filter((f) => f.code === `APE_${code}`);
      // Actual reachability finding: external entries reach parent; self does not.
      assert.deepEqual(byCode("UNREACHABLE_OPERATOR").map((f) => f.subject), [
        "agent:orphan",
        "agent:self",
      ]);
      assert.deepEqual(byCode("GRANT_WIDENS_PARENT").map((f) => f.subject), [
        "agent:bridge",
        "agent:parent",
      ]);
      assert.deepEqual(byCode("LINK_CYCLE").map((f) => f.subject), [
        "agent:client",
        "agent:coach",
        "agent:devbox",
        "agent:field",
        "agent:lead",
        "agent:secretary",
      ]);
      console.log(
        "APE extended fixture counts:",
        JSON.stringify(cases.ape.metrics),
      );
      const invalid = await validate(
        new Map([["invalid.sysml", "package Broken { part def ]"]]),
        fixture.home,
      );
      assert.ok(invalid.errors.length > 0);
      assert.equal(invalid.ape.status, "skipped");
      assert.equal(invalid.ape.code, "APE_INVALID_MODEL");
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
      assert.deepEqual(summary.ape, { status: "completed", count: 6 });
      assert.ok(summary.inferred!.rules > 0);
      const published = JSON.parse(
        await readFile(join(summary.outDir, "validation.json"), "utf8"),
      );
      assert.deepEqual(published.validation, summary.validation);
      assert.deepEqual(published.errors, []);
      assert.deepEqual(published.warnings, []);
      assert.doesNotMatch(
        JSON.stringify(published),
        /"(?:totalMs|preparationMs|projectionMs|loadMs|ms)":/,
      );
      assert.equal(Object.hasOwn(published.ape.metrics, "quads"), false);
      assert.equal(Object.hasOwn(published.ape, "validationReport"), false);
      const page = await readFile(summary.viewer, "utf8");
      const viewerData = JSON.parse(
        page.match(
          /<script id="data" type="application\/json">(.*?)<\/script>/s,
        )![1],
      );
      assert.equal(
        viewerData.texts[viewerData.versions[0].files["ape-report.ttl"]],
        await readFile(join(summary.outDir, "ape-report.ttl"), "utf8"),
      );
      await initOxigraph();
      const reportStore = new Store();
      try {
        reportStore.load(
          await readFile(join(summary.outDir, "ape-report.ttl"), "utf8"),
          { format: "text/turtle" },
        );
        const sh = "http://www.w3.org/ns/shacl#";
        assert.equal(
          reportStore.query(
            `ASK { ?report a <${sh}ValidationReport>; <${sh}conforms> false }`,
          ),
          true,
        );
        const results = reportStore.query(
          `SELECT ?result WHERE { ?report <${sh}result> ?result . ?result a <${sh}ValidationResult>; <${sh}sourceShape> <urn:ase:ape:v1:LINK_CYCLE> }`,
        );
        assert.ok(Array.isArray(results));
        assert.ok(results.length >= published.ape.findings.length);
        assert.equal(
          reportStore.match(
            null,
            namedNode(sh + "sourceConstraintComponent"),
            namedNode(sh + "SPARQLConstraintComponent"),
          ).length,
          results.length,
        );
        // RDF reports one result per solution; APE JSON groups related values by agent.
        const focuses = reportStore.query(
          `SELECT DISTINCT ?focus WHERE { ?result <${sh}focusNode> ?focus }`,
        );
        assert.ok(Array.isArray(focuses));
        assert.equal(focuses.length, published.ape.findings.length);
      } finally {
        (reportStore as Store & { free(): void }).free();
      }
      const publishedFindings = JSON.parse(
        await readFile(join(summary.outDir, "findings.json"), "utf8"),
      );
      assert.deepEqual(
        publishedFindings.filter((f: { code: string }) =>
          f.code.startsWith("APE_")
        ),
        published.ape.findings,
      );
      for (const severity of ["error", "warning", "info"] as const) {
        assert.equal(
          summary.findings[severity],
          publishedFindings.filter((f: { severity: string }) =>
            f.severity === severity
          ).length,
        );
      }
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
