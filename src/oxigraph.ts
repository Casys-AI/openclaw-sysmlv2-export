import { readFile } from "node:fs/promises";
import { initSync } from "oxigraph/web";

export * from "oxigraph/web";

/** The source and bundled worker share the same pinned, packaged WASM bytes. */
export async function initOxigraph(
  input: Uint8Array | string | URL = import.meta.url.endsWith(".ts")
    ? new URL("web_bg.wasm", import.meta.resolve("oxigraph/web"))
    : new URL("./oxigraph_bg.wasm", import.meta.url),
): Promise<void> {
  const bytes = input instanceof Uint8Array ? input : await readFile(input);
  initSync({ module: bytes });
}
