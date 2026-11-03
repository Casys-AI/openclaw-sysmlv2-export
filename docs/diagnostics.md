# Diagnostics

Each plugin export compiles its SysML model with the Toolkit bundled in the
plugin package and runs the OpenClaw and APE SHACL rules; nothing is installed
or downloaded. The sorted findings and collector notes are written to
`findings.json`; export continues even if checks fail. If the bundled Toolkit is
missing or damaged, validation fails with `TOOLKIT_INTEGRITY`, model checks do
not run and snapshot `ambiguities` remain as collector notes. No TypeScript
fallback runs. The standalone command checks an existing export without writing
files or updating the model, with the Toolkit directory that `plugin:build`
writes:

```sh
deno task diagnose --export <version-dir> --toolkit plugin/toolkit
```

Each finding has `code`, `severity`, `subject`, `context` and `recovery`. Errors
identify a failure or unrestricted approval posture; warnings call for review;
infos explain static limits or context. A finding is evidence about the recorded
configuration, not proof of runtime execution or a completed security audit.
Review the context before changing settings.

The export summary and `versions.json` store `findings: {error, warning, info}`
counts. The viewer's Doctor panel displays the findings available for each
version; model-check status distinguishes skipped checks from an empty result.

Subjects match the model's stable element IDs: `agent:<id>`, `cron:<id>`,
`heartbeat:<agentId>`, `account:<id>`, `grant:<agentId>:<tool>` and `instance`.
A binding finding uses the existing account, otherwise the existing agent,
otherwise the instance. IDs retain source identifier parts exactly. Findings are
ordered by code, then subject, with the path breaking ties for
`PLAINTEXT_CREDENTIAL`. Collector infos also remain in the snapshot's
`ambiguities`. Legacy collector reference notes may coexist with new check
infos; `SAFE_BINS_DEFAULT_UNRESOLVED` is a collector note.

Sources below beginning `docs/` or `dist/` refer to the OpenClaw 2026.10.9
package. Sources under `src/` or `sysml/` describe this adapter's limits or
projection choices. The complete contract is in
[SPEC §7](../SPEC.md#7-findings).

## Model rules (APE)

Every export checks APE good practices on the graph of the exported SysML model,
with SPARQL on Oxigraph. These rules follow links between agents. Their codes
start with `APE_`. Rules and views are in [`rules/ape/`](../rules/ape/).

### `APE_GRANT_WIDENS_PARENT`

Severity: warning. Subject: agent. Pattern: S3, attenuated redelegation.

The agent has no unapproved host exec itself, but can delegate, directly or
through other agents, to an agent whose built-in exec runs on the host with
effective security `full` and ask `off`. A sandboxed agent can then reach the
host through delegation. The finding names the agents it reaches.

Review or recovery: Attenuate the delegate's grants, require approval on the
host, or remove the delegation.

### `APE_LINK_CYCLE`

Severity: warning. Subject: agent. Pattern: 4.2, centralized supervision.

The agent is in a directed delegation cycle with at least one other agent; the
finding names them. Delegating to oneself alone is not a cycle.

Review or recovery: Make the cycle's termination and supervision explicit, or
keep delegation flowing one way.

### `APE_UNREACHABLE_OPERATOR`

Severity: warning. Subject: agent. Pattern: 4.2, centralized supervision.

Nothing in the model reaches the agent: no channel binding, no scheduled task or
heartbeat it owns or targets, no hook, no delegation from another agent and no
enabled messaging from another agent. A policy targeting only the agent itself
does not reach it. This is a structural check, not proof that the agent never
runs.

Review or recovery: Model the agent's intended entry or supervision path, or
remove the agent.

## Configuration checks

These 16 checks are defined in
[`rules/openclaw/openclaw.ttl`](../rules/openclaw/openclaw.ttl). The former
`CRON_FAILING` check is deliberately dropped: runtime job health is not emitted
into the model.

### `PLAINTEXT_CREDENTIAL`

Severity: warning. Subject: account or instance.

One finding is emitted per recorded plaintext credential path. Plaintext is
allowed on these SecretRef surfaces: the warning calls for review and does not
establish a runtime failure. The deliberately partial audit covers only:

- `channels.discord.accounts.*.token`
- `channels.telegram.accounts.*.botToken`
- `gateway.auth.token`
- `models.providers.*.apiKey`

Structured SecretRefs, `$NAME` and `${NAME}` environment shorthand,
whitespace-only values and known OpenClaw model-auth markers are excluded.
`hooks.token`, `skills.entries.*.env.*`, `agents.defaults.sandbox.docker.env.*`
and `agents.entries.*.sandbox.docker.env.*` do not produce this finding.

The context names a JSON Pointer, with RFC 6901 escaping (`~0` for `~`, `~1` for
`/`); no credential value is retained. A `channels.<channel>.accounts.<id>` path
points to its account when drawn, otherwise to the instance. The four audited
families contain no agent credentials; agent environment fields are unsupported.

`plaintextCredentialPaths: string[] | null` is optional diagnostic metadata on
`openclaw-snapshot/5`; collected paths are sorted. An omitted field in an older
export parses as `null` (not collected); `[]` means collected with no matches. A
`null` field produces no findings and does not establish that no plaintext
credentials exist.

Review or recovery: Replace the value at the indicated path with the structured
env SecretRef `{source: 'env', provider: 'default', id: 'CREDENTIAL_ENV'}` and
configure `CREDENTIAL_ENV` in the gateway's environment.

Source: `docs/reference/secretref-credential-surface.md`;
`dist/config-secret-target-DS4jAbAd.mjs, classifyConfigSecretTarget`;
`dist/types.secrets-DD-Q2SS_.mjs, parseEnvTemplateSecretRef`;
`dist/model-auth-markers-BKfhEhYJ.mjs, isNonSecretApiKeyMarker`.

### `EXEC_WITHOUT_APPROVAL`

Severity: error. Subject: agent.

Exec is policy-reachable on the gateway host with effective security `full` and
ask `off`.

Review or recovery: Use exec mode `ask` or `auto`, or tighten the execution host
approvals policy.

Source: `docs/tools/exec-approvals.md`.

### `AGENT_WITHOUT_SANDBOX`

Severity: warning, or info when effective security is unresolved. Subject:
agent.

Exec can run on the gateway host and effective security is not `deny`. Explicit
`host: gateway` reaches the host even with a sandbox-layer grant; `auto`
requires a host-layer grant.

Review or recovery: Use sandbox mode `all` with exec host `auto` or `sandbox`,
or remove the exec grant.

Source: `docs/gateway/sandboxing.md`; `docs/tools/exec.md`.

### `EXTERNAL_BIND_SOURCES`

Severity: warning. Subject: agent.

An active sandbox permits bind sources outside workspace roots. Other path
checks still apply.

Review or recovery: Disable `dangerouslyAllowExternalBindSources` and use
permitted source roots.

Source: `docs/gateway/sandboxing/multiple-folders-for-one-agent.md`.

### `AGENT_TO_AGENT_WILDCARD`

Severity: warning. Subject: instance.

Agent-to-agent access is enabled and its allowlist contains `*`, allowing every
requester and target pair. For 2026.10 the setting is enabled unless explicitly
false; the legacy interpretation defaults it to false.

Review or recovery: List the intended requester and target agents, or disable
agent-to-agent access.

Source: `dist/session-visibility-c_9BAYYO.mjs, createAgentToAgentPolicy`.

### `SAFE_BIN_INTERPRETER_UNPROFILED`

Severity: warning. Subject: agent.

An interpreter or runtime in `safeBins` has no explicit argv profile. Paths,
executable suffixes and versioned interpreter names are normalized.

Review or recovery: Remove interpreter safe bins or define hardened
`safeBinProfiles` entries.

Source: `dist/exec-safe-bin-runtime-policy-CgvU47MQ.mjs`;
`dist/exec-safe-bin-trust-tdUplWO7.mjs`.

### `EXEC_ALLOWLIST_WILDCARD`

Severity: warning. Subject: agent or instance.

An agent command or instance wildcard-approval command has basename `*`. The
snapshot omits any directory restriction on that pattern.

Review or recovery: Replace it with intended command names or binary paths.

Source: `docs/tools/exec-approvals.md`.

### `MEMORY_SESSIONS_INDEXED`

Severity: warning. Subject: agent.

Memory search is enabled and either `sources` includes `sessions` or
`rememberAcrossConversations` is true.

Review or recovery: Review transcript indexing and cross-conversation recall
against the intended privacy boundary.

Source: `docs/reference/memory-config.md`.

### `BINDING_ACCOUNT_UNAVAILABLE`

Severity: warning. Subject: account, agent or instance.

A binding has no matching enabled channel account. `channel:*` matches any
account on that channel.

Review or recovery: Enable the channel and intended account, correct
`match.accountId`, or remove the obsolete binding.

Source: `docs/channels/channel-routing.md`;
`dist/server-channels-eZDWbzoS.mjs, startChannelProcessOwned`.

### `UNRESOLVED_AGENT_REFERENCE`

Severity: error if enabled on OpenClaw 2026.10; info otherwise. Subject: cron.

A job explicitly targets an absent agent. OpenClaw 2026.10 fails the run. Older
runtime behavior is unverified. A missing agentId is instead
`CRON_AGENT_UNRESOLVED`.

Review or recovery: Set `agentId` to an existing agent, restore that agent, or
delete the obsolete task.

Source: `dist/server-cron-DmxBCDVE.mjs, resolveCronAgent`.

### `UNRESOLVED_BINDING_REFERENCE`

Severity: info. Subject: account, agent or instance.

A binding names an absent agent, so no exported connection is drawn. Account
availability is checked separately.

Review or recovery: Set the binding agentId to an existing agent or remove the
obsolete binding.

Source: `docs/concepts/multi-agent.md`; `rules/openclaw/openclaw.ttl`.

### `WORKSPACE_UNVERSIONED`

Severity: info. Subject: agent.

No `.git` entry was recorded at the workspace root. Parent repositories are not
checked; this does not establish that the workspace lacks version control.

Review or recovery: If the workspace is not already backed up, track intended
files in a private repository.

Source: `docs/gateway/doctor/workspace-and-dreams.md, section 19`;
`src/adapters/out/openclaw/collector.ts (root marker only)`.

### `MALFORMED_SKILLS_DIR`

Severity: info. Subject: agent.

Entries under `skills/` could not be resolved by the collector. The accepted
root `skills/SKILL.md` is excluded; this does not establish invalid skills.

Review or recovery: Inspect the entries locally and repair broken links
belonging to intended skills.

Source: `dist/skill-root-discovery-B5Jg-4aX.mjs, discoverSkillCandidates`;
`src/adapters/out/openclaw/collector.ts (unresolved entries)`.

### `MCP_SANDBOX_GATE`

Severity: info. Subject: agent.

A sandbox is active and MCP servers are enabled, but no enabled-server MCP tool
has a sandbox-layer grant.

Review or recovery: Allow the intended server globs or `bundle-mcp` in the
sandbox tool policy.

Source: `docs/gateway/config-tools/tool-policy.md`.

### `MEMORY_REMOTE_EMBEDDINGS`

Severity: info. Subject: agent.

Memory search is enabled with a provider other than `local` or `none`. Actual
endpoint location and transmission are not verified.

Review or recovery: Review the provider and its data handling.

Source: `docs/reference/memory-config.md`.

### `MANUAL_CONFIG_BACKUPS`

Severity: info. Subject: instance.

Files named `openclaw.json.*` were recorded. Their presence does not establish
manual edits or a fault; OpenClaw doctor creates backups too.

Review or recovery: Review retention and protect any credentials the backups
contain.

Source: `docs/cli/doctor.md, Non-interactive repair notes`.

## Collector notes

These infos describe what collection and grant resolution cannot settle.

### `STATIC_TOOL_AVAILABILITY`

Severity: info. Subject: instance.

Always: grants describe static policy reachability. Credentials, plugin loading,
model-native tools and session approvals are not runtime-verified.

Review or recovery: Check runtime registration and execution-host approvals
before treating grants as execution evidence.

Source: `docs/gateway/config-tools.md`; `docs/tools/exec.md`.

### `OPENCLAW_VERSION_UNVERIFIED`

Severity: info. Subject: instance.

The recorded version is neither `2026.6.10` nor `2026.10.x`; the adapter uses
its 2026.6.10 catalog.

Review or recovery: Confirm the source version and review catalog differences
before relying on the import.

Source: `src/adapters/out/openclaw/collector.ts`;
`src/domain/openclaw/policy.ts (adapter catalog selection)`.

### `PLUGIN_INVENTORY_ABSENT`

Severity: info. Subject: instance.

No plugin inventory was supplied; plugin-only tools receive no grants.

Review or recovery: Supply `openclaw plugins list --json` output to collection.

Source: `docs/cli/plugins/list.md`.

### `TOOL_PROFILE_PARTIAL`

Severity: info. Subject: agent.

A restricted 2026.10 profile includes update-only gateway access that tool-level
grants cannot express; that automatic grant is withheld.

Review or recovery: Review gateway actions separately; add explicit grants only
when the intended scope is appropriate.

Source: `docs/gateway/config-tools/tool-policy.md`.

### `TOOL_CATALOG_INCOMPLETE`

Severity: info. Subject: agent.

Policy names tools that no documented built-in entry, supplied plugin or MCP
server declares; they receive no grants.

Review or recovery: Supply the plugin inventory or remove stale tool names.

Source: `docs/gateway/config-tools/tool-policy.md`.

### `MCP_TOOL_SUBSET_UNRESOLVED`

Severity: info. Subject: agent.

Policy names a subset of a server runtime tool catalog; subset entries grant no
whole server.

Review or recovery: Inspect live server tools or use the intended server glob.

Source: `docs/gateway/config-tools/tool-policy.md`; `docs/plugins/bundles.md`.

### `EMPTY_ALLOWLIST_UNRESOLVED`

Severity: info. Subject: agent.

An empty `allow` is treated conservatively as granting nothing because the
documentation disagrees.

Review or recovery: Set explicit tool names.

Source: `docs/gateway/sandbox-vs-tool-policy-vs-elevated.md`;
`docs/tools/multi-agent-sandbox-tools.md`.

### `SESSION_DEPENDENT_SANDBOX`

Severity: info. Subject: agent.

Sandbox mode `non-main` yields separate host and sandbox session contexts.

Review or recovery: Resolve the actual session main key before relying on a
layer grant.

Source: `docs/tools/multi-agent-sandbox-tools.md`.

### `SANDBOX_DEFAULT_TOOLS_UNRESOLVED`

Severity: info. Subject: agent.

An active sandbox policy omits `allow` or `deny`; unresolved defaults cause
sandbox grants to be withheld.

Review or recovery: Set sandbox `tools.allow` and `tools.deny` explicitly.

Source: `docs/gateway/config-agents.md`.

### `CONTEXT_DEPENDENT_TOOLS`

Severity: info. Subject: agent.

Sender or subagent tool policies require runtime context that is not resolved.

Review or recovery: Inspect the active sender and subagent policies.

Source: `docs/gateway/config-tools.md`.

### `FALLBACK_TOOL_POLICY_UNRESOLVED`

Severity: info. Subject: agent.

Fallback models are configured; exported grants describe the primary model.

Review or recovery: Resolve grants again for the actual fallback model.

Source: `docs/tools/multi-agent-sandbox-tools.md`; `docs/tools/exec.md`.

### `SAFE_BINS_DEFAULT_UNRESOLVED`

Severity: info. Subject: agent.

Safe bins are unset while the agent holds exec; no default command grants are
inferred.

Review or recovery: Set `tools.exec.safeBins` explicitly if command-level grants
are needed.

Source: `docs/tools/exec.md`; `docs/tools/exec-approvals-advanced.md`.

### `EXEC_APPROVALS_UNRESOLVED`

Severity: info. Subject: agent.

Effective exec security or ask remains unknown for a non-node host.

Review or recovery: Inspect host approvals and the normalized exec mode.

Source: `docs/tools/exec.md`.

### `NODE_EXEC_APPROVALS_UNRESOLVED`

Severity: info. Subject: agent.

Exec host is `node`; local state cannot establish the remote node approvals
posture.

Review or recovery: Inspect approvals on the execution node.

Source: `docs/tools/exec-approvals.md`.

### `ELEVATED_CONTEXT_REQUIRED`

Severity: info. Subject: agent.

Elevated exec is configured with an active sandbox; sender and session gates
remain unresolved.

Review or recovery: Verify sender allowlists and session directives.

Source: `docs/tools/elevated.md`.

### `SANDBOX_SCOPE_UNRESOLVED`

Severity: info. Subject: agent.

An active sandbox has no explicit scope and the reference documentation
disagrees on the default.

Review or recovery: Set `sandbox.scope` explicitly.

Source: `docs/gateway/sandboxing.md`; `docs/tools/multi-agent-sandbox-tools.md`.

### `SANDBOX_BACKEND_UNRESOLVED`

Severity: info. Subject: agent.

The configured backend is not Docker; only Docker isolation settings are mapped.

Review or recovery: Inspect the selected backend separately.

Source: `docs/gateway/sandboxing.md`.

### `HEARTBEAT_DEFAULT_UNRESOLVED`

Severity: info. Subject: agent.

A heartbeat applies without `every`; its default cadence depends on uncollected
authentication mode. No heartbeat is exported without that cadence, so the
finding points to the agent.

Review or recovery: Set `heartbeat.every` explicitly.

Source: `docs/gateway/heartbeat.md`.

### `WORKSPACE_MISSING`

Severity: info. Subject: agent.

The configured workspace cannot be resolved because it does not exist.

Review or recovery: Create the workspace or correct the configured workspace
path.

Source:
`src/adapters/out/openclaw/collector.ts, workspace (adapter filesystem check)`.

### `INSTRUCTION_OUTSIDE_ROOT`

Severity: info. Subject: agent.

A top-level Markdown entry is a broken link or resolves outside the workspace
and is not collected.

Review or recovery: Keep intended instruction files inside the agent workspace.

Source:
`src/adapters/out/openclaw/collector.ts, workspace (adapter collection boundary)`.

### `SKILL_SYMLINK_OUTSIDE_ROOT`

Severity: info. Subject: agent.

A skill link resolves outside the workspace; OpenClaw requires explicit trust
for such targets.

Review or recovery: Move the skill inside the workspace or review
`skills.load.allowSymlinkTargets`; the adapter still excludes the external
target.

Source: `docs/tools/skills.md`;
`src/adapters/out/openclaw/collector.ts (adapter collection boundary)`.

### `CRON_TIMEZONE_UNRESOLVED`

Severity: info. Subject: cron.

A cron expression has no explicit timezone and uses the uncollected gateway host
timezone.

Review or recovery: Set an explicit timezone.

Source: `docs/automation/cron-jobs.md`.

### `SUBMINUTE_SCHEDULE`

Severity: info. Subject: cron.

An every interval is not a whole number of minutes; its exact value is preserved
in durationMs.

Review or recovery: Use `MillisecondEvery.durationMs`; inherited count and unit
are intentionally unset.

Source: `sysml/cases.sysml (adapter MillisecondEvery)`;
`src/adapters/out/openclaw/collector.ts`.

### `CRON_AGENT_UNRESOLVED`

Severity: info. Subject: cron.

The job names no agent and OpenClaw resolves its execution agent at run time,
including plugin-managed jobs.

Review or recovery: Check the resolved agent with
`openclaw automations show <jobId>`.

Source: `docs/automation/cron-jobs/troubleshooting.md`;
`docs/concepts/dreaming.md`.

## Legacy secret counter

`plaintextSecretCount` remains unchanged in `openclaw-snapshot/5`, separately
from `plaintextCredentialPaths`. It counts arbitrary environment and header
strings as well as credential-like values, with no retained field paths. A
positive count cannot establish that a credential belongs to a supported
SecretRef surface, so `PLAINTEXT_SECRET_IN_CONFIG` is not a current diagnostic.
Review credentials locally using OpenClaw's documented
`docs/reference/secretref-credential-surface.md` rather than treating that
counter as a security error.
