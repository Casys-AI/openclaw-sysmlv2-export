import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Producer } from "../../../domain/export/versions.ts";
import { SHAPE_FILES, shapeUrl } from "../shacl/shape-files.ts";

// From source the plugin's package.json sits under plugin/; the bundle has it
// beside it.
const manifest = new URL(
  import.meta.url.endsWith(".ts")
    ? "../../../../plugin/package.json"
    : "./package.json",
  import.meta.url,
);

/** The plugin's version and a digest of the shape files that check an export
 * (their paths and bytes), as versions.json records them. */
export async function producer(): Promise<Producer> {
  const { version } = JSON.parse(await readFile(manifest, "utf8"));
  const hash = createHash("sha256");
  for (const file of SHAPE_FILES) {
    hash.update(`${file}\0`);
    hash.update(await readFile(shapeUrl(file)));
    hash.update("\0");
  }
  return { plugin: version, shapes: hash.digest("hex") };
}
