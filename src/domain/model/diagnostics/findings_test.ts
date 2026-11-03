import assert from "node:assert/strict";
import type { ApeFinding, PersistedApeReport } from "./ape.ts";
import { checksOf } from "./checks.ts";
import { findingsDelta } from "./delta.ts";
import { collectorNotes, doctorGroups } from "./groups.ts";

const finding = (
  code: string,
  subject: string,
  over: Partial<ApeFinding> = {},
): ApeFinding => ({
  code,
  severity: "warning",
  subject,
  context: `${code} on ${subject}`,
  recovery: `Fix ${code}.`,
  ...over,
});
const ape = (
  status: PersistedApeReport["status"],
  extra: Partial<PersistedApeReport> = {},
): PersistedApeReport => ({ status, findings: [], ...extra });
const completed = (...codes: string[]) =>
  ape("completed", {
    metrics: {
      elements: 1,
      baseQuads: 1,
      derivedQuads: 0,
      batches: 1,
      views: [],
      queries: codes.map((code) => ({ code, findings: 0 })),
    },
  });

Deno.test("the checks state tells a clean model from one that was not checked", () => {
  const checks = (
    report: PersistedApeReport | null,
    findings: "recorded" | "missing" | "unreadable" = "recorded",
    validation?: Parameters<typeof checksOf>[0]["validation"],
  ) => checksOf({ ape: report, findings, validation, inferenceFailed: 2 });
  assert.deepEqual(checks(completed("APE_X", "Y")), {
    state: "verified",
    rules: 2,
    inferenceFailed: 2,
  });
  // The recovery of a skipped analysis is the export's own.
  assert.deepEqual(
    checks(ape("skipped", { code: "TOOLKIT_NOT_INSTALLED" }), "recorded", {
      status: "skipped",
      errors: 0,
      recovery: "openclaw sysmlv2-toolkit install",
    }),
    {
      state: "not-run",
      code: "TOOLKIT_NOT_INSTALLED",
      recovery: "openclaw sysmlv2-toolkit install",
      inferenceFailed: 2,
    },
  );
  assert.match(
    checks(ape("skipped", { code: "APE_INVALID_MODEL" })).recovery!,
    /compile errors/,
  );
  assert.deepEqual(
    checks(ape("failed", { code: "APE_TIMEOUT", recovery: "Retry." })),
    {
      state: "failed",
      code: "APE_TIMEOUT",
      recovery: "Retry.",
      inferenceFailed: 2,
    },
  );
  // An archive from before the analysis existed: its findings, or nothing.
  assert.equal(checks(null).state, "verified");
  assert.equal(checks(null, "missing").state, "unrecorded");
  assert.equal(
    checks(completed("X"), "unreadable").code,
    "VIEWER_FINDINGS_INVALID",
  );
});

Deno.test("the Doctor groups findings by severity, code and recovery, each subject with its own context", () => {
  const note = finding("SAFE_BINS_DEFAULT_UNRESOLVED", "agent:a", {
    severity: "info",
  });
  const cycle = { pattern: "4.2", finding: "present" as const };
  const groups = doctorGroups(
    [
      finding("APE_LINK_CYCLE", "agent:a", { ...cycle, related: ["agent:b"] }),
      finding("APE_LINK_CYCLE", "agent:b", { ...cycle, related: ["agent:a"] }),
      finding("NOTE_RULE", "agent:b", { severity: "info" }),
      note,
      finding("EXEC", "agent:a", { severity: "error" }),
      finding("EXEC", "agent:b", { severity: "error", recovery: "Other." }),
    ],
    { "agent:a": "Alpha" },
    collectorNotes([note]),
  );
  assert.deepEqual(
    groups.map((g) => [g.severity, g.code, g.source, g.subjects.length]),
    [
      ["error", "EXEC", "rule", 1],
      ["error", "EXEC", "rule", 1],
      ["warning", "APE_LINK_CYCLE", "rule", 2],
      ["info", "NOTE_RULE", "note", 1],
      ["info", "SAFE_BINS_DEFAULT_UNRESOLVED", "collector", 1],
    ],
  );
  assert.equal(groups[2].pattern, "4.2");
  assert.deepEqual(groups[2].subjects, [
    {
      id: "agent:a",
      label: "Alpha",
      context: "APE_LINK_CYCLE on agent:a",
      related: ["agent:b"],
    },
    {
      id: "agent:b",
      label: "agent:b",
      context: "APE_LINK_CYCLE on agent:b",
      related: ["agent:a"],
    },
  ]);
});

Deno.test("a finding is new or resolved only when its rule ran on both sides", () => {
  const side = (findings: ApeFinding[], ...ran: string[]) => ({
    findings,
    ran: new Set(ran),
    collector: new Set<string>(),
  });
  const kept = finding("A", "agent:a");
  const delta = findingsDelta(
    side(
      [kept, finding("B", "agent:b"), finding("APE_C", "agent:a")],
      "A",
      "B",
      "C",
    ),
    side(
      // `A` twice: one remains; `D` ran only before, `C` ran only now.
      [kept, kept, finding("B", "agent:a"), finding("D", "agent:a")],
      "A",
      "B",
      "D",
    ),
    { against: "v0", inputs: "same", labels: { "agent:a": "Alpha" } },
  );
  const keys = (list: typeof delta.new) =>
    list.map((f) => `${f.code} ${f.label}`);
  assert.deepEqual(keys(delta.new), ["B agent:b"]);
  assert.deepEqual(keys(delta.resolved), ["A Alpha", "B Alpha"]);
  assert.deepEqual(keys(delta.newRule), ["APE_C Alpha"]);
  assert.deepEqual(keys(delta.notComparable), ["D Alpha"]);
});

Deno.test("a finding whose text alone changed is neither new nor resolved", () => {
  const side = (findings: ApeFinding[]) => ({
    findings,
    ran: new Set(["A"]),
    collector: new Set<string>(),
  });
  const delta = findingsDelta(
    side([finding("A", "agent:a", { context: "names the agent" })]),
    side([finding("A", "agent:a"), finding("A", "agent:b")]),
    { against: "v0", inputs: "same", labels: {} },
  );
  assert.deepEqual([delta.new, delta.resolved.map((f) => f.subject)], [[], [
    "agent:b",
  ]]);
});
