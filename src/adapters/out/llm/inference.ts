import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";
import { parseAgentInference as parse } from "../../../domain/model/inference.ts";
import type { Snapshot } from "../../../domain/model/snapshot.ts";
export {
  AGENT_INFERENCE_SCHEMA,
  inferencePrompt,
} from "../../../domain/model/inference.ts";
// Model text may copy contact details or credentials from the prose: mask them.
const SENSITIVE = [
  EMAIL_ADDRESS_PATTERN.pattern,
  JWT_PATTERN.pattern,
  /CANARY-[A-Za-z0-9_-]+/,
  /[A-Za-z0-9_\-]{32,}/,
  /\+?\d[\d ().-]{7,}\d/,
].map((p) =>
  new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`)
);
export function parseAgentInference(
  value: unknown,
  snapshot: Snapshot,
  expectedAgentId: string,
  sentFiles?: string[],
) {
  return parse(value, snapshot, expectedAgentId, SENSITIVE, sentFiles);
}
