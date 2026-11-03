# Changelog

## 0.3.0 — 2026-11-03

The snapshot schema and the inference contract (`openclaw-inference/1`) are
unchanged: every new field is optional, so older exports, `inference.json` files
and `versions.json` entries still read.

- **The Toolkit ships inside the plugin.** The package carries the pinned
  sysml-toolkit 0.10.10 files in `toolkit/` (about 20 MB, licenses included), so
  installing the plugin gives model validation and diagnostics with no further
  step, and nothing is downloaded at install or export time. Every export still
  checks each file against its pinned SHA-256; a missing or modified file is a
  `TOOLKIT_INTEGRITY` error whose recovery is to reinstall the plugin, and the
  export is kept with a failed validation. `plugin/THIRD_PARTY_NOTICES.md` now
  names the Toolkit, its licenses and its upstream release.
- **Removed:** `openclaw sysmlv2-toolkit install` and `--from`, the install into
  `<state dir>/sysmlv2-export-toolkit/`, and the `TOOLKIT_NOT_INSTALLED` and
  `TOOLKIT_DOWNLOAD_FAILED` errors. `openclaw sysmlv2-toolkit status` stays and
  verifies the bundled files. An export no longer ends with validation
  `skipped`; the status remains only on earlier versions. A
  `<state dir>/sysmlv2-export-toolkit/` folder left by an earlier install is no
  longer read and can be deleted.
- **Build.** `deno task plugin:build` writes `plugin/toolkit/` from the archive
  that `SYSML_TOOLKIT_WASM_ARCHIVE` names, after checking it against the pinned
  hash. It never downloads: without the variable it fails with
  `TOOLKIT_ARCHIVE_MISSING`. CI downloads and verifies the archive before the
  build.
- **Deno CLI.** `diagnose` takes `--toolkit <dir>` (for instance
  `plugin/toolkit`) in place of `--state-dir`.
- **Viewer: navigation.** Back and Forward follow the versions, views, tabs and
  files opened; the address names the selected element or the lines shown in
  Files, and the inspector copies it. An address to a version, view or element
  the page lacks shows a coded note (`VERSION_NOT_FOUND`, `VIEW_NOT_FOUND`,
  `ELEMENT_NOT_FOUND`). Fixed: zoom out could zoom in after Fit, a hash that
  does not decode left the page empty, and another version lost the view asked
  for.
- **Viewer: reading at scale.** Fit uses the space under the toolbar, and
  Scheduled tasks is laid out for the strip above its week (Fit 0.18 to 0.41 on
  a real instance). F, Enter or Fit selection frame an element in the room the
  sidebar leaves; a click no longer leaves its node under the sidebar. Zoomed
  out, Behaviour shows titled procedures. Drag pans from anywhere, two fingers
  pinch, and the table under a diagram folds away.
- **Viewer: marks.** Changes have their own blue, apart from the Doctor's amber;
  the selection has a halo that keeps the change colour; hovering marks an
  element and its edges without dimming the rest; a Behaviour selection dims
  only the other procedures.
- **Viewer: panels and Overview.** Doctor and Changes entries select and frame
  their element without leaving the panel, and each panel keeps its scroll. An
  agent's inspector links its other views. The Overview's tiles open what they
  count, with a Doctor tile first; severity marks name their codes in a tooltip.
- **Viewer: what the data now says, shown.** The header and the version picker
  say what went into each version and whether it was checked; only real changes
  are marked, and the picker, rail and panel share one count. The Doctor says
  when its checks did not run, groups findings by code with readable subject
  chips, says what is new or resolved, lights a delegation cycle in Reach and
  nests widened grants under the exec they reach; severity has a shape. The
  Changes tab leads with per-element changes. Overview rows show figures, Tools
  filters by holders, a week strip selects its task, Reach and hook edges are
  drawn with a legend per view, and Behaviour lists its procedures and states
  its authority. A diagram is laid out for the canvas its table leaves.
- **Viewer: less text, more access.** The gestures' hint goes after first use,
  the legend folds, and two notes became tooltips. Every button shows its focus
  ring, focus survives re-renders, diagram elements and matrix cells have full
  accessible names, and a live region reports selections.
- **Viewer data tells the truth.** Each version says whether its model checks
  ran (`verified`, `not-run`, `failed`, `unrecorded`, with the export's recovery
  and the failed inferences), whether its configuration, its inference or only
  the export changed since the previous version (`same`, `inference`, `changed`,
  `schema`), and gives readable labels, the Doctor's findings grouped by
  severity, code and recovery, and the new and resolved findings against the
  last version whose APE analysis completed. A view's delta splits `changed` (a
  shown value) from `touched` (only the SysML), counts once what the panel lists
  and leaves initial and final nodes out. The Changes tab can list, per element,
  what changed, and the changed files by group.
- **`diff` covers more and ignores the instance running.** It compares accounts,
  hooks, agent names, policy, providers, bundled skills, messaging and
  environment, and leaves out a task's last run, the memory notes and backups
  that pile up, and a binding's position in its id. A binding is known by its
  agent, account and peer, so a peer kind change is a removal and an addition.
- **APE findings name their related agents.** `findings.json` rows of
  `APE_LINK_CYCLE` and `APE_GRANT_WIDENS_PARENT` carry an optional sorted
  `related` list of `agent:<id>`; older versions read as before.
- **Reach view.** Who can reach whom: agents with their posture, delegation as
  one edge per pair (double-ended when both ways), hooks as nodes, the messaging
  policy as a block. It has its own layout; System keeps its first layer.
- **Hook mappings in System**, in a group of their own with an edge to the agent
  each starts, dashed when the agent is absent.
- **Posture.** One helper states where exec runs, network, workspace access,
  external binds and elevated, in System, Overview, Tools and Reach. A host exec
  policy is never attached to an exec that runs in the sandbox.
- **Exported facts shown.** The Overview totals name the SysML they rest on;
  fallback models, inferred role, task model and delivery are attributes;
  `ScheduledCase` emits `primaryModel`; Overview rows carry `figures`; display
  names are the readable names on blocks.
- **Tools matrix data.** Built-in tools sit in the capability groups of the
  recorded OpenClaw version, rows state their holder count and groups a host
  marker; plugin profiles and MCP OAuth and filters are attributes.
- **Behaviour.** A list of procedures with trigger and step count; the agent's
  authority (where exec runs, ask policy, outbound tools) on each rule.
- **`PROSE_NOT_ENFORCED`.** A new warning: an inferred exec prohibition or
  constraint that the configuration does not enforce. It needs inference; a rule
  now carries an optional `concern` (`exec`), and `OpenClawInferred` gains an
  `InferredConcern` part for it.
- **Stable inference.** An agent keeps its earlier inference when what the model
  is sent is unchanged; `versions.json` says how many agents (`inferred.reused`)
  and each version records the plugin version and a digest of the shipped
  shapes.
- `UNRESOLVED_AGENT_REFERENCE` messages name the absent agent.

## 0.2.0 — 2026-11-03

The snapshot schema stays `openclaw-snapshot/5`, with one optional field,
`plaintextCredentialPaths`; the inference contract is unchanged.

- **APE rules on the model graph.** With the Toolkit installed, every export
  checks APE good practices on the graph of its SysML model: the Toolkit's
  element graph, projected to the versioned `openmbee-v2` RDF subset, is queried
  through a scoped SHACL SPARQL profile on Oxigraph in WebAssembly. Three rules:
  an agent that can reach unapproved host exec through delegation, delegation
  cycles, unreachable agents; each names the agents involved. Views and
  constraints are in `rules/ape/ape.ttl`; a completed analysis writes
  `ape-report.ttl`. Findings start with `APE_` and join the others. The same
  shapes produced matching findings and related pairs on synthetic baseline and
  extended fixtures using unmodified
  [OpenSysML v0.11.0](https://github.com/Open-MBEE/OpenSysML/releases/tag/v0.11.0)
  Turtle. The projection is a subset, not an identical native graph; the
  [mapping and test oracle](rules/ape/README.md) describe the boundaries.
- **Agent links are SysML references.** Delegation is a `DelegationRule`
  connection between two agents, with a `DelegationPolicy` keeping the literal
  targets and wildcards; messaging targets, hook targets and scheduled-task
  targets refer to agents. Unknown targets stay explicit (`unresolvedTarget`,
  `unresolvedTargets`). Consumers of the former String attributes must follow
  the new form.

- **Diagnostics.** Sixteen OpenClaw configuration checks and three portable APE
  checks run as SHACL rules on the compiled SysML model. The Doctor panel
  displays the findings and collector notes. With no Toolkit, model checks are
  skipped and collector notes remain available; no TypeScript fallback runs.
  `CRON_FAILING` is dropped because runtime health is not emitted. The
  `diagnose` CLI checks an existing export without writing to it.

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
- **A sidebar.** An icon rail on the right opens the Inspector, Changes and
  Doctor panels, with their counts on the icons. The sidebar sits beside the
  diagram and the table, collapses, and keeps the width you drag it to. Changes
  lists what was added, changed and removed, with each changed value before and
  after; the inspector strikes the old value above the new one and folds each
  piece of SysML to its first line. View and version pickers show a larger,
  styled list where the browser allows it.

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
