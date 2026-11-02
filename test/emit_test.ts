import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";
import { collect } from "../src/collect.ts";
import { doctor } from "../src/doctor.ts";
import { emit } from "../src/emit.ts";
import { canonical } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

Deno.test("fixture output is deterministic, sanitized, and matches reviewed goldens", async () => {
  const fixture = await createFixture({ git: true, backups: 2 });
  try {
    const snapshot = await collect(fixture.home, fixture.plugins);
    const files = emit(snapshot);
    const repeated = await collect(fixture.home, fixture.plugins);
    assert.equal(canonical(snapshot), canonical(repeated));
    assert.deepEqual([...files], [...emit(repeated)]);

    const outputs = new Map([
      ["snapshot.json", canonical(snapshot)],
      ...files,
      ["findings.json", canonical(doctor(snapshot))],
    ]);
    assert.deepEqual([...outputs.keys()].sort(), [
      "OpenClawImport.sysml",
      "OpenClawInstance.sysml",
      "findings.json",
      "snapshot.json",
    ]);
    for (const [name, output] of outputs) {
      assert.doesNotMatch(output, /CANARY-/);
      assert.doesNotMatch(output, EMAIL_ADDRESS_PATTERN.pattern);
      assert.doesNotMatch(output, JWT_PATTERN.pattern);
      assert.equal(
        output,
        await readFile(new URL(`./golden/${name}`, import.meta.url), "utf8"),
        name,
      );
    }
    const instance = files.get("OpenClawInstance.sysml")!;
    assert.doesNotMatch(
      instance,
      /lastRun|consecutiveErrors|hasLastError|createdAt/i,
    );
    const changed = structuredClone(snapshot);
    for (const job of changed.cron) {
      job.runtime = {
        lastRunStatus: "runtime-only-marker",
        lastRunAtMs: 123456789,
        consecutiveErrors: 99,
        hasLastError: true,
        createdAtMs: 987654321,
      };
    }
    assert.deepEqual([...files], [...emit(changed)]);
  } finally {
    await fixture.cleanup();
  }
});
