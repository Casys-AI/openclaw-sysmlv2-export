import { invalid } from "../primitives/error.ts";
import {
  arr,
  enumeration,
  number,
  obj,
  required,
  text,
} from "../primitives/input.ts";
import type { Agent, Cron, FileRef, Snapshot } from "./snapshot.ts";

/** Inference contract (`openclaw-inference/1`, SPEC.md "Inference"): proposals
 * a model infers from an agent's instructions. They stay apart from
 * extracted facts and are not admitted. */
export interface Source {
  file: string;
  fromLine: number;
  toLine: number;
}
export interface Step {
  id: string;
  text: string;
  kind: "action" | "decision" | "handoff" | "escalation";
  target: string | null;
}
export interface Procedure {
  id: string;
  title: string;
  trigger: string;
  steps: Step[];
  source: Source;
}
export interface Rule {
  id: string;
  text: string;
  kind: "permission" | "constraint" | "prohibition";
  source: Source;
  /** What the rule is about, when the configuration can enforce it: `exec`
   * for how the agent may run commands. Absent otherwise, and in files that
   * predate it. */
  concern?: "exec";
}
/** What the model is sent about an agent, by digest and setting: an inference
 * can be reused exactly when it is unchanged. */
export interface InferenceInput {
  /** Who the model may name as a hand-off target: `id` or `id (name)`. */
  roster: string[];
  files: {
    file: string;
    sha256: string;
    schedule?: Cron["schedule"];
    enabled?: boolean;
  }[];
}
export interface AgentInference {
  agentId: string;
  role: string;
  procedures: Procedure[];
  rules: Rule[];
  /** What the model was sent; absent in files that predate it. */
  input?: InferenceInput;
  /** The version whose run asked the model, kept when a later version reuses
   * this inference. */
  inferredIn?: string;
}
export interface Inference {
  schema: "openclaw-inference/1";
  model: string;
  agents: AgentInference[];
}

const SLUG = "^[a-z][a-z0-9-]{0,62}$";
const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["file", "fromLine", "toLine"],
  properties: {
    file: {
      type: "string",
      description: "Source label, e.g. AGENTS.md, cron:<job id> or heartbeat",
    },
    fromLine: { type: "integer", minimum: 1 },
    toLine: { type: "integer", minimum: 1 },
  },
};
/** JSON Schema of one agent's inference, given to the model as tool parameters. */
export const AGENT_INFERENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agentId", "role", "procedures", "rules"],
  properties: {
    agentId: { type: "string" },
    role: { type: "string", description: "One sentence." },
    procedures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "trigger", "steps", "source"],
        properties: {
          id: { type: "string", pattern: SLUG },
          title: { type: "string" },
          trigger: {
            type: "string",
            description: "What starts the procedure.",
          },
          steps: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "text", "kind", "target"],
              properties: {
                id: { type: "string", pattern: SLUG },
                text: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["action", "decision", "handoff", "escalation"],
                },
                target: {
                  type: ["string", "null"],
                  description:
                    "Agent id, owner or customer for handoffs and escalations; otherwise null.",
                },
              },
            },
          },
          source: sourceSchema,
        },
      },
    },
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "kind", "concern", "source"],
        properties: {
          id: { type: "string", pattern: SLUG },
          text: { type: "string" },
          kind: {
            type: "string",
            enum: ["permission", "constraint", "prohibition"],
          },
          concern: {
            type: ["string", "null"],
            enum: ["exec", null],
            description:
              "exec when the rule limits how the agent may run commands; otherwise null.",
          },
          source: sourceSchema,
        },
      },
    },
  },
};

/** Only agent turns with a prompt and an explicit owner are inference sources. */
export function cronSources(snapshot: Snapshot, agentId: string): Cron[] {
  return snapshot.cron.filter((job) =>
    job.agentId === agentId && job.payloadKind === "agentTurn" &&
    job.prompt !== null
  );
}

/** Workspace sources are behavior files: bootstrap-style names (AGENTS.md,
 * SOUL.md, TOOLS.md…), never the agent's memory or its owner's profile, nor
 * other notes kept in the workspace. */
export function behaviourFiles(agent: Agent): FileRef[] {
  return agent.workspace.instructions.filter((f) =>
    /^[A-Z_]+\.md$/.test(f.path) && !["MEMORY.md", "USER.md"].includes(f.path)
  );
}

/** What the model is sent about an agent, from the collected digests. */
export function inferenceInput(
  snapshot: Snapshot,
  agent: Agent,
): InferenceInput {
  return {
    roster: snapshot.agents.map((a) =>
      a.name === a.id ? a.id : `${a.id} (${a.name})`
    ),
    files: [
      ...behaviourFiles(agent).map((f) => ({ file: f.path, sha256: f.sha256 })),
      ...cronSources(snapshot, agent.id).map((job) => ({
        file: `cron:${job.id}`,
        sha256: job.prompt!.sha256,
        schedule: job.schedule,
        enabled: job.enabled,
      })),
      ...(agent.heartbeat?.prompt
        ? [{
          file: "heartbeat",
          sha256: agent.heartbeat.prompt.sha256,
          schedule: {
            kind: "every" as const,
            everyMs: agent.heartbeat.everyMs,
            expression: null,
            timezone: null,
          },
          enabled: agent.heartbeat.everyMs > 0,
        }]
        : []),
    ],
  };
}

/** Stable labels resolve to collected digests, never to prompt bodies. */
export function sourceFiles(
  snapshot: Snapshot,
  agent: Agent,
): Map<string, FileRef> {
  return new Map([
    ...agent.workspace.instructions.map((f): [string, FileRef] => [f.path, f]),
    ...cronSources(snapshot, agent.id).map((job): [string, FileRef] => [
      `cron:${job.id}`,
      job.prompt!,
    ]),
    ...(agent.heartbeat?.prompt
      ? [["heartbeat", agent.heartbeat.prompt] as [string, FileRef]]
      : []),
  ]);
}

/** Instructions travel inline, numbered; schedule metadata is not a source line. */
export function inferencePrompt(
  agentId: string,
  files: {
    path: string;
    text: string;
    schedule?: Cron["schedule"];
    enabled?: boolean;
  }[],
  agents: { id: string; name: string }[],
): string {
  const targets = [
    ...agents.map((a) => a.name === a.id ? a.id : `${a.id} (${a.name})`),
    "owner",
    "customer",
  ];
  const body = files.map((f) => {
    const schedule = f.schedule
      ? `Scheduled task${
        f.enabled === undefined ? "" : f.enabled ? " (enabled)" : " (disabled)"
      }; schedule: ${JSON.stringify(f.schedule)}\n`
      : "";
    return `### ${f.path}\n${schedule}${
      f.text.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n")
    }`;
  }).join("\n\n");
  return [
    `Describe how the OpenClaw agent \`${agentId}\` works, from its instruction sources below.`,
    "Extract its procedures as ordered steps, and its rules (permissions, constraints, prohibitions).",
    "For a scheduled task (cron or heartbeat), use its schedule as the procedure trigger, including expression and time zone or interval. Preserve disabled status; a null time zone is unknown, not UTC.",
    "Mark a step as handoff or escalation when work goes to another agent, the owner or the customer, and name that target.",
    'For a rule that limits how the agent may run commands (the exec tool, a shell, processes), set concern to "exec"; otherwise set it to null.',
    `A target is one of these ids, written without the name in parentheses: ${
      targets.join(", ")
    }. Use null otherwise.`,
    `Cite each procedure and rule with the source label and line range it comes from, among: ${
      files.map((f) => f.path).join(", ")
    }. Describe only what the sources say; do not invent steps.`,
    "Ids are lowercase kebab-case and unique across procedures, steps and rules.",
    "Do not copy secrets, names of people or contact details: describe roles instead.",
    "Answer with one JSON object only, no prose and no code fence, matching this JSON Schema:",
    JSON.stringify(AGENT_INFERENCE_SCHEMA),
    "",
    body,
  ].join("\n");
}

const slug = new RegExp(SLUG);
function id(v: unknown, seen: Set<string>): string {
  const s = required(v);
  if (!slug.test(s) || seen.has(s)) {
    invalid("Invalid or duplicate inference id");
  }
  seen.add(s);
  return s;
}
function phrase(v: unknown, SENSITIVE: RegExp[]): string {
  let s = required(v).trim();
  if (!s) invalid("Inference text must not be empty");
  for (const p of SENSITIVE) s = s.replace(p, "[redacted]");
  // A long sentence is shortened, not a reason to drop the whole agent.
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
}
function source(v: unknown, files: Set<string>): Source {
  const o = obj(v), file = required(o.file);
  const fromLine = number(o.fromLine), toLine = number(o.toLine);
  if (!files.has(file)) {
    invalid("Inference cites an unknown instruction source");
  }
  if (!fromLine || !toLine || fromLine < 1 || toLine < fromLine) {
    invalid("Invalid inference line range");
  }
  return { file, fromLine: fromLine!, toLine: toLine! };
}

/** Validates one agent's model output at the trust boundary. */
export function parseAgentInference(
  value: unknown,
  snapshot: Snapshot,
  expectedAgentId: string,
  SENSITIVE: RegExp[],
  sentFiles?: string[],
): AgentInference {
  const o = obj(value), agentId = required(o.agentId);
  // Prose can try to speak for another agent: the answer must be about the one asked.
  if (agentId !== expectedAgentId) invalid("Inference names another agent");
  const agent = snapshot.agents.find((a) => a.id === agentId) ??
    invalid("Inference names an unknown agent");
  // Citations may only point at this agent's sources that the model received.
  const files = new Set(
    [...sourceFiles(snapshot, agent).keys()].filter((p) =>
      !sentFiles || sentFiles.includes(p)
    ),
  );
  const targets = new Set([
    ...snapshot.agents.map((a) => a.id),
    "owner",
    "customer",
  ]);
  const seen = new Set<string>();
  return {
    agentId,
    role: phrase(o.role, SENSITIVE),
    procedures: arr(o.procedures).map((p) => {
      const po = obj(p);
      const steps = arr(po.steps).map((s) => {
        const so = obj(s);
        const kind = enumeration(so.kind, [
          "action",
          "decision",
          "handoff",
          "escalation",
        ], "action");
        const target = text(so.target);
        if (target !== null && !targets.has(target)) {
          invalid("Inference step targets an unknown agent or party");
        }
        return {
          id: id(so.id, seen),
          text: phrase(so.text, SENSITIVE),
          kind,
          target,
        };
      });
      if (!steps.length) invalid("A procedure needs at least one step");
      return {
        id: id(po.id, seen),
        title: phrase(po.title, SENSITIVE),
        trigger: phrase(po.trigger, SENSITIVE),
        steps,
        source: source(po.source, files),
      };
    }),
    rules: arr(o.rules).map((r) => {
      const ro = obj(r);
      return {
        id: id(ro.id, seen),
        text: phrase(ro.text, SENSITIVE),
        kind: enumeration(ro.kind, [
          "permission",
          "constraint",
          "prohibition",
        ], "constraint"),
        // Lenient: an unknown or absent concern is none, not a reason to
        // drop the agent's whole inference.
        ...(ro.concern === "exec" ? { concern: "exec" as const } : {}),
        source: source(ro.source, files),
      };
    }),
  };
}
