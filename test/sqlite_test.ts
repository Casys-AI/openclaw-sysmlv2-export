import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { createFixture } from "./support/fixture.ts";
Deno.test("SQLite readOnly flag rejects writes and cannot create a missing database", async () => {
  const f = await createFixture();
  try {
    const db = new DatabaseSync(join(f.home, "state/openclaw.sqlite"), {
      readOnly: true,
    });
    try {
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM cron_jobs").get()!.n,
        10,
      );
      assert.throws(() => db.exec("CREATE TABLE forbidden (id TEXT)"));
    } finally {
      db.close();
    }
    const missing = join(f.home, "missing.sqlite");
    assert.throws(() => new DatabaseSync(missing, { readOnly: true }));
    await assert.rejects(() => access(missing));
  } finally {
    await f.cleanup();
  }
});
