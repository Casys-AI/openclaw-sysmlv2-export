import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { main, run } from "../cli.ts";
import { ExportError } from "../src/error.ts";
import { createFixture } from "./support/fixture.ts";

Deno.test("CLI collect/export/doctor/diff compose with deterministic sanitized output", async () => {
  const fixture = await createFixture();
  const output = await mkdtemp(join(tmpdir(), "openclaw-cli-test-"));
  try {
    const first = join(output, "first.json"),
      second = join(output, "second.json");
    const input = await readFile(join(fixture.home, "openclaw.json"), "utf8");
    const firstResult = await run([
      "collect",
      "--home",
      fixture.home,
      "--out",
      first,
    ]);
    assert.deepEqual(
      await run(["collect", "--home", fixture.home, "--out", second]),
      firstResult,
    );
    const snapshotText = await readFile(first, "utf8");
    assert.equal(snapshotText, await readFile(second, "utf8"));
    assert.deepEqual(await run(["diff", first, second]), []);
    assert.deepEqual(
      await run(["doctor", "--snapshot", first]),
      await run(["doctor", "--snapshot", second]),
    );
    const exported = join(output, "exported"),
      repeated = join(output, "repeated");
    assert.deepEqual(
      await run(["export", "--snapshot", first, "--out", exported]),
      await run(["export", "--snapshot", second, "--out", repeated]),
    );
    const files = await readdir(exported);
    assert.ok(files.length > 0);
    for (const file of files) {
      const text = await readFile(join(exported, file), "utf8");
      assert.equal(text, await readFile(join(repeated, file), "utf8"));
      assert.doesNotMatch(
        text,
        /CANARY-|Fixture placeholder|original skill is private|original file \(/,
      );
    }
    await assert.rejects(() =>
      run(["collect", "--home", fixture.home, "--out", first])
    );
    await assert.rejects(() =>
      run([
        "collect",
        "--home",
        fixture.home,
        "--out",
        join(fixture.home, "openclaw.json"),
      ])
    );
    await assert.rejects(() =>
      run(["export", "--snapshot", first, "--out", exported])
    );
    assert.equal(await readFile(first, "utf8"), snapshotText);
    assert.equal(
      await readFile(join(fixture.home, "openclaw.json"), "utf8"),
      input,
    );
  } finally {
    await fixture.cleanup();
    await rm(output, { recursive: true, force: true });
  }
});

Deno.test("CLI rejects unknown flags and invalid snapshot boundaries", async () => {
  await assert.rejects(
    () => run(["doctor", "--unknown", "x"]),
    (error: unknown) =>
      error instanceof ExportError && error.code === "CLI_USAGE",
  );
  const fixture = await createFixture();
  const output = await mkdtemp(join(tmpdir(), "openclaw-cli-invalid-"));
  try {
    const path = join(output, "snapshot.json");
    await run(["collect", "--home", fixture.home, "--out", path]);
    const snapshot = JSON.parse(await readFile(path, "utf8"));
    for (
      const bad of [{ ...snapshot, schema: "unknown/1" }, {
        ...snapshot,
        schema: "openclaw-snapshot/4",
      }, {
        ...snapshot,
        unexpected: "CANARY-EXTRA",
      }]
    ) {
      await writeFile(path, JSON.stringify(bad));
      for (
        const args of [["doctor", "--snapshot", path], ["diff", path, path], [
          "export",
          "--snapshot",
          path,
          "--out",
          join(output, "unused"),
        ]]
      ) {
        await assert.rejects(() => run(args), (error: unknown) => {
          assert.ok(error instanceof ExportError);
          assert.equal(error.code, "INVALID_INPUT");
          assert.doesNotMatch(JSON.stringify(error), /CANARY-/);
          return true;
        });
      }
    }
  } finally {
    await fixture.cleanup();
    await rm(output, { recursive: true, force: true });
  }
});

Deno.test("CLI collect takes an optional plugin inventory file", async () => {
  const fixture = await createFixture();
  try {
    const out = join(dirname(fixture.pluginsFile), "snapshot.json");
    await run([
      "collect",
      "--home",
      fixture.home,
      "--plugins",
      fixture.pluginsFile,
      "--out",
      out,
    ]);
    assert.ok(JSON.parse(await readFile(out, "utf8")).plugins.length > 0);
    await assert.rejects(
      () => run(["collect", "--home", fixture.home, "--plugins", "--out", out]),
      (error: unknown) =>
        error instanceof ExportError && error.code === "CLI_USAGE",
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("CLI main prints coded JSON and returns nonzero for invalid arguments", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => {
    lines.push(values.map(String).join(" "));
  };
  try {
    assert.equal(await main(["CANARY-UNKNOWN-COMMAND"]), 1);
  } finally {
    console.log = original;
  }
  assert.equal(lines.length, 1);
  const error = JSON.parse(lines[0]);
  assert.equal(error.code, "CLI_USAGE");
  assert.equal(typeof error.context, "string");
  assert.equal(typeof error.recovery, "string");
  assert.doesNotMatch(lines[0], /CANARY-/);
});
