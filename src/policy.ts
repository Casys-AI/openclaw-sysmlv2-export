import { enumeration, type Obj, obj, strings, text } from "./input.ts";
import type { Agent, Finding, Policy, Sandbox } from "./snapshot.ts";
import { byId, unique } from "./snapshot.ts";

// OpenClaw 2026.6.10 docs/gateway/config-tools.md, Tool profiles / Tool groups.
export const GROUPS: Record<string, string[]> = {
  "group:runtime": ["exec", "process", "code_execution"],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:sessions": [
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "sessions_yield",
    "subagents",
    "session_status",
  ],
  "group:memory": ["memory_search", "memory_get"],
  "group:web": ["web_search", "x_search", "web_fetch"],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["heartbeat_respond", "cron", "gateway"],
  "group:messaging": ["message"],
  "group:nodes": ["nodes"],
  "group:agents": ["agents_list", "update_plan"],
  "group:media": [
    "image",
    "image_generate",
    "music_generate",
    "video_generate",
    "tts",
  ],
};
export const BUILTINS = unique([
  ...Object.values(GROUPS).flat(),
  "pdf",
  "skill_workshop",
]);
GROUPS["group:openclaw"] = BUILTINS;
const profiles: Record<string, string[] | null> = {
  full: null,
  minimal: ["session_status"],
  coding: [
    "group:fs",
    "group:runtime",
    "group:web",
    "group:sessions",
    "group:memory",
    "cron",
    "image",
    "image_generate",
    "skill_workshop",
    "video_generate",
  ],
  messaging: [
    "group:messaging",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "session_status",
  ],
};
export function policy(raw: unknown): Policy {
  const p = obj(raw);
  return {
    profile: p.profile === undefined ? null : enumeration(
      p.profile,
      ["full", "minimal", "coding", "messaging"],
      "full",
    ),
    allow: p.allow === undefined ? null : strings(p.allow),
    alsoAllow: strings(p.alsoAllow),
    deny: strings(p.deny),
  };
}
export function info(
  code: string,
  subject: string,
  context: string,
  recovery: string,
): Finding {
  return { code, severity: "info", subject, context, recovery };
}
function matches(tool: string, patterns: string[]): boolean {
  return patterns.some((raw) => {
    const p = raw.toLowerCase() === "bash" ? "exec" : raw.toLowerCase();
    if (GROUPS[p]) return GROUPS[p].includes(tool);
    return new RegExp(
      "^" + p.split("*").map((s) =>
        s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      ).join(".*") + "$",
    ).test(tool);
  });
}
function filter(tools: string[], p: Policy, applyProfile = false): string[] {
  const base = applyProfile ? profiles[p.profile ?? "full"] : p.allow;
  const allow = base === null ? null : unique([...base, ...p.alsoAllow]);
  return tools.filter((t) =>
    !matches(t, p.deny) &&
    (allow === null || matches(t, allow) ||
      t === "apply_patch" && matches("write", allow))
  );
}
function providerPolicy(raw: Obj, model: string | null): Policy {
  const pp = obj(raw.byProvider), provider = model?.split("/")[0];
  return policy(
    model && Object.hasOwn(pp, model)
      ? pp[model]
      : provider
      ? pp[provider]
      : undefined,
  );
}
export function resolvePolicy(
  id: string,
  global: Obj,
  agent: Obj,
  sandbox: Sandbox,
  model: string | null,
  findings: Finding[],
): Pick<Agent, "grants" | "policy"> {
  const g = policy(global),
    a = policy(agent),
    p = providerPolicy(global, model),
    ap = providerPolicy(agent, model);
  // docs/tools/multi-agent-sandbox-tools.md: profile override, successive
  // intersections; sandbox override replaces global policy. No denied tool is restored.
  const sb = obj(obj(agent.sandbox).tools ?? obj(global.sandbox).tools);
  const s = policy(sb);
  // docs/gateway/config-agents.md gives an example, not a versioned complete
  // default catalog. Keep provenance unset and withhold unresolved sandbox grants.
  const sandboxDefaultsUnresolved = sb.allow === undefined ||
    sb.deny === undefined;
  let allowed = filter(BUILTINS, {
    ...a,
    profile: a.profile ?? g.profile,
    alsoAllow: unique([...g.alsoAllow, ...a.alsoAllow]),
    deny: [],
  }, true);
  allowed = filter(allowed, {
    ...ap,
    profile: ap.profile ?? p.profile,
    alsoAllow: unique([...p.alsoAllow, ...ap.alsoAllow]),
    deny: [],
  }, true);
  for (const stage of [g, p, a, ap]) allowed = filter(allowed, stage);
  // docs/tools/exec.md, apply_patch: available only for OpenAI/OpenAI Codex
  // models; fallback turns need their own provider-policy resolution.
  if (!model?.startsWith("openai/") && !model?.startsWith("openai-codex/")) {
    allowed = allowed.filter((t) => t !== "apply_patch");
  }
  if (
    obj(obj(global.exec).applyPatch).enabled === false ||
    obj(obj(agent.exec).applyPatch).enabled === false
  ) allowed = allowed.filter((t) => t !== "apply_patch");
  const web = { ...obj(global.web), ...obj(agent.web) };
  if (obj(web.search).enabled === false) {
    allowed = allowed.filter((t) => t !== "web_search");
  }
  if (obj(web.fetch).enabled === false) {
    allowed = allowed.filter((t) => t !== "web_fetch");
  }
  const grants: Agent["grants"] = [];
  for (
    const layer of sandbox.mode === "off"
      ? ["host"]
      : sandbox.mode === "all"
      ? ["sandbox"]
      : ["host", "sandbox"]
  ) {
    const tools = layer === "sandbox"
      ? sandboxDefaultsUnresolved ? [] : filter(allowed, s)
      : allowed;
    for (const tool of tools) {
      grants.push({
        id: `${layer}:${tool}`,
        tool,
        layer: layer as "host" | "sandbox",
      });
    }
  }
  if (sandbox.mode === "non-main") {
    findings.push(
      info(
        "SESSION_DEPENDENT_SANDBOX",
        id,
        "Host and sandbox grants describe separate session contexts.",
        "Resolve the session main key before using a grant; docs/tools/multi-agent-sandbox-tools.md.",
      ),
    );
  }
  const entries = [g, a, p, ap, s].flatMap(
    (x) => [...x.allow ?? [], ...x.alsoAllow, ...x.deny],
  );
  if ([g, a, p, ap, s].some((p) => p.allow?.length === 0)) {
    findings.push(
      info(
        "EMPTY_ALLOWLIST_UNRESOLVED",
        id,
        "An empty allowlist is treated conservatively as granting no tools; the docs disagree on empty-list behavior.",
        "Set explicit tool names; compare docs/gateway/sandbox-vs-tool-policy-vs-elevated.md and docs/tools/multi-agent-sandbox-tools.md.",
      ),
    );
  }
  if (sandbox.mode !== "off" && sandboxDefaultsUnresolved) {
    findings.push(
      info(
        "SANDBOX_DEFAULT_TOOLS_UNRESOLVED",
        id,
        "Sandbox grants are withheld: the supplied docs do not identify a complete versioned default catalog for omitted policy fields.",
        "Set sandbox tools.allow and tools.deny explicitly; docs/gateway/config-agents.md.",
      ),
    );
  }
  if (
    entries.some((x) =>
      x !== "*" && !GROUPS[x] && !BUILTINS.includes(x) && x !== "bash"
    )
  ) {
    findings.push(
      info(
        "TOOL_CATALOG_INCOMPLETE",
        id,
        "Policy mentions tools outside the documented built-in catalog; they receive no grants.",
        "Inspect plugin registrations separately; docs/gateway/config-tools.md.",
      ),
    );
  }
  if (
    global.toolsBySender || agent.toolsBySender ||
    obj(global.subagents).tools !== undefined
  ) {
    findings.push(
      info(
        "CONTEXT_DEPENDENT_TOOLS",
        id,
        "Sender or subagent policies require runtime context.",
        "Inspect the active sender and subagent policies; docs/gateway/config-tools.md.",
      ),
    );
  }
  return {
    grants: byId(grants),
    policy: { global: g, agent: a, sandbox: s, provider: p, agentProvider: ap },
  };
}
export function model(raw: unknown, defaults: unknown): Agent["model"] {
  const base = typeof defaults === "string"
    ? { primary: defaults }
    : obj(defaults);
  const own = typeof raw === "string" ? { primary: raw } : obj(raw);
  return {
    primary: text(own.primary ?? base.primary),
    fallbacks: strings(own.fallbacks ?? base.fallbacks),
  };
}
