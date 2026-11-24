# OpenClaw model checks

[`openclaw.ttl`](openclaw.ttl) defines 21 OpenClaw configuration checks, with
OpenClaw 2026.10.9 source citations. The shared SHACL engine executes their
views after the six APE views and evaluates both sets of constraints over the
compiled SysML graph. See the [APE execution profile](../ape/README.md) and
[diagnostics guide](../../docs/diagnostics.md) for the supported forms and
finding descriptions.

The delegation wildcard check uses the shared delegation view, which requires a
built-in `sessions_spawn` grant on each source. The workspace and scheduling
checks read built-in tool grants. The sender-policy view matches enabled
accounts to binding declarations and uses the shared exec posture and the
`message` grant to set severity.

OpenClaw finding codes remain unprefixed. The three portable APE codes retain
`APE_` and their `finding` values. Both rule sets can add `ape:principle` and
`ape:pattern` references to findings. For compatibility, the combined report is
named `ape-report.ttl` and its validation result field is `ape`. The Toolkit,
bundled with the plugin, is required for model checks. If it is missing or
damaged, checks do not run and collector notes in snapshot `ambiguities` remain
available; there is no TypeScript fallback. `SAFE_BINS_DEFAULT_UNRESOLVED` is a
collector note. Legacy unresolved-reference notes can coexist with new check
infos. Runtime cron health is not emitted, and `CRON_FAILING` is deliberately
dropped.
