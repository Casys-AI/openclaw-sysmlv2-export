import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";
import { invalid } from "./error.ts";
import { arr, enumeration, number, obj, required, text } from "./input.ts";
import { name } from "./emit.ts";
import type { Snapshot } from "./snapshot.ts";

/** Inference contract (`openclaw-inference/1`, SPEC.md "Inference"): proposals
 * a model infers from an agent's instruction files. They stay apart from
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
}
export interface AgentInference {
  agentId: string;
  role: string;
  procedures: Procedure[];
  rules: Rule[];
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
      description: "Instruction file name, e.g. AGENTS.md",
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
        required: ["id", "text", "kind", "source"],
        properties: {
          id: { type: "string", pattern: SLUG },
          text: { type: "string" },
          kind: {
            type: "string",
            enum: ["permission", "constraint", "prohibition"],
          },
          source: sourceSchema,
        },
      },
    },
  },
};

/** The instruction given to the agent; its files travel inline, numbered. */
export function inferencePrompt(
  agentId: string,
  files: { path: string; text: string }[],
  agents: { id: string; name: string }[],
): string {
  const targets = [
    ...agents.map((a) => a.name === a.id ? a.id : `${a.id} (${a.name})`),
    "owner",
    "customer",
  ];
  const body = files.map((f) =>
    `### ${f.path}\n${
      f.text.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n")
    }`
  ).join("\n\n");
  return [
    `Describe how the OpenClaw agent \`${agentId}\` works, from its instruction files below.`,
    "Extract its procedures as ordered steps, and its rules (permissions, constraints, prohibitions).",
    "Mark a step as handoff or escalation when work goes to another agent, the owner or the customer, and name that target.",
    `A target is one of these ids, written without the name in parentheses: ${
      targets.join(", ")
    }. Use null otherwise.`,
    `Cite each procedure and rule with the file and line range it comes from, among: ${
      files.map((f) => f.path).join(", ")
    }. Describe only what the files say; do not invent steps.`,
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
// Model text may copy contact details or credentials from the prose: mask them.
const SENSITIVE = [
  EMAIL_ADDRESS_PATTERN.pattern,
  JWT_PATTERN.pattern,
  /[A-Za-z0-9_\-]{32,}/,
  /\+?\d[\d ().-]{7,}\d/,
].map((p) =>
  new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`)
);
function phrase(v: unknown): string {
  let s = required(v).trim();
  if (!s) invalid("Inference text must not be empty");
  for (const p of SENSITIVE) s = s.replace(p, "[redacted]");
  // A long sentence is shortened, not a reason to drop the whole agent.
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
}
function source(v: unknown, files: Set<string>): Source {
  const o = obj(v), file = required(o.file);
  const fromLine = number(o.fromLine), toLine = number(o.toLine);
  if (!files.has(file)) invalid("Inference cites an unknown instruction file");
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
  sentFiles?: string[],
): AgentInference {
  const o = obj(value), agentId = required(o.agentId);
  // Prose can try to speak for another agent: the answer must be about the one asked.
  if (agentId !== expectedAgentId) invalid("Inference names another agent");
  const agent = snapshot.agents.find((a) => a.id === agentId) ??
    invalid("Inference names an unknown agent");
  // Citations may only point at files the model actually received.
  const files = new Set(
    agent.workspace.instructions.map((f) => f.path).filter((p) =>
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
    role: phrase(o.role),
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
        return { id: id(so.id, seen), text: phrase(so.text), kind, target };
      });
      if (!steps.length) invalid("A procedure needs at least one step");
      return {
        id: id(po.id, seen),
        title: phrase(po.title),
        trigger: phrase(po.trigger),
        steps,
        source: source(po.source, files),
      };
    }),
    rules: arr(o.rules).map((r) => {
      const ro = obj(r);
      return {
        id: id(ro.id, seen),
        text: phrase(ro.text),
        kind: enumeration(ro.kind, [
          "permission",
          "constraint",
          "prohibition",
        ], "constraint"),
        source: source(ro.source, files),
      };
    }),
  };
}

const doc = (s: string) => `doc /* ${s.replaceAll("*/", "* /")} */`;

/** Emits the proposals as a separate package, each element linked to the
 * digest of the file it was inferred from. */
export function emitInferred(
  snapshot: Snapshot,
  inference: Inference,
): Map<string, string> {
  const lines = [
    "package OpenClawInferred {",
    "    private import ScalarValues::*;",
    `    ${
      doc(
        `Proposals inferred by ${inference.model} from agent instruction files. Not admitted: accept or decline each one.`,
      )
    }`,
  ];
  const fileOf = (agentId: string, s: Source) => {
    const f = snapshot.agents.find((a) => a.id === agentId)!.workspace
      .instructions.find((i) => i.path === s.file)!;
    return `source ${s.file}:${s.fromLine}-${s.toLine} sha256 ${f.sha256}`;
  };
  for (
    const a of [...inference.agents].sort((x, y) =>
      x.agentId < y.agentId ? -1 : 1
    )
  ) {
    for (const p of a.procedures) {
      lines.push(
        `    action def ${name(a.agentId, p.id.replaceAll("-", "_"))} {`,
        `        ${
          doc(
            `Inferred procedure "${p.title}". Trigger: ${
              p.trigger.replace(/\.$/, "")
            }. ${fileOf(a.agentId, p.source)}`,
          )
        }`,
      );
      for (const s of p.steps) {
        const to = s.target ? ` → ${s.target}` : "";
        lines.push(
          `        action ${name("step", s.id.replaceAll("-", "_"))} { ${
            doc(`${s.kind}${to}: ${s.text}`)
          } }`,
        );
      }
      for (let i = 1; i < p.steps.length; i++) {
        lines.push(
          `        first ${
            name("step", p.steps[i - 1].id.replaceAll("-", "_"))
          } then ${name("step", p.steps[i].id.replaceAll("-", "_"))};`,
        );
      }
      lines.push("    }");
    }
    for (const r of a.rules) {
      lines.push(
        `    requirement def ${name(a.agentId, r.id.replaceAll("-", "_"))} {`,
        `        ${
          doc(`Inferred ${r.kind}: ${r.text} ${fileOf(a.agentId, r.source)}`)
        }`,
        "    }",
      );
    }
  }
  lines.push("}");
  return new Map([["OpenClawInferred.sysml", lines.join("\n") + "\n"]]);
}
