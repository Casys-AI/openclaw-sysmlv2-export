# OpenClaw → SysML v2

An [OpenClaw](https://openclaw.ai) plugin that exports an OpenClaw instance as a
SysML v2 model, checks its configuration, and can infer what each agent does
from its own instructions. Every run is kept as a version you can browse and
compare in a small offline page.

It is the entry point to Assembly, Casys' workbench for building, running and
evolving agentic systems from SysML v2.

> Preview (0.1). Built for OpenClaw 2026.10.x; the collector also reads 2026.6
> configurations. The OpenClaw plugin API is still marked experimental.

## What it exports

The instance package groups the model by Assembly's categories, one nested
package each.

| Category  | OpenClaw                                        | SysML v2                                                                                     |
| --------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Operators | Agents, models, identities; model providers     | `part def … :> OpenClawAgent` (a `SoftwareOperator`); `ModelProvider` parts                  |
| Tools     | Built-in, plugin, MCP and CLI tools             | One catalog of `OpenClawTool`s (an `ExecutableCapability`) with their origin and provider    |
| Tools     | Plugins that declare tools, MCP servers         | `OpenClawPlugin` and `McpServer` providers                                                   |
| Context   | Instruction files, skills, memory policy, notes | One `AgentContext` per agent: file references (path, SHA-256, size), skills, `AgentMemory`   |
| Context   | Bundled skills, memory backend                  | `BundledSkill` entries and one `MemoryBackend`                                               |
| Cases     | Cron jobs and heartbeats                        | Scheduled case types with cron or interval schedules                                         |
| Entries   | Channel accounts, bindings, hooks               | `ChannelAccount` parts, agent ↔ account connections, `ExternalTrigger` parts                 |
| Authority | Tool policy, exec allowlists                    | Effective, positive `ToolGrant`s per agent and layer (host or sandbox), each naming one tool |
| Authority | Exec posture and approvals, sandboxes           | `ExecutionPosture`, `ExecApprovals`, `Sandbox` (image, network, mounts, environment _names_) |
| Authority | Delegation and agent-to-agent messaging         | Delegation rules and a messaging policy                                                      |

MCP and CLI are origins of tools, not categories. OpenClaw memory is kept as an
inventory: it is not Assembly's governed memory, since OpenClaw has no admission
or validity window.

Tool groups and profiles follow the recorded OpenClaw version: `2026.10.x` uses
the 2026.10 catalog, and other versions use the 2026.6.10 catalog with an
informational finding when unverified. Restricted 2026.10 profiles include
update-only `gateway` access; the export reports that partial profile instead of
granting the entire tool automatically.

Plugin tools come from OpenClaw's own inventory: the plugin runs
`openclaw plugins list --json` and reads each listed manifest for optional flags
and `toolMetadata.profiles`. A disabled plugin's tools get no grant. A tool
attached to a selected restricted profile joins that profile's allowlist; other
policy restrictions still apply. Optional tools need an explicit allow entry, a
matching profile attachment, or the `full` profile.

MCP grants describe whole configured servers; individual tool names require
runtime discovery and produce an informational finding. Exec commands become CLI
tools named after their binary; their grants keep the argument-restriction flag
and exist only when the agent has the `exec` tool and effective `allowlist`
security.

Exec posture keeps the configured policy, selected host approvals and their
stricter result separately. Doctor checks that effective result for exec without
approval. This is a static host baseline: session overrides and runtime sandbox
routing are not collected, and remote node approvals remain unresolved.

The library it builds on (`core.sysml`, `cases.sysml`, `skills.sysml`, copied
from Assembly) is written next to the export, so each export folder compiles on
its own.

A **doctor** reports coded findings: exec without approval, agents without a
sandbox, external bind mounts, `agentToAgent: *`, plaintext secrets in the
config, failing cron jobs, unversioned workspaces, config backups and broken or
misplaced skills.

With **inference**, the agent's model reads each agent's behavior files
(`AGENTS.md`, `SOUL.md`, `TOOLS.md`, …) and proposes its procedures (ordered
steps, hand-offs, escalations) and rules (permissions, constraints,
prohibitions). Each proposal cites its file, lines and digest. Proposals land in
a separate `OpenClawInferred` package and are never admitted automatically.

## Privacy

- Never exported: secret values, tokens, API keys, provider URLs, peer, guild
  and user ids, allowlists of people, bind source paths, plugin paths and plugin
  config outside the memory allowlist, prompts and file bodies. Files are
  referenced by digest. Environment variables keep their names only.
- Memory notes keep only counts, dates, byte totals and digests; note names,
  extra search paths and Active Memory prompts or chat ids are excluded.
- MCP environment and header values, launch commands, URLs and arguments are
  excluded. Exec approval paths keep only their final segment; argument
  patterns, socket credentials and usage history are excluded.
- Two layers: an allowlist projection, then
  [`@logtape/redaction`](https://jsr.io/@logtape/redaction).
- Inference sends only behavior files to the agent's own model, never
  `MEMORY.md`, `USER.md` or other workspace notes. Contact details and
  token-like strings in the model's answer are masked.
- The chat command is owner-only; the agent tool is optional and offered only to
  the owner's unsandboxed sessions. Replies never show absolute host paths.

## Install

Requirements: OpenClaw ≥ 2026.10.9 (Node ≥ 24.22.1 or ≥ 26.12.1) and
[Deno](https://deno.com) ≥ 2.9 to build the bundle.

```sh
deno task plugin:build
openclaw plugins install --link "$(pwd)/plugin" --force --accept-capabilities
```

## Use

```sh
openclaw sysmlv2-export                 # export + doctor
openclaw sysmlv2-export --infer --open  # with inference, then open the viewer
openclaw sysmlv2-export --infer --model anthropic/claude-sonnet-5-5
```

- In a chat: `/sysmlv2_export` or `/sysmlv2_export infer`.
- The agent tool `sysmlv2_export` (export and doctor, no model call) must be
  allowed explicitly, for instance with `tools.alsoAllow`.
- Outside a chat, inference analyses each agent in its own context. Allow it
  with `plugins.entries.sysmlv2-export.llm.allowAgentIdOverride: true`, and
  `allowModelOverride: true` for `--model`.

Each run writes `<state dir>/sysmlv2-export/<UTC time>/`:

```text
snapshot.json  findings.json  OpenClawImport.sysml  OpenClawInstance.sysml
core.sysml  cases.sysml  skills.sysml
OpenClawInferred.sysml  inference.json   (with --infer)
```

`versions.json` lists the versions, newest first, and `index.html` is a static
page (no network, opens from `file://`) to browse them and see the diff of each
file since the previous version.

Snapshots use `openclaw-snapshot/5`. Older snapshot schemas are rejected;
collect the instance again before exporting or comparing snapshots.

## Develop

```sh
deno task check && deno lint && deno fmt --check && deno task test
openclaw plugins list --json > plugins.json               # optional inventory
deno task collect --home ~/.openclaw --plugins plugins.json --out snapshot.json
deno task export --snapshot snapshot.json --out exported
deno task doctor --snapshot snapshot.json
deno task diff before.json after.json
```

The test fixture is an anonymized and genericized OpenClaw instance; every
secret is a `CANARY-*` marker and no output may contain one. To check that an
export compiles, point `ASSEMBLY_DIR` at an Assembly checkout and
`SYSML_TOOLKIT_DIR` at its Toolkit package, then run `deno task test:toolkit`.

The design, mapping and limits are in [SPEC.md](SPEC.md).

## License

MIT. The copied Assembly SysML library keeps Assembly's MIT license.
