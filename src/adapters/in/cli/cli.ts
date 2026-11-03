import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collect } from "./src/collect.ts";
import { doctor } from "./src/doctor.ts";
import { diff } from "./src/diff.ts";
import { emit } from "./src/emit.ts";
import { ExportError } from "./src/error.ts";
import { json } from "./src/input.ts";
import { ASSEMBLY_LIBRARY } from "./src/library.ts";
import { canonical, parseSnapshot } from "./src/snapshot.ts";
export async function run(args: string[]): Promise<unknown> {
  const [command, ...rest] = args;
  const usage = () => {
    throw new ExportError(
      "CLI_USAGE",
      "Invalid command or arguments",
      "Use collect --home DIR [--plugins FILE] --out FILE; export --snapshot FILE --out DIR; doctor --snapshot FILE; diff A B.",
    );
  };
  const flags = (expected: string[], optional: string[] = []) => {
    if (rest.length % 2) return usage();
    const values: Record<string, string> = {};
    for (let i = 0; i < rest.length; i += 2) {
      if (
        ![...expected, ...optional].includes(rest[i]) ||
        Object.hasOwn(values, rest[i]) || !rest[i + 1] ||
        rest[i + 1].startsWith("--")
      ) return usage();
      values[rest[i]] = rest[i + 1];
    }
    if (!expected.every((k) => Object.hasOwn(values, k))) return usage();
    return values;
  };
  const snapshot = async (path: string) =>
    parseSnapshot(json(await readFile(path, "utf8")));
  if (command === "collect") {
    // --plugins: the output of `openclaw plugins list --json`.
    const f = flags(["--home", "--out"], ["--plugins"]);
    const s = await collect(
      f["--home"],
      Object.hasOwn(f, "--plugins")
        ? json(await readFile(f["--plugins"], "utf8"))
        : null,
    );
    await writeFile(f["--out"], canonical(s), { flag: "wx", mode: 0o600 });
    return {
      schema: s.schema,
      agents: s.agents.length,
      cronJobs: s.cron.length,
    };
  }
  if (command === "export") {
    const f = flags(["--snapshot", "--out"]),
      files = new Map([
        ...emit(await snapshot(f["--snapshot"])),
        ...ASSEMBLY_LIBRARY,
      ]);
    await mkdir(f["--out"]);
    for (const [path, text] of files) {
      await writeFile(join(f["--out"], path), text, {
        flag: "wx",
        mode: 0o600,
      });
    }
    return { files: [...files.keys()] };
  }
  if (command === "doctor") {
    const f = flags(["--snapshot"]);
    return doctor(await snapshot(f["--snapshot"]));
  }
  if (command === "diff") {
    if (rest.length !== 2 || rest.some((x) => x.startsWith("--"))) {
      return usage();
    }
    return diff(await snapshot(rest[0]), await snapshot(rest[1]));
  }
  return usage();
}
export async function main(args: string[]): Promise<number> {
  try {
    console.log(canonical(await run(args)).trimEnd());
    return 0;
  } catch (e) {
    const error = e instanceof ExportError ? e : new ExportError(
      "CLI_IO_ERROR",
      "Cannot read or create the requested files",
      "Check permissions and use a new output path; existing files are never overwritten.",
    );
    console.log(canonical(error.toJSON()).trimEnd());
    return 1;
  }
}
if (import.meta.main) Deno.exitCode = await main(Deno.args);
