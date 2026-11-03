import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ExportError } from "../../../infrastructure/error.ts";
import { TOOLKIT_FILES, TOOLKIT_VERSION } from "../../sysml-toolkit-pin.ts";

/** The Toolkit ships in the plugin package, next to the bundle (`toolkit/`);
 * a source checkout reads the `plugin/toolkit/` that `plugin:build` writes. */
export const bundledToolkit = resolve(fileURLToPath(
  new URL(
    import.meta.url.endsWith(".ts")
      ? "../../../../plugin/toolkit/"
      : "./toolkit/",
    import.meta.url,
  ),
));

export interface ToolkitStatus {
  version: string;
  path: string;
  verified: true;
}
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const integrity = (context: string) =>
  new ExportError(
    "TOOLKIT_INTEGRITY",
    context,
    "Reinstall the plugin. From a source checkout, run deno task plugin:build with SYSML_TOOLKIT_WASM_ARCHIVE set.",
  );
/** Every pinned file of `directory`, read once and checked against its hash. */
export async function readToolkit(
  directory: string,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const [name, hash] of Object.entries(TOOLKIT_FILES)) {
    try {
      const file = join(directory, name);
      if (!(await lstat(file)).isFile()) {
        throw new Error("Expected regular file");
      }
      const bytes = await readFile(file);
      if (sha256(bytes) !== hash) throw new Error("Hash mismatch");
      files.set(name, bytes);
    } catch {
      throw integrity(
        `Toolkit file is missing, unreadable or modified: ${name}`,
      );
    }
  }
  return files;
}
export async function toolkitStatus(directory: string): Promise<ToolkitStatus> {
  await readToolkit(directory);
  return { version: TOOLKIT_VERSION, path: directory, verified: true };
}
