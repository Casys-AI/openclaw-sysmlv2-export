import { INFERRED_FILE, INSTANCE_FILE } from "../model/views.ts";

/** The files of a version by what they are, in the order the Changes tab
 * shows them: the model of the instance, the inferred behaviour, the library
 * the model imports, the data the model is built from, the diagnostics. */
const FILE_GROUPS = [
  "instance",
  "inferred",
  "library",
  "data",
  "diagnostics",
] as const;
export type FileGroup = typeof FILE_GROUPS[number];

const DIAGNOSTICS = new Set([
  "findings.json",
  "validation.json",
  "ape-report.ttl",
]);

function fileGroup(file: string): FileGroup {
  return file === INSTANCE_FILE
    ? "instance"
    : file === INFERRED_FILE
    ? "inferred"
    : file.endsWith(".sysml")
    ? "library"
    : DIAGNOSTICS.has(file)
    ? "diagnostics"
    : "data";
}

/** Some files grouped, empty groups left out. */
export function groupFiles(
  files: string[],
): { group: FileGroup; files: string[] }[] {
  return FILE_GROUPS.map((group) => ({
    group,
    files: files.filter((f) => fileGroup(f) === group).sort(),
  })).filter((g) => g.files.length);
}
