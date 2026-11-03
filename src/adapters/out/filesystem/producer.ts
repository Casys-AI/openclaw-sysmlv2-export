import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Producer } from "../../../domain/export/versions.ts";

// From source the plugin's files sit under plugin/ and the shapes under
// rules/; the bundle has both beside it.
const source = import.meta.url.endsWith(".ts");
const at = (path: string, bundled = path) =>
  new URL(source ? `../../../../${path}` : `./${bundled}`, import.meta.url);

/** The plugin's version and a digest of the shipped shape files (every `.ttl`
 * under `rules/`, by directory and name), as versions.json records them. */
export async function producer(): Promise<Producer> {
  const { version } = JSON.parse(
    await readFile(at("plugin/package.json", "package.json"), "utf8"),
  );
  const hash = createHash("sha256");
  for (const directory of ["ape", "openclaw"]) {
    const dir = at(`rules/${directory}/`);
    const names = (await readdir(dir)).filter((n) => n.endsWith(".ttl")).sort();
    for (const name of names) {
      hash.update(`${directory}/${name}\0`);
      hash.update(await readFile(new URL(name, dir)));
      hash.update("\0");
    }
  }
  return { plugin: version, shapes: hash.digest("hex") };
}
