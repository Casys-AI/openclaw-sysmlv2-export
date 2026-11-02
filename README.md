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

| OpenClaw                                | SysML v2                                                     |
| --------------------------------------- | ------------------------------------------------------------ |
| Agents, models, identities              | `part def … :> OpenClawAgent` (a `SoftwareOperator`)         |
| Tool policy                             | Effective, positive `ToolGrant`s per agent (host or sandbox) |
| Sandboxes                               | `Sandbox` parts: image, network, mounts, environment _names_ |
| Channel accounts and bindings           | `ChannelAccount` parts and agent ↔ account connections       |
| Cron jobs and heartbeats                | Scheduled case types with cron or interval schedules         |
| Hooks                                   | `ExternalTrigger` parts                                      |
| Skills and instruction files            | References with path, SHA-256 and size                       |
| Delegation and agent-to-agent messaging | Delegation rules and a messaging policy                      |

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
  and user ids, allowlists of people, bind source paths, prompts and file
  bodies. Files are referenced by digest. Environment variables keep their names
  only.
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
openclaw assembly-export                 # export + doctor
openclaw assembly-export --infer --open  # with inference, then open the viewer
openclaw assembly-export --infer --model anthropic/claude-sonnet-5-5
```

- In a chat: `/assembly_export` or `/assembly_export infer`.
- The agent tool `assembly_export` (export and doctor, no model call) must be
  allowed explicitly, for instance with `tools.alsoAllow`.
- Outside a chat, inference analyses each agent in its own context. Allow it
  with `plugins.entries.assembly-export.llm.allowAgentIdOverride: true`, and
  `allowModelOverride: true` for `--model`.

Each run writes `<state dir>/assembly-export/<UTC time>/`:

```text
snapshot.json  findings.json  OpenClawImport.sysml  OpenClawInstance.sysml
core.sysml  cases.sysml  skills.sysml
OpenClawInferred.sysml  inference.json   (with --infer)
```

`versions.json` lists the versions, newest first, and `index.html` is a static
page (no network, opens from `file://`) to browse them and see the diff of each
file since the previous version.

## Develop

```sh
deno task check && deno lint && deno fmt --check && deno task test
deno task collect --home ~/.openclaw --out snapshot.json   # offline pipeline
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
