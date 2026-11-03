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
      canonical([{ ...ape, related: [""] }]),
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
    assert.equal(data.versions[1].checks.state, "unrecorded");
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
  // The count is what the panel lists: the drawn binding edge is marked on
  // the diagram and not counted.
  assert.equal(delta.count, 2);
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

Deno.test("an Overview row changes with what it shows, not with inference", async () => {
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
  // The lead's row and the instance's totals show the disabled account.
  assert.deepEqual([delta.added, delta.changed], [[], [
    "agent:lead",
    "instance",
  ]]);
  assert.equal(data.versions[0].inputs, "changed");
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

const validationOf = (ape: unknown) =>
  canonical({ validation: { status: "passed", errors: 0 }, ape });
const ranApe = (...codes: string[]) =>
  validationOf({
    status: "completed",
    findings: [],
    metrics: {
      elements: 1,
      baseQuads: 1,
      derivedQuads: 0,
      batches: 1,
      views: [],
      queries: codes.map((code) => ({ code, findings: 0 })),
    },
  });
const row = (code: string, subject: string, extra = {}) => ({
  code,
  severity: "warning",
  subject,
  context: `${code} on ${subject}`,
  recovery: `Fix ${code}.`,
  ...extra,
});

Deno.test("a version says whether its checks ran", () => {
  const verified = version("2026-11-02T10-25-00Z", snapshot);
  verified.files["findings.json"] = canonical([]);
  verified.files["validation.json"] = ranApe("APE_A", "B");
  const skipped = version("2026-11-02T10-20-00Z", snapshot);
  skipped.entry.validation = {
    status: "skipped",
    errors: 0,
    code: "TOOLKIT_NOT_INSTALLED",
    recovery: "openclaw sysmlv2-toolkit install",
  };
  skipped.entry.inferred = { procedures: 0, rules: 0, failed: 3 };
  skipped.files["findings.json"] = canonical(snapshot.ambiguities);
  skipped.files["validation.json"] = validationOf({
    status: "skipped",
    code: "TOOLKIT_NOT_INSTALLED",
    findings: [],
  });
  const legacy = version("2026-11-02T10-15-00Z", snapshot);
  return viewerPage([verified, skipped, legacy]).then((page) => {
    const data = dataOf(page);
    assert.deepEqual(
      data.versions.map((v: { checks: unknown }) => v.checks),
      [
        { state: "verified", rules: 2, inferenceFailed: 0 },
        {
          state: "not-run",
          code: "TOOLKIT_NOT_INSTALLED",
          recovery: "openclaw sysmlv2-toolkit install",
          inferenceFailed: 3,
        },
        { state: "unrecorded", inferenceFailed: 0 },
      ],
    );
    // The fallback to the collector's notes stays.
    assert.equal(data.versions[2].findings.length, snapshot.ambiguities.length);
  });
});

Deno.test("the Doctor groups findings and sets them against the last version whose checks ran", async () => {
  const ape = { pattern: "4.2", finding: "present" };
  const note = snapshot.ambiguities[0];
  const now = version("2026-11-02T10-25-00Z", snapshot);
  now.files["findings.json"] = canonical([
    note,
    row("B", "agent:lead"),
    row("B", "agent:field"),
    row("C", "agent:lead"),
    row("APE_A", "agent:field", { ...ape, related: ["agent:lead"] }),
  ]);
  now.files["validation.json"] = ranApe("APE_A", "B", "C");
  const skipped = version("2026-11-02T10-20-00Z", snapshot);
  skipped.files["validation.json"] = validationOf({
    status: "skipped",
    findings: [],
  });
  // The first exports named the APE rules without their prefix.
  const before = version("2026-11-02T10-15-00Z", snapshot);
  before.files["findings.json"] = canonical([
    note,
    row("APE_A", "agent:lead", ape),
    row("B", "agent:lead"),
  ]);
  before.files["validation.json"] = ranApe("A", "B");
  const data = dataOf(await viewerPage([now, skipped, before]));
  const [latest, middle, oldest] = data.versions;
  const lead = snapshot.agents.find((a) => a.id === "lead")!.name;
  assert.deepEqual(
    latest.doctor.groups.map((
      g: { code: string; source: string; subjects: unknown[] },
    ) => [g.code, g.source, g.subjects.length]),
    [
      ["APE_A", "rule", 1],
      ["B", "rule", 2],
      ["C", "rule", 1],
      [note.code, "collector", 1],
    ],
  );
  assert.deepEqual(latest.doctor.groups[0].subjects[0], {
    id: "agent:field",
    label: snapshot.agents.find((a) => a.id === "field")!.name,
    context: "APE_A on agent:field",
    related: ["agent:lead"],
  });
  // `APE_A` of the lead is resolved; the rule `C` did not run before.
  const keys = (list: { code: string; subject: string }[]) =>
    list.map((f) => `${f.code} ${f.subject}`);
  assert.equal(latest.doctor.delta.against, oldest.id);
  assert.equal(latest.doctor.delta.inputs, "same");
  assert.deepEqual(keys(latest.doctor.delta.new), [
    "APE_A agent:field",
    "B agent:field",
  ]);
  assert.deepEqual(keys(latest.doctor.delta.resolved), ["APE_A agent:lead"]);
  assert.equal(latest.doctor.delta.resolved[0].label, lead);
  assert.deepEqual(keys(latest.doctor.delta.newRule), ["C agent:lead"]);
  assert.deepEqual([middle.doctor.delta, oldest.doctor.delta], [null, null]);
});

Deno.test("a version says what its inputs are against the previous one, and what the export only re-stated", async () => {
  const restated = version("2026-11-02T10-25-00Z", snapshot);
  restated.files["OpenClawInstance.sysml"] = restated.files[
    "OpenClawInstance.sysml"
  ].replace(
    'attribute :>> network = "fixture-net";',
    'attribute :>> network = "fixture-net"; // restated',
  );
  const changed = structuredClone(snapshot);
  changed.agents[0].sandbox.memory = "2g";
  const older = [
    version("2026-11-02T10-20-00Z", snapshot),
    version("2026-11-02T10-15-00Z", snapshot),
  ];
  older[1].files["snapshot.json"] = '{"schema":"openclaw-snapshot/4"}';
  const data = dataOf(
    await viewerPage([
      version("2026-11-02T10-30-00Z", changed),
      restated,
      ...older,
    ]),
  );
  assert.deepEqual(
    data.versions.map((v: { inputs: string | null }) => v.inputs),
    ["changed", "same", "schema", null],
  );
  // The configuration is the same: nothing it shows changed, and the agent
  // whose SysML was re-stated is only touched.
  const { delta } = viewOf(data, data.versions[1], "system");
  assert.deepEqual(
    [delta.added, delta.changed, delta.touched, delta.count],
    [[], [], ["agent:client"], 0],
  );
});

Deno.test("an inferred step added since the previous version is listed, its start and end are not", async () => {
  const inference: Inference = JSON.parse(
    await readFile(
      new URL("../fixtures/inference.json", import.meta.url),
      "utf8",
    ),
  );
  const next = structuredClone(inference);
  const lead = next.agents.find((a) => a.agentId === "lead")!;
  const copy = structuredClone(lead.procedures[0]);
  copy.id = "second-flow";
  for (const step of copy.steps) step.id = `second-${step.id}`;
  lead.procedures.push(copy);
  const infer = (id: string, i: Inference) => {
    const v = version(id, snapshot);
    v.files["inference.json"] = JSON.stringify(i);
    Object.assign(v.files, Object.fromEntries(emitInferred(snapshot, i)));
    return v;
  };
  const data = dataOf(
    await viewerPage([
      infer("2026-11-02T10-20-00Z", next),
      infer("2026-11-02T10-15-00Z", inference),
    ]),
  );
  const { delta } = viewOf(data, data.versions[0], "behaviour:lead");
  assert.ok(delta.added.includes("procedure:second-flow"));
  assert.ok(!delta.added.includes("procedure:second-flow:start"));
  assert.ok(!delta.added.includes("procedure:second-flow:end"));
  assert.equal(data.versions[0].inputs, "inference");
});

Deno.test("a version lists what changed per element and per kind of file", async () => {
  const next = structuredClone(snapshot);
  next.agents[0].name = "Renamed";
  next.accounts.find((a) => a.id === "telegram:lead")!.enabled = false;
  const old = version("2026-11-02T10-10-00Z", snapshot);
  old.files["snapshot.json"] = '{"schema":"openclaw-snapshot/4"}';
  const data = dataOf(
    await viewerPage([
      version("2026-11-02T10-20-00Z", next),
      version("2026-11-02T10-15-00Z", snapshot),
      old,
    ]),
  );
  const [latest, middle, oldest] = data.versions;
  assert.deepEqual(
    latest.diff.subjects.map((s: { id: string }) => s.id),
    ["account:telegram:lead", `agent:${next.agents[0].id}`],
  );
  assert.equal(latest.diff.subjects[1].label, "Renamed");
  assert.deepEqual(
    latest.diff.groups.map((g: { group: string }) => g.group),
    ["instance", "data"],
  );
  // Not comparable: the files are grouped, with no bullets.
  assert.equal(middle.diff.subjects, null);
  assert.ok(middle.diff.groups.length);
  assert.equal(oldest.diff, null);
});
