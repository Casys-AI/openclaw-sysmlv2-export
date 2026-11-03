import { parentPort, workerData } from "node:worker_threads";
import { exit } from "node:process";

if (workerData.compiled) {
  parentPort.postMessage({
    phase: "compiled",
    diagnostics: workerData.compiled,
  });
  await new Promise((resolve) => parentPort.once("message", resolve));
}
if (workerData.mode === "throw") {
  throw new Error(
    'worker exploded at /private/secret/model.sysml:4\n<urn:secret> <urn:p> "private-graph-value" .',
  );
}
if (workerData.mode === "exit") {
  exit(0);
} else {
  // A real synchronous WASM loop cannot observe a JS cancellation message.
  const module = new WebAssembly.Module(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      4,
      1,
      96,
      0,
      0,
      3,
      2,
      1,
      0,
      7,
      7,
      1,
      3,
      114,
      117,
      110,
      0,
      0,
      10,
      9,
      1,
      7,
      0,
      3,
      64,
      12,
      0,
      11,
      11,
    ]),
  );
  Atomics.store(new Int32Array(workerData.started), 0, 1);
  new WebAssembly.Instance(module).exports.run();
}
