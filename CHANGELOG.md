# Changelog

## Unreleased

The snapshot schema and the inference contract are unchanged.

- **Model validation.** `openclaw sysmlv2-toolkit install` installs the pinned
  sysml-toolkit 0.10.10 WebAssembly release, downloaded or from a local copy
  with `--from`, and `status` checks it. Once it is installed, every export is
  compiled in a worker stopped after 60 seconds: the summary and `versions.json`
  give the result, `validation.json` the diagnostics, and a failed validation
  keeps the export. No Assembly checkout is needed any more.
- **CI compiles exports** with the pinned public archive.

- **Overview.** The viewer opens on a table of the agents: model, host or
  sandbox, tools by origin, channel accounts, scheduled tasks, context and, with
  inference, procedures and rules, under the instance's totals. Each row names
  the declarations it sums up and links to the agent in the other views.
- **Tools as an allocation matrix.** The Tools diagram becomes a SysML
  allocation matrix of tools (by origin and provider) against agents, each cell
  an agent's grant on the host, in the sandbox or both. Header and first column
  stay in place, groups fold and count each agent's tools, a filter keeps the
  matching tools, and rows, columns and cells show what changed and open their
  SysML.
- **Rules as a requirements table.** A Behaviour view keeps its procedures as
  action flows and lists its rules under them: name, kind, text and source,
  sortable and filtered by kind, each linked to its SysML lines. Many procedures
  wrap into rows instead of one wide row.
- **A week of scheduled tasks.** Under the Scheduled tasks diagram, a 7 × 24
  hour strip per task shows when each cron schedule fires, in its own time zone,
  and the intervals that run all week; one-shot and date-bound schedules are
  listed as not weekly.
- A table under a diagram can be resized, and schedules in words also read day
  ranges and names (`MON-FRI`).
- **Readable changes.** The change counts open one list of what was added,
  changed and removed, with each changed value before and after; the inspector
  strikes the old value above the new one. The inspector sits beside the table
  instead of over it, scrolls as one panel and folds each piece of SysML to its
  first line. View and version pickers show a larger, styled list where the
  browser allows it.

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
  agents' own models to propose procedures and rules from their behaviour files
  and the prompts of their scheduled tasks. Proposals cite their source lines
  and digest, are validated and masked, and land in a separate package that is
  never admitted automatically.
- **Versions and viewer.** Every run is kept in its own folder, listed in
  `versions.json`, with a static offline page to browse the files and see what
  changed since the previous run. The page draws four SysML v2 views: System
  (agents and channel accounts), Tools (the catalog and each agent's grants),
  Scheduled tasks and, with inference, one Behaviour view per agent. Elements
  open their SysML text, and changes since the previous run are highlighted.
- **Privacy.** Read-only collection; secrets, people's ids, URLs, host paths,
  prompts and file bodies never enter the export. A sanitized, deterministic
  snapshot (`openclaw-snapshot/5`) records what was read.
