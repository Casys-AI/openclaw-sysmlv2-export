import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Inference } from "../src/infer.ts";
import { layoutView, type Scene } from "../src/layout.ts";
import { parseSnapshot } from "../src/snapshot.ts";
import { diagramViews } from "../src/views.ts";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const snapshot = parseSnapshot(await read("./golden/snapshot.json"));
const inference: Inference = await read("./fixtures/inference.json");

const overlaps = (a: Scene["nodes"][number], b: Scene["nodes"][number]) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

Deno.test("layout is deterministic, nests containers and never overlaps siblings", async () => {
  for (const v of diagramViews(snapshot, inference)) {
    const scene = await layoutView(v);
    assert.deepEqual(scene, await layoutView(v), v.id);
    assert.equal(scene.nodes.length, v.nodes.length);
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    for (const n of scene.nodes) {
      const parent = n.parent ? byId.get(n.parent)! : null;
      if (parent) {
        assert.ok(
          n.x >= parent.x && n.y >= parent.y &&
            n.x + n.w <= parent.x + parent.w &&
            n.y + n.h <= parent.y + parent.h,
          `${v.id}: ${n.id} outside ${parent.id}`,
        );
      }
      for (const m of scene.nodes) {
        if (m !== n && m.parent === n.parent) {
          assert.ok(!overlaps(n, m), `${v.id}: ${n.id} overlaps ${m.id}`);
        }
      }
    }
    for (const e of scene.edges) {
      assert.ok(e.pts.length > 0, `${v.id}: ${e.id}`);
    }
  }
});

Deno.test("a Behaviour view with many rules stays wider than tall", async () => {
  const [field] = inference.agents;
  const rules = Array.from({ length: 40 }, (_, i) => ({
    ...field.rules[0],
    id: `rule-${i}`,
  }));
  const view = diagramViews(snapshot, {
    ...inference,
    agents: [{ ...field, rules }],
  }).find((v) => v.id === "behaviour:field")!;
  const scene = await layoutView(view);
  assert.ok(scene.w > scene.h, `${scene.w} × ${scene.h}`);
});
