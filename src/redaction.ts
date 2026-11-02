import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
import { createHash } from "node:crypto";
import { type Obj, obj, text } from "./input.ts";
import type { FileRef } from "./snapshot.ts";

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
/** Counts non-empty credential leaves, environment and header values, never peer IDs.
 * SecretRef and ${ENV_NAME} references are not plaintext credentials.
 * Counting is metadata extraction, not another redaction implementation. */
export function plaintextSecretCount(raw: unknown): number {
  const leaves = (v: unknown): number => {
    if (typeof v === "string") {
      return v.length > 0 && !/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(v) ? 1 : 0;
    }
    if (!v || typeof v !== "object") return 0;
    if (!Array.isArray(v) && "source" in v && "id" in v) return 0;
    return Object.values(v).reduce<number>((n, x) => n + leaves(x), 0);
  };
  const walk = (v: unknown): number => {
    if (!v || typeof v !== "object") return 0;
    return Object.entries(v).reduce((sum, [key, value]) =>
      sum +
      // docs/plugins/bundles.md, Transports: headers support secret references.
      (/^(env|vars|headers)$/i.test(key)
        ? leaves(value)
        : /(?:password|passwd|passphrase|secret|token|api.?key|private.?key|credential)s?$/i
            .test(key) && typeof value !== "boolean"
        ? leaves(value)
        : walk(value)), 0);
  };
  return walk(raw);
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
export function environmentNames(raw: unknown): string[] {
  return Object.keys(obj(raw)).sort();
}
