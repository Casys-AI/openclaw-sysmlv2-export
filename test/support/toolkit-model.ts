import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { readToolkit } from "../../src/adapters/out/sysml-toolkit/bundled.ts";
import type { ElementSession } from "../../src/application/model/diagnostics/ports/out/toolkit-elements.port.ts";

/** Test-only access to the same pinned, fully checked compiler session as runtime. */
export async function withToolkitModel<T>(
  toolkit: string,
  sources: Map<string, string>,
  inspect: (session: ElementSession) => T | Promise<T>,
): Promise<T> {
  const files = await readToolkit(toolkit);
  const module = await import(
    `data:text/javascript;base64,${
      Buffer.from(files.get("sysmlv2.js")!).toString("base64")
    }`
  );
  module.initSync({ module: files.get("sysmlv2_bg.wasm")! });
  const expand = (name: string) =>
    gunzipSync(files.get(`stdlib/sysml-library.${name}.gz`)!);
  const library = module.PreparedLibrary.fromSnapshot(
    expand("prepared"),
    expand("json").toString("utf8"),
    expand("libcache"),
  );
  try {
    const session = module.Session.fromSourcesWithPreparedLibrary(
      JSON.stringify(
        [...sources].sort(([a], [b]) => a.localeCompare(b)).map((
          [name, text],
        ) => ({ name, text })),
      ),
      library,
    );
    try {
      const diagnostics = JSON.parse(session.check());
      if (
        diagnostics.some((d: { severity: string }) => d.severity === "error")
      ) {
        throw new Error(
          `Toolkit model has errors: ${JSON.stringify(diagnostics)}`,
        );
      }
      return await inspect(session);
    } finally {
      session.free();
    }
  } finally {
    library.free();
  }
}
