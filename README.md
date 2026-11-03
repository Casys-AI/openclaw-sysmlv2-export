# OpenClaw → SysML v2

An [OpenClaw](https://openclaw.ai) plugin that exports your instance as a SysML
v2 model and shows it in an offline viewer.

The model describes your agents and their models, the tools each one may use,
the context it works from (instructions, skills, memory), when it runs and where
it can be reached. On request, each agent's own model also reads its instruction
files and proposes the procedures and rules they describe. Every export is kept
as a version, so you can see what changed between two runs.

![Behaviour view: an agent's inferred procedures as action flows, above its rules](docs/screenshots/behaviour.png)

SysML v2 is the OMG's standard language for describing systems. The export is
the entry point to Assembly, Casys' workbench for building, running and evolving
agentic systems from SysML v2, but reading it needs neither Assembly nor any
SysML tool.

**Status:** preview. Built for OpenClaw 2026.10.x; the collector also reads
2026.6 configurations. The OpenClaw plugin API is still marked experimental.

## Install

Requires OpenClaw 2026.10.9 or later, on Node 24.22.1 or later (or 26.12.1 or
later).

From ClawHub:

```sh
openclaw plugins install clawhub:@casys/openclaw-sysmlv2-export
```

From source, with [Deno](https://deno.com) 2.9.7 or later to build the bundle:

```sh
git clone https://github.com/Casys-AI/openclaw-sysmlv2-export.git
cd openclaw-sysmlv2-export
deno task plugin:build
openclaw plugins install --link "$(pwd)/plugin" --force --accept-capabilities
```

## Use

```sh
openclaw sysmlv2-export                  # export the instance
openclaw sysmlv2-export --infer --open   # also infer behaviour, then open the viewer
openclaw sysmlv2-export --infer --model anthropic/claude-sonnet-5-5
openclaw sysmlv2-export --out ./exports  # write to another directory
```

- **In a chat**, the owner can run `/sysmlv2_export`, or `/sysmlv2_export infer`
  to infer with the model of the conversation's agent: OpenClaw binds a chat
  command to that agent.
- **As an agent tool**, `sysmlv2_export` exports without calling a model. The
  tool is optional: allow it explicitly, for instance with `tools.alsoAllow`.
- **From the command line**, `--infer` analyses each agent with its own model,
  or with the one `--model` names. Allow it with
  `plugins.entries.sysmlv2-export.llm.allowAgentIdOverride: true`, and add
  `allowModelOverride: true` for `--model`.

Each run writes a folder `<state dir>/sysmlv2-export/<UTC time>/`:

```text
snapshot.json  findings.json  OpenClawImport.sysml  OpenClawInstance.sysml
core.sysml  cases.sysml  skills.sysml
inference.json  OpenClawInferred.sysml   (with --infer)
```

Beside the run folders, `versions.json` lists the runs, newest first, and
`index.html` is the viewer. To write elsewhere by default, set
`plugins.entries.sysmlv2-export.config.outDir`.

## Check the system

With the Toolkit installed, each export checks its SysML model with OpenClaw
configuration rules and portable APE rules using SHACL SPARQL on Oxigraph. It
writes findings with codes, affected elements and recovery advice; the Doctor
panel lists them. Findings do not block an export or change the instance.
Without the Toolkit, model checks are skipped and collector notes from the
snapshot remain available.

![The Doctor panel: each finding with the element it concerns and its fix](docs/screenshots/doctor.png)

[Diagnostics](docs/diagnostics.md) lists every code, its source in OpenClaw and
its fix. To check an exported model without changing it, run
`deno task diagnose --export <version-dir> --state-dir <Toolkit-install-state-dir>`.

## Validate the model

Each export can be compiled with
[sysml-toolkit](https://github.com/Open-MBEE/sysml-toolkit), an open-source
SysML v2 compiler, to check that the model is valid SysML v2. Install it once,
explicitly (about 21 MB); exporting never downloads anything.

```sh
openclaw sysmlv2-toolkit install                       # download the pinned release
openclaw sysmlv2-toolkit install --from <archive.tgz>  # or install a local copy
openclaw sysmlv2-toolkit status
```

`install` fetches the public
[sysml-wasm 0.10.10 release](https://github.com/Open-MBEE/sysml-toolkit/releases/tag/v0.10.10),
or reads the archive given with `--from`, checks it against its pinned SHA-256
and installs it under `<state dir>/sysmlv2-export-toolkit/0.10.10/`, licenses
included. Both commands print JSON.

Once the Toolkit is installed, every export is compiled, inferred behaviour
included, with a 60-second compile deadline. APE then has its own default
10-second deadline; an `APE_TIMEOUT` leaves the compile result intact. The run's
summary and `versions.json` say whether validation `passed`, `failed` or was
`skipped`; `validation.json` lists the diagnostics with their file and line. A
failed validation never loses the export. Without the Toolkit, validation is
skipped, with the command that installs it.

## Viewer

`index.html` is a single static page: it needs no network, opens from `file://`,
and its diagrams are laid out when the export runs. Pick a version, then a view.

- **Overview**, the landing view: one row per agent, with its model, where it
  runs (host or sandbox), its tools by origin, channel accounts, scheduled
  tasks, context and inferred behaviour, under the instance's totals. Each row
  links to the agent in the other views.
- **System**: each agent as a part with its context and granted tools, connected
  to its channel accounts through its bindings.
- **Tools**: a SysML allocation matrix of the tool catalog, by origin and
  provider, against the agents. Each cell is a grant, on the host, in the
  sandbox or both. Groups fold, and a filter narrows the tools.
- **Scheduled tasks**: cron jobs and heartbeats linked to the agent they wake,
  above a week strip of the hours each one fires in.
- **Behaviour**, with inference: an agent's proposed procedures as action flows,
  with decisions, hand-offs and escalations, and its rules in a requirements
  table with the lines they come from.

The icon rail on the right opens three panels in a sidebar that you can collapse
and resize. The Inspector shows the attributes and exact SysML text of the
element, row or cell you click, and an agent's other views. Changes lists what
was added, changed and removed since the previous version, each changed value
before and after, and the diagram and table mark it in blue. Doctor lists the
findings. An entry of Changes or Doctor selects and frames its element without
leaving the panel. The Files and Changes tabs show each file and its diff
against the previous version.

Drag or scroll to pan, pinch or Command/Control and scroll to zoom. F, Enter or
the Fit selection button frame the selected element; a step frames its
procedure. Zoomed out, a Behaviour view shows each procedure as a titled frame,
and a click frames it. The table under a diagram folds away to give the diagram
the room. The Overview's tiles open what they count, and its Doctor tile the
Doctor. The address names the version, the view and the selected element (or the
file and lines shown): Back returns to the place you left, a link reopens it,
and the inspector's Copy link copies it.

![Overview: one row per agent under the instance's totals](docs/screenshots/overview.png)

| System                                      | Tools                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ![System view](docs/screenshots/system.png) | ![Tools allocation matrix, with one grant open in the inspector](docs/screenshots/tools.png) |

![Scheduled tasks, with the week in which each task fires](docs/screenshots/scheduled-tasks.png)

The screenshots show the anonymized test fixture, two versions apart.

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

- **Grants are effective.** Each agent's tool policy (profiles, allow and deny
  lists, provider and sandbox policies) is resolved into the tools it can
  actually use, following the catalog of the recorded OpenClaw version. What a
  static configuration cannot settle is recorded in the snapshot rather than
  guessed.
- **Plugin tools** come from OpenClaw's own inventory, which the plugin reads
  with `openclaw plugins list --json`. A disabled plugin's tools get no grant,
  and optional tools need an explicit opt-in.
- **MCP servers** are granted as whole servers, since their tools are only known
  at runtime. **Exec commands** allowed by safe bins and approval allowlists
  become command-line tools when exec runs in allowlist mode.
- **Inferred proposals** (ordered steps, hand-offs and escalations; permissions,
  constraints and prohibitions) cite their file, lines and digest, and go into a
  separate `OpenClawInferred` package. They are never admitted automatically.

The SysML library the model builds on (`core.sysml`, `cases.sysml`,
`skills.sysml`, copied from Assembly) is written into each export folder, so
every folder compiles on its own.

## Privacy

The export reads your instance and writes nothing back. It keeps the structure
of your system, never its secrets or the people it talks to.

- **Never exported:** secret values, tokens and API keys; provider URLs; peer,
  guild and user ids and allowlists of people; bind source paths, plugin paths
  and plugin configuration; prompts and file bodies. Files are referenced by
  digest, and environment variables and headers keep their names only.
- **Memory** keeps only counts, dates, byte totals and digests. Note names,
  extra search paths, Active Memory prompts and chat ids are left out.
- **MCP and exec:** server URLs, commands, arguments and environment values are
  left out. Exec approval paths keep only their last segment; argument patterns
  and usage history are left out.
- **Two layers** enforce this: an allowlist projection, then
  [`@logtape/redaction`](https://jsr.io/@logtape/redaction).
- **Inference** sends an agent's behaviour files (`AGENTS.md`, `SOUL.md`,
  `TOOLS.md`…) and its cron and heartbeat prompts to the model of one of your
  agents, never `MEMORY.md`, `USER.md` or other notes. Contact details and
  token-like strings are masked in the answer.
- **Chat replies** never show absolute host paths.

## Develop

```sh
deno task check && deno lint && deno fmt --check && deno task test
deno task plugin:build
openclaw plugins list --json > plugins.json             # optional inventory
deno task collect --home ~/.openclaw --plugins plugins.json --out snapshot.json
deno task export --snapshot snapshot.json --out exported
deno task diff before.json after.json
deno task diagnose --export <version-dir> --state-dir <Toolkit-install-state-dir>
```

Snapshots use the `openclaw-snapshot/5` schema; older schemas are rejected, so
collect again after upgrading. Model checks require the installed Toolkit.

The test fixture is an anonymized, generic OpenClaw instance in which every
secret is a `CANARY-*` marker that no output may contain. CI runs the checks,
the tests, the plugin build and the Toolkit test, which compiles exports with
the pinned archive. To run that test locally, set `SYSML_TOOLKIT_WASM_ARCHIVE`
to the archive's path and run `deno task test:toolkit`; without it, the test is
skipped.

[SPEC.md](SPEC.md) specifies the behaviour, the mapping and the limits;
[CHANGELOG.md](CHANGELOG.md) lists the changes.

Contributors: see [contribution boundaries](CONTRIBUTING.md) and the
[source map](src/README.md).

## License

MIT. The copied Assembly SysML library keeps Assembly's MIT license. The plugin
bundle includes [elkjs](https://github.com/kieler/elkjs) 0.9.3, under the
Eclipse Public License 2.0, to lay the diagrams out;
[plugin/THIRD_PARTY_NOTICES.md](plugin/THIRD_PARTY_NOTICES.md) holds the notices
of every bundled package.

The Toolkit, installed separately, is under the Apache License 2.0 and its SysML
v2 standard library under the Eclipse Public License 2.0; their license files
and notices are installed with it.
