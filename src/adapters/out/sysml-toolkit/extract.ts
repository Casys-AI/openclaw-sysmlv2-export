import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { ExportError } from "../../../infrastructure/error.ts";
import {
  TOOLKIT_ARCHIVE_SHA256,
  TOOLKIT_FILES,
  TOOLKIT_URL,
} from "../../sysml-toolkit-pin.ts";
import { readToolkit } from "./bundled.ts";
import { readToolkitTar } from "./tar.ts";

/** Only independently pinned regular-file contents can become filesystem paths. */
export function unpackToolkitArchive(
  bytes: Uint8Array,
): Map<string, Uint8Array> {
  if (
    createHash("sha256").update(bytes).digest("hex") !== TOOLKIT_ARCHIVE_SHA256
  ) {
    throw new ExportError(
      "TOOLKIT_INTEGRITY",
      "The Toolkit archive does not match the pinned release.",
      `Download ${TOOLKIT_URL} again and check it against ${TOOLKIT_ARCHIVE_SHA256}.`,
    );
  }
  const entries = readToolkitTar(
    gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }),
  );
  const files = new Map<string, Uint8Array>();
  for (const [name, hash] of Object.entries(TOOLKIT_FILES)) {
    const contents = entries.get(`package/${name}`);
    if (
      !contents || createHash("sha256").update(contents).digest("hex") !== hash
    ) {
      throw new ExportError(
        "TOOLKIT_INTEGRITY",
        `The Toolkit archive has a missing or modified pinned file: ${name}`,
        `Download ${TOOLKIT_URL} again.`,
      );
    }
    files.set(name, contents);
  }
  return files;
}

/** Replaces `directory` with exactly the pinned Toolkit files of the pinned
 * release archive: the archive hash is checked before anything is unpacked,
 * and each written file against its own pin. Build and test time only. */
export async function extractToolkit(
  archive: string | undefined,
  directory: string,
): Promise<void> {
  const bytes = archive ? await readFile(archive).catch(() => null) : null;
  if (!bytes) {
    throw new ExportError(
      "TOOLKIT_ARCHIVE_MISSING",
      "The pinned Toolkit archive is not set or cannot be read.",
      `Download ${TOOLKIT_URL} and set SYSML_TOOLKIT_WASM_ARCHIVE to its path.`,
    );
  }
  const files = unpackToolkitArchive(bytes);
  await rm(directory, { recursive: true, force: true });
  for (const name of Object.keys(TOOLKIT_FILES)) {
    const path = join(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, files.get(name)!);
  }
  await readToolkit(directory);
}
