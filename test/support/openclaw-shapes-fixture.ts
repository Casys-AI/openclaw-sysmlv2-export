import { emit } from "../../src/adapters/out/sysml/emitter.ts";
import { emitInferred } from "../../src/adapters/out/sysml/inferred.ts";
import { ASSEMBLY_LIBRARY } from "../../src/adapters/out/sysml/library.ts";
import type { Inference } from "../../src/domain/model/inference.ts";
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

export const MIGRATED_CODES = new Set([
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
  return [["baseline", baseline, false], ["extended", extended, true], [
    "unverified-and-negative",
    unverified,
    true,
  ]] as const;
}
