import { emit } from "../../src/adapters/out/sysml/emitter.ts";
import { emitInferred } from "../../src/adapters/out/sysml/inferred.ts";
import { ASSEMBLY_LIBRARY } from "../../src/adapters/out/sysml/library.ts";
import type { ApeFinding } from "../../src/domain/model/diagnostics/ape.ts";
import type { Inference } from "../../src/domain/model/inference.ts";
import type { Snapshot } from "../../src/domain/model/snapshot.ts";

/** Public synthetic mutations covering the configuration diagnostics. */
export function openclawShapesFixture(base: Snapshot): Snapshot {
  const snapshot = structuredClone(base);
  snapshot.openclawVersion = "2026.10.9";
  snapshot.backupCount = 2;
  snapshot.messaging = { enabled: true, allowedTargets: ["*"] };
  const agent = snapshot.agents[0];
  agent.grants = ["exec", "sessions_spawn", "apply_patch"].map((tool) => ({
    id: `host:${tool}`,
    tool,
    layer: "host",
  }));
  agent.delegation = ["*"];
  agent.execution.host = "gateway";
  agent.execution.effective = { security: "full", ask: "off" };
  agent.execution.safeBins = ["\u00a0/bin/PYTHON3.12.exe\ufeff", "node"];
  agent.execution.safeBinProfiles = [" node "];
  agent.execution.commands = [{
    id: "name:*",
    command: "*",
    kind: "name",
    argsRestricted: false,
  }];
  agent.sandbox.mode = "all";
  agent.sandbox.dangerouslyAllowExternalBindSources = true;
  agent.workspace.versioned = false;
  agent.workspace.malformedSkills = [
    "skills/SKILL.md",
    "skills/broken",
    "skills/unresolved",
  ];
  agent.memory.search.enabled = true;
  agent.memory.search.provider = "remote-synthetic";
  agent.memory.search.sources = ["sessions"];
  agent.memory.search.rememberAcrossConversations = false;
  if (!snapshot.mcpServers.some((server) => server.enabled)) {
    snapshot.mcpServers.push({
      id: "synthetic",
      toolPrefix: "mcp_synthetic",
      enabled: true,
      transport: "stdio",
      oauth: false,
      oauthIdentity: null,
      toolFilter: { include: [], exclude: [] },
      envNames: [],
      headerNames: [],
      argCount: 0,
    });
  }
  snapshot.plaintextCredentialPaths = [
    "/gateway/auth/token",
    "/models/providers/synthetic/apiKey",
  ];
  const account = snapshot.accounts.find((a) => a.channel === "discord");
  if (account) {
    snapshot.plaintextCredentialPaths.push(
      `/channels/discord/accounts/${
        account.accountId.replaceAll("~", "~0").replaceAll("/", "~1")
      }/token`,
    );
    account.enabled = false;
    snapshot.bindings.push({
      id: "disabled-account",
      agentId: agent.id,
      account: account.id,
      peerKind: null,
    });
  }
  snapshot.bindings.push(
    {
      id: "missing-both",
      agentId: "absent-agent",
      account: "absent-channel:*",
      peerKind: null,
    },
    {
      id: "missing-account",
      agentId: agent.id,
      account: "absent-channel:account",
      peerKind: null,
    },
  );
  const cron = snapshot.cron[0];
  for (const enabled of [true, false]) {
    snapshot.cron.push({
      ...structuredClone(cron),
      id: `absent-${enabled}`,
      agentId: "absent-agent",
      enabled,
    });
  }
  addAuthorityCases(snapshot);
  return snapshot;
}

function addAuthorityCases(snapshot: Snapshot) {
  const agent = (id: string) => snapshot.agents.find((a) => a.id === id)!;
  agent("coach").sandbox.workspaceAccess = "ro";
  agent("devbox").sandbox.workspaceAccess = "none";
  const lead = agent("lead");
  // Leave only Skill Workshop able to change context for this agent.
  lead.grants = lead.grants.filter(({ tool }) =>
    !["write", "edit", "cron"].includes(tool)
  );
  lead.grants.push({
    id: "host:automations",
    tool: "automations",
    layer: "host",
  });
  const field = agent("field");
  field.grants = field.grants.filter(({ tool }) => tool !== "message");

  for (
    const [id, dmPolicy, groupPolicy] of [
      ["public-dm", "open", "allowlist"],
      ["public-group", "pairing", "open"],
      ["unbound-open", "open", "allowlist"],
    ]
  ) {
    snapshot.accounts.push({
      id: `telegram:${id}`,
      channel: "telegram",
      accountId: id,
      enabled: true,
      dmPolicy,
      groupPolicy,
    });
  }
  snapshot.accounts.find((account) => account.id === "whatsapp:devbox")!
    .dmPolicy = "open";
  for (
    const [id, agentId, account, peerKind] of [
      ["public-dm", "client", "telegram:public-dm", "direct"],
      ["public-group", "coach", "telegram:*", "group"],
      ["public-channel", "field", "telegram:public-group", "channel"],
      ["group-policy-on-direct", "lead", "telegram:public-group", "direct"],
      ["dm-policy-on-group", "lead", "telegram:public-dm", "group"],
    ]
  ) {
    snapshot.bindings.push({ id, agentId, account, peerKind });
  }
}

/** Instructions that limit exec: one prohibition and one permission, so only
 * the prohibition is not enforced by a host exec that runs unprompted. */
function inferenceFor(snapshot: Snapshot): Inference {
  const source = { file: "AGENTS.md", fromLine: 1, toLine: 1 };
  return {
    schema: "openclaw-inference/1",
    model: "synthetic",
    agents: [{
      agentId: snapshot.agents[0].id,
      role: "Synthetic.",
      procedures: [],
      rules: [
        {
          id: "ask-before-commands",
          text: "Never run a command without asking first.",
          kind: "prohibition",
          concern: "exec",
          source,
        },
        {
          id: "may-run-tests",
          text: "May run the test suite.",
          kind: "permission",
          concern: "exec",
          source,
        },
      ],
    }],
  };
}

/** The files a case compiles: the export, the library and, in the cases that
 * have one, the inferred package. */
export function openclawShapesSources(
  snapshot: Snapshot,
  withInference: boolean,
): Map<string, string> {
  return new Map([
    ...emit(snapshot),
    ...withInference ? emitInferred(snapshot, inferenceFor(snapshot)) : [],
    ...ASSEMBLY_LIBRARY,
  ]);
}

export const OPENCLAW_CODES = new Set([
  "PROSE_NOT_ENFORCED",
  "EXEC_ALLOWLIST_WILDCARD",
  "MCP_SANDBOX_GATE",
  "SAFE_BIN_INTERPRETER_UNPROFILED",
  "EXEC_WITHOUT_APPROVAL",
  "AGENT_WITHOUT_SANDBOX",
  "EXTERNAL_BIND_SOURCES",
  "WORKSPACE_UNVERSIONED",
  "MALFORMED_SKILLS_DIR",
  "MEMORY_SESSIONS_INDEXED",
  "MEMORY_REMOTE_EMBEDDINGS",
  "AGENT_TO_AGENT_WILDCARD",
  "PLAINTEXT_CREDENTIAL",
  "UNRESOLVED_AGENT_REFERENCE",
  "BINDING_ACCOUNT_UNAVAILABLE",
  "UNRESOLVED_BINDING_REFERENCE",
  "MANUAL_CONFIG_BACKUPS",
  "DELEGATION_WILDCARD",
  "SELF_WRITABLE_CONTEXT",
  "SELF_SCHEDULING",
  "OPEN_SENDER_POLICY",
]);

export const openclawFindingRows = (findings: ApeFinding[]) =>
  findings.filter((f) => OPENCLAW_CODES.has(f.code)).map((
    { code, subject, severity, context, recovery, principle, pattern, finding },
  ) => ({
    code,
    subject,
    severity,
    context,
    recovery,
    principle,
    pattern,
    finding,
  }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

export function openclawShapesCases(baseline: Snapshot) {
  const extended = openclawShapesFixture(baseline);
  const unverified = structuredClone(extended);
  unverified.openclawVersion = "2026.11.1";
  unverified.agents[0].execution.effective.security = "unknown";
  unverified.agents[0].execution.safeBinProfiles = ["python3.12", "node"];
  unverified.agents[0].workspace.malformedSkills = ["skills/SKILL.md"];
  unverified.agents[0].memory.search.enabled = false;
  unverified.agents[0].memory.search.rememberAcrossConversations = true;
  unverified.agents[0].grants = unverified.agents[0].grants.filter(({ tool }) =>
    tool !== "sessions_spawn" && tool !== "apply_patch"
  );
  return [["baseline", baseline, false], ["extended", extended, true], [
    "unverified-and-negative",
    unverified,
    true,
  ]] as const;
}
