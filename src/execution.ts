import { invalid } from "./error.ts";
import { enumeration, type Obj, obj } from "./input.ts";
import { is202610 } from "./policy.ts";

const SECURITY = ["deny", "allowlist", "full"] as const;
const ASK = ["off", "on-miss", "always"] as const;
type Security = typeof SECURITY[number];
type Ask = typeof ASK[number];
export interface ExecPolicy {
  security: Security | "unknown";
  ask: Ask | "unknown";
}
export interface ApprovalPolicy {
  security: Security | null;
  ask: Ask | null;
}

// docs/tools/exec.md, Modes: ask and auto have the same security/ask pair,
// but auto additionally enables review, so retain the configured mode as well.
const EXEC_MODES = {
  deny: { security: "deny", ask: "off" },
  allowlist: { security: "allowlist", ask: "off" },
  ask: { security: "allowlist", ask: "on-miss" },
  auto: { security: "allowlist", ask: "on-miss" },
  full: { security: "full", ask: "off" },
} as const;
type Mode = keyof typeof EXEC_MODES;

/** Configured host posture, before host-local approvals and session overrides. */
export function configuredExec(
  global: Obj,
  own: Obj,
  version: string | null,
): ExecPolicy & { host: string; mode: Mode | null } {
  const host = enumeration(
    own.host === undefined ? global.host : own.host,
    ["auto", "sandbox", "gateway", "node"],
    "auto",
  );
  // docs/tools/exec-approvals.md, Policy knobs: gateway/node default full/off;
  // explicit sandbox defaults deny/off. Auto describes the host baseline here,
  // not the policy of a runtime sandbox. Older undocumented defaults stay unknown.
  const modern = is202610(version);
  let result: ExecPolicy & { mode: Mode | null } = {
    mode: null,
    security: modern ? host === "sandbox" ? "deny" : "full" : "unknown",
    ask: modern ? "off" : "unknown",
  };
  for (const layer of [global, own]) {
    // docs/tools/exec-approvals.md: mode and legacy fields in the same object
    // are invalid. Cross-layer precedence is applyExecPolicyLayer in
    // dist/exec-policy-DDPEdabr.mjs: mode replaces both fields; legacy fields
    // clear an inherited mode and override only the supplied fields.
    if (layer.mode !== undefined) {
      if (layer.security !== undefined || layer.ask !== undefined) {
        invalid("Exec mode cannot share a scope with legacy security or ask");
      }
      const mode = enumeration(
        layer.mode,
        Object.keys(EXEC_MODES) as Mode[],
        "full",
      );
      result = { mode, ...EXEC_MODES[mode] };
    } else if (layer.security !== undefined || layer.ask !== undefined) {
      result = {
        mode: null,
        security: layer.security === undefined
          ? result.security
          : enumeration(layer.security, SECURITY, "full"),
        ask: layer.ask === undefined
          ? result.ask
          : enumeration(layer.ask, ASK, "off"),
      };
    }
  }
  return { host, ...result };
}

/** docs/tools/exec-approvals.md: omitted host policy fields inherit config. */
export function approvalPolicy(raw: unknown): ApprovalPolicy {
  const value = obj(raw);
  return {
    security: value.security === undefined
      ? null
      : enumeration(value.security, SECURITY, "full"),
    ask: value.ask === undefined ? null : enumeration(value.ask, ASK, "off"),
  };
}

/** docs/tools/exec-approvals.md, Control UI editing: per-agent overrides.
 * dist/exec-approvals-resolver-C1cTECqF.mjs resolves each field from the agent,
 * then wildcard, then defaults; omitted fields keep the config fallback. */
export function selectApprovals(
  defaults: ApprovalPolicy,
  wildcard: ApprovalPolicy,
  own: ApprovalPolicy,
): ApprovalPolicy {
  return {
    security: own.security ?? wildcard.security ?? defaults.security,
    ask: own.ask ?? wildcard.ask ?? defaults.ask,
  };
}

/** docs/tools/exec-approvals.md: approvals can only tighten the config pair.
 * Security takes the lower rank; ask takes the higher. Unknown input cannot
 * establish full/off, but deny/always are decisive even against unknown. */
export function effectiveExec(
  configured: ExecPolicy & { host: string },
  approvals: ApprovalPolicy,
): ExecPolicy {
  // docs/tools/exec-approvals.md, Node host: node approvals are fetched from
  // that execution host at runtime; this instance's SQLite is not evidence.
  const security = configured.host === "node" ? "unknown" : approvals.security;
  const ask = configured.host === "node" ? "unknown" : approvals.ask;
  return {
    security: security === null
      ? configured.security
      : security === "deny" || configured.security === "deny"
      ? "deny"
      : security === "unknown" || configured.security === "unknown"
      ? "unknown"
      : SECURITY[
        Math.min(
          SECURITY.indexOf(configured.security),
          SECURITY.indexOf(security),
        )
      ],
    ask: ask === null
      ? configured.ask
      : ask === "always" || configured.ask === "always"
      ? "always"
      : ask === "unknown" || configured.ask === "unknown"
      ? "unknown"
      : ASK[Math.max(ASK.indexOf(configured.ask), ASK.indexOf(ask))],
  };
}
