import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

type FixtureValue = string | number | null;

interface CronFixture {
  table: string;
  columns: string[];
  rows: Record<string, FixtureValue>[];
}

const source = fileURLToPath(
  new URL("../fixtures/openclaw-2026.6.10-anon/", import.meta.url),
);

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Copy the text fixture and materialize its SQLite state in an owned temp dir. */
export async function createFixture(
  options: { git?: boolean; backups?: number } = {},
): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const backups = options.backups ?? 0;
  if (!Number.isSafeInteger(backups) || backups < 0) {
    throw new RangeError("backups must be a non-negative safe integer");
  }

  const home = await mkdtemp(join(tmpdir(), "openclaw-export-fixture-"));
  const cleanup = () => rm(home, { recursive: true, force: true });
  try {
    await cp(source, home, { recursive: true });
    const fixture: CronFixture = JSON.parse(
      await readFile(join(home, "state", "cron_jobs.json"), "utf8"),
    );
    const database = new DatabaseSync(join(home, "state", "openclaw.sqlite"));
    try {
      // The JSON lists the real column subset. Infer affinity from all rows;
      // entirely null columns are text, preserving their null values below.
      const definitions = fixture.columns.map((column) => {
        const values = fixture.rows.map((row) => row[column]).filter((value) =>
          value !== null && value !== undefined
        );
        const numeric = values.length > 0 &&
          values.every((value) => typeof value === "number");
        const affinity = numeric
          ? values.every((value) => Number.isInteger(value))
            ? "INTEGER"
            : "REAL"
          : "TEXT";
        return `${identifier(column)} ${affinity}`;
      });
      database.exec(
        `CREATE TABLE ${identifier(fixture.table)} (${definitions.join(", ")})`,
      );
      const insert = database.prepare(
        `INSERT INTO ${identifier(fixture.table)} (${
          fixture.columns.map(identifier).join(", ")
        }) VALUES (${fixture.columns.map(() => "?").join(", ")})`,
      );
      for (const row of fixture.rows) {
        insert.run(...fixture.columns.map((column) => row[column] ?? null));
      }
    } finally {
      database.close();
    }

    if (options.git) await mkdir(join(home, "workspace", ".git"));
    for (let index = 1; index <= backups; index++) {
      await cp(
        join(home, "openclaw.json"),
        join(home, `openclaw.json.backup-${index}`),
      );
    }
    return { home, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
