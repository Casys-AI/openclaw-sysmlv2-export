import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ExportError } from "../../../infrastructure/error.ts";
import type { VersionEntry } from "../../../domain/export/versions.ts";

/** versions.json lists the runs kept in outDir; none before the first run. */
export async function readVersions(outDir: string): Promise<VersionEntry[]> {
  try {
    return JSON.parse(await readFile(join(outDir, "versions.json"), "utf8"));
  } catch (e) {
    if ((e as { code?: unknown }).code === "ENOENT") return [];
    throw e;
  }
}

/** A kept version's inference.json, parsed; null when absent or unreadable. */
export async function readInference(dir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, "inference.json"), "utf8"));
  } catch {
    return null;
  }
}

/** A kept version's exported files by name (other files, such as a .DS_Store
 * left by a file browser, are not part of it). */
export async function versionFiles(
  dir: string,
): Promise<Record<string, string>> {
  const names = await readdir(dir).catch((e) => {
    throw e?.code === "ENOENT"
      ? new ExportError(
        "EXPORT_VERSION_MISSING",
        "versions.json lists a version whose directory is gone",
        "Restore the directory or remove its entry from versions.json.",
      )
      : e;
  });
  return Object.fromEntries(
    await Promise.all(
      names.filter((n) => n === "ape-report.ttl" || /\.(sysml|json)$/.test(n))
        .map(async (n) => [
          n,
          await readFile(join(dir, n), "utf8"),
        ]),
    ),
  );
}

export const exportFiles = {
  join,
  mkdir,
  writeFile,
  readVersions,
  readInference,
  versionFiles,
};
