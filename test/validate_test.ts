import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { ExportError } from "../src/error.ts";
import { validate } from "../src/validate.ts";

Deno.test("deadline terminates a worker stuck in WASM before rejecting", async () => {
  const started = new SharedArrayBuffer(4);
  let exited = false;
  await assert.rejects(
    validate(new Map(), "unused", {
      timeoutMs: 1000,
      createWorker() {
        const worker = new Worker(
          new URL("./support/toolkit-hang.mjs", import.meta.url),
          { workerData: started },
        );
        worker.once("exit", () => {
          exited = true;
        });
        return worker;
      },
    }),
    (e: unknown) => e instanceof ExportError && e.code === "TOOLKIT_TIMEOUT",
  );
  assert.equal(Atomics.load(new Int32Array(started), 0), 1);
  assert.equal(exited, true);
});
