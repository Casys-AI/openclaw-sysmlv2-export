import assert from "node:assert/strict";
import { viewerPage } from "../src/viewer.ts";

Deno.test("viewer data can neither close its script nor open a comment", () => {
  const text = "doc /* </script><script>alert(1)</script><!-- */";
  const page = viewerPage([{
    entry: {
      id: "2026-11-02T10-15-00Z",
      createdAt: "2026-11-02T10:15:00.000Z",
      agents: 1,
      inferred: null,
    },
    files: { "OpenClawInstance.sysml": text },
  }]);
  assert.equal(page.match(/<\/script>/g)?.length, 2);
  assert.ok(!page.includes("<!--"));
  const json = page.match(
    /<script id="data" type="application\/json">(.*?)<\/script>/s,
  )![1];
  assert.equal(JSON.parse(json).texts[0], text);
});
