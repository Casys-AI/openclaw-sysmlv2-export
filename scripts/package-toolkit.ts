/** Writes `plugin/toolkit/` from the pinned Toolkit release archive that
 * SYSML_TOOLKIT_WASM_ARCHIVE names. The build never downloads it: fetch the URL
 * in `src/adapters/sysml-toolkit-pin.ts` and the archive hash is checked here. */
import { fileURLToPath } from "node:url";
import { extractToolkit } from "../src/adapters/out/sysml-toolkit/extract.ts";
import { TOOLKIT_VERSION } from "../src/adapters/sysml-toolkit-pin.ts";
import { ExportError } from "../src/infrastructure/error.ts";

try {
  await extractToolkit(
    Deno.env.get("SYSML_TOOLKIT_WASM_ARCHIVE"),
    fileURLToPath(new URL("../plugin/toolkit/", import.meta.url)),
  );
  console.log(`Packaged Toolkit ${TOOLKIT_VERSION} into plugin/toolkit`);
} catch (error) {
  if (!(error instanceof ExportError)) throw error;
  console.error(JSON.stringify(error.toJSON(), null, 2));
  Deno.exitCode = 1;
}
