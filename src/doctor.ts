import type { Finding, Snapshot } from "./snapshot.ts";
export function doctor(snapshot: Snapshot): Finding[] {
  const findings = [...snapshot.ambiguities];
  const add = (
    code: string,
    severity: Finding["severity"],
    subject: string,
    context: string,
    recovery: string,
  ) => findings.push({ code, severity, subject, context, recovery });
  for (const a of snapshot.agents) {
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
  }
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
