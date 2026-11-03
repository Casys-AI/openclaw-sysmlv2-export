import { type Snapshot } from "./snapshot.ts";
export interface Change {
  kind: string;
  subject: string;
  before: unknown;
  after: unknown;
}
/** Compares what is configured. What the instance does while it runs (a task's
 * last run, the memory notes an agent writes, the backups on disk) and the
 * collector's notes are left out; so is a binding's id, which ends with its
 * position in the list: a binding is known by its agent, account and peer. */
export function diff(
  a: Snapshot,
  b: Snapshot,
  canonical: (value: unknown) => string,
): Change[] {
  const changes: Change[] = [];
  const compare = (
    kind: string,
    subject: string,
    before: unknown,
    after: unknown,
  ) => {
    if (canonical(before) !== canonical(after)) {
      changes.push({ kind, subject, before, after });
    }
  };
  const entities = <T extends { id: string }>(
    kind: string,
    left: T[],
    right: T[],
    visit?: (a: T, b: T) => void,
    key: (x: T) => string = (x) => x.id,
  ) => {
    const aa = new Map(left.map((x) => [key(x), x])),
      bb = new Map(right.map((x) => [key(x), x]));
    for (const id of [...new Set([...aa.keys(), ...bb.keys()])].sort()) {
      const old = aa.get(id), next = bb.get(id);
      if (!old || !next) {
        compare(
          `${kind}.${old ? "removed" : "added"}`,
          id,
          old ?? null,
          next ?? null,
        );
      } else if (visit) visit(old, next);
      else compare(`${kind}.changed`, id, old, next);
    }
  };
  entities("agent", a.agents, b.agents, (old, next) => {
    for (
      const key of [
        "name",
        "emoji",
        "implicit",
        "model",
        "grants",
        "policy",
        "sandbox",
        "execution",
        "delegation",
        "heartbeat",
      ] as const
    ) compare(`agent.${key}`, old.id, old[key], next[key]);
    compare("agent.memory", old.id, old.memory.search, next.memory.search);
    const workspace = (
      { path, versioned, malformedSkills }:
        Snapshot["agents"][number]["workspace"],
    ) => ({ path, versioned, malformedSkills });
    compare(
      "agent.workspace",
      old.id,
      workspace(old.workspace),
      workspace(next.workspace),
    );
    entities(
      `skill:${old.id}`,
      old.workspace.skills,
      next.workspace.skills,
      (x, y) =>
        compare("skill.digest", `${old.id}:${x.id}`, x.sha256, y.sha256),
    );
    entities(
      `instruction:${old.id}`,
      old.workspace.instructions,
      next.workspace.instructions,
      (x, y) =>
        compare("instruction.digest", `${old.id}:${x.id}`, x.sha256, y.sha256),
    );
  });
  entities("account", a.accounts, b.accounts);
  entities(
    "binding",
    a.bindings,
    b.bindings,
    () => {},
    (x) => `${x.agentId}|${x.account}|${x.peerKind ?? ""}`,
  );
  entities("hook", a.hooks, b.hooks);
  entities("provider", a.providers, b.providers);
  entities("bundledSkill", a.bundledSkills, b.bundledSkills);
  entities("plugin", a.plugins ?? [], b.plugins ?? []);
  entities("mcp", a.mcpServers, b.mcpServers);
  compare("instance.version", "instance", a.openclawVersion, b.openclawVersion);
  compare(
    "instance.environment",
    "instance",
    a.environmentNames,
    b.environmentNames,
  );
  // A null list says the collector did not look, not that nothing was found.
  const lists = !!a.plaintextCredentialPaths && !!b.plaintextCredentialPaths;
  const credentials = (s: Snapshot) => ({
    count: s.plaintextSecretCount,
    ...(lists ? { paths: s.plaintextCredentialPaths } : {}),
  });
  compare("instance.credentials", "instance", credentials(a), credentials(b));
  compare("exec.approvals", "instance", a.execApprovals, b.execApprovals);
  compare("memory.backend", "instance", a.memoryBackend, b.memoryBackend);
  compare("messaging", "instance", a.messaging, b.messaging);
  entities("cron", a.cron, b.cron, (old, next) => {
    compare("cron.schedule", old.id, old.schedule, next.schedule);
    const { schedule: _a, runtime: _x, ...left } = old,
      { schedule: _b, runtime: _y, ...right } = next;
    compare("cron.job", old.id, left, right);
  });
  return changes.sort((a, b) =>
    `${a.kind}:${a.subject}` < `${b.kind}:${b.subject}` ? -1 : 1
  );
}
