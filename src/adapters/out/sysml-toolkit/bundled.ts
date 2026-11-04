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
  source: "bundled" | "external";
  installed: boolean;
  version: string;
  path: string;
  verified: boolean;
}
export interface ToolkitLocationOptions {
  /** Explicit locations keep installation tests independent of the checkout. */
  bundledDirectory?: string;
  distributionFile?: string;
}
export function toolkitPath(stateDir: string): string {
  return join(stateDir, "sysmlv2-export-toolkit", TOOLKIT_VERSION);
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw integrity("Cannot inspect the Toolkit installation.");
  }
}
async function location(stateDir: string, options: ToolkitLocationOptions) {
  const directory = options.bundledDirectory ?? bundledToolkit;
  const marker = options.distributionFile ??
    join(directory, "..", "distribution.json");
  let source: ToolkitStatus["source"] = "bundled";
  try {
    const distribution = JSON.parse(await readFile(marker, "utf8"));
    if (
      distribution?.toolkit !== "bundled" &&
      distribution?.toolkit !== "external"
    ) {
      throw new Error("Invalid distribution marker");
    }
    source = distribution.toolkit;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw integrity(
        "The plugin distribution marker is unreadable or invalid.",
      );
    }
  }
  return {
    source,
    path: source === "bundled" ? directory : toolkitPath(stateDir),
  };
}
export const toolkitNotInstalled = () =>
  new ExportError(
    "TOOLKIT_NOT_INSTALLED",
    "The pinned SysML Toolkit is not installed for this lightweight distribution.",
    "Run openclaw sysmlv2-toolkit install, or provide --from <archive> to that command.",
  );
/** A full package never falls back to the external cache if its bundle is damaged. */
export async function resolveToolkit(
  stateDir: string,
  options: ToolkitLocationOptions = {},
): Promise<{ source: ToolkitStatus["source"]; path: string }> {
  const selected = await location(stateDir, options);
  if (selected.source === "external" && !await exists(selected.path)) {
    throw toolkitNotInstalled();
  }
  return selected;
}
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const integrity = (context: string) =>
  new ExportError(
    "TOOLKIT_INTEGRITY",
    context,
    "Reinstall the plugin for a bundled distribution. For a lightweight distribution, remove the damaged Toolkit cache and run openclaw sysmlv2-toolkit install. From a source checkout, run deno task plugin:build with SYSML_TOOLKIT_WASM_ARCHIVE set.",
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
export async function toolkitStatus(
  stateDir: string,
  options: ToolkitLocationOptions = {},
): Promise<ToolkitStatus> {
  const selected = await location(stateDir, options);
  if (selected.source === "external" && !await exists(selected.path)) {
    return {
      ...selected,
      version: TOOLKIT_VERSION,
      installed: false,
      verified: false,
    };
  }
  await readToolkit(selected.path);
  return {
    ...selected,
    version: TOOLKIT_VERSION,
    installed: true,
    verified: true,
  };
}
