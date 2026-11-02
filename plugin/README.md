# OpenClaw SysML v2 Export

Exports your OpenClaw instance as a SysML v2 model (the OMG standard language
for describing systems) for Assembly: agents and their models, the tools each
one is allowed to use, their instructions, skills and memory, cron jobs and
heartbeats, channels, sandboxes and exec settings. On request, each agent's own
model proposes the procedures and rules written in its instruction files.

Every run is kept as a version, with an offline page that draws it as SysML v2
diagrams (system, tools, scheduled tasks, inferred behaviour), shows each
element's SysML text and highlights what changed since the previous run.

Status: 0.1.0, preview. Requires OpenClaw 2026.10.9 or later.

## Install

```sh
openclaw plugins install clawhub:@casys/openclaw-sysmlv2-export
```

## Use

```sh
openclaw sysmlv2-export                 # export
openclaw sysmlv2-export --infer --open  # with inference, then open the viewer
```

- In a chat: `/sysmlv2_export`, or `/sysmlv2_export infer` with the conversation
  agent's model (owner only).
- The agent tool `sysmlv2_export` exports without calling a model. It is
  optional: allow it explicitly, for instance with `tools.alsoAllow`.
- `--infer` on the command line analyses each agent with its own model and needs
  `plugins.entries.sysmlv2-export.llm.allowAgentIdOverride: true`;
  `--model <provider/model>` also needs `allowModelOverride: true`.

Each run writes `<state dir>/sysmlv2-export/<UTC time>/` with the snapshot and
the SysML files, and updates `versions.json` and the viewer, `index.html`.

## Privacy

- The export only reads the instance and never changes it.
- Secret values, tokens, API keys, URLs, people's ids and host paths are never
  exported. Files are referenced by path and digest, never copied.
- Inference sends only an agent's behaviour files (`AGENTS.md`, `SOUL.md`,
  `TOOLS.md`…) to the model of one of your agents, never `MEMORY.md`, `USER.md`
  or other notes, and masks contact details and tokens in the answer. Its
  proposals are kept apart and never admitted automatically.

Source, documentation and specification:
<https://github.com/Casys-AI/openclaw-sysmlv2-export>. MIT license; the bundle
includes elkjs 0.9.3 (Eclipse Public License 2.0) for diagram layout, and the
notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
