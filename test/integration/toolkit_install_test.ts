import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExportError } from "../../src/infrastructure/error.ts";
import { TOOLKIT_FILES } from "../../src/adapters/sysml-toolkit-pin.ts";
import {
  readToolkit,
  resolveToolkit,
  type ToolkitLocationOptions,
  toolkitPath,
  toolkitStatus,
} from "../../src/adapters/out/sysml-toolkit/bundled.ts";
import { extractToolkit } from "../../src/adapters/out/sysml-toolkit/extract.ts";
import { installToolkit } from "../../src/adapters/out/sysml-toolkit/install.ts";
import {
  TOOLKIT_URL,
  TOOLKIT_VERSION,
} from "../../src/adapters/sysml-toolkit-pin.ts";

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
      toolkitStatus(dir, { bundledDirectory: join(dir, "toolkit") }),
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
      assert.equal(
        (await toolkitStatus(dir, { bundledDirectory: toolkit })).verified,
        true,
      );
      await writeFile(join(toolkit, "sysmlv2.js"), "tampered");
      await assert.rejects(
        toolkitStatus(dir, { bundledDirectory: toolkit }),
        code("TOOLKIT_INTEGRITY"),
      );
    }),
});

async function external(dir: string): Promise<ToolkitLocationOptions> {
  const distributionFile = join(dir, "distribution.json");
  await writeFile(distributionFile, JSON.stringify({ toolkit: "external" }));
  return { bundledDirectory: join(dir, "toolkit"), distributionFile };
}
Deno.test("a lightweight distribution reports an absent versioned Toolkit without downloading", () =>
  fixture(async (dir) => {
    const options = await external(dir);
    assert.deepEqual(await toolkitStatus(dir, options), {
      source: "external",
      installed: false,
      verified: false,
      path: toolkitPath(dir),
      version: TOOLKIT_VERSION,
    });
    await assert.rejects(
      resolveToolkit(dir, options),
      (error: unknown) =>
        error instanceof ExportError &&
        error.code === "TOOLKIT_NOT_INSTALLED" &&
        error.recovery.includes("openclaw sysmlv2-toolkit install"),
    );
    assert.deepEqual(await readdir(dir), ["distribution.json"]);
    await writeFile(options.distributionFile!, '{"toolkit":"unknown"}');
    await assert.rejects(
      toolkitStatus(dir, options),
      code("TOOLKIT_INTEGRITY"),
    );
    await writeFile(options.distributionFile!, "not json");
    await assert.rejects(
      resolveToolkit(dir, options),
      code("TOOLKIT_INTEGRITY"),
    );
  }));
Deno.test("explicit installation rejects a wrong archive without creating a cache", () =>
  fixture(async (dir) => {
    const options = await external(dir);
    const from = join(dir, "bad.tgz");
    await writeFile(from, "not gzip");
    await assert.rejects(
      installToolkit(dir, { ...options, from }),
      code("TOOLKIT_INTEGRITY"),
    );
    assert.deepEqual((await readdir(dir)).sort(), [
      "bad.tgz",
      "distribution.json",
    ]);
  }));
Deno.test("explicit installation classifies request, HTTP, body and local read failures", () =>
  fixture(async (dir) => {
    const options = await external(dir);
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
        installToolkit(dir, { ...options, fetch: fetcher as typeof fetch }),
        code("TOOLKIT_DOWNLOAD_FAILED"),
      );
    }
    await assert.rejects(
      installToolkit(dir, { ...options, from: join(dir, "absent.tgz") }),
      code("TOOLKIT_DOWNLOAD_FAILED"),
    );
    assert.deepEqual(await readdir(dir), ["distribution.json"]);
  }));
Deno.test({
  name:
    "lightweight local install is atomic, versioned, idempotent and detects tampering",
  ignore: !archive,
  fn: () =>
    fixture(async (dir) => {
      const options = await external(dir);
      const installed = await installToolkit(dir, {
        ...options,
        from: archive,
      });
      assert.deepEqual(installed, {
        source: "external",
        installed: true,
        verified: true,
        changed: true,
        version: TOOLKIT_VERSION,
        path: toolkitPath(dir),
      });
      assert.equal((await readToolkit(installed.path)).size, 9);
      assert.deepEqual(await readdir(join(dir, "sysmlv2-export-toolkit")), [
        TOOLKIT_VERSION,
      ]);
      assert.equal(
        (await installToolkit(dir, {
          ...options,
          fetch: (() => {
            throw new Error("must not fetch");
          }) as typeof fetch,
        })).changed,
        false,
      );
      assert.deepEqual(await resolveToolkit(dir, options), {
        source: "external",
        path: installed.path,
      });
      await writeFile(join(installed.path, "sysmlv2.js"), "tampered");
      await assert.rejects(
        toolkitStatus(dir, options),
        code("TOOLKIT_INTEGRITY"),
      );
      await assert.rejects(
        installToolkit(dir, { ...options, from: archive }),
        code("TOOLKIT_INTEGRITY"),
      );
    }),
});
Deno.test({
  name:
    "explicit download uses the pinned URL and concurrent installs verify the winner",
  ignore: !archive,
  fn: () =>
    fixture(async (dir) => {
      const options = await external(dir);
      const bytes = await readFile(archive!);
      let requests = 0;
      const fetcher = (url: string | URL | Request) => {
        assert.equal(url, TOOLKIT_URL);
        requests++;
        return Promise.resolve(new Response(Uint8Array.from(bytes)));
      };
      const results = await Promise.all([
        installToolkit(dir, { ...options, fetch: fetcher as typeof fetch }),
        installToolkit(dir, { ...options, fetch: fetcher as typeof fetch }),
      ]);
      assert.equal(requests, 2);
      assert.deepEqual(results.map((r) => r.changed).sort(), [false, true]);
      assert.equal((await toolkitStatus(dir, options)).verified, true);
      assert.deepEqual(await readdir(join(dir, "sysmlv2-export-toolkit")), [
        TOOLKIT_VERSION,
      ]);
    }),
});
Deno.test({
  name:
    "full distribution stays offline and never falls back to a valid external cache",
  ignore: !archive,
  fn: () =>
    fixture(async (dir) => {
      const options = await external(dir);
      await installToolkit(dir, { ...options, from: archive });
      await extractToolkit(archive, options.bundledDirectory!);
      await writeFile(
        options.distributionFile!,
        JSON.stringify({ toolkit: "bundled" }),
      );
      const noFetch = (() => {
        throw new Error("must not fetch");
      }) as typeof fetch;
      const status = await toolkitStatus(dir, options);
      assert.deepEqual(status, {
        source: "bundled",
        path: options.bundledDirectory,
        installed: true,
        verified: true,
        version: TOOLKIT_VERSION,
      });
      assert.equal(
        (await installToolkit(dir, { ...options, fetch: noFetch })).changed,
        false,
      );
      await writeFile(join(options.bundledDirectory!, "sysmlv2.js"), "damaged");
      await assert.rejects(
        toolkitStatus(dir, options),
        code("TOOLKIT_INTEGRITY"),
      );
      await assert.rejects(
        installToolkit(dir, { ...options, fetch: noFetch }),
        code("TOOLKIT_INTEGRITY"),
      );
      assert.deepEqual(await resolveToolkit(dir, options), {
        source: "bundled",
        path: options.bundledDirectory,
      });
      assert.equal((await readToolkit(toolkitPath(dir))).size, 9);
      await rm(options.bundledDirectory!, { recursive: true });
      await assert.rejects(
        toolkitStatus(dir, options),
        code("TOOLKIT_INTEGRITY"),
      );
      await assert.rejects(
        installToolkit(dir, { ...options, fetch: noFetch }),
        code("TOOLKIT_INTEGRITY"),
      );
      // Old source checkouts lack a marker and must remain strict full packages.
      await rm(options.distributionFile!);
      await assert.rejects(
        toolkitStatus(dir, options),
        code("TOOLKIT_INTEGRITY"),
      );
    }),
});
