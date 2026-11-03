import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { ApeFinding } from "../../src/adapters/out/shacl/diagnostics.ts";
import { compareFindings } from "../../src/domain/model/diagnostics/findings.ts";
import { emit } from "../../src/adapters/out/sysml/emitter.ts";
import { type Inference } from "../../src/domain/model/inference.ts";
import { emitInferred } from "../../src/adapters/out/sysml/inferred.ts";
import { type Snapshot } from "../../src/domain/model/snapshot.ts";
import { canonical } from "../../src/infrastructure/canonical-json.ts";
import { parseSnapshot } from "../../src/infrastructure/snapshot-codec.ts";
import {
  viewerPage,
  type ViewerVersion,
} from "../../src/composition/viewer.ts";

const snapshot: Snapshot = parseSnapshot(
  JSON.parse(
    await readFile(new URL("../golden/snapshot.json", import.meta.url), "utf8"),
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

Deno.test("viewer uses persisted findings and falls back to collector notes when absent", async () => {
  const previous = version("2026-11-02T10-15-00Z", snapshot);
  const current = version("2026-11-02T10-20-00Z", snapshot);
  const persisted = [{
    code: "TEST",
    severity: "warning",
    subject: "instance",
    context: "Stored.",
    recovery: "Review.",
  }];
  current.files["findings.json"] = canonical(persisted);
  const data = dataOf(await viewerPage([current, previous]));
  assert.deepEqual(
    data.versions.map((v: { findings: unknown }) => v.findings),
    [persisted, [...snapshot.ambiguities].sort(compareFindings)],
  );
});

Deno.test("each version merges its stored APE findings, even without a readable snapshot", async () => {
  const ape = (
    subject: string,
    finding: ApeFinding["finding"] = "absent",
  ): ApeFinding => ({
    code: "APE_UNREACHABLE_OPERATOR",
    severity: "warning",
    subject,
    context: "Synthetic persisted structural finding.",
    recovery: "Review the modeled entry.",
    pattern: "4.2",
    finding,
  });
  const current = version("2026-11-02T10-25-00Z", snapshot);
  const previous = version("2026-11-02T10-20-00Z", snapshot);
  const legacy = version("2026-11-02T10-15-00Z", snapshot);
  const currentApe = [ape("agent:z"), ape("agent:a")];
  const previousApe = [ape("agent:previous")];
  const legacyApe = [ape("agent:legacy", "indeterminate")];
  current.files["findings.json"] = canonical([
    ...currentApe,
    {
      code: "TEST",
      severity: "info",
      subject: "instance",
      context: "Persisted context.",
      recovery: "Review.",
    },
  ]);
  previous.files["findings.json"] = canonical(previousApe);
  legacy.files["snapshot.json"] = '{"schema":"openclaw-snapshot/4"}';
  legacy.files["findings.json"] = canonical(legacyApe);
  const data = dataOf(await viewerPage([current, previous, legacy]));
  assert.deepEqual(
    data.versions.map((v: { findings: ApeFinding[] }) =>
      v.findings.filter((row) => row.code.startsWith("APE_"))
    ),
    [
      [...currentApe].reverse(),
      previousApe,
      legacyApe,
    ],
  );
  assert.equal(
    data.versions[0].findings.find((f: { code: string }) => f.code === "TEST")
      .context,
    "Persisted context.",
  );
  for (const v of data.versions.slice(0, 2)) {
    const keys = v.findings.map((row: ApeFinding) =>
      `${row.code}:${row.subject}`
    );
    assert.deepEqual(keys, [...keys].sort());
  }
  assert.equal(data.versions[2].views, null);
});

Deno.test("unreadable findings remain local to their version", async () => {
  const good = version("2026-11-02T10-25-00Z", snapshot);
  const bad = version("2026-11-02T10-20-00Z", snapshot);
  const legacy = version("2026-11-02T10-15-00Z", snapshot);
  const ape: ApeFinding = {
    code: "APE_UNREACHABLE_OPERATOR",
    severity: "warning",
    subject: "agent:good",
    context: "Synthetic persisted structural finding.",
    recovery: "Review the modeled entry.",
    pattern: "4.2",
    finding: "absent",
  };
  good.files["findings.json"] = canonical([ape]);
  legacy.files["snapshot.json"] = '{"schema":"openclaw-snapshot/4"}';
  legacy.files["findings.json"] = canonical([{
    ...ape,
    subject: "agent:legacy",
  }]);
  for (
    const text of [
      "invalid JSON with private parser input",
      "{}",
      '[{"code":"APE_UNREACHABLE_OPERATOR","severity":"high"}]',
    ]
  ) {
    bad.files["findings.json"] = text;
    const data = dataOf(await viewerPage([good, bad, legacy]));
    assert.deepEqual(
      data.versions.map((v: { findings: { code: string }[] }) =>
        v.findings.filter((finding) =>
          finding.code === "VIEWER_FINDINGS_INVALID"
        ).length
      ),
      [0, 1, 0],
    );
    const warning = data.versions[1].findings.find((f: { code: string }) =>
      f.code === "VIEWER_FINDINGS_INVALID"
    );
    assert.equal(warning.severity, "warning");
    assert.equal(warning.subject, "instance");
    assert.match(
      warning.context,
      /2026-11-02T10-20-00Z.*findings.*unreadable/i,
    );
    assert.doesNotMatch(
      warning.context,
      /private parser input|Unexpected|severity/,
    );
    assert.deepEqual(
      data.versions[0].findings.filter((f: ApeFinding) =>
        f.code.startsWith("APE_")
      ),
      [ape],
    );
    assert.deepEqual(
      data.versions[1].findings.filter((f: { code: string }) =>
        f.code !== warning.code
      ),
      [],
    );
    assert.equal(data.versions[2].findings[0].subject, "agent:legacy");
    assert.equal(data.versions[2].views, null);
  }
});

Deno.test("legacy APE timings do not enter page texts or diffs and archives stay intact", async () => {
  const report = (ms: number) =>
    canonical({
      validation: { status: "passed", errors: 0 },
      errors: [],
      warnings: [],
      ape: {
        status: "completed",
        findings: [],
        metrics: {
          elements: 2,
          sourceElements: 3,
          quads: 4,
          baseQuads: 4,
          derivedQuads: 1,
          batches: 1,
          totalMs: ms,
          preparationMs: ms,
          projectionMs: ms,
          loadMs: ms,
          views: [{ file: "agents.rq", graph: "urn:agents", quads: 1, ms }],
          queries: [{ code: "UNREACHABLE_OPERATOR", findings: 0, ms }],
        },
      },
    });
  const newer = version("2026-11-02T10-20-00Z", snapshot);
  const older = version("2026-11-02T10-15-00Z", snapshot);
  newer.files["validation.json"] = report(111);
  older.files["validation.json"] = report(222);
  const page = await viewerPage([newer, older]);
  assert.equal(newer.files["validation.json"], report(111));
  assert.equal(older.files["validation.json"], report(222));
  const data = dataOf(page);
  assert.deepEqual(data.versions[0].changes, []);
  const archived = JSON.parse(
    data.texts[data.versions[0].files["validation.json"]],
  );
  assert.deepEqual(archived.ape.metrics, {
    elements: 2,
    sourceElements: 3,
    baseQuads: 4,
    derivedQuads: 1,
    batches: 1,
    views: [{ file: "agents.rq", graph: "urn:agents", quads: 1 }],
    queries: [{ code: "UNREACHABLE_OPERATOR", findings: 0 }],
  });
  newer.files["validation.json"] = report(333);
  older.files["validation.json"] = report(444);
  assert.equal(await viewerPage([newer, older]), page);
  older.files["validation.json"] = "invalid JSON";
  assert.ok(dataOf(await viewerPage([older])).texts.includes("invalid JSON"));
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

Deno.test("an Overview row changes with the declarations it sums up, not with inference", async () => {
  const inference: Inference = JSON.parse(
    await readFile(
      new URL("../fixtures/inference.json", import.meta.url),
      "utf8",
    ),
  );
  const next = structuredClone(snapshot);
  next.accounts.find((a) => a.id === "telegram:lead")!.enabled = false;
  const later = version("2026-11-02T10-20-00Z", next);
  later.files["inference.json"] = JSON.stringify(inference);
  Object.assign(later.files, Object.fromEntries(emitInferred(next, inference)));
  const data = dataOf(
    await viewerPage([later, version("2026-11-02T10-15-00Z", snapshot)]),
  );
  const { delta } = viewOf(data, data.versions[0], "overview");
  assert.deepEqual([delta.added, delta.changed], [[], ["agent:lead"]]);
});

Deno.test("a version whose snapshot this viewer cannot read keeps its files", async () => {
  const old = version("2026-11-02T10-15-00Z", snapshot);
  old.files["snapshot.json"] = JSON.stringify({
    schema: "openclaw-snapshot/4",
  });
  const data = dataOf(await viewerPage([old]));
  assert.equal(data.versions[0].views, null);
  assert.equal(data.versions[0].findings, null);
  assert.ok(data.versions[0].files["OpenClawInstance.sysml"] >= 0);
});
