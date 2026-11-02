import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emit } from "../src/emit.ts";
import { canonical, parseSnapshot, type Snapshot } from "../src/snapshot.ts";
import { viewerPage, type ViewerVersion } from "../src/viewer.ts";

const snapshot: Snapshot = parseSnapshot(
  JSON.parse(
    await readFile(new URL("./golden/snapshot.json", import.meta.url), "utf8"),
  ),
);
const version = (id: string, s: Snapshot): ViewerVersion => ({
  entry: {
    id,
    createdAt: `${id.slice(0, 13)}:${id.slice(14, 16)}:00.000Z`,
    agents: s.agents.length,
    inferred: null,
  },
  files: Object.fromEntries([["snapshot.json", canonical(s)], ...emit(s)]),
});
const dataOf = (page: string) =>
  JSON.parse(
    page.match(
      /<script id="data" type="application\/json">(.*?)<\/script>/s,
    )![1],
  );

/** A version's entry for a view, in the page data. */
// deno-lint-ignore no-explicit-any
const viewOf = (data: any, version: any, id: string) =>
  version.views.find((e: { view: number }) => data.views[e.view].id === id);

Deno.test("viewer data can neither close its script nor open a comment", async () => {
  const text = "doc /* </script><script>alert(1)</script><!-- */";
  const hostile = structuredClone(snapshot);
  hostile.agents[0].name = "</script><svg onload=alert(1)>";
  const v = version("2026-11-02T10-15-00Z", hostile);
  v.files["notes.sysml"] = text;
  const page = await viewerPage([v]);
  assert.equal(page.match(/<\/script>/g)?.length, 2);
  assert.ok(!page.includes("<!--") && !page.includes("<svg onload"));
  const data = dataOf(page);
  assert.ok(data.texts.includes(text));
  const system = data.views[viewOf(data, data.versions[0], "system").view];
  assert.match(
    JSON.stringify(system.scene),
    /displayName = \\"<\/script><svg onload=alert\(1\)>\\"/,
  );
});

Deno.test("the same versions give the same page", async () => {
  const versions = [version("2026-11-02T10-15-00Z", snapshot)];
  assert.equal(await viewerPage(versions), await viewerPage(versions));
});

Deno.test("an element added since the previous version is highlighted", async () => {
  const next = structuredClone(snapshot);
  next.agents.find((a) => a.id === "coach")!.grants.push({
    id: "sandbox:cron",
    tool: "cron",
    layer: "sandbox",
  });
  next.accounts.push({
    id: "telegram:coach",
    channel: "telegram",
    accountId: "coach",
    enabled: true,
    dmPolicy: "pairing",
    groupPolicy: "allowlist",
  });
  next.bindings.push({
    id: "binding-new",
    agentId: "coach",
    account: "telegram:coach",
    peerKind: null,
  });
  const data = dataOf(
    await viewerPage([
      version("2026-11-02T10-20-00Z", next),
      version("2026-11-02T10-15-00Z", snapshot),
    ]),
  );
  const [latest, first] = data.versions;
  const delta = viewOf(data, latest, "system").delta;
  assert.deepEqual(delta.added, [
    "account:telegram:coach",
    "binding:binding-new",
  ]);
  // Coach's block lists its tools, cron now among them.
  assert.deepEqual([delta.changed, delta.removed, delta.isNew], [
    ["agent:coach"],
    [],
    false,
  ]);
  assert.equal(first.views[0].delta, null);
  // The new element's SysML is located in its own version's text.
  const system = data.views[viewOf(data, latest, "system").view];
  const [file, from] = system.elements["account:telegram:coach"].s[0];
  assert.match(
    data.texts[latest.files[file]].split("\n")[from - 1],
    /part 'account_telegram:coach' : ChannelAccount \{/,
  );
  // In the Tools matrix, the new grant is a new cell of a changed row.
  const tools = viewOf(data, latest, "tools");
  assert.deepEqual(
    [tools.delta.added, tools.delta.changed],
    [["grant:coach:cron"], ["agent:coach", "tool:cron"]],
  );
  const { table } = data.views[tools.view];
  const cell = table.cells.find((c: unknown[]) => c[3] === "grant:coach:cron");
  assert.deepEqual(
    [table.rows[cell[0]].id, table.columns[cell[1]].id, cell[2]],
    ["tool:cron", "agent:coach", "s"],
  );
});

Deno.test("a version whose snapshot this viewer cannot read keeps its files", async () => {
  const old = version("2026-11-02T10-15-00Z", snapshot);
  old.files["snapshot.json"] = JSON.stringify({
    schema: "openclaw-snapshot/4",
  });
  const data = dataOf(await viewerPage([old]));
  assert.equal(data.versions[0].views, null);
  assert.ok(data.versions[0].files["OpenClawInstance.sysml"] >= 0);
});
