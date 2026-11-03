import { ExportError } from "../../../domain/primitives/error.ts";
import { json } from "../../../domain/primitives/input.ts";
import type { Snapshot } from "../../../domain/model/snapshot.ts";
import type { Change } from "../../../domain/model/diff.ts";
export interface CliDependencies {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(
    path: string,
    data: string,
    options: { flag: string; mode: number },
  ): Promise<unknown>;
  mkdir(path: string): Promise<unknown>;
  join(...parts: string[]): string;
  collect(home: string, plugins: unknown): Promise<Snapshot>;
  diagnose(directory: string, stateDir: string): Promise<unknown>;
  diff(a: Snapshot, b: Snapshot): Change[];
  emit(snapshot: Snapshot): Map<string, string>;
  ASSEMBLY_LIBRARY: ReadonlyMap<string, string>;
  canonical(value: unknown): string;
  parseSnapshot(value: unknown): Snapshot;
}
export function createCli(
  {
    readFile,
    writeFile,
    mkdir,
    join,
    collect,
    diagnose,
    diff,
    emit,
    ASSEMBLY_LIBRARY,
    canonical,
    parseSnapshot,
  }: CliDependencies,
) {
  async function run(args: string[]): Promise<unknown> {
    const [command, ...rest] = args;
    const usage = () => {
      throw new ExportError(
        "CLI_USAGE",
        "Invalid command or arguments",
        "Use collect --home DIR [--plugins FILE] --out FILE; export --snapshot FILE --out DIR; diagnose --export DIR --state-dir DIR; diff A B.",
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
    if (command === "diagnose") {
      const f = flags(["--export", "--state-dir"]);
      return await diagnose(f["--export"], f["--state-dir"]);
    }
    if (command === "diff") {
      if (rest.length !== 2 || rest.some((x) => x.startsWith("--"))) {
        return usage();
      }
      return diff(await snapshot(rest[0]), await snapshot(rest[1]));
    }
    return usage();
  }
  async function main(args: string[]): Promise<number> {
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

  return { run, main };
}
