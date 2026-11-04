import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { ExportError } from "../../../infrastructure/error.ts";
import { TOOLKIT_URL } from "../../sysml-toolkit-pin.ts";
import {
  readToolkit,
  type ToolkitLocationOptions,
  type ToolkitStatus,
  toolkitStatus,
} from "./bundled.ts";
import { unpackToolkitArchive } from "./extract.ts";

/** Explicit owner command only: exports and plugin installation never call it. */
export async function installToolkit(
  stateDir: string,
  options: ToolkitLocationOptions & {
    from?: string;
    fetch?: typeof globalThis.fetch;
  } = {},
): Promise<ToolkitStatus & { changed: boolean }> {
  const status = await toolkitStatus(stateDir, options);
  if (status.installed) return { ...status, changed: false };
  let archive: Uint8Array;
  try {
    if (options.from) archive = await readFile(options.from);
    else {
      const response = await (options.fetch ?? globalThis.fetch)(TOOLKIT_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      archive = new Uint8Array(await response.arrayBuffer());
    }
  } catch {
    throw new ExportError(
      "TOOLKIT_DOWNLOAD_FAILED",
      "Could not read the pinned SysML Toolkit archive.",
      "Retry openclaw sysmlv2-toolkit install or provide --from <archive>.",
    );
  }
  // Verify the archive and every individual file before creating an installation.
  const files = unpackToolkitArchive(archive);
  const parent = dirname(status.path);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, ".install-"));
  try {
    for (const [name, contents] of files) {
      const path = join(temporary, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }
    // Re-read the staged files before the single atomic activation rename.
    await readToolkit(temporary);
    try {
      await rename(temporary, status.path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      return { ...await toolkitStatus(stateDir, options), changed: false };
    }
    return { ...status, installed: true, verified: true, changed: true };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
