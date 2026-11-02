# OpenClaw → SysML v2

An [OpenClaw](https://openclaw.ai) plugin that exports your instance as a SysML
v2 model: your agents, the tools each one is allowed to use, what they work
from, when they run and where they are reachable. Optionally, each agent's own
model reads its instruction files and proposes the procedures and rules they
describe. Every run is kept as a version you can browse and compare in a small
offline page.

SysML v2 is the OMG's standard language for describing systems. The export is
the entry point to Assembly, Casys' workbench for building, running and evolving
agentic systems from SysML v2; you do not need either to read what it produces.

**Status:** 0.1.0, preview. Built for OpenClaw 2026.10.x; the collector also
reads 2026.6 configurations. The OpenClaw plugin API is still marked
experimental.

## Install

Requires OpenClaw 2026.10.9 or later (Node ≥ 24.22.1 or ≥ 26.12.1).

From ClawHub:

```sh
openclaw plugins install clawhub:@casys/openclaw-sysmlv2-export
```

From source, with [Deno](https://deno.com) 2.9 or later to build the bundle:

```sh
git clone https://github.com/Casys-AI/openclaw-sysmlv2-export.git
cd openclaw-sysmlv2-export
deno task plugin:build
openclaw plugins install --link "$(pwd)/plugin" --force --accept-capabilities
```

## Use

```sh
openclaw sysmlv2-export                  # export
openclaw sysmlv2-export --infer --open   # with inference, then open the viewer
openclaw sysmlv2-export --infer --model anthropic/claude-sonnet-5-5
openclaw sysmlv2-export --out ./exports  # another output directory
```

- In a chat: `/sysmlv2_export`, or `/sysmlv2_export infer` to infer with the
  conversation agent's model (OpenClaw binds a chat command to that agent). Only
  the owner can run it.
- The agent tool `sysmlv2_export` exports without calling a model. It is
  optional: allow it explicitly, for instance with `tools.alsoAllow`.
- From the command line, `--infer` analyses each agent with its own model. Allow
  it with `plugins.entries.sysmlv2-export.llm.allowAgentIdOverride: true`, and
  add `allowModelOverride: true` for `--model`.

Each run writes `<state dir>/sysmlv2-export/<UTC time>/`:

```text
snapshot.json  OpenClawImport.sysml  OpenClawInstance.sysml
core.sysml  cases.sysml  skills.sysml
inference.json  OpenClawInferred.sysml   (with --infer)
```

`versions.json` lists the runs, newest first, and `index.html` is the viewer.
Set `plugins.entries.sysmlv2-export.config.outDir` to write elsewhere by
default.

## Viewer

`index.html` draws each version as SysML v2 diagrams. It is one static page: no
network, it opens from `file://`, and the diagrams are laid out when the export
runs. Pick a version, then a view:

- **System**: each agent as a part with its context (instructions, skills,
  memory) and its granted tools by origin, connected to its channel accounts
  through its bindings.
- **Tools**: the tool catalog by origin and provider. Each tool shows which
  agents hold it, on the host or in the sandbox.
- **Scheduled tasks**: cron jobs and heartbeats with their schedules, linked to
  the agent they wake.
- **Behaviour** (with inference): each agent's proposed procedures as action
  flows, with decisions, hand-offs and escalations, and its rules with the lines
  they come from.

Click an element to see its attributes and its exact SysML text. Elements added
or changed since the previous version are highlighted, and removed ones are
listed. Files and Changes show each file and its diff since the previous
version.

## What it exports

The model groups the instance by Assembly's categories, one package each.

| Category  | From OpenClaw                                                                      | In the model                                                                                                     |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Operators | Agents with their models, identities, sandboxes and exec settings; model providers | One part per agent (a software operator) holding its context, sandbox and exec posture                           |
| Tools     | Built-in, plugin, MCP and command-line tools                                       | One catalog of every granted tool, with its origin and provider                                                  |
| Context   | Instruction files, skills, memory policy and notes; bundled skills, memory backend | Each agent's context (files and skills by path and digest, a memory inventory), plus instance-wide entries       |
| Cases     | Cron jobs and heartbeats                                                           | Scheduled cases with their cron or interval schedule                                                             |
| Entries   | Channel accounts, bindings, hooks                                                  | Accounts, agent ↔ account connections, external triggers                                                         |
| Authority | Tool policy, exec allowlists and approvals, delegation, agent-to-agent messaging   | Effective tool grants per agent and layer (host or sandbox), host exec approvals, delegation and messaging rules |

- **Grants are effective.** The export resolves each agent's tool policy
  (profiles, allow and deny lists, provider and sandbox policies) into the tools
  it can actually use, following the recorded OpenClaw version's catalog. What a
  static configuration cannot settle is noted in the snapshot instead of
  guessed.
- **Plugin tools** come from OpenClaw's own inventory: the plugin runs
  `openclaw plugins list --json`. A disabled plugin's tools get no grant, and
  optional tools need an explicit opt-in.
- **MCP servers** are granted as whole servers; their individual tools are only
  known at runtime. **Exec commands** allowed by safe bins and approval
  allowlists become command-line tools when exec runs in allowlist mode.
- **Inference** proposals (ordered steps, hand-offs, escalations; permissions,
  constraints, prohibitions) cite their file, lines and digest, and land in a
  separate `OpenClawInferred` package. They are never admitted automatically.

The SysML library it builds on (`core.sysml`, `cases.sysml`, `skills.sysml`,
copied from Assembly) is written next to the export, so each export folder
compiles on its own.

## Privacy

- The export only reads the instance; nothing is written back to OpenClaw.
- Never exported: secret values, tokens, API keys, provider URLs, peer, guild
  and user ids, allowlists of people, bind source paths, plugin paths and plugin
  configuration, prompts and file bodies. Files are referenced by digest.
  Environment variables and headers keep their names only.
- Memory notes keep only counts, dates, byte totals and digests; note names,
  extra search paths and Active Memory prompts or chat ids are excluded.
- MCP URLs, commands, arguments and environment values are excluded. Exec
  approval paths keep only their final segment; argument patterns and usage
  history are excluded.
- Two layers: an allowlist projection, then
  [`@logtape/redaction`](https://jsr.io/@logtape/redaction).
- Inference sends behaviour files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`…) and that
  agent's cron/heartbeat prompts to the model of one of your agents, never
  `MEMORY.md`, `USER.md` or other notes. Contact details and token-like strings
  in the answer are masked.
- Chat replies never show absolute host paths.

## Develop

```sh
deno task check && deno lint && deno fmt --check && deno task test
deno task plugin:build
openclaw plugins list --json > plugins.json             # optional inventory
deno task collect --home ~/.openclaw --plugins plugins.json --out snapshot.json
deno task export --snapshot snapshot.json --out exported
deno task diff before.json after.json
deno task doctor --snapshot snapshot.json               # experimental
```

`doctor` is an experimental configuration diagnostic; the plugin does not run
it. Snapshots use the `openclaw-snapshot/5` schema; older schemas are rejected,
so collect again after upgrading.

The test fixture is an anonymized, genericized OpenClaw instance in which every
secret is a `CANARY-*` marker that no output may contain. CI runs the checks,
the tests and the plugin build. The Toolkit test, which compiles an export with
Assembly's SysML Toolkit, needs an Assembly checkout and is not part of CI: set
`ASSEMBLY_DIR` to the checkout and `SYSML_TOOLKIT_DIR` to its Toolkit package,
then run `deno task test:toolkit`.

The behaviour, mapping and limits are specified in [SPEC.md](SPEC.md); changes
are listed in [CHANGELOG.md](CHANGELOG.md).

## License

MIT. The copied Assembly SysML library keeps Assembly's MIT license. The plugin
bundle includes [elkjs](https://github.com/kieler/elkjs) 0.9.3, under the
Eclipse Public License 2.0, to lay the diagrams out;
[plugin/THIRD_PARTY_NOTICES.md](plugin/THIRD_PARTY_NOTICES.md) holds the notices
of every bundled package.
