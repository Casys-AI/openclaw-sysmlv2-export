import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ExportError, invalid, ioError } from "./error.ts";
import {
  arr,
  boolean,
  enumeration,
  json,
  number,
  type Obj,
  obj,
  required,
  strings,
  text,
} from "./input.ts";
import {
  digest,
  environmentNames,
  plaintextSecretCount,
  prose,
  redact,
} from "./redaction.ts";
import { info, model, resolvePolicy } from "./policy.ts";
import {
  type Agent,
  byId,
  type Cron,
  type FileRef,
  type Finding,
  parseSnapshot,
  type Plugin,
  type Sandbox,
  type Snapshot,
  unique,
} from "./snapshot.ts";

/** OpenClaw 2026.6 keeps agents in `agents.list`; 2026.10 moved them to keyed
 * `agents.entries` (docs/concepts/multi-agent.md). Each entry is redacted on
 * its own and stays paired with its raw value: an agent id such as
 * "secretary" must not be redacted away as a dictionary key. */
function agentEntries(agents: Obj): { config: Obj; raw: Obj }[] {
  const entries = obj(agents.entries);
  const raws = Object.keys(entries).length
    ? Object.entries(entries).map(([id, v]) => ({ ...obj(v), id }))
    : arr(agents.list).map(obj);
  return raws.map((raw) => ({ raw, config: { ...redact(raw), id: raw.id } }));
}
/** 2026.10 exec modes as the 2026.6 security/ask pair the snapshot keeps. */
const EXEC_MODES: Record<string, [string, string]> = {
  deny: ["deny", "off"],
  allowlist: ["allowlist", "off"],
  ask: ["allowlist", "on-miss"],
  auto: ["allowlist", "on-miss"],
  full: ["full", "off"],
};
async function regular(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw ioError(
      "UNSAFE_INPUT_FILE",
      "Expected a regular input file, without symlinks",
    );
  }
  if (stat.size > 32 * 1024 * 1024) {
    throw ioError(
      "INPUT_LIMIT",
      "Input file exceeds the 32 MiB collection limit",
    );
  }
}
function ref(bytes: Uint8Array, path: string): FileRef {
  return { id: path, path, bytes: bytes.byteLength, sha256: digest(bytes) };
}
const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
const inside = (root: string, path: string) =>
  path === root || path.startsWith(`${root}${sep}`);

/** Reads top-level Markdown and discovered skills. The resolved root stays
 * internal so the memory inventory uses the same workspace boundary. */
async function workspace(
  home: string,
  path: string,
  id: string,
  findings: Finding[],
): Promise<{ workspace: Agent["workspace"]; root: string | null }> {
  if (path.startsWith("~")) {
    throw ioError(
      "UNRESOLVED_WORKSPACE",
      "Tilde workspace paths need an explicit absolute path in the offline input",
    );
  }
  const given = isAbsolute(path) ? path : resolve(home, path);
  const result: Agent["workspace"] = {
    path: relative(home, given).split("\\").join("/") || ".",
    versioned: false,
    instructions: [],
    skills: [],
    malformedSkills: [],
  };
  const root = await realpath(given).catch(() => null);
  if (root === null) {
    findings.push(
      info(
        "WORKSPACE_MISSING",
        id,
        "The configured workspace does not exist.",
        "Create the workspace or fix agents.list[].workspace.",
      ),
    );
    return { workspace: result, root };
  }
  const top = (await readdir(root, { withFileTypes: true })).sort(byName);
  result.versioned = top.some((e) => e.name === ".git");
  for (const entry of top) {
    if (!entry.name.endsWith(".md")) continue;
    const target = await realpath(join(root, entry.name)).catch(() => null);
    if (target === null || !inside(root, target)) {
      findings.push(
        info(
          "INSTRUCTION_OUTSIDE_ROOT",
          id,
          `${entry.name} is a broken link or resolves outside the workspace; it is not collected.`,
          "Keep instruction files inside the agent workspace.",
        ),
      );
    } else if ((await stat(target)).isFile()) {
      await regular(target);
      result.instructions.push(ref(await readFile(target), entry.name));
    }
  }
  // docs/tools/skills.md: a skill is found wherever SKILL.md appears under the
  // root; folders only group. Symlinked skill roots count only when their
  // realpath stays inside the configured root.
  const seen = new Set<string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const children = (await readdir(dir, { withFileTypes: true })).sort(byName);
    if (children.some((c) => c.name === "SKILL.md")) {
      if (prefix === "skills") result.malformedSkills.push("skills/SKILL.md");
      else {
        const bytes = await readFile(join(dir, "SKILL.md"));
        const front = bytes.toString("utf8").match(
          /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
        )?.[1];
        const line = front?.match(/^name:\s*(.*?)\s*$/m)?.[1];
        const skillId = prefix.slice("skills/".length);
        const name = line?.replace(/^(['"])(.*)\1$/, "$2") ??
          skillId.split("/").at(-1)!;
        result.skills.push({
          ...ref(bytes, `${prefix}/SKILL.md`),
          id: skillId,
          name,
        });
        return;
      }
    }
    for (const child of children) {
      if (child.name.startsWith(".") || child.name === "node_modules") continue;
      const target = await realpath(join(dir, child.name)).catch(() => null);
      if (target === null) {
        result.malformedSkills.push(`${prefix}/${child.name}`);
        continue;
      }
      if (!inside(root, target)) {
        findings.push(
          info(
            "SKILL_SYMLINK_OUTSIDE_ROOT",
            id,
            `${prefix}/${child.name} resolves outside the workspace; OpenClaw ignores it unless skills.load.allowSymlinkTargets trusts the target.`,
            "Move the skill into the workspace or trust its target; docs/tools/skills.md.",
          ),
        );
        continue;
      }
      if ((await stat(target)).isDirectory()) {
        await walk(target, `${prefix}/${child.name}`);
      }
    }
  };
  const skillsRoot = top.some((e) => e.name === "skills")
    ? await realpath(join(root, "skills")).catch(() => null)
    : null;
  if (skillsRoot !== null && inside(root, skillsRoot)) {
    await walk(skillsRoot, "skills");
  }
  result.instructions = byId(result.instructions);
  result.skills = byId(result.skills);
  return { workspace: result, root };
}

/** docs/reference/memory-config.md: shared search defaults, per-agent overrides,
 * enabled=true, provider=openai, sources=[memory], multimodal.enabled=false.
 * docs/gateway/doctor/config-migrations.md names the legacy search locations.
 * This projection overrides fields (including extraPaths) and preserves unset
 * rememberAcrossConversations instead of resolving contextual runtime defaults. */
function memorySearch(
  config: Obj,
  defaults: Obj,
  agent: Obj,
): Agent["memory"]["search"] {
  const base = obj([
    obj(config.memory).search,
    defaults.memorySearch,
    config.memorySearch,
  ].find((v) => v !== undefined));
  const own = obj([
    obj(agent.memory).search,
    agent.memorySearch,
  ].find((v) => v !== undefined));
  const search = { ...base, ...own };
  const multimodal = { ...obj(base.multimodal), ...obj(own.multimodal) };
  return {
    enabled: boolean(search.enabled, true),
    provider: text(search.provider === undefined ? "openai" : search.provider),
    model: text(search.model),
    fallback: text(search.fallback),
    sources: unique(
      strings(search.sources === undefined ? ["memory"] : search.sources),
    ),
    rememberAcrossConversations:
      search.rememberAcrossConversations === undefined
        ? null
        : boolean(search.rememberAcrossConversations, false),
    extraPathCount: arr(search.extraPaths).length,
    multimodal: boolean(multimodal.enabled, false),
  };
}

/** docs/concepts/memory.md distinguishes curated, daily and other Markdown.
 * docs/reference/memory-config.md: the builtin index skips symlinks. Only
 * direct dated children are daily; nested Markdown contributes a count only. */
async function memoryNotes(
  root: string | null,
): Promise<Omit<Agent["memory"], "search">> {
  const result: Omit<Agent["memory"], "search"> = {
    daily: {
      count: 0,
      firstDate: null,
      lastDate: null,
      bytes: 0,
      sha256: null,
    },
    otherCount: 0,
  };
  if (root === null) return result;
  const dir = await realpath(join(root, "memory")).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  // Like skills/, a resolved root is accepted only inside the workspace.
  if (dir === null || !inside(root, dir) || !(await stat(dir)).isDirectory()) {
    return result;
  }
  const lines: string[] = [];
  const walk = async (dir: string, direct: boolean): Promise<void> => {
    for (const name of await readdir(dir)) {
      const path = join(dir, name), entry = await lstat(path);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!name.startsWith(".")) await walk(path, false);
      } else if (entry.isFile() && /\.md$/i.test(name)) {
        const date = direct
          ? name.match(/^(\d{4}-\d{2}-\d{2})(?:-[^/]+)?\.md$/i)?.[1]
          : undefined;
        if (date === undefined) result.otherCount++;
        else {
          await regular(path);
          const bytes = await readFile(path);
          lines.push(`${date} ${digest(bytes)} ${bytes.byteLength}\n`);
          result.daily.bytes += bytes.byteLength;
        }
      }
    }
  };
  await walk(dir, true);
  lines.sort();
  result.daily.count = lines.length;
  if (lines.length) {
    result.daily.firstDate = lines[0].slice(0, 10);
    result.daily.lastDate = lines.at(-1)!.slice(0, 10);
    result.daily.sha256 = digest(lines.join(""));
  }
  return result;
}

/** docs/tools/plugin.md: memory slot; docs/concepts/dreaming.md: dreaming config.
 * docs/concepts/active-memory/configuration.md defines the retained fields.
 * Bundled disabled / config enabled defaults are confirmed by
 * dist/config-state-Ba1MVBAI.mjs and dist/config-CpTCuMPy.mjs (2026.10.9).
 * This describes explicit configuration, not runtime auto-activation. */
function memoryBackend(config: Obj): Snapshot["memoryBackend"] {
  const plugins = obj(config.plugins), entries = obj(plugins.entries);
  const dreaming = obj(obj(obj(entries["memory-core"]).config).dreaming);
  const active = obj(entries["active-memory"]), settings = obj(active.config);
  return {
    slot: text(obj(plugins.slots).memory),
    dreaming: {
      enabled: dreaming.enabled === undefined
        ? null
        : boolean(dreaming.enabled, false),
      frequency: text(dreaming.frequency),
      timezone: text(dreaming.timezone),
    },
    activeMemory: entries["active-memory"] === undefined ? null : {
      enabled: boolean(active.enabled, false) &&
        boolean(settings.enabled, true),
      agents: unique(strings(settings.agents)),
      allowedChatTypes: unique(strings(settings.allowedChatTypes)),
      persistTranscripts: settings.persistTranscripts === undefined
        ? null
        : boolean(settings.persistTranscripts, false),
    },
  };
}
function duration(value: unknown): number {
  const match = required(value).match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!match) invalid("Unsupported heartbeat duration");
  return Number(match[1]) *
    ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]!);
}
/** Retained values come from the redacted config; the raw config only gives
 * bind counts and modes and environment names, whose values are redacted. */
function sandbox(
  defaults: Obj,
  own: Obj,
  rawDefaults: Obj,
  rawOwn: Obj,
  id: string,
  findings: Finding[],
): Sandbox {
  const base = obj(defaults.sandbox), over = obj(own.sandbox);
  const scope = text(over.scope ?? base.scope);
  const mode = enumeration(
    over.mode ?? base.mode,
    ["off", "all", "non-main"],
    "off",
  );
  if (scope === null && mode !== "off") {
    findings.push(
      info(
        "SANDBOX_SCOPE_UNRESOLVED",
        id,
        "The reference docs disagree: agent versus session default scope.",
        "Set sandbox.scope explicitly; compare docs/gateway/sandboxing.md and docs/tools/multi-agent-sandbox-tools.md.",
      ),
    );
  }
  const shared = scope === "shared";
  const docker = {
    ...obj(base.docker),
    ...(shared ? {} : obj(over.docker)),
  };
  const rawBase = obj(obj(rawDefaults.sandbox).docker),
    rawOver = shared ? {} : obj(obj(rawOwn.sandbox).docker);
  const binds = strings({ ...rawBase, ...rawOver }.binds);
  if ((over.backend ?? base.backend ?? "docker") !== "docker") {
    findings.push(
      info(
        "SANDBOX_BACKEND_UNRESOLVED",
        id,
        "Non-Docker isolation settings are outside the v0 mapping.",
        "Inspect the backend separately; docs/gateway/sandboxing.md.",
      ),
    );
  }
  return {
    mode,
    scope,
    workspaceAccess: enumeration(over.workspaceAccess ?? base.workspaceAccess, [
      "none",
      "ro",
      "rw",
    ], "none"),
    image: text(docker.image, "openclaw-sandbox:bookworm-slim")!,
    readOnlyRoot: boolean(docker.readOnlyRoot, true),
    network: text(docker.network, "none")!,
    memory: text(docker.memory),
    cpus: number(docker.cpus),
    bindCount: binds.length,
    bindModes: binds.map((b) => {
      const mode = b.split(":").at(-1);
      return mode === "ro" ? "ro" : "rw";
    }),
    environmentNames: unique([
      ...environmentNames(rawBase.env),
      ...environmentNames(rawOver.env),
    ]),
    dangerouslyAllowExternalBindSources: boolean(
      docker.dangerouslyAllowExternalBindSources,
      false,
    ),
  };
}
function cron(home: string, findings: Finding[]): Cron[] {
  const path = join(home, "state", "openclaw.sqlite");
  // docs/automation/cron-jobs.md: state/openclaw.sqlite is authoritative.
  // Deno 2.9.7 node:sqlite resolves a file: URI as a literal local path with
  // scoped permissions (reproduced by sqlite_test.ts). Open the path explicitly
  // with readOnly=true; this is the same SQLite read-only flag, without fallback.
  // No immutable=1: committed WAL records must remain visible.
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA query_only=ON; BEGIN");
    // The flattened columns differ between releases (2026.10 dropped them); the
    // job and its runtime state are kept as JSON documents in both.
    const rows = db.prepare(
      "SELECT job_id, job_json, state_json FROM cron_jobs",
    ).all();
    const result = rows.map((row): Cron => {
      const id = required(row.job_id),
        job = obj(json(required(row.job_json))),
        state = obj(json(text(row.state_json) ?? "{}")),
        schedule = obj(job.schedule),
        payload = obj(job.payload),
        delivery = obj(job.delivery),
        kind = enumeration(schedule.kind, ["cron", "every", "at"], "cron");
      const everyMs = number(schedule.everyMs),
        expression = text(schedule.expr ?? schedule.at),
        timezone = text(schedule.tz);
      if (kind === "every" && !everyMs) {
        invalid("Every schedules must be positive");
      }
      if (kind === "every" && everyMs! % 60000 !== 0) {
        findings.push(
          info(
            "SUBMINUTE_SCHEDULE",
            id,
            "The interval is preserved in milliseconds; AssemblyCases::ScheduleUnit has no second or millisecond unit.",
            "Use MillisecondEvery.durationMs for the exact interval; the inherited count and unit are intentionally unset.",
          ),
        );
      }
      if (kind !== "every" && expression === null) {
        invalid("Missing schedule expression");
      }
      if (kind === "cron" && timezone === null) {
        findings.push(
          info(
            "CRON_TIMEZONE_UNRESOLVED",
            id,
            "Cron uses the gateway host timezone, which is not collected.",
            "Set an explicit timezone; docs/automation/cron-jobs.md.",
          ),
        );
      }
      return {
        id,
        name: required(job.name),
        enabled: boolean(job.enabled, true),
        agentId: text(job.agentId),
        schedule: { kind, expression, timezone, everyMs },
        sessionTarget: required(job.sessionTarget),
        wakeMode: required(job.wakeMode),
        payloadKind: required(payload.kind),
        model: text(payload.model),
        prompt: prose(
          payload.message,
          `state/openclaw.sqlite#cron_jobs/${
            encodeURIComponent(id)
          }/job_json/payload/message`,
        ),
        delivery: {
          mode: text(delivery.mode),
          channel: text(delivery.channel),
          accountId: text(delivery.accountId),
        },
        runtime: {
          lastRunStatus: text(state.lastRunStatus ?? state.lastStatus),
          lastRunAtMs: number(state.lastRunAtMs),
          consecutiveErrors: number(state.consecutiveErrors, 0)!,
          hasLastError: state.lastError !== undefined &&
            state.lastError !== null,
          createdAtMs: number(job.createdAtMs),
        },
      };
    });
    db.exec("ROLLBACK");
    return byId(result);
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw ioError(
      "CRON_READ_FAILED",
      "Cannot read the required cron_jobs columns from the read-only SQLite database",
    );
  } finally {
    db?.close();
  }
}
/** OpenClaw's plugin inventory, the output of `openclaw plugins list --json`
 * (docs/cli/plugins/list.md). Tool ownership comes from each entry's
 * `contracts.tools`; optionality from `toolMetadata.<tool>.optional` in the
 * manifest at its `rootDir`, which the inventory omits
 * (docs/plugins/building-plugins.md, Registering tools). Only plugins that
 * declare tools are kept, with their id, enablement and tool names. */
async function plugins(list: unknown): Promise<Plugin[]> {
  const result: Plugin[] = [];
  for (const value of arr(obj(list).plugins)) {
    const entry = obj(value),
      tools = unique(strings(obj(entry.contracts).tools));
    if (!tools.length) continue;
    if (typeof entry.enabled !== "boolean") {
      invalid("Plugin inventory entry without an enabled flag");
    }
    const root = required(entry.rootDir);
    if (!isAbsolute(root)) invalid("Plugin inventory rootDir must be absolute");
    const path = join(root, "openclaw.plugin.json");
    let manifest: Obj;
    try {
      await regular(path);
      manifest = obj(json(await readFile(path, "utf8")));
    } catch (e) {
      if (e instanceof ExportError) throw e;
      throw ioError(
        "PLUGIN_MANIFEST_READ_FAILED",
        "A plugin listed with tools has no readable openclaw.plugin.json",
      );
    }
    const meta = obj(manifest.toolMetadata);
    result.push({
      id: required(entry.id),
      enabled: entry.enabled,
      tools,
      optionalTools: tools.filter((t) => boolean(obj(meta[t]).optional, false)),
    });
  }
  return byId(result);
}

/** The sole instance reader. All exceptions exposed to callers are coded and
 * never include parser input, absolute input paths or native error messages. */
export async function collect(
  inputHome: string,
  pluginList: unknown = null,
): Promise<Snapshot> {
  try {
    const home = await realpath(inputHome), path = join(home, "openclaw.json");
    await regular(path);
    const raw = obj(json(await readFile(path, "utf8")));
    const config = redact(raw);
    const version = text(obj(config.meta).lastTouchedVersion);
    const defaults = obj(obj(config.agents).defaults),
      rawDefaults = obj(obj(raw.agents).defaults);
    const pairs = agentEntries(obj(raw.agents));
    const implicit = pairs.length === 0;
    // docs/concepts/multi-agent.md, Single-agent mode / Routing: implicit main
    // exists only without configured agents. Stale cron references do not create agents.
    if (implicit) pairs.push({ config: { id: "main" }, raw: { id: "main" } });
    const list = pairs.map((p) => p.config);
    const systemAgent = text(obj(defaults.systemAgent).agentId);
    const defaultId = required(
      (list.find((a) => a.default === true) ??
        list.find((a) => a.id === systemAgent) ?? list[0]).id,
    );
    const findings: Finding[] = [],
      global = obj(config.tools),
      rawGlobal = obj(raw.tools),
      inventory = pluginList === null ? null : await plugins(pluginList);
    if (version !== "2026.6.10") {
      findings.push(
        info(
          "OPENCLAW_VERSION_UNVERIFIED",
          "instance",
          version === "2026.10.9"
            ? "Agent and cron shapes of 2026.10 are read; tool policy follows the 2026.6.10 documentation."
            : "The config records another or no version; the snapshot uses the 2026.6.10 interpretation.",
          "Confirm the source version before relying on this import.",
        ),
      );
    }
    findings.push(
      info(
        "STATIC_TOOL_AVAILABILITY",
        "instance",
        "Grants resolve documented built-in policy and declared plugin tools. Credentials, plugin loading, model-native tools and session approvals are not runtime-verified.",
        "Check runtime tool registration and host approvals before treating policy reachability as execution evidence; docs/gateway/config-tools.md and docs/tools/exec.md.",
      ),
    );
    if (inventory === null) {
      findings.push(
        info(
          "PLUGIN_INVENTORY_ABSENT",
          "instance",
          "No plugin inventory was supplied: tools that plugins declare outside the documented built-in catalog receive no grants.",
          "Supply the output of openclaw plugins list --json; docs/cli/plugins/list.md.",
        ),
      );
    }
    const agents: Agent[] = [];
    const selectedHeartbeats = list.some((a) => a.heartbeat !== undefined);
    for (const { config: a, raw: original } of pairs) {
      const id = required(a.id),
        identity = obj(a.identity),
        tools = obj(a.tools),
        rawTools = obj(original.tools);
      const sb = sandbox(defaults, a, rawDefaults, original, id, findings),
        m = model(a.model, defaults.model);
      const resolved = resolvePolicy(
        id,
        global,
        tools,
        sb,
        m.primary,
        inventory,
        findings,
      );
      // docs/tools/browser.md: both plugin and browser configuration can disable
      // the tool; an active sandbox browser has its separate configuration.
      if (
        obj(obj(obj(raw.plugins).entries).browser).enabled === false ||
        obj(raw.browser).enabled === false &&
          !(sb.mode !== "off" &&
            obj(obj(original.sandbox).browser).enabled === true)
      ) resolved.grants = resolved.grants.filter((g) => g.tool !== "browser");
      if (m.fallbacks.length) {
        findings.push(
          info(
            "FALLBACK_TOOL_POLICY_UNRESOLVED",
            id,
            "Grants describe the primary model. Fallback provider policies and model-native tools may differ.",
            "Resolve grants again for the actual fallback model; docs/tools/multi-agent-sandbox-tools.md and docs/tools/exec.md.",
          ),
        );
      }
      const ex = { ...obj(global.exec), ...obj(tools.exec) };
      const elev = obj(rawGlobal.elevated), ae = obj(rawTools.elevated);
      const globalChannels = Object.keys(obj(elev.allowFrom)).filter((k) =>
        strings(obj(elev.allowFrom)[k]).length > 0
      );
      const channels = ae.allowFrom === undefined
        ? globalChannels
        : globalChannels.filter((k) =>
          strings(obj(ae.allowFrom)[k]).length > 0
        );
      const elevated = boolean(elev.enabled, false) &&
        boolean(ae.enabled, true) && channels.length > 0;
      if (elevated && sb.mode !== "off") {
        findings.push(
          info(
            "ELEVATED_CONTEXT_REQUIRED",
            id,
            "Elevated exec is configured but depends on sender allowlists and session directives; no unconditional host grant is inferred.",
            "Verify sender and session gates; docs/tools/elevated.md.",
          ),
        );
      }
      // docs/tools/exec-approvals.md (2026.10): tools.exec.mode replaces the
      // security/ask pair; docs/tools/exec.md: without one, gateway and node
      // hosts run with mode=full.
      const mode = text(ex.mode) ??
        (ex.security === undefined && ex.ask === undefined &&
            version?.startsWith("2026.10")
          ? "full"
          : null);
      const [security, ask] = mode !== null && mode in EXEC_MODES
        ? EXEC_MODES[mode]
        : [ex.security, ex.ask];
      const execution = {
        host: enumeration(
          ex.host,
          ["auto", "sandbox", "gateway", "node"],
          "auto",
        ),
        security: enumeration(security, [
          "deny",
          "allowlist",
          "full",
          "unknown",
        ], "unknown"),
        ask: enumeration(
          ask,
          ["off", "on-miss", "always", "unknown"],
          "unknown",
        ),
        elevated,
        elevatedChannelsCount: channels.length,
      };
      if (execution.security === "unknown" || execution.ask === "unknown") {
        findings.push(
          info(
            "EXEC_APPROVALS_UNRESOLVED",
            id,
            "Exec mode or host approval defaults are not fully represented by security/ask in this config.",
            "Inspect host approvals and normalized exec mode; docs/tools/exec.md.",
          ),
        );
      }
      const hb = { ...obj(defaults.heartbeat), ...obj(a.heartbeat) };
      let heartbeat: Agent["heartbeat"] = null;
      if (selectedHeartbeats ? a.heartbeat !== undefined : id === defaultId) {
        if (hb.every !== undefined) {
          heartbeat = {
            everyMs: duration(hb.every),
            target: text(hb.target, "none")!,
            prompt: prose(
              hb.prompt,
              `openclaw.json#/agents/${id}/heartbeat/prompt`,
            ),
          };
        } else {findings.push(
            info(
              "HEARTBEAT_DEFAULT_UNRESOLVED",
              id,
              "Default heartbeat cadence depends on authentication mode, which is not collected.",
              "Set heartbeat.every explicitly; docs/gateway/heartbeat.md.",
            ),
          );}
      }
      const collected = await workspace(
        home,
        text(
          a.workspace ?? defaults.workspace,
          id === defaultId ? "workspace" : `workspace-${id}`,
        )!,
        id,
        findings,
      );
      agents.push({
        id,
        name: text(identity.name ?? a.name, id)!,
        emoji: text(identity.emoji),
        implicit,
        model: m,
        ...resolved,
        sandbox: sb,
        execution,
        workspace: collected.workspace,
        memory: {
          search: memorySearch(config, defaults, a),
          ...await memoryNotes(collected.root),
        },
        delegation: unique(
          // docs/gateway/config-tools.md: defaults.subagents.allowAgents is
          // inherited; absent at both levels means only the requesting agent.
          strings(
            obj(a.subagents).allowAgents ??
              obj(defaults.subagents).allowAgents ?? [id],
          ),
        ),
        heartbeat,
      });
    }
    const accounts: Snapshot["accounts"] = [];
    for (const [channel, value] of Object.entries(obj(raw.channels))) {
      const originalChannel = obj(value),
        c = redact(originalChannel),
        ac = obj(originalChannel.accounts);
      for (
        const [accountId, value] of Object.entries(
          Object.keys(ac).length ? ac : { default: c },
        )
      ) {
        const a = redact(obj(value));
        accounts.push({
          id: `${channel}:${accountId}`,
          channel,
          accountId,
          enabled: boolean(c.enabled, true) && boolean(a.enabled, true),
          dmPolicy: text(a.dmPolicy ?? c.dmPolicy),
          groupPolicy: text(a.groupPolicy ?? c.groupPolicy),
        });
      }
    }
    const bindings = arr(config.bindings).map((value, index) => {
      const b = obj(value),
        match = obj(b.match),
        rawMatch = obj(obj(arr(raw.bindings)[index]).match),
        channel = required(match.channel);
      const candidates = accounts.filter((a) => a.channel === channel).map(
        (a) => a.accountId,
      ).sort();
      const accountId = text(
        match.accountId ?? obj(obj(config.channels)[channel]).defaultAccount,
        candidates.includes("default") ? "default" : candidates[0] ?? "default",
      )!;
      const agentId = required(b.agentId),
        peerKind = text(obj(rawMatch.peer).kind);
      const identity = {
        agentId,
        account: `${channel}:${accountId}`,
        peerKind,
      };
      return {
        id: `binding-${digest(JSON.stringify(identity)).slice(0, 20)}-${index}`,
        ...identity,
      };
    });
    const jobs = cron(home, findings),
      ids = new Set(agents.map((a) => a.id));
    for (const binding of bindings) {
      if (
        !ids.has(binding.agentId) ||
        !accounts.some((a) => a.id === binding.account)
      ) {
        findings.push(
          info(
            "UNRESOLVED_BINDING_REFERENCE",
            binding.id,
            "The binding refers to an absent agent or channel account; no connection is emitted.",
            "Reconcile the binding endpoints; docs/concepts/multi-agent.md.",
          ),
        );
      }
    }
    for (const job of jobs) {
      if (job.agentId === null) {
        // 2026.10: plugin-managed jobs such as memory-core's dreaming sweep
        // (docs/concepts/dreaming.md) name no agent; the execution agent is
        // resolved at run time (docs/automation/cron-jobs/troubleshooting.md).
        findings.push(
          info(
            "CRON_AGENT_UNRESOLVED",
            job.id,
            "The job names no agent; OpenClaw resolves its execution agent at run time.",
            "Check the agent with openclaw automations show <jobId>; docs/automation/cron-jobs/troubleshooting.md.",
          ),
        );
      } else if (!ids.has(job.agentId)) {
        findings.push(
          info(
            "UNRESOLVED_AGENT_REFERENCE",
            job.id,
            "Cron target is absent from agents.list; it is not an implicit configured agent.",
            "Reconcile the cron target with configured agents; docs/concepts/multi-agent.md and docs/automation/cron-jobs.md.",
          ),
        );
      }
    }
    const hooks = arr(obj(config.hooks).mappings).map((v, index) => {
      const h = obj(v), original = obj(arr(obj(raw.hooks).mappings)[index]);
      return {
        id: `hook-${index}`,
        name: text(h.name, `hook-${index}`)!,
        agentId: text(h.agentId, defaultId)!,
        channel: text(h.channel),
        template: prose(
          original.messageTemplate,
          `openclaw.json#/hooks/mappings/${index}/messageTemplate`,
        ),
      };
    });
    // Project each named skill entry after redaction individually: DEFAULT_REDACT_FIELDS
    // also matches dictionary labels such as the legitimate bundled "1password".
    const bundledSkills = Object.entries(obj(obj(raw.skills).entries)).map((
      [id, v],
    ) => ({ id, enabled: boolean(redact(obj(v)).enabled, true) }));
    const providers = Object.entries(obj(obj(raw.models).providers)).map(
      ([id, v]) => {
        const p = redact(obj(v));
        return {
          id,
          api: text(p.api),
          models: unique(arr(p.models).map((v) => required(obj(v).id))),
        };
      },
    );
    const messaging = obj(global.agentToAgent);
    const result: Snapshot = {
      schema: "openclaw-snapshot/3",
      openclawVersion: text(obj(config.meta).lastTouchedVersion, "2026.6.10")!,
      plaintextSecretCount: plaintextSecretCount(raw),
      backupCount: (await readdir(home, { withFileTypes: true })).filter((e) =>
        e.isFile() && e.name.startsWith("openclaw.json.")
      ).length,
      environmentNames: environmentNames(obj(raw.env).vars ?? raw.env),
      agents: byId(agents),
      accounts: byId(accounts),
      bindings: byId(bindings),
      cron: jobs,
      hooks: byId(hooks),
      bundledSkills: byId(bundledSkills),
      providers: byId(providers),
      plugins: inventory,
      memoryBackend: memoryBackend(config),
      messaging: {
        enabled: boolean(messaging.enabled, false),
        allowedTargets: unique(strings(messaging.allow)),
      },
      ambiguities: findings.sort((a, b) =>
        `${a.code}:${a.subject}` < `${b.code}:${b.subject}` ? -1 : 1
      ),
    };
    return parseSnapshot(result);
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw ioError(
      "COLLECT_READ_FAILED",
      "Cannot read the required instance files",
    );
  }
}
