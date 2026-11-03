import { structuredPatch } from "diff";
import type { FileChange } from "../../../domain/model/presentation.ts";
/** Files that differ between two versions, with their unified diff. */
export function changes(
  older: Record<string, string>,
  newer: Record<string, string>,
): FileChange[] {
  const names = [...new Set([...Object.keys(older), ...Object.keys(newer)])]
    .sort().filter((n) => older[n] !== newer[n]);
  return names.map((file) => ({
    file,
    status: !Object.hasOwn(older, file)
      ? "added"
      : !Object.hasOwn(newer, file)
      ? "removed"
      : "changed",
    hunks: structuredPatch(file, file, older[file] ?? "", newer[file] ?? "")
      .hunks.map((h) => ({
        header:
          `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
        lines: h.lines,
      })),
  }));
}
