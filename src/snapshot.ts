import { invalid } from "./error.ts";
import { EMAIL_ADDRESS_PATTERN, JWT_PATTERN } from "@logtape/redaction";

export interface FileRef {
  id: string;
  path: string;
  sha256: string;
  bytes: number;
}
export interface Skill extends FileRef {
  name: string;
}
export interface Policy {
  profile: string | null;
  allow: string[] | null;
  alsoAllow: string[];
  deny: string[];
}
export interface Sandbox {
  mode: "off" | "all" | "non-main";
  scope: string | null;
  workspaceAccess: string;
  image: string;
  readOnlyRoot: boolean;
  network: string;
  memory: string | null;
  cpus: number | null;
  bindCount: number;
  bindModes: string[];
  environmentNames: string[];
  dangerouslyAllowExternalBindSources: boolean;
}
export interface Agent {
  id: string;
  name: string;
  emoji: string | null;
  implicit: boolean;
  model: { primary: string | null; fallbacks: string[] };
  grants: { id: string; tool: string; layer: "host" | "sandbox" }[];
  policy: {
    global: Policy;
    agent: Policy;
    sandbox: Policy;
    provider: Policy;
    agentProvider: Policy;
  };
  sandbox: Sandbox;
  workspace: {
    path: string;
    versioned: boolean;
    instructions: FileRef[];
    skills: Skill[];
    malformedSkills: string[];
  };
  execution: {
    host: string;
    security: string;
    ask: string;
    elevated: boolean;
    elevatedChannelsCount: number;
  };
  delegation: string[];
  heartbeat: { everyMs: number; target: string; prompt: FileRef | null } | null;
}
export interface Cron {
  id: string;
  name: string;
  enabled: boolean;
  /** Null when the job names no agent (memory-core's dreaming job, for one). */
  agentId: string | null;
  schedule: {
    kind: "cron" | "every" | "at";
    expression: string | null;
    timezone: string | null;
    everyMs: number | null;
  };
  sessionTarget: string;
  wakeMode: string;
  payloadKind: string;
  model: string | null;
  prompt: FileRef | null;
  delivery: {
    mode: string | null;
    channel: string | null;
    accountId: string | null;
  };
  runtime: {
    lastRunStatus: string | null;
    lastRunAtMs: number | null;
    consecutiveErrors: number;
    hasLastError: boolean;
    createdAtMs: number | null;
  };
}
/** A plugin that declares agent tools (`contracts.tools`), as OpenClaw's
 * plugin inventory lists it. Paths and other manifest fields are not kept. */
export interface Plugin {
  id: string;
  enabled: boolean;
  tools: string[];
  /** `toolMetadata.<tool>.optional`: exposed only on explicit opt-in. */
  optionalTools: string[];
}
export interface Finding {
  code: string;
  severity: "error" | "warning" | "info";
  subject: string;
  context: string;
  recovery: string;
}
export interface Snapshot {
  schema: "openclaw-snapshot/2";
  openclawVersion: string;
  plaintextSecretCount: number;
  backupCount: number;
  environmentNames: string[];
  agents: Agent[];
  accounts: {
    id: string;
    channel: string;
    accountId: string;
    enabled: boolean;
    dmPolicy: string | null;
    groupPolicy: string | null;
  }[];
  bindings: {
    id: string;
    agentId: string;
    account: string;
    peerKind: string | null;
  }[];
  cron: Cron[];
  hooks: {
    id: string;
    name: string;
    agentId: string;
    channel: string | null;
    template: FileRef | null;
  }[];
  bundledSkills: { id: string; enabled: boolean }[];
  providers: { id: string; api: string | null; models: string[] }[];
  /** Null when no plugin inventory was supplied to the collector. */
  plugins: Plugin[] | null;
  messaging: { enabled: boolean; allowedTargets: string[] };
  ambiguities: Finding[];
}

/** Stable keys; entity arrays are sorted by id at construction. Ordered model
 * fallbacks and bind modes retain their semantic order. No locale or clock. */
export function canonical(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
        : v,
    2,
  ) + "\n";
}
export function byId<T extends { id: string }>(values: T[]): T[] {
  return values.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

// A dependency-free schema for the serialized trust boundary. Inside the pipeline
// Snapshot is trusted; emit/doctor/diff do not revalidate it.
type Shape =
  | "string"
  | "number"
  | "boolean"
  | { [key: string]: Shape }
  | readonly [Shape]
  | { enum: readonly (string | null)[] }
  | { nullable: Shape };
const str: Shape = "string", num: Shape = "number", bool: Shape = "boolean";
const nullable = (s: Shape): Shape => ({ nullable: s });
const ns = nullable(str), nn = nullable(num), strings: Shape = [str];
const file: Shape = { id: str, path: str, sha256: str, bytes: num };
const policy: Shape = {
  profile: ns,
  allow: nullable(strings),
  alsoAllow: strings,
  deny: strings,
};
const finding: Shape = {
  code: str,
  severity: { enum: ["error", "warning", "info"] },
  subject: str,
  context: str,
  recovery: str,
};
const shape: Shape = {
  schema: { enum: ["openclaw-snapshot/2"] },
  openclawVersion: str,
  plaintextSecretCount: num,
  backupCount: num,
  environmentNames: strings,
  agents: [{
    id: str,
    name: str,
    emoji: ns,
    implicit: bool,
    model: { primary: ns, fallbacks: strings },
    grants: [{ id: str, tool: str, layer: { enum: ["host", "sandbox"] } }],
    policy: {
      global: policy,
      agent: policy,
      sandbox: policy,
      provider: policy,
      agentProvider: policy,
    },
    sandbox: {
      mode: { enum: ["off", "all", "non-main"] },
      scope: ns,
      workspaceAccess: str,
      image: str,
      readOnlyRoot: bool,
      network: str,
      memory: ns,
      cpus: nn,
      bindCount: num,
      bindModes: strings,
      environmentNames: strings,
      dangerouslyAllowExternalBindSources: bool,
    },
    workspace: {
      path: str,
      versioned: bool,
      instructions: [file],
      skills: [{ id: str, path: str, sha256: str, bytes: num, name: str }],
      malformedSkills: strings,
    },
    execution: {
      host: str,
      security: str,
      ask: str,
      elevated: bool,
      elevatedChannelsCount: num,
    },
    delegation: strings,
    heartbeat: nullable({ everyMs: num, target: str, prompt: nullable(file) }),
  }],
  accounts: [{
    id: str,
    channel: str,
    accountId: str,
    enabled: bool,
    dmPolicy: ns,
    groupPolicy: ns,
  }],
  bindings: [{ id: str, agentId: str, account: str, peerKind: ns }],
  cron: [{
    id: str,
    name: str,
    enabled: bool,
    agentId: ns,
    schedule: {
      kind: { enum: ["cron", "every", "at"] },
      expression: ns,
      timezone: ns,
      everyMs: nn,
    },
    sessionTarget: str,
    wakeMode: str,
    payloadKind: str,
    model: ns,
    prompt: nullable(file),
    delivery: { mode: ns, channel: ns, accountId: ns },
    runtime: {
      lastRunStatus: ns,
      lastRunAtMs: nn,
      consecutiveErrors: num,
      hasLastError: bool,
      createdAtMs: nn,
    },
  }],
  hooks: [{
    id: str,
    name: str,
    agentId: str,
    channel: ns,
    template: nullable(file),
  }],
  bundledSkills: [{ id: str, enabled: bool }],
  providers: [{ id: str, api: ns, models: strings }],
  plugins: nullable([{
    id: str,
    enabled: bool,
    tools: strings,
    optionalTools: strings,
  }]),
  messaging: { enabled: bool, allowedTargets: strings },
  ambiguities: [finding],
};
function check(value: unknown, schema: Shape): void {
  if (typeof schema === "string") {
    if (
      typeof value !== schema ||
      (schema === "number" &&
        (!Number.isFinite(value) || (value as number) < 0))
    ) invalid("Invalid snapshot value");
    if (
      typeof value === "string" &&
      (value.includes("CANARY-") ||
        [EMAIL_ADDRESS_PATTERN, JWT_PATTERN].some((p) =>
          new RegExp(p.pattern.source, p.pattern.flags).test(value)
        ))
    ) invalid("Sensitive content in retained snapshot metadata");
  } else if (Array.isArray(schema)) {
    if (!Array.isArray(value)) invalid("Invalid snapshot array");
    value.forEach((v) => check(v, schema[0]));
    const ids = value.filter((v) => v && typeof v === "object" && "id" in v)
      .map((v) => v.id);
    if (new Set(ids).size !== ids.length) {
      invalid("Duplicate snapshot identity");
    }
  } else if ("enum" in schema) {
    if (!(schema.enum as readonly unknown[]).includes(value)) {
      invalid("Invalid snapshot enumeration");
    }
  } else if ("nullable" in schema) {
    if (value !== null) check(value, schema.nullable as Shape);
  } else {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      invalid("Invalid snapshot object");
    }
    const fields = schema as Record<string, Shape>,
      obj = value as Record<string, unknown>;
    if (Object.keys(obj).some((k) => !Object.hasOwn(fields, k))) {
      invalid("Unknown snapshot field");
    }
    for (const [k, s] of Object.entries(fields)) check(obj[k], s);
  }
}
export function parseSnapshot(value: unknown): Snapshot {
  check(value, shape);
  return value as Snapshot;
}
