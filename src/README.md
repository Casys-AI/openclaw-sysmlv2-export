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
copies both into the plugin. See [contribution boundaries](../CONTRIBUTING.md).
