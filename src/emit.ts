import { OPENCLAW_IMPORT } from "./library.ts";
import {
  type Agent,
  canonical,
  type FileRef,
  type Snapshot,
} from "./snapshot.ts";

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
/** Attribute redefinitions; null values are left unset. */
function attrs(values: Record<string, unknown>): string[] {
  return Object.entries(values).filter(([, v]) => v !== null).map(([k, v]) =>
    `attribute :>> ${k} = ${literal(v)};`
  );
}
/** A SysML body whose lines are indented one level. */
function block(header: string, body: string[]): string[] {
  return [`${header} {`, ...body.map((l) => `    ${l}`), "}"];
}
function file(f: FileRef, declaration: string): string[] {
  return block(
    declaration,
    attrs({ path: f.path, sha256: f.sha256, bytes: f.bytes }),
  );
}
function every(ms: number): string[] {
  return block("attribute :>> schedule : MillisecondEvery", [
    `attribute :>> durationMs = ${ms};`,
    ...(ms % 60000 === 0
      ? [
        `attribute :>> count = ${ms / 60000};`,
        "attribute :>> unit = AssemblyCases::ScheduleUnit::minute;",
      ]
      : []),
  ]);
}

const ORIGINS = ["builtin", "plugin", "mcp", "cli"] as const;
interface Tool {
  /** Catalog key: the tool name, or `cli:<command>` for a CLI tool. */
  key: string;
  toolId: string;
  origin: typeof ORIGINS[number];
  provider: string | null;
  optional: boolean;
}
interface Grant {
  id: string;
  tool: Tool;
  layer: string;
  commandKind: string | null;
  argsRestricted: boolean | null;
}

/** The agent's effective grants, each with the catalog tool it references:
 * policy grants, then the CLI commands reachable through each exec grant. */
function grants(snapshot: Snapshot, a: Agent): Grant[] {
  const tool = (toolId: string): Tool => {
    // docs/gateway/config-tools/tool-policy.md: configured MCP tools belong to
    // bundle-mcp, named after their server; a plugin's declared name is its tool.
    const server = snapshot.mcpServers.find((s) =>
      s.enabled && toolId === `${s.toolPrefix}__*`
    );
    const plugin = server
      ? undefined
      : snapshot.plugins?.find((p) => p.enabled && p.tools.includes(toolId));
    return {
      key: toolId,
      toolId,
      origin: server ? "mcp" : plugin ? "plugin" : "builtin",
      provider: server?.id ?? plugin?.id ?? null,
      optional: plugin?.optionalTools.includes(toolId) ?? false,
    };
  };
  const result: Grant[] = a.grants.map((g) => ({
    id: g.id,
    tool: tool(g.tool),
    layer: g.layer,
    commandKind: null,
    argsRestricted: null,
  }));
  // docs/tools/exec-approvals.md, exec.security: command allowlists apply
  // only to allowlist security and cannot grant access to the exec tool.
  if (a.execution.effective.security !== "allowlist") return result;
  for (const exec of a.grants.filter((g) => g.tool === "exec")) {
    for (const c of a.execution.commands) {
      result.push({
        id: `${exec.layer}:cli:${c.id}`,
        tool: {
          key: `cli:${c.command}`,
          toolId: c.command,
          origin: "cli",
          provider: "exec",
          optional: false,
        },
        layer: exec.layer,
        commandKind: c.kind,
        argsRestricted: c.argsRestricted,
      });
    }
  }
  return result;
}

const group = (title: string, doc: string, body: string[]) =>
  block(`package ${title}`, [`doc /* ${doc} */`, ...body]);

export function emit(snapshot: Snapshot): Map<string, string> {
  const agents = [...snapshot.agents].sort((a, b) => a.id < b.id ? -1 : 1);
  const granted = new Map(agents.map((a) => [a.id, grants(snapshot, a)]));
  const catalog = new Map(
    [...granted.values()].flat().map((g) => [g.tool.key, g.tool]),
  );

  const operators: string[] = [];
  for (const a of agents) {
    operators.push(
      ...block(`part def ${name("Agent", a.id)} :> OpenClawAgent`, [
        ...attrs({
          id: a.id,
          displayName: a.name,
          emoji: a.emoji,
          primaryModel: a.model.primary,
          fallbackModels: a.model.fallbacks,
        }),
        `doc /* Sanitized OpenClaw tool policy provenance: ${
          canonical(a.policy).trim().replaceAll("*/", "* /")
        } */`,
        ...granted.get(a.id)!.map((g) =>
          `ref item ${name("grant", g.id)} : ToolGrant = Authority::${
            name("grant", `${a.id}:${g.id}`)
          };`
        ),
      ]),
    );
    // docs/concepts/memory.md: root MEMORY.md is the curated layer; its
    // existing instruction reference supplies metadata without duplicating prose.
    const curated = a.workspace.instructions.find((f) =>
      f.path === "MEMORY.md"
    );
    const { search, daily, otherCount } = a.memory;
    const { commands: _commands, approvals, effective, ...execution } =
      a.execution;
    operators.push(
      ...block(`part ${name("agent", a.id)} : ${name("Agent", a.id)}`, [
        ...block(
          "part sandbox : Sandbox",
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
          }),
        ),
        ...block(
          "part execution : ExecutionPosture",
          attrs({
            ...execution,
            approvalSecurity: approvals.security,
            approvalAsk: approvals.ask,
            effectiveSecurity: effective.security,
            effectiveAsk: effective.ask,
          }),
        ),
        ...block(
          "part memory : AgentMemory",
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
          }),
        ),
        ...a.workspace.skills.flatMap((s) =>
          block(
            `part ${name("skill", s.id)} : APESkills::InitialSkill`,
            attrs({ id: s.id, source: s.path, digest: s.sha256 }),
          )
        ),
        ...a.workspace.instructions.flatMap((f) =>
          file(f, `part ${name("file", f.id)} : InstructionFile`)
        ),
      ]),
    );
  }
  for (const p of snapshot.providers) {
    operators.push(...block(
      `part ${name("provider", p.id)} : ModelProvider`,
      attrs({ name: p.id, apiKind: p.api, modelIds: p.models }),
    ));
  }

  const tools = block(
    "part toolCatalog : ToolCatalog",
    [...catalog.values()].sort((a, b) =>
      ORIGINS.indexOf(a.origin) - ORIGINS.indexOf(b.origin) ||
      (a.toolId < b.toolId ? -1 : a.toolId > b.toolId ? 1 : 0)
    ).flatMap((t) =>
      block(`part ${name("tool", t.key)} :> tools`, [
        ...attrs({ toolId: t.toolId }),
        `attribute :>> origin = ToolOrigin::${t.origin};`,
        ...attrs({ provider: t.provider, optional: t.optional }),
      ])
    ),
  );
  for (const p of snapshot.plugins ?? []) {
    tools.push(...block(
      `part ${name("plugin", p.id)} : OpenClawPlugin`,
      attrs({
        pluginId: p.id,
        enabled: p.enabled,
        tools: p.tools,
        optionalTools: p.optionalTools,
        toolProfiles: p.toolProfiles,
      }),
    ));
  }
  for (const s of snapshot.mcpServers) {
    tools.push(...block(
      `part ${name("mcp", s.id)} : McpServer`,
      attrs({
        serverId: s.id,
        toolPrefix: s.toolPrefix,
        enabled: s.enabled,
        transport: s.transport,
        oauth: s.oauth,
        oauthIdentity: s.oauthIdentity,
        toolInclude: s.toolFilter.include,
        toolExclude: s.toolFilter.exclude,
        envNames: s.envNames,
        headerNames: s.headerNames,
        argCount: s.argCount,
      }),
    ));
  }

  const { slot, dreaming, activeMemory } = snapshot.memoryBackend;
  const context = [
    ...snapshot.bundledSkills.flatMap((s) =>
      block(
        `part ${name("bundled", s.id)} : BundledSkill`,
        attrs({ name: s.id, enabled: s.enabled }),
      )
    ),
    ...block(
      "part memoryBackend : MemoryBackend",
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
    ),
  ];

  const cases: string[] = [];
  for (const a of agents) {
    if (!a.heartbeat) continue;
    cases.push(...block(`part ${name("heartbeat", a.id)} : ScheduledCase`, [
      ...attrs({
        id: `heartbeat:${a.id}`,
        displayName: `Heartbeat ${a.id}`,
        enabled: a.heartbeat.everyMs > 0,
        targetAgent: a.id,
      }),
      "attribute :>> envelope = AssemblyCases::EnvelopeKind::reassessment;",
      `ref part :>> owner = Operators::${name("agent", a.id)};`,
      ...every(a.heartbeat.everyMs),
      ...(a.heartbeat.prompt
        ? file(a.heartbeat.prompt, "part file_prompt : InstructionFile")
        : []),
    ]));
  }
  for (const j of snapshot.cron) {
    const owner = snapshot.agents.find((a) => a.id === j.agentId);
    cases.push(...block(`part ${name("cron", j.id)} : ScheduledCase`, [
      ...attrs({
        id: j.id,
        displayName: j.name,
        enabled: j.enabled,
        targetAgent: j.agentId,
      }),
      "attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;",
      ...(owner
        ? [`ref part :>> owner = Operators::${name("agent", owner.id)};`]
        : []),
      ...(j.schedule.kind === "every"
        ? every(j.schedule.everyMs!)
        : j.schedule.kind === "at"
        ? block(
          "attribute :>> schedule : AtSchedule",
          attrs({ instant: j.schedule.expression }),
        )
        : block(
          "attribute :>> schedule : CronSchedule",
          attrs({
            expression: j.schedule.expression,
            timezone: j.schedule.timezone,
          }),
        )),
      ...(j.prompt ? file(j.prompt, "part file_prompt : InstructionFile") : []),
    ]));
  }

  const entries = snapshot.accounts.flatMap((a) =>
    block(
      `part ${name("account", a.id)} : ChannelAccount`,
      attrs({
        channel: a.channel,
        accountId: a.accountId,
        enabled: a.enabled,
        dmPolicy: a.dmPolicy,
        groupPolicy: a.groupPolicy,
      }),
    )
  );
  for (const b of snapshot.bindings) {
    if (
      snapshot.agents.some((a) => a.id === b.agentId) &&
      snapshot.accounts.some((a) => a.id === b.account)
    ) {
      entries.push(...block(
        `connection ${
          name("binding", b.id)
        } : AgentBinding connect Operators::${name("agent", b.agentId)} to ${
          name("account", b.account)
        }`,
        attrs({ peerKind: b.peerKind }),
      ));
    }
  }
  for (const h of snapshot.hooks) {
    entries.push(...block(`part ${name("hook", h.id)} : ExternalTrigger`, [
      ...attrs({
        name: h.name,
        targetAgent: h.agentId,
        deliveryChannel: h.channel,
      }),
      ...(h.template
        ? file(h.template, "part file_template : InstructionFile")
        : []),
    ]));
  }

  const authority: string[] = [];
  for (const a of agents) {
    for (const g of granted.get(a.id)!) {
      authority.push(
        ...block(`item ${name("grant", `${a.id}:${g.id}`)} : ToolGrant`, [
          `ref :>> tool = Tools::toolCatalog.${name("tool", g.tool.key)};`,
          ...attrs({
            layer: g.layer,
            commandKind: g.commandKind,
            argsRestricted: g.argsRestricted,
          }),
        ]),
      );
    }
  }
  for (const a of agents) {
    for (const to of a.delegation) {
      authority.push(...block(
        `part ${name("delegation", `${a.id}:${to}`)} : DelegationRule`,
        attrs({ fromAgent: a.id, toAgent: to }),
      ));
    }
  }
  authority.push(
    ...block("part messaging : MessagingPolicy", attrs(snapshot.messaging)),
  );
  if (snapshot.execApprovals !== null) {
    const { defaults, wildcardCommands } = snapshot.execApprovals;
    authority.push(...block(
      "part execApprovals : ExecApprovals",
      attrs({
        defaultSecurity: defaults.security,
        defaultAsk: defaults.ask,
        askFallback: defaults.askFallback,
        autoAllowSkills: defaults.autoAllowSkills,
        wildcardCommands,
      }),
    ));
  }

  const instance = block("package OpenClawInstance", [
    "private import OpenClawImport::*;",
    "private import ScalarValues::*;",
    ...group(
      "Operators",
      "OpenClaw agents as software operators, with their sandbox, exec posture, memory, skills and instruction files, and the model providers they use.",
      operators,
    ),
    ...group(
      "Tools",
      "One catalog of every granted tool, by origin (built-in, plugin, MCP, CLI). Plugins and MCP servers are providers.",
      tools,
    ),
    ...group(
      "Context",
      "Instance-wide context: bundled skill entries and the memory backend.",
      context,
    ),
    ...group("Cases", "Cron jobs and heartbeats as scheduled cases.", cases),
    ...group(
      "Entries",
      "Channel accounts, the agents bound to them, and hooks.",
      entries,
    ),
    ...group(
      "Authority",
      "Effective tool grants per agent and layer, delegation and agent-to-agent messaging rules, and host exec approvals.",
      authority,
    ),
  ]);
  return new Map([["OpenClawImport.sysml", OPENCLAW_IMPORT], [
    "OpenClawInstance.sysml",
    instance.join("\n") + "\n",
  ]]);
}
