import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExportError } from "../../src/infrastructure/error.ts";
import {
  installToolkit,
  readToolkit,
  toolkitPath,
  toolkitStatus,
} from "../../src/adapters/out/sysml-toolkit/install.ts";

const code = (expected: string) => (e: unknown) =>
  e instanceof ExportError && e.code === expected;
async function fixture(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "toolkit-install-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
Deno.test("missing toolkit reports status and actionable error", () =>
  fixture(async (dir) => {
    assert.equal((await toolkitStatus(dir)).installed, false);
    await assert.rejects(
      readToolkit(dir),
      (e: unknown) =>
        e instanceof ExportError && e.code === "TOOLKIT_NOT_INSTALLED" &&
        e.recovery === "openclaw sysmlv2-toolkit install",
    );
  }));
Deno.test("an archive that is not the pinned release is refused before decompression", () =>
  fixture(async (dir) => {
    const archive = join(dir, "bad.tgz");
    await writeFile(archive, "not gzip");
    await assert.rejects(
      installToolkit(dir, { from: archive }),
      code("TOOLKIT_INTEGRITY"),
    );
  }));
Deno.test("download request, HTTP and body failures are classified", () =>
  fixture(async (dir) => {
    for (
      const fetcher of [
        () => Promise.reject(new Error("offline")),
        () => Promise.resolve(new Response("missing", { status: 404 })),
        () =>
          Promise.resolve(
            new Response(
              new ReadableStream({
                start(c) {
                  c.error(new Error("body"));
                },
              }),
            ),
          ),
      ]
    ) {
      await assert.rejects(
        installToolkit(dir, { fetch: fetcher as typeof fetch }),
        code("TOOLKIT_DOWNLOAD_FAILED"),
      );
    }
  }));
const archive = Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE");
Deno.test({
  name:
    "real pinned archive installs, verifies, no-ops and detects file tampering",
  ignore: !archive,
  fn: () =>
    fixture(async (dir) => {
      assert.equal(
        (await installToolkit(dir, { from: archive })).changed,
        true,
      );
      assert.equal((await readToolkit(dir)).size, 9);
      assert.equal(
        (await installToolkit(dir, {
          fetch: (() => {
            throw new Error("must not fetch");
          }) as typeof fetch,
        })).changed,
        false,
      );
      await writeFile(join(toolkitPath(dir), "sysmlv2.js"), "tampered");
      await assert.rejects(toolkitStatus(dir), code("TOOLKIT_INTEGRITY"));
      await assert.rejects(
        installToolkit(dir, { from: archive }),
        code("TOOLKIT_INTEGRITY"),
      );
    }),
});
