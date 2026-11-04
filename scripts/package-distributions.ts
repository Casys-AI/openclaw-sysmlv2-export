/** Stage two distributions from one build; publish neither. npm's allowlist is
 * the source of package contents. The lightweight variant omits only Toolkit
 * files and declares that choice explicitly beside the unchanged runtime. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLKIT_FILES } from "../src/adapters/sysml-toolkit-pin.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "plugin");
const manifest = JSON.parse(
  await readFile(join(source, "package.json"), "utf8"),
);
const version: string = manifest.version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
const output = join(root, ".release", version);
const artifacts = join(output, "artifacts");

type Pack = {
  filename: string;
  size: number;
  unpackedSize: number;
  files: { path: string }[];
};
function npmPack(directory: string, destination?: string): Pack {
  const args = ["pack", "--ignore-scripts", "--json"];
  if (destination) args.push("--pack-destination", destination);
  else args.push("--dry-run");
  const output = new Deno.Command("npm", {
    args,
    cwd: directory,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const decoder = new TextDecoder();
  if (!output.success) throw new Error(decoder.decode(output.stderr));
  const result = JSON.parse(decoder.decode(output.stdout));
  assert.equal(result.length, 1);
  return result[0];
}
const inventory = npmPack(source).files.map((file) => file.path).sort();
assert.ok(inventory.includes("distribution.json"), "Run plugin:build first");
assert.deepEqual(
  inventory.filter((name) => name.startsWith("toolkit/")).map((name) =>
    name.slice(8)
  ),
  Object.keys(TOOLKIT_FILES).sort(),
);
await rm(output, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });

const results = [];
for (
  const [channel, mode] of [["github", "bundled"], [
    "clawhub",
    "external",
  ]] as const
) {
  const directory = join(output, channel);
  const selected = inventory.filter((name) =>
    mode === "bundled" || !name.startsWith("toolkit/")
  );
  for (const name of selected) {
    assert.ok(!isAbsolute(name) && !name.split("/").includes(".."));
    assert.ok(
      (await lstat(join(source, name))).isFile(),
      `Not a regular file: ${name}`,
    );
    const target = join(directory, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, name), target);
  }
  await writeFile(
    join(directory, "distribution.json"),
    JSON.stringify({ toolkit: mode }, null, 2) + "\n",
  );
  if (mode === "external") {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify(
        {
          ...manifest,
          files: manifest.files.filter((name: string) => name !== "toolkit/"),
        },
        null,
        2,
      ) + "\n",
    );
  }
  const packed = npmPack(directory, artifacts);
  assert.deepEqual(packed.files.map((file) => file.path).sort(), selected);
  const name = `casys-openclaw-sysmlv2-export-${version}${
    mode === "external" ? "-clawhub" : ""
  }.tgz`;
  await rename(join(artifacts, packed.filename), join(artifacts, name));
  const sha256 = createHash("sha256").update(
    await readFile(join(artifacts, name)),
  ).digest("hex");
  results.push({
    channel,
    toolkit: mode,
    name,
    sha256,
    size: packed.size,
    unpackedSize: packed.unpackedSize,
    files: selected.length,
  });
  await writeFile(
    join(artifacts, mode === "bundled" ? "SHA256SUMS" : "SHA256SUMS.clawhub"),
    `${sha256}  ${name}\n`,
  );
}
// All shared content is identical: only delivery metadata differs.
for (
  const name of inventory.filter((name) =>
    !name.startsWith("toolkit/") &&
    !["distribution.json", "package.json"].includes(name)
  )
) {
  assert.deepEqual(
    await readFile(join(output, "github", name)),
    await readFile(join(output, "clawhub", name)),
    name,
  );
}
await writeFile(
  join(artifacts, "packages.json"),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(JSON.stringify({ output, packages: results }, null, 2));
