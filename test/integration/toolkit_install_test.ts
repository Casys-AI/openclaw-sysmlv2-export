import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExportError } from "../../src/infrastructure/error.ts";
import { TOOLKIT_FILES } from "../../src/adapters/sysml-toolkit-pin.ts";
import {
  readToolkit,
  toolkitStatus,
} from "../../src/adapters/out/sysml-toolkit/bundled.ts";
import { extractToolkit } from "../../src/adapters/out/sysml-toolkit/extract.ts";

const code = (expected: string) => (e: unknown) =>
  e instanceof ExportError && e.code === expected;
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "toolkit-bundle-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
Deno.test("a missing bundled Toolkit is an integrity error that says to reinstall", () =>
  fixture(async (dir) => {
    await assert.rejects(
      toolkitStatus(join(dir, "toolkit")),
      (e: unknown) =>
        e instanceof ExportError && e.code === "TOOLKIT_INTEGRITY" &&
        /^Reinstall the plugin/.test(e.recovery),
    );
  }));
Deno.test("packaging needs the archive and refuses one that is not the pinned release", () =>
  fixture(async (dir) => {
    const toolkit = join(dir, "toolkit"), archive = join(dir, "bad.tgz");
    await writeFile(archive, "not gzip");
    for (
      const [given, expected] of [
        [undefined, "TOOLKIT_ARCHIVE_MISSING"],
        [join(dir, "absent.tgz"), "TOOLKIT_ARCHIVE_MISSING"],
        [archive, "TOOLKIT_INTEGRITY"],
      ] as const
    ) {
      await assert.rejects(extractToolkit(given, toolkit), code(expected));
    }
    assert.deepEqual(await readdir(dir), ["bad.tgz"]);
  }));
const archive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");
Deno.test({
  name:
    "real pinned archive packages exactly the pinned files and tampering is detected",
  ignore: !archive,
  fn: () =>
    fixture(async (dir) => {
      const toolkit = join(dir, "toolkit");
      await mkdir(toolkit);
      await writeFile(join(toolkit, "stale.txt"), "left over");
      await extractToolkit(archive, toolkit);
      const names = Object.keys(TOOLKIT_FILES).sort();
      assert.deepEqual(
        (await readdir(toolkit, { recursive: true, withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) =>
            join(entry.parentPath, entry.name).slice(toolkit.length + 1)
          ).sort(),
        names,
      );
      assert.deepEqual([...(await readToolkit(toolkit)).keys()].sort(), names);
      assert.equal((await toolkitStatus(toolkit)).verified, true);
      await writeFile(join(toolkit, "sysmlv2.js"), "tampered");
      await assert.rejects(toolkitStatus(toolkit), code("TOOLKIT_INTEGRITY"));
    }),
});
