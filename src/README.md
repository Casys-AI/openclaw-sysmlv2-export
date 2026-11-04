# Source map

- `domain/` contains the model, OpenClaw concepts and domain primitives.
- `application/` coordinates export, model diagnostics and viewer use cases. Its
  outbound ports are `export/ports/out/export.port.ts`,
  `model/diagnostics/ports/out/shapes-diagnostics.port.ts`,
  `model/diagnostics/ports/out/toolkit-elements.port.ts`,
  `model/diagnostics/ports/out/toolkit-validation.port.ts`,
  `model/viewer/ports/out/viewer.port.ts`, and
  `model/semantic/ports/out/rdf-projector.port.ts`.
- `adapters/in/` handles CLI and OpenClaw entry; `adapters/out/` implements
  filesystem, inference, OpenClaw, Oxigraph, SHACL, SysML, toolkit and viewer
  capabilities.
- `infrastructure/` provides shared technical facilities, and `composition/`
  connects the application to implementations.

Inference parsing receives its redaction policy through injection. Domain errors
carry codes; technical error sanitation is handled in infrastructure.

The shipped rules are [`rules/ape/ape.ttl`](../rules/ape/ape.ttl) and
[`rules/openclaw/openclaw.ttl`](../rules/openclaw/openclaw.ttl); packaging
copies both into the plugin. It also writes the pinned Toolkit into
`plugin/toolkit/` (`adapters/out/sysml-toolkit/`: `extract.ts` at build time,
`bundled.ts` to read and verify it at run time) from the archive that
`SYSML_TOOLKIT_WASM_ARCHIVE` names. `scripts/package-distributions.ts` stages
the complete GitHub and lightweight ClawHub packages from that same build.
`distribution.json` selects bundled loading or the versioned state-directory
copy installed explicitly by `adapters/out/sysml-toolkit/install.ts`. See
[contribution boundaries](../CONTRIBUTING.md).
