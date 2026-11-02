import { canonical, type Snapshot } from "./snapshot.ts";
export interface Change {
  kind: string;
  subject: string;
  before: unknown;
  after: unknown;
}
export function diff(a: Snapshot, b: Snapshot): Change[] {
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
  ) => {
    const aa = new Map(left.map((x) => [x.id, x])),
      bb = new Map(right.map((x) => [x.id, x]));
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
        "model",
        "grants",
        "sandbox",
        "execution",
        "delegation",
        "heartbeat",
      ] as const
    ) compare(`agent.${key}`, old.id, old[key], next[key]);
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
  entities("binding", a.bindings, b.bindings);
  entities("plugin", a.plugins ?? [], b.plugins ?? []);
  entities("cron", a.cron, b.cron, (old, next) => {
    compare("cron.schedule", old.id, old.schedule, next.schedule);
    const { schedule: _a, ...left } = old, { schedule: _b, ...right } = next;
    compare("cron.job", old.id, left, right);
  });
  return changes.sort((a, b) =>
    `${a.kind}:${a.subject}` < `${b.kind}:${b.subject}` ? -1 : 1
  );
}
