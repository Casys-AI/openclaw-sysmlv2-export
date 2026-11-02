import type { Finding, Snapshot } from "./snapshot.ts";

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

export function doctor(snapshot: Snapshot): Finding[] {
  const findings = [...snapshot.ambiguities];
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
        "An exec allowlist command matches every executable name.",
        "Replace the wildcard with the intended command names or binary paths.",
      );
    }
  };
  for (const a of snapshot.agents) {
    // docs/gateway/config-tools/tool-policy.md: MCP tools need a separate
    // sandbox-layer grant even when a normal tool profile allows bundle-mcp.
    if (
      a.sandbox.mode !== "off" && mcpTools.size > 0 &&
      !a.grants.some((g) => g.layer === "sandbox" && mcpTools.has(g.tool))
    ) {
      add(
        "MCP_SANDBOX_GATE",
        "info",
        a.id,
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
        a.id,
        "An interpreter or runtime in safeBins has no explicit argv profile.",
        "Remove interpreter safe bins or define hardened safeBinProfiles entries.",
      );
    }
    wildcard(a.id, a.execution.commands);
    const exec = a.grants.some((g) => g.tool === "exec");
    if (exec && a.execution.security === "full" && a.execution.ask === "off") {
      add(
        "EXEC_WITHOUT_APPROVAL",
        "error",
        a.id,
        "Exec is policy-reachable with security full and ask off.",
        "Restrict exec security or require approvals.",
      );
    }
    if (exec && a.sandbox.mode !== "all") {
      add(
        "AGENT_WITHOUT_SANDBOX",
        "warning",
        a.id,
        "Exec can be reached in a session without a sandbox.",
        "Enable sandbox mode all or remove the exec grant.",
      );
    }
    if (a.sandbox.dangerouslyAllowExternalBindSources) {
      add(
        "EXTERNAL_BIND_SOURCES",
        "warning",
        a.id,
        "External bind sources are explicitly allowed.",
        "Disable dangerouslyAllowExternalBindSources and use permitted source roots.",
      );
    }
    if (!a.workspace.versioned) {
      add(
        "WORKSPACE_UNVERSIONED",
        "warning",
        a.id,
        "Workspace has no .git entry.",
        "Track the intended workspace files in version control.",
      );
    }
    if (a.workspace.malformedSkills.length) {
      add(
        "MALFORMED_SKILLS_DIR",
        "warning",
        a.id,
        `${a.workspace.malformedSkills.length} malformed skill locations.`,
        "Place each skill in its own directory with SKILL.md.",
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
        a.id,
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
        a.id,
        "Memory search uses a remote embedding provider.",
        "Review the embedding provider and its data handling; docs/reference/memory-config.md.",
      );
    }
  }
  wildcard("instance", snapshot.execApprovals?.wildcardCommands ?? []);
  if (snapshot.messaging.allowedTargets.includes("*")) {
    add(
      "AGENT_TO_AGENT_WILDCARD",
      "warning",
      "instance",
      "Agent-to-agent policy contains a wildcard.",
      "List only the intended messaging targets.",
    );
  }
  if (snapshot.plaintextSecretCount > 0) {
    add(
      "PLAINTEXT_SECRET_IN_CONFIG",
      "error",
      "instance",
      `${snapshot.plaintextSecretCount} plaintext credential or environment values were excluded.`,
      "Replace plaintext credentials with supported secret references.",
    );
  }
  for (const job of snapshot.cron) {
    if (job.runtime.consecutiveErrors >= 3) {
      add(
        "CRON_FAILING",
        "warning",
        job.id,
        `${job.runtime.consecutiveErrors} consecutive failures.`,
        "Inspect job execution locally; error bodies are deliberately excluded.",
      );
    }
  }
  if (snapshot.backupCount > 0) {
    add(
      "MANUAL_CONFIG_BACKUPS",
      "info",
      "instance",
      `${snapshot.backupCount} configuration backups exist; openclaw doctor creates some of them itself.`,
      "Review backup retention and protect any credentials they contain.",
    );
  }
  return findings.sort((a, b) => {
    const x = `${a.code}:${a.subject}`, y = `${b.code}:${b.subject}`;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
