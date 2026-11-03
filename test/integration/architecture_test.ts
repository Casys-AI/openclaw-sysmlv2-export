import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
const sourceRoot = new URL("src/", root);
const entries = new Set([
  "cli.ts",
  "plugin/core.ts",
  "plugin/index.mjs",
  "src/adapters/out/sysml-toolkit/worker.ts",
]);

async function* sourceFiles(directory: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(directory)) {
    const file = new URL(
      entry.name + (entry.isDirectory ? "/" : ""),
      directory,
    );
    if (entry.isDirectory) yield* sourceFiles(file);
    else if (
      /\.(?:ts|mjs)$/.test(entry.name) && !entry.name.endsWith("_test.ts")
    ) yield file;
  }
}
function imports(source: string): string[] {
  const staticImports =
    /\b(?:import\s+(?:(?:type\s+)?[^;]*?\sfrom\s*)?|export\s+(?:type\s+)?(?:\{[^;]*?\}|\*(?:\s+as\s+\w+)?)\s+from\s*)["']([^"']+)["']/g;
  const dynamicImports = /\bimport\s*\(\s*["']([^"']+)["']/g;
  return [...source.matchAll(staticImports), ...source.matchAll(dynamicImports)]
    .map((match) => match[1]);
}

Deno.test("production layers keep dependency direction and runtime boundaries", async () => {
  assert.deepEqual(
    imports(`import "./side-effect.ts";
import type { A } from "./type.ts";
export * from "./all.ts";
export { value } from "./named.ts";
const value = import("./dynamic.ts");`),
    [
      "./side-effect.ts",
      "./type.ts",
      "./all.ts",
      "./named.ts",
      "./dynamic.ts",
    ],
  );
  const allowed: Record<string, readonly string[]> = {
    domain: ["domain"],
    application: ["domain", "application"],
    infrastructure: ["domain", "application", "infrastructure"],
    adapters: ["domain", "application", "adapters", "infrastructure"],
    composition: [
      "domain",
      "application",
      "adapters",
      "infrastructure",
      "composition",
    ],
  };
  const folders = [];
  for await (const entry of Deno.readDir(sourceRoot)) {
    assert(
      entry.isDirectory || !/\.(?:ts|mjs)$/.test(entry.name),
      `src contains a loose production file: ${entry.name}`,
    );
    if (entry.isDirectory) folders.push(entry.name);
  }
  assert.deepEqual(folders.sort(), Object.keys(allowed).sort());
  const files = [];
  for await (const file of sourceFiles(sourceRoot)) files.push(file);
  for (const entry of entries) {
    if (!entry.startsWith("src/")) files.push(new URL(entry, root));
  }
  for (const file of files) {
    const relative = file.href.slice(root.href.length);
    const insideSource = file.href.startsWith(sourceRoot.href);
    const layer = insideSource
      ? file.href.slice(sourceRoot.href.length).split("/")[0]
      : "entry";
    const source = await Deno.readTextFile(file);
    if (layer === "domain" || layer === "application") {
      assert.doesNotMatch(
        source,
        /\b(?:Deno|process|fetch)\s*(?:\.|\()/,
        `${relative}: runtime global in ${layer}`,
      );
    }
    for (const specifier of imports(source)) {
      if (!specifier.startsWith(".")) {
        assert(
          !["domain", "application"].includes(layer),
          `${relative}: external import ${specifier}`,
        );
        continue;
      }
      const dependency = new URL(specifier, file);
      const targetInsideSource = dependency.href.startsWith(sourceRoot.href);
      const targetLayer = targetInsideSource
        ? dependency.href.slice(sourceRoot.href.length).split("/")[0]
        : "entry";
      // Adapters embed the shipped SysML library assets as text.
      const libraryAsset = layer === "adapters" &&
        dependency.href.startsWith(new URL("sysml/", root).href) &&
        dependency.pathname.endsWith(".sysml");
      if (libraryAsset) continue;
      if (layer === "entry") {
        assert(
          targetLayer === "composition" ||
            entries.has(dependency.href.slice(root.href.length)) ||
            (relative === "plugin/index.mjs" &&
              dependency.href === new URL("plugin/core.mjs", root).href),
          `${relative}: entry imports ${specifier}`,
        );
      } else {
        const entryComposition = entries.has(relative) &&
          targetLayer === "composition";
        assert(
          allowed[layer]?.includes(targetLayer) || entryComposition,
          `${relative}: ${layer} imports ${specifier}`,
        );
      }
    }
  }
});
