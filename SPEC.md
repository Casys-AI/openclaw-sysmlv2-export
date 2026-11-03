# OpenClaw SysML v2 export — specification

This document specifies the current behaviour of the OpenClaw plugin
`sysmlv2-export` and of the Deno CLI that shares its pipeline. The
[README](README.md) is the user guide.

References written `docs/…` are pages of the `docs/` folder of the OpenClaw
2026.10.9 package; `dist/…` names its compiled sources. They justify the rules
that follow them.

## 1. Purpose and scope

The export reads an OpenClaw instance without changing it and turns it into:

- a sanitized, deterministic **snapshot** (`snapshot.json`);
- a **SysML v2 model** built on Assembly's library, grouped by Assembly
  category;
- on request, **inferred procedures and rules** proposed by a model from each
  agent's behaviour files and scheduled-task prompts, kept apart from extracted
  facts.

Each plugin run is kept as a version, browsable and comparable in an offline
viewer.

The **doctor** (§7.2) reads the same snapshot and reports coded configuration
findings. Every plugin export writes them to `findings.json`; the Deno CLI can
also check an existing snapshot. Findings do not change the instance or block
export.

**Targets.** OpenClaw 2026.10.x, following the 2026.10.9 documentation. The
collector also reads 2026.6.10 configurations (`agents.list`, legacy memory
search keys, the 2026.6.10 tool catalog).

**Out of scope.** Writing back to OpenClaw; sessions, transcripts and the memory
index; OAuth token stores; flows; plugin internals beyond their manifest; any
change to Assembly's library.

## 2. Pipeline

Each step is a pure function with a thin CLI around it. Steps compose; none
calls the next.

| Step     | Signature                              | Role                                                                          |
| -------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| collect  | `collect(home, pluginList) → Snapshot` | The only step that reads the instance. Read-only.                             |
| emit     | `emit(snapshot) → Map<path, text>`     | Deterministic SysML text: `OpenClawImport.sysml`, `OpenClawInstance.sysml`.   |
| doctor   | `doctor(snapshot) → Finding[]`         | Collector findings plus configuration rules (§7.2); plugin and Deno CLI.      |
| diff     | `diff(a, b) → Change[]`                | Structural changes between two snapshots (§8).                                |
| validate | `validate(files) → Diagnostics`        | Compiles written files with the explicitly installed pinned WASM Toolkit.     |
| views    | `diagramViews(snapshot, inference)`    | The viewer's model: nodes and edges per view, each with its SysML; its table. |
| layout   | `layoutView(view) → Scene`             | Positions a view's drawn elements with elkjs, at export time. Asynchronous.   |
| tables   | `drawing(view)`, `tableData(view)`     | Splits a view into what is drawn and its table, shaped for the page (§10.5).  |
| viewer   | `viewerPage(versions) → html`          | Static page over the kept versions (§10.5). Asynchronous.                     |
| infer    | `parseAgentInference`, `emitInferred`  | Validates a model's answer and emits `OpenClawInferred.sysml` (§9).           |

A plugin run is: list plugins (`openclaw plugins list --json`) → collect → emit
→ doctor → optionally infer → write a new version directory → validate → update
`versions.json` → regenerate `index.html`. The Deno CLI exposes collect, export
(emit plus library), doctor and diff separately (§10.7).

The collector uses only `node:` APIs (`fs`, `path`, `crypto`, `sqlite`), so the
same code runs under Deno and, bundled, inside OpenClaw's Node runtime.

## 3. Collection

### 3.1 Inputs

| Input                       | Where                                                       | Read                                                                                                             |
| --------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Configuration               | `<home>/openclaw.json`                                      | Parsed, redacted, then projected field by field.                                                                 |
| Configuration backups       | `<home>/openclaw.json.*`                                    | Regular files counted, never read.                                                                               |
| Workspace instruction files | top-level `*.md` of each agent workspace                    | Path, SHA-256 and size. Links count only when they resolve inside the workspace.                                 |
| Workspace skills            | every `SKILL.md` under `<workspace>/skills/`                | Path, SHA-256, size and the frontmatter `name` only.                                                             |
| Memory notes                | `<workspace>/memory/`                                       | Dates, sizes and an aggregate digest (§3.4).                                                                     |
| Version control             | `.git` entry at the workspace root                          | Presence only.                                                                                                   |
| Cron jobs                   | `<home>/state/openclaw.sqlite`, table `cron_jobs`           | `job_json` and `state_json` documents.                                                                           |
| Host exec approvals         | same database, table `exec_approvals_config`, row `current` | Policy fields and allowlist patterns; optional table.                                                            |
| Plugin inventory            | output of `openclaw plugins list --json`                    | Ids, enablement and declared tools; then each tool-declaring plugin's `openclaw.plugin.json` for `toolMetadata`. |

The SQLite database is required. It is opened once with the read-only flag,
`PRAGMA query_only=ON`, inside a transaction that is rolled back, and without
`immutable=1` so committed WAL records stay visible
(`docs/automation/cron-jobs.md`; `docs/tools/exec-approvals.md`, Settings and
storage). The configuration, instruction files, daily notes and plugin manifests
must be regular files of at most 32 MiB.

Never read: session transcripts and the per-agent index
(`<state>/agents/<id>/agent/openclaw-agent.sqlite`), the `mcp_oauth_stores`
table, the `operator_approvals` ledger, the legacy `exec-approvals.json`, and
plugin code.

### 3.2 Agents

- 2026.10 keyed `agents.entries` take precedence; otherwise `agents.list`
  (`docs/concepts/multi-agent.md`). Each entry is redacted on its own so an
  agent id is never mistaken for a secret key.
- With no configured agent, an implicit `main` agent exists. A cron job that
  names an absent agent never creates one.
- The default agent is the one marked `default: true`, else
  `agents.defaults.systemAgent.agentId`, else the first. Its default workspace
  is `workspace`; other agents default to `workspace-<id>`. Relative paths
  resolve against the OpenClaw home; `~` paths are rejected
  (`UNRESOLVED_WORKSPACE`).
- Delegation targets come from the agent's `subagents.allowAgents`, else
  `agents.defaults.subagents.allowAgents`, else the agent itself
  (`docs/gateway/config-tools.md`).
- Heartbeats: when any agent declares `heartbeat`, only those agents have one;
  otherwise only the default agent, from `agents.defaults.heartbeat`. The
  interval `every` (`<n>ms|s|m|h|d`) is required to emit it.

### 3.3 Workspaces and skills

- A skill is any directory under `skills/` that holds `SKILL.md`; folders
  without one only group skills (`docs/tools/skills.md`). Its id is its path
  under `skills/`; its name is the frontmatter `name`, else the folder name.
- Inner symlinks are followed once; links that resolve outside the workspace are
  skipped with `SKILL_SYMLINK_OUTSIDE_ROOT`; broken links and a
  `skills/SKILL.md` at the root are recorded as malformed. Dot-directories and
  `node_modules` are skipped. This legacy metadata does not establish invalid
  skills; the doctor ignores the root `SKILL.md` entry.

### 3.4 Memory

- **Search policy** (`docs/reference/memory-config.md`): global `memory.search`,
  else `agents.defaults.memorySearch`, else top-level `memorySearch` (legacy
  keys, `docs/gateway/doctor/config-migrations.md`). Per agent, `memory.search`,
  else `memorySearch`; defined agent fields override global ones, including
  `extraPaths`. Defaults: `enabled: true`, `provider: "openai"`,
  `sources: ["memory"]`, `multimodal: false`; unset `model`, `fallback` and
  `rememberAcrossConversations` stay null.
- **Notes** (`docs/concepts/memory.md`): `MEMORY.md` is the curated layer and
  stays an instruction file reference. Direct children of `memory/` named
  `YYYY-MM-DD.md` or `YYYY-MM-DD-<slug>.md` are daily notes: count, first and
  last date, total bytes, and a SHA-256 over the sorted
  `<date> <sha256> <bytes>` lines. Other Markdown under `memory/` is counted.
  Symlinks, dot-directories and a `memory/` that resolves outside the workspace
  are ignored.
- **Backend**: the `plugins.slots.memory` slot (`docs/tools/plugin.md`), Memory
  Core dreaming settings (`docs/concepts/dreaming.md`) and Active Memory
  enablement, agents, chat types and transcript persistence
  (`docs/concepts/active-memory/configuration.md`). Active Memory is enabled
  when its plugin entry is enabled (default false) and `config.enabled` is not
  false (default true; `dist/config-state-*.mjs`, `dist/config-*.mjs`).

### 3.5 Channels, bindings, hooks, cron

- Channel accounts: `channels.<channel>.accounts.<id>`, or one `default` account
  per channel; enabled when both channel and account are.
- Bindings: agent, account (match account, else the channel's `defaultAccount`,
  else `default`, else the first account) and peer kind only.
- Hook mappings: name, target agent (default agent when unset), delivery
  channel, and the message template as a reference.
- Cron jobs: name, enablement, agent (nullable), schedule (`cron` expression and
  time zone, `every` milliseconds, or `at` instant), session target, wake mode,
  payload kind and model, delivery mode/channel/account, the prompt as a
  reference, and runtime state (last status and time, consecutive errors,
  presence of a last error, creation time). Runtime state serves the doctor and
  the diff; it is never emitted.

## 4. Snapshot contract

### 4.1 Shape

`schema: "openclaw-snapshot/5"`. Top-level fields:

| Field                                 | Content                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `openclawVersion`                     | `meta.lastTouchedVersion`, or `unknown`.                                                                                |
| `plaintextSecretCount`                | Number of plaintext credential, environment and header values in the configuration (§4.3).                              |
| `plaintextCredentialPaths`            | Sorted `string[]` of audited plaintext credential JSON Pointers (§4.3), or `null` when not collected.                   |
| `backupCount`                         | Number of `openclaw.json.*` files.                                                                                      |
| `environmentNames`                    | Names of configured environment variables.                                                                              |
| `agents[]`                            | Model, effective `grants`, raw tool `policy`, `sandbox`, `execution`, `workspace`, `memory`, `delegation`, `heartbeat`. |
| `accounts[]`, `bindings[]`, `hooks[]` | Entries (§3.5).                                                                                                         |
| `cron[]`                              | Scheduled jobs (§3.5).                                                                                                  |
| `bundledSkills[]`, `providers[]`      | `skills.entries` enablement; model providers with API kind and model ids.                                               |
| `plugins[]` or `null`                 | Tool-declaring plugins: id, enabled, tools, optional tools, profile attachments. Null without an inventory.             |
| `mcpServers[]`                        | Configured MCP servers (§6.3).                                                                                          |
| `execApprovals` or `null`             | Host approval defaults and the `*` allowlist; null when no approval row is stored.                                      |
| `memoryBackend`                       | Slot, dreaming, Active Memory (§3.4).                                                                                   |
| `messaging`                           | `tools.agentToAgent` enablement and allowed targets.                                                                    |
| `ambiguities[]`                       | Informational findings raised while collecting (§7.1).                                                                  |

Inline prose (heartbeat prompts, hook templates, cron prompts) becomes a file
reference whose path is a JSON pointer, such as
`state/openclaw.sqlite#cron_jobs/<id>/job_json/payload/message`.

### 4.2 Determinism and validation

- Keys are sorted, entity arrays are sorted by id, sets are sorted and
  deduplicated; model fallbacks and bind modes keep their order. Collect, emit,
  doctor and diff read no clock and no locale: the same instance gives the same
  bytes.
- `parseSnapshot` validates every snapshot at the trust boundary: exact shape,
  no unknown field, enumerations, finite non-negative numbers, unique ids per
  array, and no string containing `CANARY-`, an e-mail address or a JWT. Inside
  the pipeline the snapshot is trusted and not revalidated.
- A released schema version is never extended in place. Older schemas are
  rejected; collect again. The optional `/5` diagnostic metadata field
  `plaintextCredentialPaths` is an explicit compatibility exception: omission
  parses as `null` (not collected); `[]` means collected with no matches.

### 4.3 Privacy

- **Projection first.** The snapshot is built field by field from an allowlist,
  so an unknown field never passes.
- **Redaction second.** The raw configuration goes through `@logtape/redaction`
  (`DEFAULT_REDACT_FIELDS` plus environment, headers, arguments, URLs, working
  directories, client certificates, base URLs, peer, guild and user ids,
  `allowFrom` lists, recipients, bind sources, extra hosts, prompts and
  templates) before projection. There is no third mechanism.
- **Never kept:** secret values, tokens and API keys; environment and header
  values (names only); provider base URLs; peer, guild and user ids; allowlists
  of people; bind source paths and extra hosts; plugin paths, sources, trust
  records, package names, versions and configuration; MCP URLs, commands,
  arguments (count only), working directories, OAuth settings other than the
  identity, client certificates; the directory part of exec path patterns,
  argument patterns (presence only), usage history, timestamps, entry ids,
  socket settings, trusted directories and `pathPrepend` values (counts only);
  memory note names and slugs, `extraPaths` (count only), local model paths,
  remote and vector-store settings; Active Memory prompts, chat ids, transcript
  directory and model; prompts and file bodies.
- **Secret counting.** Non-empty string leaves under keys named like `password`,
  `secret`, `token`, `apiKey`, `privateKey` or `credential`, and every value
  under `env`, `vars` or `headers`, count toward `plaintextSecretCount`.
  `${NAME}` references and secret-reference objects (`{ source, id }`) do not.
  This legacy `/5` counter includes arbitrary environment and header strings and
  retains no field paths. It cannot establish a supported credential surface and
  does not produce a doctor finding (§7.2).
- **Audited credential paths.** `plaintextCredentialPaths` records only paths,
  never values, for non-empty plaintext strings on four audited SecretRef
  families: `channels.discord.accounts.*.token`,
  `channels.telegram.accounts.*.botToken`, `gateway.auth.token` and
  `models.providers.*.apiKey`. Paths are JSON Pointers with RFC 6901 escaping
  (`~` becomes `~0`, `/` becomes `~1`). Structured SecretRefs, `$NAME` and
  `${NAME}` environment shorthand, whitespace-only values and known OpenClaw
  model-auth markers are excluded. This is deliberately partial coverage:
  `hooks.token`, `skills.entries.*.env.*`,
  `agents.defaults.sandbox.docker.env.*` and
  `agents.entries.*.sandbox.docker.env.*` do not produce findings.
- **Coded errors** never echo input values, native messages or absolute paths.

## 5. SysML mapping by Assembly category

### 5.1 Packages

- `OpenClawImport.sysml` defines the import vocabulary. It specializes
  Assembly's library and never redefines it:
  - `OpenClawAgent` specializes `AssemblyCore::SoftwareOperator`;
  - `OpenClawTool` specializes `AssemblyCore::ExecutableCapability`;
  - `ScheduledCase` specializes `AssemblyCases::CaseType`;
  - `CronSchedule`, `AtSchedule` and `MillisecondEvery` specialize
    `AssemblyCases::Schedule`.
- `OpenClawInstance.sysml` holds the instance in one nested package per Assembly
  category, each with a short `doc`: `Operators`, `Tools`, `Context`, `Cases`,
  `Entries`, `Authority`. References across them are qualified
  (`Authority::grant_…`, `Tools::toolCatalog.tool_…`, `Operators::agent_…`).
- `core.sysml`, `cases.sysml` and `skills.sysml` are copies of Assembly's
  `AssemblyCore`, `AssemblyCases` and `APESkills` (each names its source
  commit). They are written into every export directory, so each one compiles
  alone.
- Names are `<prefix>_<id>` when that is a valid identifier, otherwise a quoted
  name. Attributes with a null value are left unset; lists and objects are
  serialized as JSON strings.

### 5.2 Operators

| OpenClaw                             | SysML                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent                                | `part def Agent_<id> :> OpenClawAgent` (id, display name, emoji, primary and fallback models), a `doc` with the sanitized tool policy as provenance, and a reference to each of its grants; `part agent_<id>` of that type. |
| Agent context, sandbox, exec posture | Parts of the agent usage: `context` (§5.4), `sandbox : Sandbox`, `execution : ExecutionPosture` (§5.7).                                                                                                                     |
| Model provider (`models.providers`)  | `ModelProvider` (name, API kind, model ids).                                                                                                                                                                                |

### 5.3 Tools

| OpenClaw                                 | SysML                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every tool granted to at least one agent | One `OpenClawTool` in `toolCatalog : ToolCatalog`: `toolId`, `origin` (`ToolOrigin::builtin`, `plugin`, `mcp`, `cli`), `provider`, `optional`. Sorted by origin, then id. |
| Plugin declaring tools                   | `OpenClawPlugin` provider (id, enabled, tools, optional tools, profile attachments), disabled plugins included.                                                           |
| MCP server (`mcp.servers`)               | `McpServer` provider (id, tool prefix, enabled, transport, OAuth flag and identity, tool filter, environment and header names, argument count).                           |

Built-in tools have no provider. A plugin tool's provider is its plugin id; an
MCP tool `<prefix>__*` stands for every tool of its server, with the server id
as provider; a CLI tool's id is the command and its provider is `exec`. A
provider's ungranted tools stay listed on the provider only. OpenClaw's internal
owner of MCP tools, `bundle-mcp`, is never emitted.

### 5.4 Context

Each agent's context is a part of its agent usage in `Operators`; the `Context`
package holds the instance-wide entries.

| OpenClaw                               | SysML                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Instruction file                       | `InstructionFile` (path, SHA-256, bytes) in the agent's `AgentContext.instructions`.                                                |
| Workspace skill                        | `APESkills::InitialSkill` (id, source path, digest) in `AgentContext.skills`.                                                       |
| Memory search policy and notes         | `AgentMemory` as `AgentContext.memory`: search fields, curated `MEMORY.md` digest and size, daily-note inventory, other-note count. |
| Bundled skill entry (`skills.entries`) | `BundledSkill` (name, enabled).                                                                                                     |
| Memory backend                         | One `MemoryBackend` (slot, dreaming, Active Memory).                                                                                |

### 5.5 Cases

| OpenClaw  | SysML                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron job  | `ScheduledCase` with envelope `deterministic`, its owner and target agent as references when the agent exists (else the literal `unresolvedTarget`), and a schedule: `CronSchedule` (expression, time zone), `MillisecondEvery` for `every`, or `AtSchedule` (instant). Prompt as an `InstructionFile`. |
| Heartbeat | `ScheduledCase` with envelope `reassessment`, its agent as owner and target, and a `MillisecondEvery` schedule. Prompt as an `InstructionFile`.                                                                                                                                                         |

`MillisecondEvery` keeps the exact interval in `durationMs`; whole minutes also
set the inherited `count` and `unit = minute`, since
`AssemblyCases::ScheduleUnit` has no smaller unit.

### 5.6 Entries

| OpenClaw        | SysML                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Channel account | `ChannelAccount` (channel, account id, enabled, DM and group policies).                                                             |
| Binding         | `AgentBinding` connection agent ↔ account with the peer kind, when both ends exist.                                                 |
| Hook mapping    | `ExternalTrigger` (name, target agent as a reference, else `unresolvedTarget`, delivery channel), template as an `InstructionFile`. |

### 5.7 Authority

`Sandbox` and `ExecutionPosture` are parts of each agent usage in `Operators`;
grants, approvals, delegation and messaging are in the `Authority` package.

| OpenClaw                                  | SysML                                                                                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective tools per agent and layer (§6)  | `ToolGrant` items: a reference to the catalog tool and the layer (`host` or `sandbox`); CLI grants also carry `commandKind` and `argsRestricted`.                                                                                                   |
| `tools.exec`, `tools.elevated`, approvals | `ExecutionPosture` per agent: host, configured mode/security/ask, approval security/ask, effective security/ask, elevated flag and channel count, safe bins and profile names, trusted-directory and path-prepend counts, strict inline evaluation. |
| Sandbox                                   | `Sandbox` per agent: mode, scope, workspace access, image, read-only root, network, memory, CPUs, bind count and modes, environment names.                                                                                                          |
| Host approval defaults and `*` allowlist  | One `ExecApprovals` (default security/ask, ask fallback, auto-allow skills, wildcard commands), only when stored.                                                                                                                                   |
| `subagents.allowAgents`                   | Per agent, a `DelegationPolicy` (the agent as a reference, literal targets, wildcard flag, unresolved targets), and one `DelegationRule` connection agent → agent for each known target.                                                            |
| `tools.agentToAgent`                      | `MessagingPolicy` (enabled, literal targets, wildcard flag, unresolved targets, and a reference to each known target agent).                                                                                                                        |

For 2026.10, agent-to-agent access is enabled unless explicitly false
(`dist/session-visibility-c_9BAYYO.mjs`, `createAgentToAgentPolicy`); the legacy
collector interpretation defaults it to false. The wildcard rule still requires
that access to be enabled (§7.2).

## 6. Tool grant resolution

A grant is a positive, effective right: an agent can use a tool on a layer.
Absence of a grant means no right. The raw policy stays in the snapshot and in
the agent's `doc` as provenance.

### 6.1 Catalogs by version

- A recorded `2026.10.x` version selects the 2026.10 groups and profiles
  (`docs/gateway/config-tools/tool-policy.md`). There, `cron` is an alias of
  `automations`, and `group:openclaw` excludes `read`, `write`, `edit`,
  `apply_patch`, `exec`, `process`, `canvas` and plugin-owned tools.
- Any other version selects the 2026.6.10 groups and profiles
  (`docs/gateway/config-tools.md`); a version other than `2026.6.10` also raises
  `OPENCLAW_VERSION_UNVERIFIED`.
- Only documented entries are used. The restricted 2026.10 profiles expose
  `gateway` for updates only; a tool-level grant cannot express an action
  subset, so `gateway` is not granted by those profiles and
  `TOOL_PROFILE_PARTIAL` names the profile. Explicit allow entries still apply.

### 6.2 Plugins

- The catalog holds the selected built-in tools that no listed plugin declares,
  plus the tools of enabled plugins. A name a plugin declares is that plugin's
  tool: it gets no grant while the plugin is disabled, even if the 2026.6
  built-in catalog lists it (`browser`, `memory_search`…).
- `group:plugins` expands to the tools of enabled plugins; each plugin id
  expands to its tools in every allow and deny list, sandbox included.
- `toolMetadata.<tool>.profiles` attaches a plugin tool to the named profiles
  (`minimal`, `coding`, `messaging`, `full`; anything else is `INVALID_INPUT`).
  An attachment does not bypass later allow, deny or sandbox gates
  (`docs/plugins/manifest/capabilities.md`).
- An optional tool (`toolMetadata.<tool>.optional`) needs an explicit opt-in in
  one of the policies of its session: its name or a matching glob, its plugin
  id, `group:plugins`, `*`, an explicit `full` profile, or a selected profile it
  is attached to. An unset profile does not opt in. The sandbox policy counts
  for the sandbox layer (`docs/plugins/building-plugins.md`, Registering tools;
  `catalogPolicies` in `dist/tool-resolution-*.mjs`).
- Without an inventory, plugin-declared tools get no grant and
  `PLUGIN_INVENTORY_ABSENT` says so.

### 6.3 MCP servers

- Tool names of a server are only known at runtime, so each enabled server is
  one pseudo tool `<prefix>__*`, owned like every MCP tool by OpenClaw's
  `bundle-mcp` plugin (`docs/plugins/bundles.md`, Tool naming). The `coding` and
  `messaging` profiles allow `bundle-mcp` implicitly.
- The prefix follows `sanitizeServerName` and `assignSafeServerNames`
  (`dist/agent-bundle-mcp-names-*.mjs`): characters outside `[A-Za-z0-9_-]`
  become `-`, `mcp-` is prepended when the result does not start with a letter,
  it is cut to 30 characters, case-insensitive collisions get `-2`, `-3`… in
  declaration order, and it is lowercased for policy matching.
- The transport is the explicit `transport`, else `streamable-http` for
  `type: "http"`, else `stdio` for a `command` or `sse` for a `url`
  (`docs/cli/mcp/transports.md`). Exactly one of `command` and `url` must be
  present.
- An allow entry naming single server tools (`<prefix>__tool`) grants nothing:
  it cannot stand for the whole server. `MCP_TOOL_SUBSET_UNRESOLVED` reports it.
  The server's own `toolFilter` is kept but does not change the grant.

### 6.4 Resolution order

Patterns are compared in lowercase; `bash` means `exec`; a group or plugin id
expands to its members; `*` is a glob.

1. **Profiles.** The agent's profile, else the global one, else `full`, gives
   the first allowlist, extended by the global and agent `alsoAllow`. The
   provider profile (`tools.byProvider`, keyed by the full model reference or
   its provider, agent level first) gives the second, extended by the provider
   `alsoAllow`.
2. **Allow and deny.** The global, provider, agent and agent-provider policies
   apply in turn: when a stage sets `allow`, only tools matching `allow` or its
   `alsoAllow` remain; tools matching `deny` are always removed. `apply_patch`
   follows `write` in allowlists. No later stage restores a denied tool
   (`docs/tools/multi-agent-sandbox-tools.md`).
3. **Feature gates.** `apply_patch` remains only for `openai/` and
   `openai-codex/` primary models and while `exec.applyPatch.enabled` is not
   false (`docs/tools/exec.md`). `web_search` and `web_fetch` are removed when
   `tools.web.search` or `tools.web.fetch` is disabled. `browser` is removed
   when its plugin entry is disabled, or when `browser.enabled` is false and no
   active sandbox enables its own browser (`docs/tools/browser.md`).
4. **Optional tools** are kept only when opted in (§6.2).
5. **Layers.** Sandbox mode `off` gives host grants only, `all` sandbox grants
   only, `non-main` both (`SESSION_DEPENDENT_SANDBOX`). Sandbox grants further
   pass the sandbox tool policy (`tools.sandbox.tools`, replaced by the agent's
   own), and exist only when that policy sets both `allow` and `deny`; otherwise
   none are granted and `SANDBOX_DEFAULT_TOOLS_UNRESOLVED` says so.

An empty `allow` list grants nothing (`EMPTY_ALLOWLIST_UNRESOLVED`). Grants
describe the primary model only (`FALLBACK_TOOL_POLICY_UNRESOLVED`). Sender and
subagent tool policies are not resolved (`CONTEXT_DEPENDENT_TOOLS`).

### 6.5 CLI commands

- Exec allowlists name commands: the effective safe bins (`tools.exec.safeBins`;
  `docs/tools/exec-approvals-advanced.md`, Safe bins) and the agent's own host
  approval allowlist (`agents.<id>.allowlist[]` in the approval row).
- Safe bins become `safe-bin` commands with restricted arguments, except `awk`,
  `sed` and `jq`, which OpenClaw always denies as safe bins (they stay listed in
  `safeBins`). Unset safe bins add no command (`SAFE_BINS_DEFAULT_UNRESOLVED`
  when the agent holds `exec`).
- An allowlist pattern containing `/` or starting with `~` is a `path` command
  and keeps its last segment only; any other pattern is a `name` command kept as
  written. `argsRestricted` records the presence of `argPattern`. Duplicates
  collapse and stay restricted only when every entry is.
- The `*` allowlist is kept at instance level as `wildcardCommands` and is not
  inherited by agents: the docs leave its storage semantics open.
- Commands apply only under effective `allowlist` security
  (`docs/tools/exec-approvals.md`): only then is each command emitted as a CLI
  tool and granted on the layer of each of the agent's `exec` grants. They never
  grant `exec` itself.

### 6.6 Effective exec posture

- **Configured.** Host `auto`, `sandbox`, `gateway` or `node` (agent over
  global, default `auto`). Each scope sets either `mode` or the legacy
  `security`/`ask`; both in one scope is `INVALID_INPUT`. An agent `mode`
  replaces both fields; agent legacy fields clear an inherited mode and override
  only the fields they set (`applyExecPolicyLayer` in `dist/exec-policy-*.mjs`).
  Modes map to `deny`/`off`, `allowlist`/`off`, `ask` and `auto` to
  `allowlist`/`on-miss`, `full`/`off`; `mode` is kept so `ask` and `auto` stay
  distinct. Unconfigured 2026.10 baselines are `full`/`off`, or `deny`/`off` for
  an explicit `sandbox` host; undocumented older defaults are `unknown`.
- **Approvals.** Security and ask resolve independently from the agent entry,
  then `*`, then the defaults of the approval row
  (`dist/exec-approvals-resolver-*.mjs`); an omitted field inherits the
  configured value.
- **Effective.** Approvals can only tighten: security takes the stricter of
  `deny` < `allowlist` < `full`, ask the stricter of `off` < `on-miss` <
  `always`. `unknown` stays unknown unless `deny` or `always` decides. A `node`
  host's approvals live on that node, so its effective posture is unknown unless
  the configuration already decides it (`NODE_EXEC_APPROVALS_UNRESOLVED`).
- Agent exec fields replace global ones, empty arrays included;
  `safeBinProfiles` merge per key. `strictInlineEval` defaults to false
  (`docs/tools/exec.md`).
- Elevated exec counts as configured when `tools.elevated` is enabled, the agent
  does not disable it, and at least one channel has `allowFrom` entries
  (`docs/tools/elevated.md`).

This is a static host baseline: session overrides, elevated-full exceptions and
runtime sandbox routing are not inferred.

## 7. Findings

A finding has a `code`, a `severity` (`error`, `warning` or `info`), a
`subject`, a `context` and a `recovery`. Subjects use the shared view element
IDs: `agent:<id>`, `cron:<id>`, `heartbeat:<agentId>`, `account:<id>`,
`grant:<agentId>:<tool>` or `instance`. Identifier parts are preserved verbatim.
Collector findings in snapshots taken before these IDs keep raw entity IDs; the
viewer lists them without selecting an element. A binding finding points to its
account when present, otherwise its configured agent when present, otherwise
`instance`: the nearest available drawn element. Findings are sorted by `code`
then `subject`, with the path breaking ties for `PLAINTEXT_CREDENTIAL`. `error`
identifies a failure or unrestricted approval posture; `warning` calls for
review; `info` records a limit or context. Severity does not affect export
completion.

### 7.1 Collector findings

Raised while collecting and resolving grants and kept in the snapshot as
`ambiguities`, in every export. All are `info`: each names a point the static
export cannot settle, instead of guessing.

| Code                               | Subject  | Condition                                                                                                                  |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `STATIC_TOOL_AVAILABILITY`         | instance | Always: grants follow policy; credentials, plugin loading, model-native tools and session approvals are not checked.       |
| `OPENCLAW_VERSION_UNVERIFIED`      | instance | The recorded version is neither `2026.6.10` nor `2026.10.x`; the 2026.6.10 catalog is used.                                |
| `PLUGIN_INVENTORY_ABSENT`          | instance | No plugin inventory was supplied.                                                                                          |
| `TOOL_PROFILE_PARTIAL`             | agent    | 2026.10 and a selected restricted profile: its update-only `gateway` access is not granted (§6.1).                         |
| `TOOL_CATALOG_INCOMPLETE`          | agent    | A policy names a tool that neither the built-in catalog nor any listed plugin or MCP server declares.                      |
| `MCP_TOOL_SUBSET_UNRESOLVED`       | agent    | A policy names single tools of an MCP server (§6.3).                                                                       |
| `EMPTY_ALLOWLIST_UNRESOLVED`       | agent    | A policy sets an empty `allow`; it is treated as granting nothing.                                                         |
| `SESSION_DEPENDENT_SANDBOX`        | agent    | Sandbox mode `non-main`: host and sandbox grants describe different sessions.                                              |
| `SANDBOX_DEFAULT_TOOLS_UNRESOLVED` | agent    | An active sandbox whose tool policy lacks `allow` or `deny`; no sandbox grant is emitted.                                  |
| `CONTEXT_DEPENDENT_TOOLS`          | agent    | `toolsBySender` (global or agent) or a subagent tool policy is set.                                                        |
| `FALLBACK_TOOL_POLICY_UNRESOLVED`  | agent    | The agent has fallback models; grants describe the primary one.                                                            |
| `EXEC_APPROVALS_UNRESOLVED`        | agent    | The effective exec security or ask is `unknown` (non-`node` host).                                                         |
| `NODE_EXEC_APPROVALS_UNRESOLVED`   | agent    | Exec host `node`: approvals live on the remote node.                                                                       |
| `ELEVATED_CONTEXT_REQUIRED`        | agent    | Elevated exec is configured and the sandbox is active; it depends on senders and session directives.                       |
| `SANDBOX_SCOPE_UNRESOLVED`         | agent    | An active sandbox without `scope`; the docs disagree on the default (`docs/gateway/sandboxing.md`).                        |
| `SANDBOX_BACKEND_UNRESOLVED`       | agent    | A sandbox backend other than Docker; only Docker settings are mapped.                                                      |
| `HEARTBEAT_DEFAULT_UNRESOLVED`     | agent    | A heartbeat applies without `every`; the default cadence depends on the authentication mode (`docs/gateway/heartbeat.md`). |
| `WORKSPACE_MISSING`                | agent    | The configured workspace does not exist.                                                                                   |
| `INSTRUCTION_OUTSIDE_ROOT`         | agent    | A top-level `.md` entry is a broken link or resolves outside the workspace; it is not collected.                           |
| `SKILL_SYMLINK_OUTSIDE_ROOT`       | agent    | A skill link resolves outside the workspace; OpenClaw ignores it unless `skills.load.allowSymlinkTargets` trusts it.       |
| `CRON_TIMEZONE_UNRESOLVED`         | cron job | A cron expression without a time zone runs in the host's, which is not collected.                                          |
| `SUBMINUTE_SCHEDULE`               | cron job | An `every` interval that is not a whole number of minutes; kept in `durationMs` only.                                      |
| `CRON_AGENT_UNRESOLVED`            | cron job | The job names no agent; OpenClaw resolves it at run time (memory-core's dreaming sweep, for one).                          |

### 7.2 Doctor rules

`doctor(snapshot)` returns the collector infos above plus the configuration
checks below. Legacy collector copies of `UNRESOLVED_AGENT_REFERENCE`,
`UNRESOLVED_BINDING_REFERENCE` and `SAFE_BINS_DEFAULT_UNRESOLVED` are recomputed
here, so old `/5` snapshots follow the same rules. This table is the full
current code catalog, including collector infos. Sources beginning `docs/` or
`dist/` refer to OpenClaw 2026.10.9; `src/` and `sysml/` name this adapter's own
projection choices, not OpenClaw faults. [Diagnostics](docs/diagnostics.md)
explains the meaning and recovery of every code.

| Code                               | Severity                                    | Subject                    | Condition                                                                                                                                                                             | Source                                                                                                   |
| ---------------------------------- | ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `EXEC_WITHOUT_APPROVAL`            | error                                       | agent                      | Exec is policy-reachable on the gateway host with effective security `full` and ask `off`.                                                                                            | `docs/tools/exec-approvals.md`                                                                           |
| `PLAINTEXT_CREDENTIAL`             | warning                                     | account or instance        | One finding per `plaintextCredentialPaths` entry on an audited SecretRef surface. Allowed plaintext calls for review; it does not prove a runtime failure.                            | `docs/reference/secretref-credential-surface.md`                                                         |
| `AGENT_WITHOUT_SANDBOX`            | warning; info if security unresolved        | agent                      | Exec can run on the gateway host and effective security is not `deny`. Explicit `host: gateway` reaches the host even with a sandbox-layer grant; `auto` requires a host-layer grant. | `docs/gateway/sandboxing.md`; `docs/tools/exec.md`                                                       |
| `EXTERNAL_BIND_SOURCES`            | warning                                     | agent                      | An active sandbox permits bind sources outside workspace roots. Other path checks still apply.                                                                                        | `docs/gateway/sandboxing/multiple-folders-for-one-agent.md`                                              |
| `AGENT_TO_AGENT_WILDCARD`          | warning                                     | instance                   | Agent-to-agent access is enabled and its allowlist contains `*`, allowing every requester and target pair.                                                                            | `dist/session-visibility-c_9BAYYO.mjs, createAgentToAgentPolicy`                                         |
| `SAFE_BIN_INTERPRETER_UNPROFILED`  | warning                                     | agent                      | An interpreter or runtime in `safeBins` has no explicit argv profile. Paths, executable suffixes and versioned interpreter names are normalized.                                      | `dist/exec-safe-bin-runtime-policy-CgvU47MQ.mjs`; `dist/exec-safe-bin-trust-tdUplWO7.mjs`                |
| `EXEC_ALLOWLIST_WILDCARD`          | warning                                     | agent or instance          | An agent command or instance wildcard-approval command has basename `*`; any directory restriction is omitted.                                                                        | `docs/tools/exec-approvals.md`                                                                           |
| `MEMORY_SESSIONS_INDEXED`          | warning                                     | agent                      | Memory search is enabled and either `sources` includes `sessions` or `rememberAcrossConversations` is true.                                                                           | `docs/reference/memory-config.md`                                                                        |
| `CRON_FAILING`                     | warning                                     | cron                       | An enabled job has at least three consecutive errors. Disabled jobs do not trigger this rule.                                                                                         | `dist/cron-2TRTJPLC.mjs, CHRONIC_FAILURE_MIN_CONSECUTIVE_ERRORS and inspectCronJobHealth`                |
| `BINDING_ACCOUNT_UNAVAILABLE`      | warning                                     | account, agent or instance | A binding has no matching enabled channel account. `channel:*` matches any account on that channel.                                                                                   | `docs/channels/channel-routing.md`; `dist/server-channels-eZDWbzoS.mjs, startChannelProcessOwned`        |
| `UNRESOLVED_AGENT_REFERENCE`       | error if enabled on 2026.10; info otherwise | cron                       | A job explicitly targets an absent agent. OpenClaw 2026.10 fails the run; older behavior is unverified. A missing agentId is CRON_AGENT_UNRESOLVED.                                   | `dist/server-cron-DmxBCDVE.mjs, resolveCronAgent`                                                        |
| `UNRESOLVED_BINDING_REFERENCE`     | info                                        | account, agent or instance | A binding names an absent agent, so no exported connection is drawn. Account availability is checked separately.                                                                      | `docs/concepts/multi-agent.md`; `src/doctor.ts (export endpoint check)`                                  |
| `WORKSPACE_UNVERSIONED`            | info                                        | agent                      | No `.git` entry was recorded at the workspace root. Parent repositories are not checked; this does not establish that the workspace lacks version control.                            | `docs/gateway/doctor/workspace-and-dreams.md, section 19`; `src/collect.ts (root marker only)`           |
| `MALFORMED_SKILLS_DIR`             | info                                        | agent                      | Entries under `skills/` could not be resolved by the collector. The accepted root `skills/SKILL.md` is excluded; this does not establish invalid skills.                              | `dist/skill-root-discovery-B5Jg-4aX.mjs, discoverSkillCandidates`; `src/collect.ts (unresolved entries)` |
| `MCP_SANDBOX_GATE`                 | info                                        | agent                      | A sandbox is active and MCP servers are enabled, but no enabled-server MCP tool has a sandbox-layer grant.                                                                            | `docs/gateway/config-tools/tool-policy.md`                                                               |
| `MEMORY_REMOTE_EMBEDDINGS`         | info                                        | agent                      | Memory search is enabled with a provider other than `local` or `none`. Endpoint location and transmission are not verified.                                                           | `docs/reference/memory-config.md`                                                                        |
| `MANUAL_CONFIG_BACKUPS`            | info                                        | instance                   | Files named openclaw.json.* were recorded. This does not establish manual edits or a fault; OpenClaw doctor creates backups too.                                                      | `docs/gateway/doctor/config-migrations.md, rewrite rules`                                                |
| `STATIC_TOOL_AVAILABILITY`         | info                                        | instance                   | Always: grants describe static policy reachability. Credentials, plugin loading, model-native tools and session approvals are not runtime-verified.                                   | `docs/gateway/config-tools.md`; `docs/tools/exec.md`                                                     |
| `OPENCLAW_VERSION_UNVERIFIED`      | info                                        | instance                   | The recorded version is neither `2026.6.10` nor `2026.10.x`; the adapter uses its 2026.6.10 catalog.                                                                                  | `src/collect.ts`; `src/policy.ts (adapter catalog selection)`                                            |
| `PLUGIN_INVENTORY_ABSENT`          | info                                        | instance                   | No plugin inventory was supplied; plugin-only tools receive no grants.                                                                                                                | `docs/cli/plugins/list.md`                                                                               |
| `TOOL_PROFILE_PARTIAL`             | info                                        | agent                      | A restricted 2026.10 profile includes update-only gateway access that tool-level grants cannot express; that automatic grant is withheld.                                             | `docs/gateway/config-tools/tool-policy.md`                                                               |
| `TOOL_CATALOG_INCOMPLETE`          | info                                        | agent                      | Policy names tools that no documented built-in entry, supplied plugin or MCP server declares; they receive no grants.                                                                 | `docs/gateway/config-tools/tool-policy.md`                                                               |
| `MCP_TOOL_SUBSET_UNRESOLVED`       | info                                        | agent                      | Policy names a subset of a server runtime tool catalog; subset entries grant no whole server.                                                                                         | `docs/gateway/config-tools/tool-policy.md`; `docs/plugins/bundles.md`                                    |
| `EMPTY_ALLOWLIST_UNRESOLVED`       | info                                        | agent                      | An empty `allow` is treated conservatively as granting nothing because the documentation disagrees.                                                                                   | `docs/gateway/sandbox-vs-tool-policy-vs-elevated.md`; `docs/tools/multi-agent-sandbox-tools.md`          |
| `SESSION_DEPENDENT_SANDBOX`        | info                                        | agent                      | Sandbox mode `non-main` yields separate host and sandbox session contexts.                                                                                                            | `docs/tools/multi-agent-sandbox-tools.md`                                                                |
| `SANDBOX_DEFAULT_TOOLS_UNRESOLVED` | info                                        | agent                      | An active sandbox policy omits `allow` or `deny`; unresolved defaults cause sandbox grants to be withheld.                                                                            | `docs/gateway/config-agents.md`                                                                          |
| `CONTEXT_DEPENDENT_TOOLS`          | info                                        | agent                      | Sender or subagent tool policies require runtime context that is not resolved.                                                                                                        | `docs/gateway/config-tools.md`                                                                           |
| `FALLBACK_TOOL_POLICY_UNRESOLVED`  | info                                        | agent                      | Fallback models are configured; exported grants describe the primary model.                                                                                                           | `docs/tools/multi-agent-sandbox-tools.md`; `docs/tools/exec.md`                                          |
| `SAFE_BINS_DEFAULT_UNRESOLVED`     | info                                        | agent                      | Safe bins are unset while the agent holds exec; no default command grants are inferred.                                                                                               | `docs/tools/exec.md`; `docs/tools/exec-approvals-advanced.md`                                            |
| `EXEC_APPROVALS_UNRESOLVED`        | info                                        | agent                      | Effective exec security or ask remains unknown for a non-node host.                                                                                                                   | `docs/tools/exec.md`                                                                                     |
| `NODE_EXEC_APPROVALS_UNRESOLVED`   | info                                        | agent                      | Exec host is `node`; local state cannot establish the remote node approvals posture.                                                                                                  | `docs/tools/exec-approvals.md`                                                                           |
| `ELEVATED_CONTEXT_REQUIRED`        | info                                        | agent                      | Elevated exec is configured with an active sandbox; sender and session gates remain unresolved.                                                                                       | `docs/tools/elevated.md`                                                                                 |
| `SANDBOX_SCOPE_UNRESOLVED`         | info                                        | agent                      | An active sandbox has no explicit scope and the reference documentation disagrees on the default.                                                                                     | `docs/gateway/sandboxing.md`; `docs/tools/multi-agent-sandbox-tools.md`                                  |
| `SANDBOX_BACKEND_UNRESOLVED`       | info                                        | agent                      | The configured backend is not Docker; only Docker isolation settings are mapped.                                                                                                      | `docs/gateway/sandboxing.md`                                                                             |
| `HEARTBEAT_DEFAULT_UNRESOLVED`     | info                                        | agent                      | A heartbeat applies without `every`; its default cadence depends on uncollected authentication mode.                                                                                  | `docs/gateway/heartbeat.md`                                                                              |
| `WORKSPACE_MISSING`                | info                                        | agent                      | The configured workspace cannot be resolved because it does not exist.                                                                                                                | `src/collect.ts, workspace (adapter filesystem check)`                                                   |
| `INSTRUCTION_OUTSIDE_ROOT`         | info                                        | agent                      | A top-level Markdown entry is a broken link or resolves outside the workspace and is not collected.                                                                                   | `src/collect.ts, workspace (adapter collection boundary)`                                                |
| `SKILL_SYMLINK_OUTSIDE_ROOT`       | info                                        | agent                      | A skill link resolves outside the workspace; OpenClaw requires explicit trust for such targets.                                                                                       | `docs/tools/skills.md`; `src/collect.ts (adapter collection boundary)`                                   |
| `CRON_TIMEZONE_UNRESOLVED`         | info                                        | cron                       | A cron expression has no explicit timezone and uses the uncollected gateway host timezone.                                                                                            | `docs/automation/cron-jobs.md`                                                                           |
| `SUBMINUTE_SCHEDULE`               | info                                        | cron                       | An every interval is not a whole number of minutes; its exact value is preserved in durationMs.                                                                                       | `sysml/cases.sysml (adapter MillisecondEvery)`; `src/collect.ts`                                         |
| `CRON_AGENT_UNRESOLVED`            | info                                        | cron                       | The job names no agent and OpenClaw resolves its execution agent at run time, including plugin-managed jobs.                                                                          | `docs/automation/cron-jobs/troubleshooting.md`; `docs/concepts/dreaming.md`                              |

The `/5` `plaintextSecretCount` remains a legacy count, including arbitrary
`env`, `vars` and header strings without their paths. It does not prove a
credential covered by OpenClaw's
`docs/reference/secretref-credential-surface.md`; `PLAINTEXT_SECRET_IN_CONFIG`
is not a current rule.

`PLAINTEXT_CREDENTIAL` uses the drawn account for a
`channels.<channel>.accounts.<id>` path, otherwise `instance`. The four audited
families contain no agent credentials; agent environment fields are unsupported.
The classifier follows
`dist/config-secret-target-DS4jAbAd.mjs,
classifyConfigSecretTarget`. Its
context names the JSON Pointer, never the credential value. Review or recovery
is to replace the value at that path with the structured env SecretRef
`{source: 'env', provider: 'default', id: 'CREDENTIAL_ENV'}` and configure that
environment variable on the gateway. A `null` path list produces no finding; it
is not evidence that an older export contains no plaintext credentials.

The plugin writes the canonical sorted array to `findings.json`. Its export
summary and each new `versions.json` entry have
`findings: {error, warning, info}` counts, including zeroes. Older entries
without counts remain valid. Chat and tool replies render nonzero counts as
errors, warnings and notes. The viewer payload instead uses
`findings: Finding[]` recomputed from each readable snapshot, plus that
version's APE findings read from its `findings.json` (§10.6), or `null` if the
snapshot cannot be read; `[]` means a check ran with no findings.

## 8. Diff

`diff(a, b)` compares two snapshots and returns changes (`kind`, `subject`,
`before`, `after`) sorted by kind then subject. Values are snapshot values, so
never secrets.

| Kind                                                                                                                     | Subject              |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| `agent.added`, `agent.removed`                                                                                           | agent                |
| `agent.model`, `agent.grants`, `agent.sandbox`, `agent.execution`, `agent.memory`, `agent.delegation`, `agent.heartbeat` | agent                |
| `skill:<agent>.added`, `skill:<agent>.removed`, `skill.digest`                                                           | skill, `agent:skill` |
| `instruction:<agent>.added`, `instruction:<agent>.removed`, `instruction.digest`                                         | file, `agent:file`   |
| `binding.*`, `plugin.*`, `mcp.*` (`added`, `removed`, `changed`)                                                         | entity               |
| `cron.added`, `cron.removed`, `cron.schedule`, `cron.job`                                                                | cron job             |
| `exec.approvals`, `memory.backend`                                                                                       | `instance`           |

`agent.execution` carries the configured, approval and effective postures and
the commands, so a change shows which side of the policy moved even when the
effective result stays the same.

## 9. Inference

Prose (behaviour files and scheduled-task prompts) describes roles, procedures,
escalations and hand-offs that the configuration does not hold. Inference asks a
model to propose them; the proposals are never admitted automatically.

- **Input.** Per agent, its behaviour files: top-level instruction files named
  in capitals (`AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`…), except
  `MEMORY.md` and `USER.md`. Other workspace notes and `memory/` are never sent.
  Each file is reread only if it is still inside the workspace and still has the
  collected digest (`INSTRUCTION_CHANGED` otherwise). Also included are enabled
  and disabled cron jobs with `payloadKind: agentTurn` and a prompt targeting
  that agent, labelled `cron:<job id>`, and its heartbeat prompt, labelled
  `heartbeat`, when present. Jobs with `agentId: null` are skipped. At inference
  time cron prompts are reread from `state/openclaw.sqlite`
  (`cron_jobs.job_json` → `payload.message`) in a read-only transaction, and
  heartbeat prompts from `openclaw.json` with the collector's agent/default
  inheritance. The raw text must match the snapshot's `FileRef.sha256`; cron
  ownership and payload kind must still match too. Changed, missing or
  unreadable prompts fail that agent with `INSTRUCTION_CHANGED`, without echoing
  content. Prompt bodies remain in memory only; snapshot shape stays
  `openclaw-snapshot/5`.
- **Call.** One isolated completion per agent through `api.runtime.llm`
  (`docs/plugins/sdk-runtime/models.md`): the prompt carries the numbered source
  lines, scheduled-task metadata (schedule expression/time zone or interval, and
  cron enablement), the valid targets (agent ids, `owner`, `customer`) and the
  JSON Schema of the answer; purpose `sysmlv2-export.infer`, execution
  `isolated-agent-runtime`, 180 s timeout. From the CLI, each agent is analysed
  in its own context (`agentId`, which needs `llm.allowAgentIdOverride`), and
  `--model` overrides the model (`llm.allowModelOverride`). A chat command's
  model is bound to the session agent and OpenClaw lets no plugin override it
  (`dist/runtime-llm.runtime-*.mjs`), so in chat every agent is analysed with
  the session agent's model. A refusal fails that agent without a fallback. The
  model is instructed to use each scheduled task's schedule as the inferred
  procedure's trigger and to preserve disabled status; an unset time zone stays
  unknown. Schedule metadata is separate from the numbered prompt lines.
- **Validation** at the trust boundary (`parseAgentInference`): the answer must
  be about the agent asked; ids are unique kebab-case slugs; step kinds are
  `action`, `decision`, `handoff`, `escalation`, rule kinds `permission`,
  `constraint`, `prohibition`; targets belong to the known set; every procedure
  has a step; citations name a source belonging to that agent that was sent,
  with a valid line range. Texts are trimmed, cut at 300 characters, and e-mail
  addresses, JWTs, long token-like strings and phone numbers are masked.
- **Failure** is per agent: the agent is listed in `failed` with a code and the
  export's own message (or `MODEL_FAILED` with a short, masked runtime message);
  other agents continue.
- **Output.** `inference.json` (`openclaw-inference/1`: model, then per agent
  its role, procedures with ordered steps and source, rules with source) and
  `OpenClawInferred.sysml`: package `OpenClawInferred`, one `action def` per
  procedure with one `action` per step and `first … then …` successions, one
  `requirement def` per rule. Each `doc` cites the source label, lines and
  SHA-256 (for example, `source cron:<job id>:1-3 sha256 <digest>`). Raw prompts
  are never written to these outputs or the snapshot; model text is masked as
  above. The package stays separate from extracted facts, so the snapshot and
  its diff stay deterministic.

## 10. Plugin interfaces

The plugin id is `sysmlv2-export`. It requires OpenClaw ≥ 2026.10.9 and
activates on startup.

### 10.1 CLI

```text
openclaw sysmlv2-export [--infer] [--model <provider/model>] [--out <dir>] [--open]
```

Runs an export and prints a JSON summary: version directory, version id, viewer
path, agent count, and inference counts with the agents that failed. `--out`
replaces the output directory; `--open` opens the viewer with `open` (macOS) or
`xdg-open` (Linux) and otherwise prints its path.

### 10.2 Chat command

`/sysmlv2_export` exports; `/sysmlv2_export infer` also infers, with each
agent's own model. The command requires an authorized sender (the owner) on chat
surfaces and the `operator.admin` scope for gateway clients. Replies show paths
relative to `<state dir>` and never absolute host paths.

### 10.3 Agent tool

`sysmlv2_export` takes no parameters, exports, and never calls a model. It is
optional (an operator must allow it, for instance with `tools.alsoAllow`) and is
offered only to the owner's unsandboxed sessions.

### 10.4 Settings

| Setting                                                   | Effect                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `plugins.entries.sysmlv2-export.config.outDir`            | Output directory; default `<state dir>/sysmlv2-export`.                       |
| `plugins.entries.sysmlv2-export.llm.allowAgentIdOverride` | Required for inference on other agents (`docs/gateway/config-extensions.md`). |
| `plugins.entries.sysmlv2-export.llm.allowModelOverride`   | Required for `--model`.                                                       |

The plugin inventory comes from OpenClaw itself. The plugin runtime gives an
external plugin no plugin registry (`docs/plugins/sdk-runtime.md`) and the
gateway client rejects it (`docs/plugins/sdk-runtime/gateway-and-nodes.md`), so
the plugin runs the current CLI as OpenClaw re-invokes itself — the running Node
binary and its entry script — with `plugins list --json`, through
`api.runtime.system.runCommandWithTimeout` (60 s).

### 10.5 Versions and viewer

Each run writes a new directory `<outDir>/<UTC time>/`, named to the second
(`2026-11-02T10-15-00Z`):

```text
snapshot.json  findings.json  OpenClawImport.sysml  OpenClawInstance.sysml
core.sysml  cases.sysml  skills.sysml  validation.json
inference.json  OpenClawInferred.sysml      (with inference)
```

`<outDir>/versions.json` lists the runs, newest first: id, creation time, agent
count, inference counts (or null), an optional validation summary and optional
`findings: {error, warning, info}` counts. Older entries without validation or
finding counts remain valid. `<outDir>/index.html` is regenerated after each
run: one self-contained page (no network, opens from `file://`) that shows each
version as SysML v2 views (diagrams and tables), shows each file, and shows the
unified diff of each file since the previous version.

| View            | Content                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview        | The first view. A table, one row per agent: model, host or sandbox, tools by origin, bound channel accounts, scheduled tasks enabled, context and, with inference, procedures and rules; the instance's totals above; links to the agent's other views. |
| System          | Agent part usages with compartments (attributes, context, tools by origin and layer), channel accounts grouped by channel, `AgentBinding` connections.                                                                                                  |
| Tools           | The `Tools` package as a SysML allocation matrix: catalog tools grouped by origin and by plugin or MCP provider, against the agents; each cell an agent's `ToolGrant`s (host, sandbox or both); declared but ungranted tools dashed.                    |
| Scheduled tasks | Heartbeats and cron jobs as `ScheduledCase` parts with schedule and state, an owner edge to the agent they wake (an unknown target is a dashed reference), and the week in which each fires.                                                            |
| Behaviour       | Per agent with inference: one `action def` frame per procedure (start, actions, decisions, hand-offs and escalations to agents or actors, done), and its rules (`requirement def`s) as a table of kind, text and source.                                |

- **Same data as the text.** Views are built from the version's own
  `snapshot.json` and `inference.json`, with the emitter's grant resolution;
  every figure of the Overview is counted from them. Each element (a node, a
  table row, a matrix column or cell) names its declarations (qualified names)
  in the version's emitted files: an Overview row names the agent's def and
  usage, its bindings and its cases. The inspector shows their exact lines and
  opens them under Files.
- **Layout at export time.** `elkjs` 0.9.3 (pinned, layered algorithm,
  deterministic options) places System, Scheduled tasks and Behaviour's
  procedures; many procedures go into as many even rows (ELK partitions, the
  parties below) as make the view show largest on a 16:9 screen. Text is
  measured with Helvetica's metrics, the font the diagrams use (or its metric
  twins Arial and Liberation Sans); rows that do not fit end with an ellipsis,
  and the page squeezes any text that still overflows. Tables are shaped at
  export time too: rows in order with their headers, matrix cells by row and
  column. The page draws SVG and renders HTML tables, with sorting, a filter and
  folding but no layout.
- **Tables.** A view lists the elements it shows as a table instead of drawing
  them (a matrix's columns, rows and cells; an element table's rows with some
  attributes as columns, filtered by a facet such as a rule's kind or where an
  agent runs). A table under a diagram can be resized.
- **Week.** A cron schedule is placed in a 7 × 24 hour week when its day of
  month and month are `*` (or `?`) and its fields are numbers, ranges, steps,
  lists or day names, with five fields or six (seconds first): hours are in its
  own time zone, or the gateway host's when it has none. An interval under a day
  is a band over the whole week, its start being unknown; one-shot, date-bound
  and longer schedules are listed as not weekly.
- **Changes.** Against the previous version, an element is added when its id is
  new, changed when its attributes or SysML text differ (frames by their
  attributes; an Overview row, which sums declarations up, by their SysML only,
  so a new inference does not mark it), removed when it is gone; table rows,
  columns and cells count as elements, so a new grant is a new cell and marks
  its tool's row as changed. A view the previous version lacked is new.
- **Unreadable snapshots.** A version whose snapshot fails this viewer's schema
  check keeps its files and diffs, without diagrams.
- **Determinism and size.** Same versions, same bytes. File texts and view
  payloads shared by several versions are stored once, and the embedded data
  cannot close its script element.

### 10.6 Toolkit installation and validation

```text
openclaw sysmlv2-toolkit install [--from <archive.tgz>]
openclaw sysmlv2-toolkit status
```

Installation is explicit. Without `--from`, it downloads
`https://github.com/Open-MBEE/sysml-toolkit/releases/download/v0.10.10/sysml-wasm-0.10.10.tgz`.
The pinned archive SHA-256 is
`93d6ef0a2140fceabc3115cd95d629146bc004c3959bfa23d715cce8b06cc13c`. The
installer verifies the archive and files, then atomically installs into
`<state dir>/sysmlv2-export-toolkit/0.10.10/`. A verified existing installation
is an idempotent no-op. Status JSON is `{installed, version, path, verified}`;
installation JSON adds the boolean `changed`.

The Toolkit's `LICENSE` (Apache-2.0), `LICENSE-EPL-2.0` (its SysML v2 standard
library), and `THIRD-PARTY-NOTICES.md` are copied into the installation. Neither
an Assembly checkout nor a silent download is needed for compilation.

After writing the export, `runExport` validates every written SysML file,
including inferred SysML and the local `core.sysml`, `cases.sysml` and
`skills.sysml`, using the Toolkit's standard library. The standalone Deno export
remains the separate emitter; tests call validation on its exact output files.
It checks installed file hashes and uses `initSync` inside
`node:worker_threads`, with a 60-second timeout.

The validation summary is `{status, errors, code?, recovery?}`, where `status`
is `passed`, `failed` or `skipped` and `errors` is a number. `validation.json`
is `{validation: summary, errors: [...], warnings: [...]}`. Each diagnostic has
`code`, `message`, `file`, `line` and `column`; source positions are 1-based,
and runtime errors use null for the file and position. Skipped validation still
writes the file, with empty diagnostic arrays. Unresolved references in the
exported sources count as errors even when the Toolkit marks them advisory;
other non-error findings are kept in `warnings`. Chat and tool output include
one short validation line.

Missing Toolkit skips validation with `TOOLKIT_NOT_INSTALLED` and recovery
exactly `openclaw sysmlv2-toolkit install`. Compilation errors, tampering and
timeouts fail validation without discarding the export. These diagnostics are
informational to the export result.

**APE rules on the model graph.** After a passing check, the same worker takes
the compiled element graph (`toFullJson`), projects a subset of it to RDF with
Assembly's vocabulary (`urn:ase:vocab:`, one named graph per build), loads it in
batches into Oxigraph 0.5.12 (WebAssembly), materializes five SPARQL `CONSTRUCT`
views and runs the rules. Views, rules and the derived vocabulary
(`urn:ase:ape:v1:`) are data under `rules/ape/`, documented in
[`rules/ape/README.md`](rules/ape/README.md); queries are SPARQL 1.1 only. Each
rule file starts with six header fields (`code`, `severity`, APE `pattern`,
`finding`, `context`, `recovery`) and returns `?agentId`, plus `?relatedAgentId`
when its context names `{related}`. Findings are prefixed `APE_`, keep `pattern`
and `finding`, and join the doctor's in `findings.json` and its counts.
`validation.json` adds `ape`: `{status, findings, metrics}`, where `status` is
`completed`, `skipped` (no Toolkit or a failed check) or `failed`; a failure
carries `code`, `stage` (projection, loading, view or rule), `file` and `cause`,
separate from the Toolkit diagnostics. The rules read only the compiled model,
never the snapshot.

### 10.7 Deno CLI

```text
deno task collect --home <dir> [--plugins <file>] --out <file>
deno task export  --snapshot <file> --out <dir>
deno task doctor  --snapshot <file>     # configuration findings (§7.2)
deno task diff    <a> <b>
```

Output is JSON on stdout; errors are `{ code, context, recovery }` with exit
code 1. Written files never overwrite existing ones and are created with mode
`0600`; `export` writes the two instance files and the library into a new
directory.

## 11. Coded errors

Failures are `{ code, context, recovery }` errors, never findings.

| Code                                              | Raised by | When                                                                                    |
| ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `INVALID_INPUT`                                   | all       | A known field has the wrong shape or an unsupported value; a snapshot fails validation. |
| `UNSAFE_INPUT_FILE`, `INPUT_LIMIT`                | collect   | An input file is a symlink or not a regular file; it exceeds 32 MiB.                    |
| `UNRESOLVED_WORKSPACE`                            | collect   | A workspace path starts with `~`.                                                       |
| `STATE_READ_FAILED`                               | collect   | The SQLite state cannot be read.                                                        |
| `PLUGIN_MANIFEST_READ_FAILED`                     | collect   | A plugin listed with tools has no readable `openclaw.plugin.json`.                      |
| `COLLECT_READ_FAILED`                             | collect   | Any other read failure.                                                                 |
| `PLUGIN_LIST_FAILED`                              | plugin    | `openclaw plugins list --json` exited non-zero.                                         |
| `INSTRUCTION_CHANGED`, `INFERENCE_NOT_JSON`       | plugin    | Per agent during inference (§9).                                                        |
| `EXPORT_VERSION_EXISTS`, `EXPORT_VERSION_MISSING` | plugin    | Two runs in the same second; `versions.json` lists a missing directory.                 |
| `CLI_USAGE`, `CLI_IO_ERROR`                       | Deno CLI  | Invalid arguments; files cannot be read or created.                                     |
| `TOOLKIT_NOT_INSTALLED`                           | validate  | Toolkit missing; validation skipped. Recovery: `openclaw sysmlv2-toolkit install`.      |
| `TOOLKIT_INTEGRITY`                               | toolkit   | Archive or installed file hash verification failed.                                     |
| `TOOLKIT_TIMEOUT`                                 | validate  | The worker exceeded 60 seconds.                                                         |
| `TOOLKIT_DOWNLOAD_FAILED`                         | toolkit   | Reading or downloading the installation archive failed.                                 |
| `TOOLKIT_VALIDATION_FAILED`                       | validate  | The worker or compiler could not complete validation.                                   |

## 12. Limits and known unknowns

- **Static view.** Grants and exec posture follow the configuration. Runtime
  tool registration, credentials, model-native tools, session approvals and
  overrides, elevated-full exceptions and runtime sandbox routing are not
  observed.
- **MCP** grants cover whole servers. Server tool names, plugin-declared MCP
  servers, bundle `.mcp.json` files and `nodeHost.mcp.servers` are not read.
- **Sandboxes** are mapped for the Docker backend only. Sandbox grants need an
  explicit sandbox tool policy. Sandbox scope defaults stay unresolved.
- **Exec.** Default safe bins, the `*` approval allowlist's inheritance and
  remote node approvals stay unresolved. Approval allowlists keep command names
  only.
- **Profiles.** Update-only `gateway` access in restricted 2026.10 profiles is
  not granted. Sender and subagent tool policies, and fallback-model policies,
  are not resolved.
- **Memory** is a configuration projection: contextual recall, runtime extra
  paths and Active Memory auto-activation are not inferred, and the memory index
  is never read.
- **Versions.** Versions other than 2026.6.10 and 2026.10.x use the 2026.6.10
  catalog. Empty allowlists are treated as granting nothing.
- **Inference** reads behaviour files and scheduled-task prompts, and depends on
  the model; its output is a proposal.
- **Diagnostics.** Static configuration checks do not establish runtime
  execution, actual embedding transmission, parent Git repositories or skill
  validity. Findings do not repair the configuration or block export.
- **Diff** does not compare agent names, raw policies, channel accounts, hooks,
  providers, bundled skills, the messaging policy or secret counts.

## 13. Design decisions

1. **Positive, effective grants.** The model holds what an agent can actually
   use, per layer, never negative grants. The raw policy is provenance. Why:
   Assembly reasons about authority as explicit grants; an unresolved allow/deny
   cascade would push OpenClaw's semantics onto every reader.
2. **Specialize Assembly, never change it.** `OpenClawImport` specializes the
   library, and each export directory carries the library copy it was built on.
   Why: an export must compile alone, against the exact definitions it targets.
3. **Prose by reference.** Files and inline prose are referenced by path,
   SHA-256 and size. Why: the model and the diff need identity and change, not
   bodies, and bodies are where private content lives.
4. **Assembly categories; MCP and CLI are origins.** One tool catalog lists
   every granted tool once, with its origin and provider. Why: categories are
   how Assembly organizes a system; MCP servers and exec commands are ways to
   provide tools, not new kinds of things.
5. **OpenClaw memory is an inventory, not governed memory.** Why: Assembly's
   `APEMemory` asserts admission decisions and validity windows; OpenClaw memory
   is agent-written Markdown with neither.
6. **Documented semantics only; ambiguity becomes an info finding.** Catalogs
   are versioned and every unsettled point is named instead of guessed. Why: a
   wrong grant is worse than a reported gap.
7. **OpenClaw's own plugin inventory.** The collector never guesses where
   manifests live. Why: plugins are installed in several roots, and
   `openclaw plugins list --json` is the authority on what is loaded and
   enabled.
8. **Three exec postures.** Configured, approvals and effective are kept
   separately. Why: CLI grants and diagnostics depend on the effective result,
   and a reviewer needs to see which side changed.
9. **Two privacy layers.** An allowlist projection, then a maintained redaction
   library; the output tests scan for canaries, e-mail addresses and JWTs. Why:
   projection blocks unknown fields; redaction catches known secrets in fields
   that are read; a third, local mechanism would drift.
10. **Pure steps and one boundary.** Steps are pure and deterministic, and the
    serialized snapshot is the only validated boundary. Why: identical inputs
    give identical bytes, which keeps diffs and goldens meaningful.
11. **Inference as separate proposals, inside the host.** It runs as an OpenClaw
    plugin with the agents' own models and writes to its own package. Why: the
    prose goes only to a model the owner already entrusts with it, never to a
    third service, and inferred content must never be mistaken for extracted
    fact.
12. **Immutable schema versions.** A snapshot schema is never extended in place,
    apart from the explicit optional `/5` diagnostic metadata exception in §4.2,
    and older ones are rejected. Why: a snapshot's meaning must not depend on
    the code that reads it; uncollected credential paths remain unknown.
13. **Diagnostics from the exported snapshot.** Plugin exports and the Deno CLI
    share the same read-only doctor. Why: findings can name the model's exact
    elements, expose static limits and point to OpenClaw sources without
    changing the instance or preventing an export.
14. **Diagrams laid out at export time.** The plugin lays the views out with
    elkjs and embeds their geometry. Why: the page stays small and works from
    `file://` without a 1.6 MB layout engine in every page, and the same input
    gives the same page; the plugin bundle carries elkjs instead.
15. **Tables for long lists, diagrams for structure.** Grants are an allocation
    matrix, rules a requirements table and the Overview a table of agents;
    procedures, bindings and schedules stay diagrams. Why: a grant relates two
    lists, and past a few dozen tools a diagram of them cannot be read, while a
    matrix stays readable at 128 tools by 20 agents; rules have no structure to
    draw. A table row is still an element with its SysML, as in a diagram.

## 14. Verification

- **Canaries.** Every secret, peer id, URL, path and prompt in the fixtures is a
  `CANARY-*` marker; no snapshot, SysML, finding or change may contain one.
- **Determinism and goldens.** Collecting and emitting twice gives identical
  bytes, equal to the reviewed goldens in `test/golden/`.
- **Doctor.** Each rule has a positive and a negative case.
- **Toolkit.** An export directory of the fixture, with an inferred package,
  compiles alone with the pinned public sysml-wasm 0.10.10 archive, without an
  Assembly checkout. CI downloads it and checks its SHA-256 before running
  `deno task test:toolkit`. Locally, set `SYSML_TOOLKIT_WASM_ARCHIVE` to an
  absolute archive path; optional archive-dependent tests skip when absent.
- **Viewer.** The fixture's views hold the expected nodes and edges, the Tools
  matrix one cell per grant, a Behaviour view its rules as a table and the
  Overview each agent's figures and links; cron expressions are placed in the
  week or refused; every element names a declaration of the emitted files;
  layout is deterministic, keeps children inside their container and never
  overlaps siblings; a new element, and a new matrix cell, is highlighted
  against the previous version; hostile names cannot escape the embedded data.
- **Collector.** Tests copy the fixture to a temporary directory and build
  `state/openclaw.sqlite` from `state/*.json`; no binary is committed.
