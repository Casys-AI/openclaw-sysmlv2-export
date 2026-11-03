import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
import { createHash } from "node:crypto";
import { type Obj, text } from "../domain/primitives/input.ts";
import type { FileRef } from "../domain/model/snapshot.ts";

const fields = [
  ...DEFAULT_REDACT_FIELDS,
  // docs/tools/mcp.md and docs/cli/mcp/transports.md: connection headers,
  // arguments, locations and client credentials are not retained metadata.
  /^(env|vars|headers|args|url|cwd|clientCert|clientKey|baseUrl|peer|guilds?|guildId|users?|userId|allowFrom|groupAllowFrom|allowSendTo|binds|extraHosts|prompt|messageTemplate|payload_message|last_error|delivery_to|to)$/i,
];
export function redact(raw: Obj): Obj {
  // 2.4.2 does not export redactProperties from its public entrypoint.
  // redactByField calls that exact implementation; capture its sanitized record
  // without logging, clocks, or a second redaction algorithm.
  let result: Obj = {};
  redactByField((record) => {
    result = record.properties;
  }, { fieldPatterns: fields, maxDepth: 64, maxProperties: 100000 })({
    category: [],
    level: "info",
    timestamp: 0,
    message: [],
    rawMessage: "",
    properties: raw,
  });
  return result;
}
export function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
/** Inline prose gets a relative source path + JSON pointer; no body is retained. */
export function prose(value: unknown, path: string): FileRef | null {
  const s = text(value);
  return s === null ? null : {
    id: path,
    path,
    sha256: digest(s),
    bytes: new TextEncoder().encode(s).byteLength,
  };
}
export {
  environmentNames,
  plaintextSecretCount,
} from "../domain/openclaw/redaction.ts";
