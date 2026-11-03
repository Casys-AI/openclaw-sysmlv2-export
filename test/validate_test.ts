import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { ExportError } from "../src/error.ts";
import { type CompileDiagnostics, validate } from "../src/validate.ts";

const compiled: CompileDiagnostics = {
  errors: [],
  warnings: [{
    code: "TOOLKIT_WARNING",
    message: "Retained compile warning",
    file: "valid.sysml",
    line: 1,
    column: 1,
  }],
};

function fixture(mode: "hang" | "throw" | "exit", afterCompile = false) {
  const started = new SharedArrayBuffer(4);
  let exited = false;
  return {
    started,
    get exited() {
      return exited;
    },
    createWorker() {
      const worker = new Worker(
        new URL("./support/toolkit-hang.mjs", import.meta.url),
        {
          workerData: {
            started,
            mode,
            compiled: afterCompile ? compiled : undefined,
          },
        },
      );
      worker.once("exit", () => {
        exited = true;
      });
      return worker;
    },
  };
}

Deno.test("compile deadline terminates a worker stuck in WASM", async () => {
  const worker = fixture("hang");
  await assert.rejects(
    validate(new Map(), "unused", { timeoutMs: 1000, ...worker }),
    (e: unknown) => e instanceof ExportError && e.code === "TOOLKIT_TIMEOUT",
  );
  assert.equal(Atomics.load(new Int32Array(worker.started), 0), 1);
  assert.equal(worker.exited, true);
});

Deno.test("APE deadline preserves compilation and terminates its WASM hang", async () => {
  const worker = fixture("hang", true);
  const result = await validate(new Map(), "unused", {
    timeoutMs: 1000,
    apeTimeoutMs: 1100,
    ...worker,
  });
  assert.deepEqual(
    { errors: result.errors, warnings: result.warnings },
    compiled,
  );
  assert.equal(result.ape.status, "failed");
  assert.equal(result.ape.code, "APE_TIMEOUT");
  assert.equal(Atomics.load(new Int32Array(worker.started), 0), 1);
  assert.equal(worker.exited, true);
});

Deno.test("worker errors retain safe causes and preserve settled compilation", async () => {
  const before = fixture("throw");
  await assert.rejects(
    validate(new Map(), "unused", before),
    (e: unknown) => {
      assert.ok(e instanceof ExportError);
      assert.equal(e.code, "TOOLKIT_VALIDATION_FAILED");
      assert.match(e.context, /worker exploded/);
      assert.doesNotMatch(
        e.context,
        /\/private\/|urn:secret|private-graph-value/,
      );
      assert.ok(e.cause instanceof Error);
      assert.match(e.cause.message, /\/private\/secret\/model.sysml/);
      return true;
    },
  );
  const after = await validate(new Map(), "unused", fixture("throw", true));
  assert.deepEqual(
    { errors: after.errors, warnings: after.warnings },
    compiled,
  );
  assert.equal(after.ape.code, "APE_WORKER_FAILED");
  assert.match(after.ape.cause!, /worker exploded/);
  assert.doesNotMatch(
    JSON.stringify(after.ape),
    /\/private\/|urn:secret|private-graph-value/,
  );
});

Deno.test("worker exit before compilation rejects, after compilation fails only APE", async () => {
  await assert.rejects(
    validate(new Map(), "unused", fixture("exit")),
    (e: unknown) =>
      e instanceof ExportError && e.code === "TOOLKIT_VALIDATION_FAILED",
  );
  const result = await validate(new Map(), "unused", fixture("exit", true));
  assert.deepEqual(
    { errors: result.errors, warnings: result.warnings },
    compiled,
  );
  assert.equal(result.ape.status, "failed");
  assert.equal(result.ape.code, "APE_WORKER_FAILED");
});
