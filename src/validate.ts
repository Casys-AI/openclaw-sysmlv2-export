import { ExportError } from "./error.ts";
export interface Diagnostics {
  errors: { code: string; context: string; recovery: string }[];
  warnings: string[];
}
const COMPILER =
  "apps/live-builder/src/adapters/out/sysml-toolkit/compilation/compiler.ts";

/** Explicit step; emit never invokes it. Compiles exactly the given files: an
 * export directory carries the Assembly library (ASSEMBLY_LIBRARY) beside its
 * own SysML. The compiler is Assembly's, from the checkout in ASSEMBLY_DIR. */
export async function validate(
  files: Map<string, string>,
): Promise<Diagnostics> {
  const packageDir = Deno.env.get("SYSML_TOOLKIT_DIR");
  const assemblyDir = Deno.env.get("ASSEMBLY_DIR");
  if (!packageDir || !assemblyDir) {
    throw new ExportError(
      "TOOLKIT_UNAVAILABLE",
      "SYSML_TOOLKIT_DIR or ASSEMBLY_DIR is not set",
      "Point ASSEMBLY_DIR at an Assembly checkout and SYSML_TOOLKIT_DIR at its pinned Toolkit package, then run test:toolkit.",
    );
  }
  const { ToolkitCompiler } = await import(
    new URL(COMPILER, `file://${assemblyDir.replace(/\/?$/, "/")}`).href
  ).catch(() => {
    throw new ExportError(
      "TOOLKIT_UNAVAILABLE",
      "The Assembly Toolkit compiler was not found under ASSEMBLY_DIR",
      "Point ASSEMBLY_DIR at the root of an Assembly checkout.",
    );
  });
  try {
    await new ToolkitCompiler({ packageDir, timeoutMs: 60000 }).compile(
      Object.fromEntries(files),
    );
    return { errors: [], warnings: [] };
  } catch {
    return {
      errors: [{
        code: "TOOLKIT_VALIDATION_FAILED",
        context: "The pinned Toolkit could not compile the exported sources",
        recovery:
          "Check Toolkit installation and the emitted source files locally; native/compiler messages are not echoed to avoid exposing source input.",
      }],
      warnings: [],
    };
  }
}
