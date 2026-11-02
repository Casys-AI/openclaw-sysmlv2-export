# Roadmap

Where the plugin is going, in order. Each step ships on its own; nothing here is
a promise of dates.

## 0.2.0 — Viewer (in progress)

- **Overview**: the instance at a glance, one row per agent (model, host or
  sandbox, tools by origin, channels, scheduled tasks, context, inferred
  behaviour), each linking to its views.
- **Tools as an allocation matrix**: tools by origin and provider against
  agents, host or sandbox per cell, filterable, with changes highlighted.
- **Requirements table**: an agent's rules listed with kind, text and source
  lines, beside its action flows.
- **Scheduled tasks timeline**: when each task fires over a week.

## Next

1. **Diagnostics.** The doctor returns to the public surface as a linter layer
   on the views: errors and warnings, each with a code, its context and how to
   fix it. Examples: a scheduled task that targets a missing agent, exec without
   approval, secrets stored in plain text, a disabled account still bound. A
   rule ships only once it raises no false positive on a real instance.
2. **Validation on your machine.** The export is compiled with the WebAssembly
   build of [sysml-toolkit](https://github.com/Open-MBEE/sysml-toolkit)
   (`@sysml/wasm`, Apache-2.0 and EPL-2.0) in a worker with a deadline, instead
   of needing an Assembly checkout. The Toolkit is about 21 MB, so it comes as a
   companion package or a pinned download verified by SHA-256.
3. **Change plan and apply.** Edit the SysML, get a plan: the difference between
   an exported version and the edited model, as OpenClaw configuration
   operations (tool grants, models, schedules, bindings…). A dry run by default;
   refused when the instance changed since that version; applied through
   OpenClaw's own configuration commands. Anything the export leaves out stays
   as it is.
   - **Rebuilding elsewhere.** Secrets kept as OpenClaw secret references (the
     export keeps the reference, never the value), and a private local file for
     what the export never shares (peer ids, URLs), merged only when applying.
4. **Prose handoff.** An edited procedure or rule becomes a proposed change to
   the instruction file it came from (`AGENTS.md`, `SOUL.md`…), for the owner to
   review or an agent to apply.
5. **Embedded MCP.** Read the model, check an edit, edit, plan and apply, as
   tools for OpenClaw agents (optional, owner only) and as a stdio MCP server
   for other clients. Edits go through the Toolkit's edit operations.
6. **Local editor.** The viewer becomes an editor, with the Toolkit's language
   server running in the browser: diagnostics and completion with no server. A
   hosted version, if any, comes later and only by opt-in.

## Principles

- Local first: nothing leaves the machine unless you ask for it.
- Read-only by default; every write is an explicit, reviewed step.
- Same inputs, same output.
