import { OPENCLAW_IMPORT } from "./library.ts";
import { canonical, type FileRef, type Snapshot } from "./snapshot.ts";

export function name(prefix: string, id: string): string {
  const n = `${prefix}_${id}`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)
    ? n
    : `'${
      n.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r")
    }'`;
}
const literal = (v: unknown) =>
  typeof v === "string"
    ? JSON.stringify(v)
    : typeof v === "boolean" || typeof v === "number"
    ? String(v)
    : JSON.stringify(JSON.stringify(v));
function attrs(values: Record<string, unknown>, indent = "        "): string {
  return Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) =>
    `${indent}attribute :>> ${k} = ${literal(v)};`
  ).join("\n");
}
function file(f: FileRef, id: string): string {
  return `    part ${name("file", id)} : InstructionFile {\n${
    attrs({ path: f.path, sha256: f.sha256, bytes: f.bytes })
  }\n    }`;
}
function every(ms: number): string {
  const exact = ms % 60000 === 0;
  return `attribute :>> schedule : MillisecondEvery {\n            attribute :>> durationMs = ${ms};${
    exact
      ? `\n            attribute :>> count = ${
        ms / 60000
      };\n            attribute :>> unit = AssemblyCases::ScheduleUnit::minute;`
      : ""
  }\n        }`;
}
export function emit(snapshot: Snapshot): Map<string, string> {
  const owner = (tool: string) =>
    snapshot.plugins?.find((p) => p.enabled && p.tools.includes(tool))?.id ??
      null;
  const lines = [
    "package OpenClawInstance {",
    "    private import OpenClawImport::*;",
    "    private import ScalarValues::*;",
  ];
  for (const a of [...snapshot.agents].sort((a, b) => a.id < b.id ? -1 : 1)) {
    lines.push(
      `    part def ${name("Agent", a.id)} :> OpenClawAgent {`,
      attrs({
        id: a.id,
        displayName: a.name,
        emoji: a.emoji,
        primaryModel: a.model.primary,
        fallbackModels: a.model.fallbacks,
      }),
    );
    lines.push(
      `        doc /* Sanitized OpenClaw tool policy provenance: ${
        canonical(a.policy).trim().replaceAll("*/", "* /")
      } */`,
    );
    for (const g of a.grants) {
      lines.push(
        `        ref item ${name("grant", g.id)} : ToolGrant = ${
          name("tool", `${a.id}:${g.id}`)
        };`,
      );
    }
    lines.push(
      "    }",
      `    part ${name("agent", a.id)} : ${name("Agent", a.id)} {`,
    );
    lines.push(
      "        part sandbox : Sandbox {",
      attrs({
        mode: a.sandbox.mode,
        scope: a.sandbox.scope,
        workspaceAccess: a.sandbox.workspaceAccess,
        image: a.sandbox.image,
        readOnlyRoot: a.sandbox.readOnlyRoot,
        network: a.sandbox.network,
        memory: a.sandbox.memory,
        cpus: a.sandbox.cpus,
        bindCount: a.sandbox.bindCount,
        bindModes: a.sandbox.bindModes,
        environmentNames: a.sandbox.environmentNames,
      }, "            "),
      "        }",
    );
    lines.push(
      "        part execution : ExecutionPosture {",
      attrs(a.execution, "            "),
      "        }",
    );
    // docs/concepts/memory.md: root MEMORY.md is the curated layer; its
    // existing instruction reference supplies metadata without duplicating prose.
    const curated = a.workspace.instructions.find((f) =>
      f.path === "MEMORY.md"
    );
    const { search, daily, otherCount } = a.memory;
    lines.push(
      "        part memory : AgentMemory {",
      attrs({
        searchEnabled: search.enabled,
        searchProvider: search.provider,
        searchModel: search.model,
        searchFallback: search.fallback,
        searchSources: search.sources,
        rememberAcrossConversations: search.rememberAcrossConversations,
        extraPathCount: search.extraPathCount,
        multimodal: search.multimodal,
        curatedSha256: curated?.sha256 ?? null,
        curatedBytes: curated?.bytes ?? null,
        dailyCount: daily.count,
        dailyFirstDate: daily.firstDate,
        dailyLastDate: daily.lastDate,
        dailyBytes: daily.bytes,
        dailySha256: daily.sha256,
        otherCount,
      }, "            "),
      "        }",
    );
    for (const s of a.workspace.skills) {
      lines.push(
        `        part ${name("skill", s.id)} : APESkills::InitialSkill {`,
        attrs({ id: s.id, source: s.path, digest: s.sha256 }, "            "),
        "        }",
      );
    }
    for (const f of a.workspace.instructions) lines.push(file(f, f.id));
    lines.push("    }");
    for (const g of a.grants) {
      lines.push(
        `    item ${name("tool", `${a.id}:${g.id}`)} : ToolGrant {`,
        attrs({ tool: g.tool, layer: g.layer, pluginId: owner(g.tool) }),
        "    }",
      );
    }
    for (const to of a.delegation) {
      lines.push(
        `    part ${name("delegation", `${a.id}:${to}`)} : DelegationRule {`,
        attrs({ fromAgent: a.id, toAgent: to }),
        "    }",
      );
    }
    if (a.heartbeat) {
      lines.push(
        `    part ${name("heartbeat", a.id)} : ScheduledCase {`,
        attrs({
          id: `heartbeat:${a.id}`,
          displayName: `Heartbeat ${a.id}`,
          enabled: a.heartbeat.everyMs > 0,
          targetAgent: a.id,
        }),
        "        attribute :>> envelope = AssemblyCases::EnvelopeKind::reassessment;",
        `        ref part :>> owner = ${name("agent", a.id)};`,
        `        ${every(a.heartbeat.everyMs)}`,
      );
      if (a.heartbeat.prompt) lines.push(file(a.heartbeat.prompt, "prompt"));
      lines.push("    }");
    }
  }
  for (const a of snapshot.accounts) {
    lines.push(
      `    part ${name("account", a.id)} : ChannelAccount {`,
      attrs({
        channel: a.channel,
        accountId: a.accountId,
        enabled: a.enabled,
        dmPolicy: a.dmPolicy,
        groupPolicy: a.groupPolicy,
      }),
      "    }",
    );
  }
  for (const b of snapshot.bindings) {
    if (
      snapshot.agents.some((a) => a.id === b.agentId) &&
      snapshot.accounts.some((a) => a.id === b.account)
    ) {
      lines.push(
        `    connection ${name("binding", b.id)} : AgentBinding connect ${
          name("agent", b.agentId)
        } to ${name("account", b.account)} {`,
        attrs({ peerKind: b.peerKind }),
        "    }",
      );
    }
  }
  for (const j of snapshot.cron) {
    lines.push(
      `    part ${name("cron", j.id)} : ScheduledCase {`,
      attrs({
        id: j.id,
        displayName: j.name,
        enabled: j.enabled,
        targetAgent: j.agentId,
      }),
      "        attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;",
    );
    const owner = snapshot.agents.find((a) => a.id === j.agentId);
    if (owner) {
      lines.push(`        ref part :>> owner = ${name("agent", owner.id)};`);
    }
    if (j.schedule.kind === "every") {
      lines.push(`        ${every(j.schedule.everyMs!)}`);
    } else if (j.schedule.kind === "at") {
      lines.push(
        "        attribute :>> schedule : AtSchedule {",
        attrs({ instant: j.schedule.expression }, "            "),
        "        }",
      );
    } else {lines.push(
        "        attribute :>> schedule : CronSchedule {",
        attrs({
          expression: j.schedule.expression,
          timezone: j.schedule.timezone,
        }, "            "),
        "        }",
      );}
    if (j.prompt) lines.push(file(j.prompt, "prompt"));
    lines.push("    }");
  }
  for (const h of snapshot.hooks) {
    lines.push(
      `    part ${name("hook", h.id)} : ExternalTrigger {`,
      attrs({
        name: h.name,
        targetAgent: h.agentId,
        deliveryChannel: h.channel,
      }),
    );
    if (h.template) lines.push(file(h.template, "template"));
    lines.push("    }");
  }
  for (const s of snapshot.bundledSkills) {
    lines.push(
      `    part ${name("bundled", s.id)} : BundledSkill {`,
      attrs({ name: s.id, enabled: s.enabled }),
      "    }",
    );
  }
  for (const p of snapshot.providers) {
    lines.push(
      `    part ${name("provider", p.id)} : ModelProvider {`,
      attrs({ name: p.id, apiKind: p.api, modelIds: p.models }),
      "    }",
    );
  }
  for (const p of snapshot.plugins ?? []) {
    lines.push(
      `    part ${name("plugin", p.id)} : OpenClawPlugin {`,
      attrs({
        pluginId: p.id,
        enabled: p.enabled,
        tools: p.tools,
        optionalTools: p.optionalTools,
      }),
      "    }",
    );
  }
  const { slot, dreaming, activeMemory } = snapshot.memoryBackend;
  lines.push(
    "    part memoryBackend : MemoryBackend {",
    attrs({
      slot,
      dreamingEnabled: dreaming.enabled,
      dreamingFrequency: dreaming.frequency,
      dreamingTimezone: dreaming.timezone,
      activeMemoryEnabled: activeMemory?.enabled ?? null,
      activeMemoryAgents: activeMemory?.agents ?? null,
      activeMemoryChatTypes: activeMemory?.allowedChatTypes ?? null,
      persistTranscripts: activeMemory?.persistTranscripts ?? null,
    }),
    "    }",
    "    part messaging : MessagingPolicy {",
    attrs(snapshot.messaging),
    "    }",
    "}",
    "",
  );
  return new Map([["OpenClawImport.sysml", OPENCLAW_IMPORT], [
    "OpenClawInstance.sysml",
    lines.join("\n"),
  ]]);
}
