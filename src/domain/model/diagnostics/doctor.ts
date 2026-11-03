import type { Finding, Snapshot } from "./snapshot.ts";
import { elementId } from "./element-id.ts";
import { credentialPathParts } from "./credentials.ts";
import { is202610 } from "./policy.ts";

// OpenClaw 2026.10.9 dist/exec-safe-bin-runtime-policy-CgvU47MQ.mjs:
// the interpreter list and versioned-name rule behind audit-BzL_D921.mjs's
// tools.exec.safe_bins_interpreter_unprofiled finding.
const interpreters = new Set([
  "ash",
  "awk",
  "bash",
  "busybox",
  "bun",
  "cmd",
  "cmd.exe",
  "cscript",
  "dash",
  "deno",
  "fish",
  "gawk",
  "gsed",
  "ksh",
  "lua",
  "mawk",
  "nawk",
  "node",
  "nodejs",
  "perl",
  "php",
  "powershell",
  "powershell.exe",
  "pypy",
  "pwsh",
  "pwsh.exe",
  "python",
  "python2",
  "python3",
  "ruby",
  "sed",
  "sh",
  "toybox",
  "wscript",
  "zsh",
]);
function unprofiledInterpreter(
  bins: string[] | null,
  profiles: string[],
): boolean {
  // dist/exec-safe-bin-trust-tdUplWO7.mjs: normalizeSafeBinName strips paths
  // and executable suffixes; normalizeSafeBinProfileName trims and lowercases.
  const names = new Set(profiles.map((p) => p.trim().toLowerCase()));
  return (bins ?? []).some((bin) => {
    const name = bin.trim().toLowerCase().split(/[\\/]/).at(-1)!
      .replace(/\.(?:exe|cmd|bat|com)$/i, "");
    return !names.has(name) && (interpreters.has(name) ||
      /^(?:python|ruby|perl|php|node)\d+(?:\.\d+)?$/.test(name));
  });
}

export function compareFindings(a: Finding, b: Finding): number {
  return a.code < b.code
    ? -1
    : a.code > b.code
    ? 1
    : a.subject < b.subject
    ? -1
    : a.subject > b.subject
    ? 1
    : 0;
}

export function doctor(snapshot: Snapshot): Finding[] {
  // Older /5 snapshots keep reference diagnostics in ambiguities. Recompute
  // these concepts here, once, using the same rules as newly collected input.
  const findings = snapshot.ambiguities.filter((f) =>
    ![
      "UNRESOLVED_AGENT_REFERENCE",
      "UNRESOLVED_BINDING_REFERENCE",
      "SAFE_BINS_DEFAULT_UNRESOLVED",
    ].includes(
      f.code,
    )
  );
  const add = (
    code: string,
    severity: Finding["severity"],
    subject: string,
    context: string,
    recovery: string,
  ) => findings.push({ code, severity, subject, context, recovery });
  const mcpTools = new Set(
    snapshot.mcpServers.filter((s) => s.enabled).map((s) =>
      `${s.toolPrefix}__*`
    ),
  );
  // docs/tools/exec-approvals.md: path and command-name patterns are globs.
  const wildcard = (subject: string, commands: { command: string }[]) => {
    if (commands.some((c) => c.command === "*")) {
      add(
        "EXEC_ALLOWLIST_WILDCARD",
        "warning",
        subject,
        "An exec allowlist has a wildcard executable basename; any directory restriction is omitted from the snapshot.",
        "Replace the wildcard with the intended command names or binary paths.",
      );
    }
  };
  for (const a of snapshot.agents) {
    const subject = elementId("agent", a.id);
    // docs/tools/exec.md lists the config default as unset;
    // docs/tools/exec-approvals-advanced.md lists runtime defaults. The export
    // collects explicit commands only; these are different layers, not a
    // contradiction between the documents.
    if (
      a.execution.safeBins === null && a.grants.some((g) => g.tool === "exec")
    ) {
      add(
        "SAFE_BINS_DEFAULT_UNRESOLVED",
        "info",
        subject,
        "Safe bins are unset; this collector does not expand runtime defaults into command grants.",
        "Set tools.exec.safeBins explicitly if command-level grants are needed; docs/tools/exec-approvals-advanced.md.",
      );
    }
    // docs/gateway/config-tools/tool-policy.md: MCP tools need a separate
    // sandbox-layer grant even when a normal tool profile allows bundle-mcp.
    if (
      a.sandbox.mode !== "off" && mcpTools.size > 0 &&
      !a.grants.some((g) => g.layer === "sandbox" && mcpTools.has(g.tool))
    ) {
      add(
        "MCP_SANDBOX_GATE",
        "info",
        subject,
        "Enabled MCP servers have no tool grant in the sandbox layer.",
        "Allow the intended server globs or bundle-mcp in the sandbox tool policy.",
      );
    }
    if (
      unprofiledInterpreter(a.execution.safeBins, a.execution.safeBinProfiles)
    ) {
      add(
        "SAFE_BIN_INTERPRETER_UNPROFILED",
        "warning",
        subject,
        "An interpreter or runtime in safeBins has no explicit argv profile.",
        "Remove interpreter safe bins or define hardened safeBinProfiles entries.",
      );
    }
    wildcard(subject, a.execution.commands);
    // docs/tools/exec-approvals.md, YOLO distinctions: auto routes sandboxed
    // sessions to the sandbox, and cannot freely switch them to gateway/node.
    // Explicit gateway runs on the host even with a sandbox-layer tool grant.
    const hostExec = a.grants.some((g) =>
      g.tool === "exec" && (a.execution.host === "gateway" ||
        a.execution.host === "auto" && g.layer === "host")
    );
    // docs/tools/exec-approvals.md: the host approval policy can tighten the
    // configured security/ask pair; inspect the resolved posture.
    if (
      hostExec && a.execution.effective.security === "full" &&
      a.execution.effective.ask === "off"
    ) {
      add(
        "EXEC_WITHOUT_APPROVAL",
        "error",
        subject,
        "Host exec is policy-reachable with security full and ask off; ordinary approval prompts are disabled.",
        "Set tools.exec.mode to ask or auto, or tighten the execution host's approvals policy.",
      );
    }
    // docs/gateway/sandboxing.md and docs/tools/exec.md: explicit host routing
    // bypasses the sandbox; host=sandbox fails closed without a sandbox runtime.
    if (hostExec && a.execution.effective.security !== "deny") {
      add(
        "AGENT_WITHOUT_SANDBOX",
        a.execution.effective.security === "unknown" ? "info" : "warning",
        subject,
        a.execution.effective.security === "unknown"
          ? "Exec routes to the gateway outside the sandbox; its effective security is unresolved."
          : "Exec can run on the gateway host outside the sandbox.",
        "Use sandbox mode all with exec host auto or sandbox, or remove the exec grant.",
      );
    }
    // docs/gateway/sandboxing/multiple-folders-for-one-agent.md: this opt-in
    // relaxes source roots only; system, credential and socket checks remain.
    if (
      a.sandbox.mode !== "off" && a.sandbox.dangerouslyAllowExternalBindSources
    ) {
      add(
        "EXTERNAL_BIND_SOURCES",
        "warning",
        subject,
        "An active sandbox permits bind sources outside workspace roots; other path checks still apply.",
        "Disable dangerouslyAllowExternalBindSources and use permitted source roots.",
      );
    }
    // docs/gateway/doctor/workspace-and-dreams.md, section 19: a backup tip,
    // not an invalid configuration. A parent Git repository is not collected.
    if (!a.workspace.versioned) {
      add(
        "WORKSPACE_UNVERSIONED",
        "info",
        subject,
        "No .git entry was recorded at the workspace root; parent repositories are not checked.",
        "If the workspace is not already backed up, track intended files in a private repository.",
      );
    }
    // dist/skill-root-discovery-B5Jg-4aX.mjs, discoverSkillCandidates: a
    // configured root may itself be a skill. Other unresolved entries are not
    // proof of an invalid skill; they may be supporting files or broken links.
    const unresolvedSkills = a.workspace.malformedSkills.filter((p) =>
      p !== "skills/SKILL.md"
    );
    if (unresolvedSkills.length) {
      add(
        "MALFORMED_SKILLS_DIR",
        "info",
        subject,
        `${unresolvedSkills.length} entries under skills could not be resolved by the collector; skill validity is not established.`,
        "Inspect these entries locally and repair broken links that belong to intended skills.",
      );
    }
    // docs/reference/memory-config.md: session sources and explicit recall
    // make conversations searchable; a remote provider receives embeddings input.
    const search = a.memory.search;
    if (
      search.enabled &&
      (search.sources.includes("sessions") ||
        search.rememberAcrossConversations === true)
    ) {
      add(
        "MEMORY_SESSIONS_INDEXED",
        "warning",
        subject,
        "Memory search includes conversation transcripts.",
        "Review session indexing and cross-conversation recall; docs/reference/memory-config.md.",
      );
    }
    if (
      search.enabled && search.provider !== null &&
      search.provider !== "local" && search.provider !== "none"
    ) {
      add(
        "MEMORY_REMOTE_EMBEDDINGS",
        "info",
        subject,
        "Memory search selects an embedding adapter other than local or none; endpoint location and transmission are not verified.",
        "Review the embedding provider and its data handling; docs/reference/memory-config.md.",
      );
    }
  }
  wildcard(
    elementId("instance"),
    snapshot.execApprovals?.wildcardCommands ?? [],
  );
  // dist/session-visibility-c_9BAYYO.mjs, createAgentToAgentPolicy: enabled
  // gates cross-agent access; both requester and target must match the allowlist.
  if (
    snapshot.messaging.enabled &&
    snapshot.messaging.allowedTargets.includes("*")
  ) {
    add(
      "AGENT_TO_AGENT_WILDCARD",
      "warning",
      elementId("instance"),
      "Enabled agent-to-agent policy allows every requester and target pair.",
      "List only the intended requester and target agents, or disable agent-to-agent access.",
    );
  }
  // docs/reference/secretref-credential-surface.md: these authored credential
  // paths accept structured SecretRefs. Plaintext is permitted, so SPEC §7
  // makes this a review warning, not a runtime-failure error.
  for (const path of [...snapshot.plaintextCredentialPaths ?? []].sort()) {
    const parts = credentialPathParts(path);
    const account = parts[0] === "channels"
      ? snapshot.accounts.find((a) =>
        a.channel === parts[1] && a.accountId === parts[3]
      )
      : undefined;
    add(
      "PLAINTEXT_CREDENTIAL",
      "warning",
      account ? elementId("account", account.id) : elementId("instance"),
      `A plaintext credential is configured at ${path}.`,
      `Replace the value at ${path} with {"source":"env","provider":"default","id":"CREDENTIAL_ENV"} and set CREDENTIAL_ENV in the gateway environment.`,
    );
  }
  const agents = new Set(snapshot.agents.map((a) => a.id));
  const cronRuntimeVerified = is202610(snapshot.openclawVersion);
  for (const job of snapshot.cron) {
    const subject = elementId("cron", job.id);
    // dist/server-cron-DmxBCDVE.mjs, resolveCronAgent: an absent explicit
    // target throws "cron job agent is unavailable"; no default substitution.
    // dist/zod-schema-2kniG8D0.mjs, explicitTargets: the ambient system agent
    // must itself belong to the roster. Older runtimes remain unverified.
    if (job.agentId !== null && !agents.has(job.agentId)) {
      add(
        "UNRESOLVED_AGENT_REFERENCE",
        job.enabled && cronRuntimeVerified ? "error" : "info",
        subject,
        !cronRuntimeVerified
          ? "The task targets an absent agent; runtime behavior is unverified for the recorded OpenClaw version."
          : job.enabled
          ? "The scheduled task targets an absent agent and fails when run."
          : "The disabled task targets an absent agent and will fail if run.",
        "Set the task's agentId to an existing agent, restore that agent, or delete the obsolete task.",
      );
    }
    // dist/cron-2TRTJPLC.mjs, CHRONIC_FAILURE_MIN_CONSECUTIVE_ERRORS and
    // inspectCronJobHealth: only enabled jobs with at least three errors qualify.
    if (job.enabled && job.runtime.consecutiveErrors >= 3) {
      add(
        "CRON_FAILING",
        "warning",
        subject,
        `${job.runtime.consecutiveErrors} consecutive failures.`,
        "Inspect job execution locally; error bodies are deliberately excluded.",
      );
    }
  }
  for (const binding of snapshot.bindings) {
    const account = snapshot.accounts.find((a) => a.id === binding.account);
    // docs/channels/channel-routing.md: accountId "*" matches any account on
    // that channel. dist/server-channels-eZDWbzoS.mjs, startChannelProcessOwned:
    // listAccountIds determines startup; disabled accounts are skipped.
    const matches = binding.account.endsWith(":*")
      ? snapshot.accounts.filter((a) => `${a.channel}:*` === binding.account)
      : account
      ? [account]
      : [];
    const subject = account
      ? elementId("account", account.id)
      : agents.has(binding.agentId)
      ? elementId("agent", binding.agentId)
      : elementId("instance");
    if (!matches.some((a) => a.enabled)) {
      add(
        "BINDING_ACCOUNT_UNAVAILABLE",
        "warning",
        subject,
        "A binding has no matching enabled channel account in the snapshot.",
        "Enable its channel and account, correct match.accountId, or remove the obsolete binding.",
      );
    }
    // docs/concepts/multi-agent.md: the exported connection needs both
    // configured endpoints; this note describes the missing model endpoint.
    if (!agents.has(binding.agentId)) {
      add(
        "UNRESOLVED_BINDING_REFERENCE",
        "info",
        subject,
        "The binding names an absent agent; no connection is drawn.",
        "Set the binding's agentId to an existing agent or remove the obsolete binding.",
      );
    }
  }
  // docs/gateway/doctor/config-migrations.md, rewrite rules: doctor writes an
  // openclaw.json.bak ring. Prefix counts do not prove manual edits or a fault.
  if (snapshot.backupCount > 0) {
    add(
      "MANUAL_CONFIG_BACKUPS",
      "info",
      elementId("instance"),
      `${snapshot.backupCount} openclaw.json.* files were recorded; they may include OpenClaw doctor's own backups.`,
      "Review backup retention and protect any credentials they contain.",
    );
  }
  return findings.sort(compareFindings);
}
