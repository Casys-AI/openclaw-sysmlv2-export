import type { Change } from "./diff.ts";
import { elementId } from "./element-id.ts";

/** One thing that changed about a subject, short enough to read at a glance:
 * a value before and after, or the items added to and removed from a list.
 * `field` is the path inside the subject (or the entity a list holds); a bullet
 * without one is the subject itself added or removed. */
export interface DiffBullet {
  /** `diff`'s kind, with the agent of a skill or instruction left out:
   * `agent.model`, `skill.added`, `account.changed`. */
  kind: string;
  field?: string;
  before?: string;
  after?: string;
  added?: string[];
  removed?: string[];
}
/** What changed about one element, by its id in the version that has it (the
 * previous one for a removal), in the order the Changes tab lists them. */
export interface DiffSubject {
  id: string;
  label: string;
  bullets: DiffBullet[];
}

type Entity = { id: string } | null;
const LIMIT = 160;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function show(value: unknown): string {
  const text = value === null || value === undefined
    ? "—"
    : Array.isArray(value)
    ? value.map(show).join(", ") || "none"
    : isObject(value)
    ? JSON.stringify(value)
    : String(value);
  return text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text;
}

/** The leaves of a change: the values that differ, and the lists' items. */
function leaves(
  path: string,
  before: unknown,
  after: unknown,
  canonical: (value: unknown) => string,
): Omit<DiffBullet, "kind">[] {
  if (canonical(before) === canonical(after)) return [];
  const join = (key: string) => path ? `${path}.${key}` : key;
  const at = path ? { field: path } : {};
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
      .flatMap((key) => leaves(join(key), before[key], after[key], canonical));
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    // Items are known by their id when they have one, else by their value.
    const id = (x: unknown) =>
      !isObject(x)
        ? String(x)
        : typeof x.id === "string"
        ? x.id
        : canonical(x).trim();
    const [was, now] = [
      new Map(before.map((x) => [id(x), x])),
      new Map(after.map((x) => [id(x), x])),
    ];
    const [added, removed] = [
      [...now.keys()].filter((k) => !was.has(k)),
      [...was.keys()].filter((k) => !now.has(k)),
    ];
    const kept = [...now.keys()].filter((k) =>
      was.has(k) && isObject(now.get(k))
    )
      .flatMap((k) => leaves(join(k), was.get(k), now.get(k), canonical));
    if (!added.length && !removed.length && !kept.length) {
      return [{ ...at, before: show(before), after: show(after) }];
    }
    return [
      ...added.length || removed.length
        ? [{
          ...at,
          ...(added.length ? { added: added.map(show) } : {}),
          ...(removed.length ? { removed: removed.map(show) } : {}),
        }]
        : [],
      ...kept,
    ];
  }
  return [{ ...at, before: show(before), after: show(after) }];
}

/** The element a change is about, and its bullets. */
function bulletsOf(
  c: Change,
  canonical: (value: unknown) => string,
): { id: string; bullets: DiffBullet[] } {
  const entity = (c.before ?? c.after) as Entity;
  const [family, status] = c.kind.split(/\.(?=[^.]*$)/) as [string, string];
  const owned = family.match(/^(skill|instruction):(.*)$/);
  const whole = (kind: string, id: string) => ({ id, bullets: [{ kind }] });
  const withLeaves = (id: string, kind: string, prefix = "") => ({
    id,
    bullets: leaves(prefix, c.before, c.after, canonical).map((l) => ({
      kind,
      ...l,
    })),
  });
  if (owned) {
    return {
      id: elementId("agent", owned[2]),
      bullets: [{ kind: `${owned[1]}.${status}`, field: c.subject }],
    };
  }
  switch (family) {
    case "agent":
    case "cron": {
      const id = elementId(family, c.subject);
      return status === "added" || status === "removed"
        ? whole(c.kind, id)
        : withLeaves(id, c.kind);
    }
    case "skill":
    case "instruction": {
      // `digest`: the subject is `agent:file`.
      const at = c.subject.indexOf(":");
      return {
        id: elementId("agent", c.subject.slice(0, at)),
        bullets: [{
          kind: c.kind,
          field: c.subject.slice(at + 1),
          before: show(c.before),
          after: show(c.after),
        }],
      };
    }
    case "binding":
      return whole(c.kind, elementId("binding", entity!.id));
    case "account":
    case "hook":
    case "plugin":
    case "mcp": {
      const id = elementId(family, entity!.id);
      return status === "changed" ? withLeaves(id, c.kind) : whole(c.kind, id);
    }
    case "provider":
    case "bundledSkill":
      return status === "changed"
        ? withLeaves(elementId("instance"), c.kind, c.subject)
        : {
          id: elementId("instance"),
          bullets: [{ kind: c.kind, field: c.subject }],
        };
    default:
      return withLeaves(elementId("instance"), c.kind);
  }
}

/** The changes between two snapshots as bullets per element. `labels` are the
 * readable names of the version that has the element. */
export function diffSubjects(
  changes: Change[],
  labels: { before: Record<string, string>; after: Record<string, string> },
  canonical: (value: unknown) => string,
): DiffSubject[] {
  const subjects = new Map<string, DiffSubject>();
  for (const change of changes) {
    const { id, bullets } = bulletsOf(change, canonical);
    // A change always shows: when no leaf differs (a list reordered), the whole value does.
    const shown = bullets.length ? bullets : [{
      kind: change.kind,
      before: show(change.before),
      after: show(change.after),
    }];
    if (!subjects.has(id)) {
      subjects.set(id, {
        id,
        label: labels.after[id] ?? labels.before[id] ?? id,
        bullets: [],
      });
    }
    subjects.get(id)!.bullets.push(...shown);
  }
  const rank = (s: DiffSubject) => s.id === "instance" ? "" : s.id;
  return [...subjects.values()].sort((a, b) => rank(a) < rank(b) ? -1 : 1);
}
