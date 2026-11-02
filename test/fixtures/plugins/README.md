# Synthetic plugin inventory

Not taken from any instance. `list.json` has the shape of
`openclaw plugins list --json` (OpenClaw 2026.10.9), cut to a few entries; each
`<id>/openclaw.plugin.json` is a minimal manifest. Tests resolve each relative
`rootDir` against a copy of this folder. Path-bearing fields and a config
default hold `CANARY-` markers that no output may contain.
