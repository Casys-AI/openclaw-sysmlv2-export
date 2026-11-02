/** Regenerate fixture goldens for review: deno run --allow-read --allow-write test/update-golden.ts */
import { mkdir, writeFile } from "node:fs/promises";
import { collect } from "../src/collect.ts";
import { doctor } from "../src/doctor.ts";
import { emit } from "../src/emit.ts";
import { canonical } from "../src/snapshot.ts";
import { createFixture } from "./support/fixture.ts";

const fixture = await createFixture({ git: true, backups: 2 });
try {
  const snapshot = await collect(fixture.home, fixture.plugins);
  const outputs = new Map([
    ["snapshot.json", canonical(snapshot)],
    ...emit(snapshot),
    ["findings.json", canonical(doctor(snapshot))],
  ]);
  const directory = new URL("./golden/", import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const [name, content] of outputs) {
    await writeFile(new URL(name, directory), content);
  }
} finally {
  await fixture.cleanup();
}
