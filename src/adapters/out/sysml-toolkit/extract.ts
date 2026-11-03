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
  if (
    createHash("sha256").update(bytes).digest("hex") !== TOOLKIT_ARCHIVE_SHA256
  ) {
    throw new ExportError(
      "TOOLKIT_INTEGRITY",
      "The Toolkit archive does not match the pinned release.",
      `Download ${TOOLKIT_URL} again and check it against ${TOOLKIT_ARCHIVE_SHA256}.`,
    );
  }
  const files = readToolkitTar(gunzipSync(bytes));
  await rm(directory, { recursive: true, force: true });
  for (const name of Object.keys(TOOLKIT_FILES)) {
    const path = join(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, files.get(`package/${name}`)!);
  }
  await readToolkit(directory);
}
