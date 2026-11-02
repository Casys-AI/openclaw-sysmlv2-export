import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { ExportError } from "./error.ts";
import {
  TOOLKIT_ARCHIVE_SHA256,
  TOOLKIT_FILES,
  TOOLKIT_URL,
  TOOLKIT_VERSION,
} from "./toolkit-pin.ts";
import { readToolkitTar } from "./toolkit-tar.ts";

export interface ToolkitStatus {
  installed: boolean;
  version: string;
  path: string;
  verified: boolean;
}
export function toolkitPath(stateDir: string): string {
  return join(stateDir, "sysmlv2-export-toolkit", TOOLKIT_VERSION);
}
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const integrity = (context: string) =>
  new ExportError(
    "TOOLKIT_INTEGRITY",
    context,
    "Remove the damaged toolkit installation and run openclaw sysmlv2-toolkit install.",
  );
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw integrity("Cannot inspect the toolkit installation.");
  }
}
export async function readToolkit(
  stateDir: string,
): Promise<Map<string, Uint8Array>> {
  const path = toolkitPath(stateDir);
  if (!await exists(path)) {
    throw new ExportError(
      "TOOLKIT_NOT_INSTALLED",
      "The pinned SysML toolkit is not installed.",
      "openclaw sysmlv2-toolkit install",
    );
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, hash] of Object.entries(TOOLKIT_FILES)) {
    try {
      const file = join(path, name);
      if (!(await lstat(file)).isFile()) {
        throw new Error("Expected regular file");
      }
      const bytes = await readFile(file);
      if (sha256(bytes) !== hash) throw new Error("Hash mismatch");
      files.set(name, bytes);
    } catch {
      throw integrity(`Toolkit file is unreadable or modified: ${name}`);
    }
  }
  return files;
}
export async function toolkitStatus(stateDir: string): Promise<ToolkitStatus> {
  const path = toolkitPath(stateDir);
  if (!await exists(path)) {
    return {
      installed: false,
      version: TOOLKIT_VERSION,
      path,
      verified: false,
    };
  }
  await readToolkit(stateDir);
  return { installed: true, version: TOOLKIT_VERSION, path, verified: true };
}
export async function installToolkit(
  stateDir: string,
  options: { from?: string; fetch?: typeof globalThis.fetch } = {},
): Promise<ToolkitStatus & { changed: boolean }> {
  const status = await toolkitStatus(stateDir);
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
      "Could not read the SysML toolkit archive.",
      "Retry openclaw sysmlv2-toolkit install or provide --from <archive>.",
    );
  }
  if (sha256(archive) !== TOOLKIT_ARCHIVE_SHA256) {
    throw integrity("Toolkit archive hash does not match the pinned release.");
  }
  // The pinned archive holds exactly these files; readToolkit verifies them
  // each time they are loaded.
  const files = readToolkitTar(gunzipSync(archive));
  const parent = dirname(status.path);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, ".install-"));
  try {
    for (const name of Object.keys(TOOLKIT_FILES)) {
      const path = join(temporary, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, files.get(`package/${name}`)!);
    }
    try {
      await rename(temporary, status.path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      // A concurrent installer won the rename; its files must still verify.
      return { ...await toolkitStatus(stateDir), changed: false };
    }
    return {
      installed: true,
      version: TOOLKIT_VERSION,
      path: status.path,
      verified: true,
      changed: true,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
