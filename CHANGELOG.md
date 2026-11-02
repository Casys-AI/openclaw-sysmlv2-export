# Changelog

## 0.1.0 — preview

First release, for OpenClaw 2026.10.9 and later.

- **SysML v2 export.** `openclaw sysmlv2-export`, the `/sysmlv2_export` chat
  command and the optional `sysmlv2_export` agent tool export the instance as a
  SysML v2 model on Assembly's library, grouped by category: operators, tools,
  context, cases, entries and authority. Each export folder carries the library
  it builds on and compiles on its own.
- **Effective tool grants.** Each agent's tool policy is resolved into the tools
  it can use, per host or sandbox layer, following the OpenClaw 2026.10 or
  2026.6.10 tool catalog. Plugin tools come from OpenClaw's plugin inventory,
  with optional tools and profile attachments; MCP servers are granted as whole
  servers; commands allowed by exec safe bins and approval allowlists become
  command-line tools.
- **Exec posture.** Configured exec settings, host approvals and their stricter
  effective result are kept side by side.
- **Context and memory.** Instruction files and skills are referenced by path
  and digest; memory search policy, a daily-note inventory (counts, dates,
  digest) and the memory backend are exported as an inventory.
- **Schedules and entries.** Cron jobs and heartbeats become scheduled cases;
  channel accounts, bindings and hooks become entries.
- **Inference (optional).** `--infer`, or `/sysmlv2_export infer`, asks the
  agents' own models to propose procedures and rules from their behaviour files.
  Proposals cite their source lines and digest, are validated and masked, and
  land in a separate package that is never admitted automatically.
- **Versions and viewer.** Every run is kept in its own folder, listed in
  `versions.json`, with a static offline page to browse the files and see what
  changed since the previous run.
- **Privacy.** Read-only collection; secrets, people's ids, URLs, host paths,
  prompts and file bodies never enter the export. A sanitized, deterministic
  snapshot (`openclaw-snapshot/5`) records what was read.
