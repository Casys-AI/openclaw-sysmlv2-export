# OpenClaw export — v0 specification

Read an OpenClaw instance without changing it, keep a sanitized snapshot, emit
SysML v2 on the Assembly library, run doctor findings and diff two snapshots.
v0 is one-way: nothing is written back to OpenClaw.

Targets: OpenClaw **2026.10.x**, using the 2026.10.9 documentation, and the
legacy **2026.6.10** catalog. The anonymized fixture in
[`test/fixtures/openclaw-2026.6.10-anon/`](test/fixtures/openclaw-2026.6.10-anon/README.md)
comes from a real instance.

## Decisions — 2 November 2026

1. **Effective permissions.** Resolve each agent's tool policy (profile,
   `alsoAllow`, `deny`, sandbox `tools.allow`/`deny`, defaults) into the
   explicit set of tools the agent can actually use, per layer (host or
   sandbox). The model holds positive grants only: no grant means no right. The
   raw OpenClaw policy is kept as provenance (snapshot, `doc` text), never as a
   negative grant.
2. **Vocabulary.** A package `OpenClawImport` specializes `AssemblyCore` and
   holds the new definitions (`OpenClawAgent`, `ToolGrant`, `CronSchedule`,
   `ChannelAccount`, `Sandbox`…). Nothing changes in Assembly's library
   (`apps/live-builder/models/` there). Definitions may move into the core
   later.
   `core.sysml`, `cases.sysml` and `skills.sysml` are copied into `sysml/`
   and written into every export directory, so it compiles alone.
3. **Prose.** Instruction files, skills, cron prompts and hook templates are
   referenced by relative path, SHA-256 and byte size. Their bodies never enter
   the snapshot, the SysML or any output.
4. **Versioned tool catalogs.** A recorded `2026.10.x` version selects the
   documented 2026.10 groups and profiles; every other version selects the
   2026.6.10 catalog. An absent version is recorded as `unknown`.
   `OPENCLAW_VERSION_UNVERIFIED` remains an info finding for versions outside
   those targets. Only documented entries are used. The 2026.10 restricted
   profiles expose `gateway` for updates only: the whole-tool grant model
   cannot express that action limit, so it withholds the automatic grant and
   emits `TOOL_PROFILE_PARTIAL`, naming the profile. Explicit policy additions
   still apply (`gateway/config-tools/tool-policy.md`).
5. **Plugin profile contributions.** Read `toolMetadata.<tool>.profiles` from
   each listed manifest and merge its declared tools into the selected profile.
   A contribution does not bypass later allow/deny or sandbox gates
   (`plugins/manifest/capabilities.md`).
6. **Effective host exec posture.** Keep configured mode/security/ask, selected
   host approval security/ask, and their stricter result separately per agent.
   Doctor and command-grant emission use the effective result. This is a
   static host baseline; session permissions and runtime sandbox routing are
   not collected (`tools/exec.md`, `tools/exec-approvals.md`).

## Pipeline

Each step is a pure function with a thin CLI. Steps compose; none calls the
next.

| Step | Signature | Notes |
| --- | --- | --- |
| collect | `collect(home, pluginList) → Snapshot` | Only step that reads the instance. Read-only. |
| emit | `emit(snapshot) → Map<path, text>` | Deterministic SysML text. |
| validate | `validate(files) → Diagnostics` | Compiles with the pinned Toolkit. |
| doctor | `doctor(snapshot) → Finding[]` | Coded findings. |
| diff | `diff(a, b) → Change[]` | Structural, from two snapshots. |

**collect** reads `openclaw.json`, each agent workspace (top-level Markdown
files by name, size and SHA-256, presence of `.git`, and a memory-note inventory
with no note names), skills as OpenClaw discovers them (`SKILL.md` anywhere under
`skills/`; inner symlinks followed once, outer ones skipped with a finding,
broken ones reported; only the frontmatter `name` is read), sibling backups
`openclaw.json.*` (count only), cron jobs and exec approval configuration from
`state/openclaw.sqlite`, tables `cron_jobs` and `exec_approvals_config`, opened
once read-only with `PRAGMA query_only` in a rolled-back transaction. Relative workspace paths resolve against the
OpenClaw home. With a plugin inventory (the output of `openclaw plugins list
--json`), it also reads `openclaw.plugin.json` in the `rootDir` of each plugin
that declares tools (see Families). It uses only `node:` APIs (`fs`, `path`,
`crypto`, `sqlite`) so the same file runs under Deno 2.9 and Node 22.

**Never in a snapshot or any output:** environment values, tokens, API keys,
provider base URLs, peer/guild/user ids, `allowFrom` lists, bind source paths,
extra hosts, prompts and file bodies. Secret-bearing fields are counted
(`plaintextSecretCount`), not copied. Environment variables keep their names.

**Redaction has two layers.** The first is projection: the snapshot is built
field by field from an allowlist, so an unknown field never passes. The second
reuses `jsr:@logtape/redaction@2.4.2` (same version as `@logtape/logtape` in
the repository): `redactProperties` with `DEFAULT_REDACT_FIELDS` plus the
fields above runs on the raw config before projection, and the output tests
scan with its `EMAIL_ADDRESS_PATTERN` and `JWT_PATTERN` besides the canaries.
Do not write a third redaction mechanism.

**Snapshot** is JSON with `schema: "openclaw-snapshot/5"`, sorted keys, arrays
sorted by id, no clock reads. Same instance → same bytes. Version 2 added
`plugins` and made `cron[].agentId` nullable; version 3 added agent `memory` and
instance `memoryBackend`; version 4 added `mcpServers`, exec command metadata and
`execApprovals`; version 5 adds plugin `toolProfiles` and configured, approval
and effective host exec posture. Released schema versions are never extended in place.
Older shapes are rejected, so collect again.

## Mapping

| OpenClaw | SysML (`OpenClawImport` + instance package) |
| --- | --- |
| agent (`agents.list`, implicit `main`) | `part def … :> OpenClawAgent`, with `OpenClawAgent :> AssemblyCore::SoftwareOperator`; id, display name, emoji, primary and fallback models |
| effective tools | `ToolGrant` items (tool, layer, owning plugin) referenced by the agent |
| plugin declaring tools | `OpenClawPlugin` part (id, enabled, tools, optional tools, profile contributions) |
| memory policy, notes and backend | `AgentMemory` per agent and one `MemoryBackend` part |
| `mcp.servers` | `McpServer` parts; whole-server `ToolGrant`s owned by `bundle-mcp` |
| exec safe bins and approval allowlists | `CommandGrant` items for agents with `exec` under effective `allowlist` security; one `ExecApprovals` part when stored |
| sandbox | `Sandbox` part: mode, scope, workspace access, image, read-only root, network, memory, cpus, bind count and modes, environment names |
| channel account | `ChannelAccount` part (channel, account id, DM and group policies) |
| binding | connection agent ↔ account, with the peer kind only |
| cron job | case type with `AssemblyCases::EnvelopeKind::deterministic` and a `CronSchedule :> AssemblyCases::Schedule` (expression, time zone); `every` maps to `AssemblyCases::Every` |
| heartbeat | case type with `reassessment` envelope and `Every` |
| hook mapping | `ExternalTrigger` (name, target agent, delivery channel) |
| workspace skill | `APESkills::InitialSkill` (id, source path, digest) |
| bundled skill entry | `BundledSkill` (name, enabled) |
| instruction file | `InstructionFile` (path, sha256, bytes) |
| `subagents.allowAgents` | delegation rule (from, to) |
| `tools.agentToAgent` | messaging policy (allowed targets) |
| model provider | provider name, API kind, model ids |
| `tools.exec`, `tools.elevated`, host approvals | `ExecutionPosture` (host, configured mode/security/ask, approval security/ask, effective security/ask, elevated, elevated channels count, safe bins/profile names, trusted-directory and path-prepend counts, strict inline evaluation) |

Runtime state (last run, errors, tokens) stays in the snapshot for the doctor
and the diff. It is not model content. Identifiers become valid SysML names;
names that cannot be made valid use quoted names.

Resolve OpenClaw semantics from the selected version's sources or docs, and
cite the file in a comment. When a rule stays ambiguous or a documented group
or profile is only partly representable, use the known subset and emit an
`info` finding naming it instead of guessing.

## Doctor

A finding is `{ code, severity: "error" | "warning" | "info", subject, context,
recovery }`. Initial rules:

| Code | Severity | Condition |
| --- | --- | --- |
| `EXEC_WITHOUT_APPROVAL` | error | `exec` reachable with effective security `full` and effective ask `off` |
| `AGENT_WITHOUT_SANDBOX` | warning | agent with `exec` and no sandbox |
| `EXTERNAL_BIND_SOURCES` | warning | `dangerouslyAllowExternalBindSources: true` |
| `AGENT_TO_AGENT_WILDCARD` | warning | `agentToAgent.allow` contains `*` |
| `PLAINTEXT_SECRET_IN_CONFIG` | error | `plaintextSecretCount > 0` |
| `CRON_FAILING` | warning | `consecutive_errors ≥ 3` |
| `WORKSPACE_UNVERSIONED` | warning | workspace without `.git` |
| `MANUAL_CONFIG_BACKUPS` | info | at least one `openclaw.json.*` sibling |
| `MALFORMED_SKILLS_DIR` | warning | `SKILL.md` at the root of `skills/`, or a broken skill link |

Folders without `SKILL.md` are legitimate groups (`docs/tools/skills.md`) and
are not reported.

## Diff

Changes between two snapshots: agent added/removed, model, grants, sandbox,
execution (including configured, approval and effective posture and commands), memory, binding, plugin and MCP server
added/removed/changed, memory backend, exec approvals, skill added/removed/digest,
instruction digest, cron job and schedule.
Each change names its subject and before/after values (never secrets).

## Families — 2 November 2026

Four families extend the export, kept light. All four are implemented.
Doc paths are relative to the
`docs/` folder of the OpenClaw 2026.10.9 package; `dist/` paths name its
compiled sources.

### 1. Plugins and their tools (implemented)

**Where OpenClaw keeps it.** Each native plugin's `openclaw.plugin.json`
declares its tools in `contracts.tools`, optional ones in
`toolMetadata.<tool>.optional` (`plugins/tool-plugins.md`), and profile
contributions in `toolMetadata.<tool>.profiles`
(`plugins/manifest/capabilities.md`). Manifests live in several places: bundled ones in
`<openclaw package>/dist/extensions/<id>/`, npm installs under
`<state>/npm/projects/<encoded-package>/` (`plugins/dependency-resolution.md`),
linked paths from `plugins.load.paths`, plus global and workspace roots.
Install records sit in SQLite (`config_machine_state`, key
`plugins.installedIndex`; `cli/plugins/list.md`). The collector never guesses
these paths.

**Input.** The narrow input is OpenClaw's own inventory,
`openclaw plugins list --json`: per plugin `id`, `enabled`, `rootDir` and
`contracts.tools` (registry view, read cold; `cli/plugins/list.md`). The
inventory omits `toolMetadata`, so the collector reads the manifest at
`rootDir` for plugins that declare tools, and takes only the optional flags
and profile contributions.
`api.runtime` exposes no plugin registry to a plugin (`plugins/sdk-runtime.md`),
and `api.runtime.gateway.request` (which could call `plugins.list` or
`tools.catalog`) rejects external plugins
(`plugins/sdk-runtime/gateway-and-nodes.md`). The plugin therefore runs the
current CLI through `api.runtime.system.runCommandWithTimeout`, as
`process.execPath` plus the entry in `argv[1]`. OpenClaw re-invokes itself the
same way (`dist/openclaw-cli-invocation-*.mjs`), and `dist/index.js` and
`dist/entry.js`, the Gateway service entries, both answer it. The Deno CLI
takes the same JSON with `collect --plugins <file>`. Without an inventory,
`plugins` is `null` and `PLUGIN_INVENTORY_ABSENT` (info) says so.

**Snapshot.** `plugins: { id, enabled, tools[], optionalTools[], toolProfiles[] }[] | null`,
only for plugins that declare at least one tool, sorted by id. Each
`toolProfiles` entry is `{ id: toolName, profiles: string[] }`, with sorted,
deduplicated profiles and entries sorted by tool id. Only declared tools with
nonempty profile contributions are kept. Profile names must be `minimal`,
`coding`, `messaging` or `full`; invalid metadata is `INVALID_INPUT`.

**Policy** (`gateway/config-tools/tool-policy.md`):

- Enabled plugins' tools join the catalog.
- A name that a plugin declares is that plugin's tool: it gets no grant while
  the plugin is disabled, even if the 2026.6 built-in catalog lists it
  (`browser`, `memory_search`…).
- `group:plugins` and each plugin id expand to the plugin's tools in every
  allow and deny list, sandbox included.
- An optional tool needs an explicit opt-in in one of the session's policies:
  its name or a glob, its plugin id, `group:plugins`, `*`, or an explicit
  `full` profile, or a selected profile to which the manifest attaches it.
  An unset profile does not opt in. The sandbox policy counts
  for the sandbox layer (`catalogPolicies` in `dist/tool-resolution-*.mjs`).
- `TOOL_CATALOG_INCOMPLETE` fires only for names that neither the built-in
  catalog nor any listed plugin declares.
- `toolMetadata.<tool>.profiles` adds a plugin tool to each named profile's
  allowlist. An unattached tool remains excluded by a restricted profile unless
  another explicit entry allows it. Global, agent, provider and sandbox
  restrictions remain authoritative (`plugins/manifest/capabilities.md`).

**SysML.** `OpenClawPlugin` part (`pluginId`, `enabled`, `tools`,
`optionalTools`, serialized `toolProfiles`) and `ToolGrant.pluginId` for grants
of plugin-owned tools.

**Doctor.** No new rule. Coded errors: `PLUGIN_LIST_FAILED` (the command failed
or printed no JSON) and `PLUGIN_MANIFEST_READ_FAILED` (a listed plugin with
tools has no regular `openclaw.plugin.json`).

**Privacy.** Only ids, the enabled flag, tool names and profile names are kept. `rootDir`,
`source`, `trust.*`, `workspaceDir`, package names, versions and plugin
config never enter the plugin inventory. The separate memory backend projection
below retains only its named configuration fields.

### 2. Memory (implemented)

**Where OpenClaw keeps it.**

- Search policy: `memory.search.*`, overridden per agent by
  `agents.entries.<id>.memory.search.*` (`reference/memory-config.md`). Legacy
  `memorySearch`, `agents.defaults.memorySearch` and
  `agents.list[].memorySearch` are what doctor migrates
  (`gateway/doctor/config-migrations.md`); the 2026.6 fixture uses them.
- Backend: the `plugins.slots.memory` slot, `memory-core` by default and
  `"none"` to disable (`tools/plugin.md`, `gateway/config-extensions.md`).
- Dreaming: `plugins.entries.memory-core.config.dreaming`
  (`concepts/dreaming.md`).
- Active Memory: `plugins.entries.active-memory` and its `config`
  (`concepts/active-memory/configuration.md`).
- Layers in each workspace (`concepts/memory.md`):
  - `MEMORY.md` at the root, exact case and regular file; the curated layer.
  - Daily notes `memory/YYYY-MM-DD.md` or `memory/YYYY-MM-DD-<slug>.md`,
    matched by `/^(\d{4}-\d{2}-\d{2})(?:-[^/]+)?\.md$/i` on direct children of
    `memory/`.
  - Other Markdown under `memory/` (imports, dreaming reports) is indexed but
    is not daily notes. Symlinks are skipped.
- The index, `<state>/agents/<id>/agent/openclaw-agent.sqlite`, also holds
  sessions and transcripts. It is never read.

**Policy and inventory.** Global search uses `memory.search` when present,
otherwise `agents.defaults.memorySearch`, then top-level `memorySearch`.
Each agent uses its `memory.search` when present, otherwise its `memorySearch`;
defined agent fields override the selected global fields. Empty modern objects
still take precedence over legacy settings. Values come from redacted config.
Search defaults are `enabled: true`, `provider: "openai"`, `sources: ["memory"]`
and `multimodal: false` (`reference/memory-config.md`). Unset `model`, `fallback`
and `rememberAcrossConversations` stay null. This is a configuration projection:
it does not infer contextual transcript recall or runtime source additions.
`extraPathCount` counts the selected `extraPaths` field; this brief's field
override deliberately does not model OpenClaw's additive runtime extra paths.

Resolve `memory/` inside the real workspace root; an outside target is ignored.
Within it, skip symlinks and dot-directories. Only direct dated regular files
are daily notes. Each passes the 32 MiB input limit before hashing. The aggregate
hash covers sorted `${date} ${fileSha256} ${bytes}\n` lines, never names or slugs.
Other regular Markdown files count recursively, including nested dated files.

**Snapshot.**

- Per agent, `memory` holds:
  - the effective `search` policy: `enabled`, `provider`, `model`, `fallback`,
    `sources`, `rememberAcrossConversations`, `extraPathCount`, `multimodal`;
  - `daily`: `count`, `firstDate`, `lastDate`, `bytes`, and `sha256` over the
    sorted `date sha256 bytes` lines;
  - `otherCount`.
- `MEMORY.md` stays the existing instruction `FileRef`, never duplicated.
- At instance level, `memoryBackend` holds `slot`, `dreaming` (`enabled`,
  `frequency`, `timezone`) and `activeMemory` (`enabled`, `agents`,
  `allowedChatTypes`, `persistTranscripts`).
- Empty daily inventories have zero count/bytes and null dates/digest.
- An unset slot stays null (OpenClaw defaults to `memory-core`); unset dreaming
  fields stay null. Active Memory is null when its entry is absent. Otherwise
  enablement requires the plugin entry to be enabled (default false) and
  `config.enabled` not false (default true). The fields are documented in
  `concepts/active-memory/configuration.md`; the defaults are confirmed by
  `dist/config-state-Ba1MVBAI.mjs` and `dist/config-CpTCuMPy.mjs`, because that
  page does not state them. This does not infer runtime auto-activation.
  Agent/chat-type arrays are sorted and deduplicated; unset transcript
  persistence stays null.

**SysML.**

- `OpenClawImport` gains an `AgentMemory` part per agent, with flat attributes:
  the search fields, `curatedSha256`/`curatedBytes` from `MEMORY.md`, and the
  daily inventory.
- It also gains one `MemoryBackend` part.
- Assembly's `APEMemory::GovernedMemoryPolicy` is not reused and
  `memory.sysml` is not copied. It describes admission-governed memory: exact
  revision and digest decisions, scopes, and a required `maxValidityMs`.
  OpenClaw memory is agent-written Markdown with no admission and no expiry, so
  instantiating it would assert governance OpenClaw does not have.

**Doctor.**

- `MEMORY_SESSIONS_INDEXED` (warning): search is enabled and either `sources`
  includes `sessions` or `rememberAcrossConversations` is true. Transcripts then become searchable
  across conversations, and `reference/memory-config.md` puts both in the same
  trust boundary.
- `MEMORY_REMOTE_EMBEDDINGS` (info): search is enabled and `provider` is neither
  null, `local` nor `none`. The configuration selects an embedding provider;
  actual runtime transmission is not verified.

**Diff.** Agent search policy or note inventory changes produce `agent.memory`;
backend changes produce `memory.backend` with subject `instance`.

**Privacy.**

- Never kept: note bodies, file names (slugs can carry conversation topics)
  beyond the date, `extraPaths` (count only), `local.modelPath`, `remote.*`,
  `store.vector.extensionPath`.
- Never kept from Active Memory: `promptOverride`, `promptAppend`,
  `allowedChatIds`, `deniedChatIds`, `transcriptDir`, `model`.
- Inference keeps excluding `MEMORY.md` and never reads `memory/`.

### 3. MCP servers (implemented)

**Where OpenClaw keeps it.**

- `mcp.servers` is a map keyed by server name (`tools/mcp.md`,
  `cli/mcp/registry.md`).
- Transport is `stdio` (from `command`), `sse` (a `url` without `transport`),
  or `streamable-http`; `type: "http"` is an alias of `streamable-http`.
- `toolFilter.include`/`exclude` hold tool names and `*` globs.
- `auth: "oauth"` and `oauth.identity` describe OAuth; its tokens live in
  `state/openclaw.sqlite`, table `mcp_oauth_stores`, and are never read.
- Plugin manifests can declare `mcpServers` (`plugins/manifest/surfaces.md`),
  and bundles ship `.mcp.json`. Those and `nodeHost.mcp.servers` are out of scope.
- Tools surface as plugin `bundle-mcp` tools named `<prefix>__<tool>`. The
  prefix is the server name made provider-safe (`sanitizeServerName` in
  `dist/agent-bundle-mcp-names-*.mjs`), and policy matching is
  case-insensitive.

**Snapshot.** `mcpServers` at instance level: `id`, `toolPrefix`, `enabled`,
`transport`, `oauth`, `oauthIdentity`, `toolFilter` (`include`, `exclude`),
`envNames`, `headerNames`, `argCount`, sorted by `id`, or `[]` when absent.
Entries are projected independently from the raw server keys, so a key such
as `token` is retained. Enablement defaults to true. `oauth` means
`auth === "oauth"`; only `oauth.identity` is retained, or null when absent.
Tool-filter arrays default to empty; they describe the server's own filter
and do not change whole-server grants.

Prefix assignment follows `sanitizeServerName` and `assignSafeServerNames`:
replace characters outside `[A-Za-z0-9_-]` with `-`, add `mcp-` when the result
does not start with a letter, truncate to 30 characters, resolve collisions
with `-2`, `-3` and so on in declaration order, then lowercase for policy.
An explicit transport wins; `type: "http"` means `streamable-http`; otherwise
command presence means `stdio` and URL presence means `sse`. Both or neither
present, or an unsupported transport, is `INVALID_INPUT`. Command and URL
values are never inspected by this projection.

**Policy.**

- Tool names are discovered at runtime, so each enabled server becomes one pseudo tool
  `<prefix>__*` of a synthetic `bundle-mcp` plugin, enabled with no optional
  tools, and the family 1 policy resolves it alongside the plugin inventory.
  The synthetic plugin is omitted from `snapshot.plugins`.
- The `coding` and `messaging` profiles implicitly allow `bundle-mcp`
  (`tool-policy.md`).
- The grant `ToolGrant { tool: "<prefix>__*", pluginId: "bundle-mcp" }` means
  "any tool of this server".
- An allow list that names single server tools gives no grant;
  `MCP_TOOL_SUBSET_UNRESOLVED` (info, agent subject) reports it. These names,
  `bundle-mcp` and server pseudo tools are known to `TOOL_CATALOG_INCOMPLETE`.

**SysML.** `McpServer` parts retain `serverId`, `toolPrefix`, `enabled`,
`transport`, `oauth`, `oauthIdentity`, flattened `toolInclude`/`toolExclude`,
`envNames`, `headerNames` and `argCount`.

**Diff.** MCP changes produce `mcp.added`, `mcp.removed` and `mcp.changed`.

**Doctor.**

- `MCP_SANDBOX_GATE` (info): sandbox mode is not `off`, at least one configured
  server is enabled, and the agent has no server pseudo-tool grant on its
  sandbox layer. `openclaw doctor` checks the same shape.
- Header values join `plaintextSecretCount` and so `PLAINTEXT_SECRET_IN_CONFIG`.

**Privacy.** Never kept: `url`, `command`, `args` (count only), `cwd`, `env`
and `headers` values (names only), `oauth.*` except `identity`, `clientCert`,
`clientKey`, and the OAuth tables.

### 4. CLI and exec allowlists (implemented)

**Where OpenClaw keeps it.**

- Config, global and per agent: `tools.exec.safeBins` and its per-agent twin
  (bare names; `tools/exec-approvals-advanced.md`, Safe bins), plus
  `safeBinProfiles` keyed by binary, `safeBinTrustedDirs` and `pathPrepend`
  (host paths), and `strictInlineEval` (`tools/exec.md`). `tools.exec.mode`
  supplies the configured posture, or the legacy `security` / `ask` fields.
- Host approvals: `state/openclaw.sqlite`, table `exec_approvals_config`, the
  row with `config_key = 'current'` (`tools/exec-approvals.md`, Settings and
  storage; `dist/exec-approvals-sqlite-*.mjs`).
  - Its `raw_json` holds default and per-agent approval policy, plus
    `agents.<id>.allowlist[]` entries:
    `pattern` (a bare command-name glob, or a resolved-path glob),
    `argPattern`, and `lastUsed*`.
  - Approvals can only tighten the config posture.
  - Allowlists and safe bins apply only when security is `allowlist` (modes
    `allowlist`, `ask` and `auto`).
- Legacy `exec-approvals.json` is import-only and not read. Neither is the
  `operator_approvals` ledger.

**Snapshot.**

- Per agent, `execution` gains:
  - `mode` (`null` for a legacy or unset mode) and configured `security` / `ask`;
  - `approvals: { security, ask }`, the selected local host policy, with nullable
    fields when omitted, and `effective: { security, ask }`, the stricter result;
  - `safeBins` (`null` when unset; the docs disagree on the default list);
  - `safeBinProfiles` (names only), `trustedDirCount`, `pathPrependCount`,
    `strictInlineEval`;
  - `commands`: `{ id, command, kind: "safe-bin" | "name" | "path", argsRestricted }`,
    sorted by `id`, where `id` is `${kind}:${command}`. A pattern containing
    `/` or beginning with `~` is a path and keeps only its last segment;
    other name patterns are kept as written. `argsRestricted` records
    `argPattern` presence. Duplicate ids collapse and remain restricted only
    when every collapsed entry is restricted.
- At instance level, `execApprovals` holds the approval `defaults` and the
  `*` allowlist as `wildcardCommands`, or `null` when the table or current row
  is absent. Defaults are nullable `security`, `ask`, `askFallback` and
  `autoAllowSkills`. The table is checked through `sqlite_master` before reading
  the current row. Each agent receives only its own stored allowlist; the
  wildcard list is not inherited because the docs leave its storage ambiguous.

**Posture resolution** (`tools/exec.md`, `tools/exec-approvals.md`). Each config
scope accepts either `mode` or legacy security/ask; a mixed scope is
`INVALID_INPUT`. An agent mode replaces both global policy fields. Agent legacy
fields clear an inherited mode and override only the supplied fields
(`dist/exec-policy-DDPEdabr.mjs`, `applyExecPolicyLayer`). Mode `ask` and `auto`
both resolve to `allowlist` / `on-miss`; keeping `mode` preserves the distinction.
Unconfigured 2026.10 gateway/node host baselines are `full` / `off`; explicit
`host: "sandbox"` defaults to `deny` / `off`. Undocumented older defaults stay
`unknown`.

Approval security and ask resolve independently from agent id, then `*`, then
defaults (`dist/exec-approvals-resolver-C1cTECqF.mjs`, supplementing the per-agent
override described in `tools/exec-approvals.md`). An omitted approval field
inherits the configured value. The effective security is the stricter of
`deny` < `allowlist` < `full`, and effective ask the stricter of
`off` < `on-miss` < `always`. Unknown inputs remain unknown unless `deny` or
`always` already determines that dimension. Invalid input values are coded
errors, never permissive defaults.

The local SQLite policy cannot establish the approvals of a remote `host:
"node"`. Its effective posture remains unknown except for decisive configured
restrictions, with `NODE_EXEC_APPROVALS_UNRESOLVED` (info). No session overrides,
full-session or elevated-full exceptions, or runtime sandbox routing are
inferred. The retained posture is the static host baseline.

Agent exec fields replace global fields, including empty arrays; profile keys
instead merge per key, so `safeBinProfiles` keeps their union (`tools/exec.md`).
`strictInlineEval` defaults to false. Effective safe bins add restricted
`safe-bin` commands except `awk`, `sed` and `jq`, which OpenClaw always denies
as safe bins (`tools/exec-approvals-advanced.md`). They remain in `safeBins` as
configured. Unset safe bins add no commands and produce
`SAFE_BINS_DEFAULT_UNRESOLVED` (info, agent subject) only when the agent holds
an `exec` grant.

**SysML.**

- `CommandGrant` items (`command`, `kind`, `argsRestricted`), referenced by the
  agent like `ToolGrant`. They are emitted only for agents that hold an `exec`
  grant under effective security `allowlist`, the only mode where they apply.
- `ExecutionPosture` gains `safeBins`, `safeBinProfiles`, `trustedDirCount`,
  `pathPrependCount` and `strictInlineEval`, plus configured `mode`,
  `approvalSecurity`, `approvalAsk`, `effectiveSecurity` and `effectiveAsk`.
  Existing `security` / `ask` attributes retain the configured posture.
- `ExecApprovals` holds `defaultSecurity`, `defaultAsk`, `askFallback`,
  `autoAllowSkills` and the serialized `wildcardCommands`, only when the
  snapshot has approval configuration.

**Doctor** (mirrors `gateway/security/audit-checks.md`):

- `EXEC_WITHOUT_APPROVAL` tests the effective security/ask pair, so a restrictive
  host approval policy suppresses the finding even when config requests full/off.
- `SAFE_BIN_INTERPRETER_UNPROFILED` (warning): an interpreter in `safeBins`
  without a `safeBinProfiles` entry.
- `EXEC_ALLOWLIST_WILDCARD` (warning): an agent or wildcard-list command is `*`. The
  audit has no check on allowlist content.

**Privacy.** Never kept: directories of path patterns, `argPattern` (presence
only), `lastUsedCommand`, `lastResolvedPath`, timestamps, entry ids,
`socket.*`, `safeBinTrustedDirs` and `pathPrepend` values.

**Diff.** Configured posture, selected approvals, effective posture and agent
commands are included in `agent.execution`. Retaining all three postures shows
which policy side changed even when the effective result stays the same.
Instance approval defaults and wildcard command changes produce
`exec.approvals` with subject `instance`.

## Invariants and tests

- **Canaries.** Every secret in the fixture is a `CANARY-*` marker. No
  `CANARY-` may appear in a snapshot, SysML, finding or change.
- **Determinism.** Collect and emit twice give identical bytes.
- **Toolkit.** An export directory of the fixture, compiled alone (it carries
  the Assembly library), has zero errors with Assembly's `ToolkitCompiler`,
  found through `ASSEMBLY_DIR`; needs `SYSML_TOOLKIT_DIR`.
- **Golden files.** Snapshot, SysML, findings for the fixture, reviewed.
- **Doctor.** One positive and one negative case per rule.
- **Collector.** Tests copy the fixture to a temp dir, build
  `state/openclaw.sqlite` from every `state/*.json` table fixture and add `.git` or backups
  where a case needs them. No binary is committed.

## Interfaces

`deno task` entries: `collect --home <dir> [--plugins <file>] --out <file>`,
`export --snapshot <file> --out <dir>`, `doctor --snapshot <file>`,
`diff <a> <b>`. Output is JSON on stdout. Errors are
`{ code, context, recovery }` with a non-zero exit.

## Qualification — 2 November 2026

The collector ran read-only on a real 2026.6.10 instance (Node 22) and, after
its upgrade, the plugin ran on the same instance in 2026.10.9 (Node 24), with
inference through Claude Sonnet 5.5. Both exports compiled with the pinned
Toolkit with zero errors and zero warnings. Real outputs never enter this
repository.

## v1 AI inference layer — OpenClaw plugin

Prose (instruction files, cron prompts) describes roles, procedures,
escalation and hand-offs that the config does not hold. An optional AI step,
packaged as an OpenClaw plugin so the prose never leaves the host and the
owner's own model is used, proposes action flows and requirements from the
instruction files. Cron prompts are not read yet.

Implemented on 2 November 2026 in `plugin/` (see the README). Contract:
`src/infer.ts` (`openclaw-inference/1`). On a local 2026.10.9 instance with
three synthetic agents, Sonnet 5.5 returned 8 procedures and 18 rules; the
proposals matched the prose (refund limit, escalation to the dispatcher) and
the whole SysML compiled with the Toolkit with zero errors.

- Inferred elements go to a separate package, marked inferred, each linked to
  the digest of its source file. They are proposals the owner accepts or
  declines, never mixed with extracted facts, so the diff stays deterministic.
- Inferred text passes the same redaction and an owner review before any export
  or sharing.
- The plugin calls the deterministic collector first.

**Versions and viewer (2 November 2026).** Each plugin run writes a new
`<outDir>/<UTC time>/` directory and lists it in `versions.json`, newest
first. A static `index.html`, regenerated after each run, browses the versions
and shows per-file unified diffs against the previous one, computed at export
time (`npm:diff@9.0.0`). The Deno CLI keeps its single output directory.

## Out of scope for v0

Writing back to OpenClaw, running against a live host (done separately),
sessions and traces, memory databases, flows, plugin internals, any
change to Assembly.
