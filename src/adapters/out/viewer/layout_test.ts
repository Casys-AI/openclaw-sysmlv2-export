import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Inference } from "../../../domain/model/inference.ts";
import { layoutView, type Scene } from "./layout.ts";
import { parseSnapshot } from "../../../infrastructure/snapshot-codec.ts";
import { drawing } from "../../../domain/model/tables.ts";
import { diagramViews } from "../../../domain/model/views.ts";

const read = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const snapshot = parseSnapshot(
  await read("../../../../test/golden/snapshot.json"),
);
const inference: Inference = await read(
  "../../../../test/fixtures/inference.json",
);

const overlaps = (a: Scene["nodes"][number], b: Scene["nodes"][number]) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

Deno.test("layout is deterministic, nests containers and never overlaps siblings", async () => {
  for (const v of diagramViews(snapshot, inference).map(drawing)) {
    if (!v.nodes.length) continue;
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

Deno.test("a Behaviour view with many procedures wraps them into rows", async () => {
  const [field] = inference.agents;
  // Thirteen procedures, each handing off to the same three parties.
  const procedures = Array.from({ length: 13 }, (_, i) => {
    const p = field.procedures[i % 2];
    return {
      ...p,
      id: `${p.id}-${i}`,
      steps: p.steps.map((s) => ({ ...s, id: `${s.id}-${i}` })),
    };
  });
  const view = drawing(
    diagramViews(snapshot, {
      ...inference,
      agents: [{ ...field, procedures }],
    }).find((v) => v.id === "behaviour:field")!,
  );
  const scene = await layoutView(view);
  assert.ok(scene.w < 1.5 * (16 / 9) * scene.h, `${scene.w} × ${scene.h}`);
  assert.deepEqual(
    scene.nodes.map((n) => n.id).sort(),
    view.nodes.map((n) => n.id).sort(),
  );
  const top = scene.nodes.filter((n) => !n.parent);
  for (const n of top) {
    for (const m of top) {
      assert.ok(m === n || !overlaps(n, m), `${n.id} overlaps ${m.id}`);
    }
  }
  assert.equal(scene.edges.length, view.edges.length);
  assert.ok(scene.edges.every((e) => e.pts.length > 0));
});

Deno.test("Scheduled tasks lays its cases out above the agents they wake, wider than tall", async () => {
  const view = drawing(
    diagramViews(snapshot, inference).find((v) => v.id === "schedules")!,
  );
  const scene = await layoutView(view);
  const at = new Map(scene.nodes.map((n) => [n.id, n]));
  const owners = scene.edges.filter((e) => e.kind === "owner");
  assert.ok(owners.length > 0);
  for (const e of owners) {
    assert.ok(at.get(e.s)!.y < at.get(e.t)!.y, e.id);
  }
  assert.ok(scene.w > 2 * scene.h, `${scene.w} × ${scene.h}`);
});
