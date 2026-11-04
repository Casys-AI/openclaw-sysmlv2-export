# OpenClaw SysML v2 Export

Exports your OpenClaw instance as a SysML v2 model, the OMG's standard language
for describing systems: your agents and their models, the tools each one may
use, their instructions, skills and memory, cron jobs and heartbeats, channels,
sandboxes and exec settings. On request, each agent's own model also proposes
the procedures and rules its instruction files describe.

Every run is kept as a version and shown in an offline page: an overview of the
agents, the system, a tools allocation matrix, scheduled tasks over a week and
the inferred behaviour. Click any element to read its SysML text; what changed
since the previous run is highlighted and listed, value by value.

Status: preview. Requires OpenClaw 2026.10.9 or later.

## Install 0.3.1

The lightweight **ClawHub** distribution installs the Toolkit separately:

```sh
openclaw plugins install clawhub:@casys/openclaw-sysmlv2-export@0.3.1
openclaw sysmlv2-toolkit install
openclaw sysmlv2-toolkit status
```

Run on the Gateway host. `install` explicitly downloads the pinned SysML Toolkit
0.10.10 archive and verifies its SHA-256 and each extracted file. For an offline
archive, use `openclaw sysmlv2-toolkit install --from ./sysml-wasm-0.10.10.tgz`.

The **complete GitHub distribution** includes all Toolkit files and licenses.
Download `casys-openclaw-sysmlv2-export-0.3.1.tgz` and verify `SHA256SUMS` from
[release v0.3.1](https://github.com/Casys-AI/openclaw-sysmlv2-export/releases/tag/v0.3.1),
then install the local archive with
`openclaw plugins install ./casys-openclaw-sysmlv2-export-0.3.1.tgz --force --accept-capabilities`.
No separate Toolkit download is needed. The release includes full download and
checksum commands. Follow any Gateway restart instruction printed by OpenClaw.

Both distributions have the same runtime and features. Neither plugin
installation nor export automatically downloads a Toolkit. Status identifies its
source, version, and whether its files are verified.

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

Each run writes `<state dir>/sysmlv2-export/<UTC time>/` with `snapshot.json`,
`findings.json`, `validation.json` and the SysML files, and updates
`versions.json` and the viewer, `index.html`.

## Check the system

With the Toolkit available, every export checks the SysML model with OpenClaw
and APE SHACL rules. The summary counts findings and the viewer's Doctor panel
lists them. Findings do not block an export or change the instance. A missing
external Toolkit is `TOOLKIT_NOT_INSTALLED`; a damaged or missing bundled one is
`TOOLKIT_INTEGRITY`. Model checks do not run in either case, and collector notes
remain available.

See the
[diagnostics guide](https://github.com/Casys-AI/openclaw-sysmlv2-export/blob/v0.3.1/docs/diagnostics.md)
for all codes and their sources.

## Validate the model

The complete package carries SysML Toolkit 0.10.10 in `toolkit/`; the
lightweight package uses its separately installed copy in the OpenClaw state
directory.

```sh
openclaw sysmlv2-toolkit status
```

`status` prints JSON: source (`bundled` or `external`), version, path,
`installed` and `verified`. Each export checks every Toolkit file against its
pinned SHA-256. A broken bundled Toolkit never falls back to an external copy.
An existing verified external install is reused by `install` without
downloading.

Compilation has a 60-second deadline. APE runs under its own default 10-second
deadline; `APE_TIMEOUT` preserves the compile result. `validation.json` reports
whether validation passed or failed and lists the diagnostics. An export is
retained when validation fails or the Toolkit is absent. The Toolkit is under
the Apache License 2.0 and its standard library under the EPL 2.0; their
licenses are included with its files.

## Privacy

- The export only reads the instance and never changes it.
- Secret values, tokens, API keys, URLs, people's ids and host paths are never
  exported. Files are referenced by path and digest, never copied.
- Inference sends only an agent's behaviour files (`AGENTS.md`, `SOUL.md`,
  `TOOLS.md`…) and its cron and heartbeat prompts to the model of one of your
  agents. Selection includes top-level Markdown names matching `[A-Z_]+.md`,
  except `MEMORY.md` and `USER.md`; review other uppercase files before
  inference. Contact details and tokens are masked in the answer, and the
  proposals are kept apart, never admitted automatically.

Source, documentation and specification:
<https://github.com/Casys-AI/openclaw-sysmlv2-export>. MIT license; the bundle
includes elkjs 0.9.3 (Eclipse Public License 2.0) to lay the diagrams out, and
the complete package carries sysml-toolkit 0.10.10 (Apache License 2.0, with an
EPL 2.0 SysML library); the lightweight package installs it separately.
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) holds the notices of every
bundled package.

Contributors: see [contribution boundaries](../CONTRIBUTING.md) and the
[source map](../src/README.md).
