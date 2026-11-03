import { invalid } from "../primitives/error.ts";
import { isCredentialPath } from "../openclaw/credentials.ts";

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
    mode: string | null;
    /** Configured host policy, before host approvals tighten it. */
    security: string;
    ask: string;
    approvals: { security: string | null; ask: string | null };
    effective: { security: string; ask: string };
    elevated: boolean;
    elevatedChannelsCount: number;
    safeBins: string[] | null;
    safeBinProfiles: string[];
    trustedDirCount: number;
    pathPrependCount: number;
    strictInlineEval: boolean;
    commands: ExecCommand[];
  };
  memory: {
    search: {
      enabled: boolean;
      provider: string | null;
      model: string | null;
      fallback: string | null;
      sources: string[];
      rememberAcrossConversations: boolean | null;
      extraPathCount: number;
      multimodal: boolean;
    };
    daily: {
      count: number;
      firstDate: string | null;
      lastDate: string | null;
      bytes: number;
      sha256: string | null;
    };
    otherCount: number;
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
  /** docs/plugins/manifest/capabilities.md: profile allowlist contributions. */
  toolProfiles: { id: string; profiles: string[] }[];
}
/** A command that exec's allowlists name: an effective safe bin or a host
 * approval allowlist entry, with `id` `<kind>:<command>`. Under effective
 * `allowlist` security the export emits it as a CLI tool, granted on the layer
 * of each `exec` grant. */
export interface ExecCommand {
  id: string;
  command: string;
  kind: "safe-bin" | "name" | "path";
  argsRestricted: boolean;
}
export interface McpServer {
  id: string;
  toolPrefix: string;
  enabled: boolean;
  transport: "stdio" | "sse" | "streamable-http";
  oauth: boolean;
  oauthIdentity: string | null;
  toolFilter: { include: string[]; exclude: string[] };
  envNames: string[];
  headerNames: string[];
  argCount: number;
}
export interface Finding {
  code: string;
  severity: "error" | "warning" | "info";
  subject: string;
  context: string;
  recovery: string;
}
export interface Snapshot {
  schema: "openclaw-snapshot/5";
  openclawVersion: string;
  plaintextSecretCount: number;
  /** Authored credential paths only; null means this metadata was not collected. */
  plaintextCredentialPaths: string[] | null;
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
  mcpServers: McpServer[];
  execApprovals: {
    defaults: {
      security: string | null;
      ask: string | null;
      askFallback: string | null;
      autoAllowSkills: boolean | null;
    };
    wildcardCommands: ExecCommand[];
  } | null;
  memoryBackend: {
    slot: string | null;
    dreaming: {
      enabled: boolean | null;
      frequency: string | null;
      timezone: string | null;
    };
    activeMemory: {
      enabled: boolean;
      agents: string[];
      allowedChatTypes: string[];
      persistTranscripts: boolean | null;
    } | null;
  };
  messaging: { enabled: boolean; allowedTargets: string[] };
  ambiguities: Finding[];
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
const command: Shape = {
  id: str,
  command: str,
  kind: { enum: ["safe-bin", "name", "path"] },
  argsRestricted: bool,
};
const security: Shape = { enum: ["deny", "allowlist", "full", "unknown"] };
const ask: Shape = { enum: ["off", "on-miss", "always", "unknown"] };
const shape: Shape = {
  schema: { enum: ["openclaw-snapshot/5"] },
  openclawVersion: str,
  plaintextSecretCount: num,
  plaintextCredentialPaths: nullable(strings),
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
      mode: { enum: [null, "deny", "allowlist", "ask", "auto", "full"] },
      security,
      ask,
      approvals: {
        security: { enum: [null, "deny", "allowlist", "full"] },
        ask: { enum: [null, "off", "on-miss", "always"] },
      },
      effective: { security, ask },
      elevated: bool,
      elevatedChannelsCount: num,
      safeBins: nullable(strings),
      safeBinProfiles: strings,
      trustedDirCount: num,
      pathPrependCount: num,
      strictInlineEval: bool,
      commands: [command],
    },
    memory: {
      search: {
        enabled: bool,
        provider: ns,
        model: ns,
        fallback: ns,
        sources: strings,
        rememberAcrossConversations: nullable(bool),
        extraPathCount: num,
        multimodal: bool,
      },
      daily: {
        count: num,
        firstDate: ns,
        lastDate: ns,
        bytes: num,
        sha256: ns,
      },
      otherCount: num,
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
    toolProfiles: [{
      id: str,
      profiles: [{ enum: ["minimal", "coding", "messaging", "full"] }],
    }],
  }]),
  mcpServers: [{
    id: str,
    toolPrefix: str,
    enabled: bool,
    transport: { enum: ["stdio", "sse", "streamable-http"] },
    oauth: bool,
    oauthIdentity: ns,
    toolFilter: { include: strings, exclude: strings },
    envNames: strings,
    headerNames: strings,
    argCount: num,
  }],
  execApprovals: nullable({
    defaults: {
      security: ns,
      ask: ns,
      askFallback: ns,
      autoAllowSkills: nullable(bool),
    },
    wildcardCommands: [command],
  }),
  memoryBackend: {
    slot: ns,
    dreaming: { enabled: nullable(bool), frequency: ns, timezone: ns },
    activeMemory: nullable({
      enabled: bool,
      agents: strings,
      allowedChatTypes: strings,
      persistTranscripts: nullable(bool),
    }),
  },
  messaging: { enabled: bool, allowedTargets: strings },
  ambiguities: [finding],
};
function check(
  value: unknown,
  schema: Shape,
  sensitive: (value: string) => boolean,
): void {
  if (typeof schema === "string") {
    if (
      typeof value !== schema ||
      (schema === "number" &&
        (!Number.isFinite(value) || (value as number) < 0))
    ) invalid("Invalid snapshot value");
    if (
      typeof value === "string" &&
      (value.includes("CANARY-") ||
        sensitive(value))
    ) invalid("Sensitive content in retained snapshot metadata");
  } else if (Array.isArray(schema)) {
    if (!Array.isArray(value)) invalid("Invalid snapshot array");
    value.forEach((v) => check(v, schema[0], sensitive));
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
    if (value !== null) check(value, schema.nullable as Shape, sensitive);
  } else {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      invalid("Invalid snapshot object");
    }
    const fields = schema as Record<string, Shape>,
      obj = value as Record<string, unknown>;
    if (Object.keys(obj).some((k) => !Object.hasOwn(fields, k))) {
      invalid("Unknown snapshot field");
    }
    for (const [k, s] of Object.entries(fields)) check(obj[k], s, sensitive);
  }
}
export function parseSnapshot(
  value: unknown,
  sensitive: (value: string) => boolean,
): Snapshot {
  // The optional /5 diagnostic metadata is absent in older exports. Preserve
  // collector subjects verbatim; this default does not migrate other fields.
  const withMetadata =
    value && typeof value === "object" && !Array.isArray(value)
      ? { plaintextCredentialPaths: null, ...value }
      : value;
  check(withMetadata, shape, sensitive);
  const snapshot = withMetadata as Snapshot;
  if (
    snapshot.plaintextCredentialPaths?.some((path) => !isCredentialPath(path))
  ) {
    invalid("Unsupported plaintext credential path");
  }
  return snapshot;
}
