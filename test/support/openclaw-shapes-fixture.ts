import type { Snapshot } from "../../src/domain/model/snapshot.ts";

/** Public synthetic mutations covering the migrated configuration diagnostics. */
export function openclawShapesFixture(base: Snapshot): Snapshot {
  const snapshot = structuredClone(base);
  snapshot.openclawVersion = "2026.10.9";
  snapshot.backupCount = 2;
  snapshot.messaging = { enabled: true, allowedTargets: ["*"] };
  const agent = snapshot.agents[0];
  agent.grants = [{ id: "host:exec", tool: "exec", layer: "host" }];
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
  return snapshot;
}

export const MIGRATED_CODES = new Set([
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
]);

export function openclawShapesCases(baseline: Snapshot) {
  const extended = openclawShapesFixture(baseline);
  const unverified = structuredClone(extended);
  unverified.openclawVersion = "2026.11.1";
  unverified.agents[0].execution.effective.security = "unknown";
  unverified.agents[0].execution.safeBinProfiles = ["python3.12", "node"];
  unverified.agents[0].workspace.malformedSkills = ["skills/SKILL.md"];
  unverified.agents[0].memory.search.enabled = false;
  unverified.agents[0].memory.search.rememberAcrossConversations = true;
  return [["baseline", baseline], ["extended", extended], [
    "unverified-and-negative",
    unverified,
  ]] as const;
}
