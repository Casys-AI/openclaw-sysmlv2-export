import type { Agent } from "./snapshot.ts";

/** What an agent's isolation and exec settings let it do, as the views state
 * it. The exec policy (security and ask) governs host exec only: it is never
 * stated for an exec that runs in the sandbox. */

export type ExecPlace = "host" | "sandbox" | "node";

const RUNS_ON = {
  off: "host",
  all: "sandbox",
  "non-main": "sandbox, except the main session",
} as const;

/** Where the agent's exec tool runs: the exec host decides, and `auto` follows
 * the layer of each exec grant (docs/tools/exec.md). Empty without an exec
 * grant. */
export function execPlaces(a: Agent): ExecPlace[] {
  const layers = new Set(
    a.grants.filter((g) => g.tool === "exec").map((g) => g.layer),
  );
  if (!layers.size) return [];
  switch (a.execution.host) {
    case "gateway":
      return ["host"];
    case "node":
      return ["node"];
    case "sandbox":
      return ["sandbox"];
    default:
      return (["host", "sandbox"] as const).filter((l) => layers.has(l));
  }
}

/** Where the agent runs, with `elevated` when an active sandbox can be left
 * through an elevated exec (a no-op without a sandbox). */
export function runsOn(a: Agent): string {
  return a.sandbox.mode !== "off" && a.execution.elevated
    ? `${RUNS_ON[a.sandbox.mode]} · elevated`
    : RUNS_ON[a.sandbox.mode];
}

const places = (a: Agent) =>
  execPlaces(a).map((p) =>
    p === "sandbox"
      ? "in sandbox"
      : `on ${p} · ${a.execution.effective.security}, ask ${a.execution.effective.ask}`
  ).join(" + ") || "not granted";

/** The posture facts the inspector lists, the same wherever an agent is shown. */
export function postureAttributes(a: Agent): [string, string][] {
  const { sandbox, execution } = a;
  const channels = execution.elevatedChannelsCount;
  return [
    ["exec", places(a)],
    ...(sandbox.mode === "off" ? [] : [
      ["network", sandbox.network] as [string, string],
      ["workspace access", sandbox.workspaceAccess] as [string, string],
      ...(sandbox.dangerouslyAllowExternalBindSources
        ? [["external binds", "allowed"] as [string, string]]
        : []),
      ...(execution.elevated
        ? [[
          "elevated",
          `sender-gated · ${channels} channel${channels === 1 ? "" : "s"}`,
        ] as [string, string]]
        : []),
    ]),
  ];
}

/** Tools that send to someone else: another session or agent, or a channel. */
export const OUTBOUND_TOOLS = [
  "message",
  "sessions_send",
  "sessions_spawn",
  "subagents",
] as const;

/** What an agent's configuration lets it do, for the rules read beside it. */
export interface Authority {
  /** Where exec runs; empty when exec is not granted. */
  exec: ExecPlace[];
  /** Effective ask policy of exec on the host or a node, else null. */
  ask: string | null;
  /** The outbound tools it is granted, sorted. */
  outbound: string[];
  /** The three facts in one short line. */
  text: string;
}

export function authority(a: Agent): Authority {
  const exec = execPlaces(a);
  const ask = exec.some((p) => p !== "sandbox")
    ? a.execution.effective.ask
    : null;
  const outbound = OUTBOUND_TOOLS.filter((t) =>
    a.grants.some((g) => g.tool === t)
  ).sort();
  return {
    exec,
    ask,
    outbound,
    text: [
      `exec ${exec.length ? exec.join(" + ") : "not granted"}${
        ask ? `, ask ${ask}` : ""
      }`,
      ...(outbound.length ? [`sends via ${outbound.join(", ")}`] : []),
    ].join(" · "),
  };
}

/** An agent's authority as the inspector lists it on a rule. */
export function authorityAttributes(auth: Authority): [string, string][] {
  return [
    ["exec runs", auth.exec.length ? auth.exec.join(" + ") : "not granted"],
    ...(auth.ask ? [["exec ask", auth.ask] as [string, string]] : []),
    [
      "outbound tools",
      auth.outbound.length ? auth.outbound.join(", ") : "none",
    ],
  ];
}
