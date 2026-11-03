import assert from "node:assert/strict";
import {
  approvalPolicy,
  configuredExec,
  effectiveExec,
  type ExecPolicy,
  selectApprovals,
} from "./execution.ts";
import { ExportError } from "../../infrastructure/error.ts";

Deno.test("exec modes preserve their normalized pair and distinct mode", () => {
  for (
    const [mode, security, ask] of [
      ["deny", "deny", "off"],
      ["allowlist", "allowlist", "off"],
      ["ask", "allowlist", "on-miss"],
      ["auto", "allowlist", "on-miss"],
      ["full", "full", "off"],
    ]
  ) {
    assert.deepEqual(configuredExec({ mode }, {}, "2026.10.9"), {
      host: "auto",
      mode,
      security,
      ask,
    });
  }
});

Deno.test("agent exec policy overrides mode or individual legacy fields", () => {
  assert.deepEqual(
    configuredExec({ mode: "full" }, { ask: "always" }, "2026.10.9"),
    { host: "auto", mode: null, security: "full", ask: "always" },
  );
  assert.deepEqual(
    configuredExec(
      { security: "deny", ask: "always" },
      { mode: "ask" },
      "2026.10.9",
    ),
    { host: "auto", mode: "ask", security: "allowlist", ask: "on-miss" },
  );
});

Deno.test("exec defaults use documented 2026.10 host policy only", () => {
  for (const host of ["auto", "gateway", "node", "sandbox"]) {
    assert.deepEqual(configuredExec({ host }, {}, "2026.10.9"), {
      host,
      mode: null,
      security: host === "sandbox" ? "deny" : "full",
      ask: "off",
    });
  }
  for (const version of [null, "2026.6.10", "2026.100.1"]) {
    assert.deepEqual(configuredExec({}, {}, version), {
      host: "auto",
      mode: null,
      security: "unknown",
      ask: "unknown",
    });
  }
});

Deno.test("exec policy rejects malformed and mixed policy fields with coded errors", () => {
  for (
    const raw of [
      { mode: "invalid" },
      { mode: null },
      { mode: "full", ask: "always" },
      { host: null },
      { security: "unknown" },
      { ask: "sometimes" },
    ]
  ) {
    assert.throws(
      () => configuredExec(raw, {}, "2026.10.9"),
      (e) => e instanceof ExportError && e.code === "INVALID_INPUT",
    );
  }
  assert.throws(
    () => configuredExec({ host: "gateway" }, { host: null }, "2026.10.9"),
    (e) => e instanceof ExportError && e.code === "INVALID_INPUT",
  );
  assert.throws(
    () => approvalPolicy({ ask: "sometimes" }),
    (e) => e instanceof ExportError && e.code === "INVALID_INPUT",
  );
});

Deno.test("approval fields inherit agent then wildcard then defaults", () => {
  const defaults = approvalPolicy({ security: "allowlist", ask: "on-miss" });
  const wildcard = approvalPolicy({ ask: "always" });
  assert.deepEqual(selectApprovals(defaults, wildcard, approvalPolicy({})), {
    security: "allowlist",
    ask: "always",
  });
  assert.deepEqual(
    selectApprovals(defaults, wildcard, approvalPolicy({ ask: "off" })),
    { security: "allowlist", ask: "off" },
  );
});

Deno.test("effective exec takes the stricter security and ask independently", () => {
  const cases: [ExecPolicy, ExecPolicy, ExecPolicy][] = [
    [
      { security: "full", ask: "off" },
      { security: "allowlist", ask: "always" },
      {
        security: "allowlist",
        ask: "always",
      },
    ],
    [{ security: "deny", ask: "always" }, { security: "full", ask: "off" }, {
      security: "deny",
      ask: "always",
    }],
    [{ security: "allowlist", ask: "on-miss" }, {
      security: "full",
      ask: "off",
    }, {
      security: "allowlist",
      ask: "on-miss",
    }],
  ];
  for (const [configured, approvals, expected] of cases) {
    assert.deepEqual(
      effectiveExec(
        { host: "gateway", ...configured },
        approvalPolicy(approvals),
      ),
      expected,
    );
  }
});

Deno.test("absent approval fields retain config and unknowns cannot imply full/off", () => {
  const configured = configuredExec({ mode: "full" }, {}, "2026.10.9");
  assert.deepEqual(effectiveExec(configured, approvalPolicy({})), {
    security: "full",
    ask: "off",
  });
  const unknown = configuredExec({}, {}, null);
  assert.deepEqual(
    effectiveExec(unknown, approvalPolicy({ security: "full" })),
    {
      security: "unknown",
      ask: "unknown",
    },
  );
  assert.deepEqual(
    effectiveExec(unknown, approvalPolicy({ security: "deny", ask: "always" })),
    { security: "deny", ask: "always" },
  );
});

Deno.test("local approvals cannot establish a remote node posture", () => {
  const configured = configuredExec(
    { host: "node", mode: "full" },
    {},
    "2026.10.9",
  );
  assert.deepEqual(
    effectiveExec(configured, approvalPolicy({ security: "full", ask: "off" })),
    { security: "unknown", ask: "unknown" },
  );
  assert.deepEqual(
    effectiveExec(
      { host: "node", security: "deny", ask: "always" },
      approvalPolicy({}),
    ),
    { security: "deny", ask: "always" },
  );
});
