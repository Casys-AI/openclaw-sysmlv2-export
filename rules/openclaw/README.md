# OpenClaw model checks

[`openclaw.ttl`](openclaw.ttl) defines 17 OpenClaw configuration checks, with
OpenClaw 2026.10.9 source citations. The shared SHACL engine executes their
views after the five APE views and evaluates both sets of constraints over the
compiled SysML graph. See the [APE execution profile](../ape/README.md) and
[diagnostics guide](../../docs/diagnostics.md) for the supported forms and
finding descriptions.

OpenClaw finding codes remain unprefixed; the three portable APE codes retain
`APE_` and their `pattern` and `finding` fields. For compatibility, the combined
report is named `ape-report.ttl` and its validation result field is `ape`. The
Toolkit, bundled with the plugin, is required for model checks. If it is missing
or damaged, checks do not run and collector notes in snapshot `ambiguities`
remain available; there is no TypeScript fallback.
`SAFE_BINS_DEFAULT_UNRESOLVED` is a collector note. Legacy unresolved-reference
notes can coexist with new check infos. Runtime cron health is not emitted, and
`CRON_FAILING` is deliberately dropped.
