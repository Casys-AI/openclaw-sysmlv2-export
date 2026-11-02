# OpenClaw SysML v2 Export

Exports your OpenClaw instance as a SysML v2 model, the OMG's standard language
for describing systems: your agents and their models, the tools each one may
use, their instructions, skills and memory, cron jobs and heartbeats, channels,
sandboxes and exec settings. On request, each agent's own model also proposes
the procedures and rules its instruction files describe.

Every run is kept as a version and shown in an offline page: an overview of the
agents, the system, a tools allocation matrix, scheduled tasks over a week and
the inferred behaviour. Click any element to read its SysML text; what changed
since the previous run is highlighted.

Status: preview. Requires OpenClaw 2026.10.9 or later.

## Install

```sh
openclaw plugins install clawhub:@casys/openclaw-sysmlv2-export
```

## Use

```sh
openclaw sysmlv2-export                 # export the instance
openclaw sysmlv2-export --infer --open  # also infer behaviour, then open the viewer
```

- **In a chat**, the owner can run `/sysmlv2_export`, or `/sysmlv2_export infer`
  to infer with the model of the conversation's agent.
- **As an agent tool**, `sysmlv2_export` exports without calling a model. The
  tool is optional: allow it explicitly, for instance with `tools.alsoAllow`.
- **From the command line**, `--infer` analyses each agent with its own model
  and needs `plugins.entries.sysmlv2-export.llm.allowAgentIdOverride: true`;
  `--model <provider/model>` also needs `allowModelOverride: true`.

Each run writes `<state dir>/sysmlv2-export/<UTC time>/` with the snapshot and
the SysML files, and updates `versions.json` and the viewer, `index.html`.

## SysML validation

No Assembly checkout is needed. Install the pinned Toolkit explicitly:

```sh
openclaw sysmlv2-toolkit install [--from <archive.tgz>]
openclaw sysmlv2-toolkit status
```

The default install downloads the public sysml-wasm 0.10.10 release, verifies
the archive and installed files, and installs atomically under
`<state dir>/sysmlv2-export-toolkit/0.10.10/`. Exporting never downloads it.
`status` returns JSON `{installed, version, path, verified}`; `install` adds
`changed`, false for an already verified installation.

Every export writes `validation.json` with compilation diagnostics and reports
`passed`, `failed` or `skipped`. Missing Toolkit means `TOOLKIT_NOT_INSTALLED`;
run `openclaw sysmlv2-toolkit install`. Compilation errors, modified Toolkit
files and a 60-second worker timeout leave the export available. Chat and tool
replies include one short validation line.

The installed Toolkit is Apache-2.0 and its SysML v2 standard library EPL-2.0;
its license files and third-party notices are copied with it.

## Privacy

- The export only reads the instance and never changes it.
- Secret values, tokens, API keys, URLs, people's ids and host paths are never
  exported. Files are referenced by path and digest, never copied.
- Inference sends only an agent's behaviour files (`AGENTS.md`, `SOUL.md`,
  `TOOLS.md`…) and its cron and heartbeat prompts to the model of one of your
  agents, never `MEMORY.md`, `USER.md` or other notes. Contact details and
  tokens are masked in the answer, and the proposals are kept apart, never
  admitted automatically.

Source, documentation and specification:
<https://github.com/Casys-AI/openclaw-sysmlv2-export>. MIT license; the bundle
includes elkjs 0.9.3 (Eclipse Public License 2.0) to lay the diagrams out, and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) holds the notices of every
bundled package.
