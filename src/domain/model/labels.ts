import { elementId } from "./element-id.ts";
import type { Snapshot } from "./snapshot.ts";

/** The readable name of every element the Doctor, the Changes list and the
 * inspector title, by element id: an agent's display name, a task's name, an
 * account's `channel:account`. An element missing here is its own label. */
export function elementLabels(s: Snapshot): Record<string, string> {
  const agent = new Map(s.agents.map((a) => [a.id, a.name]));
  const labels: Record<string, string> = {
    [elementId("instance")]: "Instance",
  };
  for (const a of s.agents) {
    labels[elementId("agent", a.id)] = a.name;
    if (a.heartbeat) {
      labels[elementId("heartbeat", a.id)] = `${a.name} heartbeat`;
    }
  }
  for (const j of s.cron) labels[elementId("cron", j.id)] = j.name;
  for (const a of s.accounts) labels[elementId("account", a.id)] = a.id;
  for (const b of s.bindings) {
    labels[elementId("binding", b.id)] = `${
      agent.get(b.agentId) ?? b.agentId
    } → ${b.account}`;
  }
  return labels;
}
