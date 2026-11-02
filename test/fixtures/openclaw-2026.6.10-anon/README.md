# Anonymized and genericized OpenClaw 2026.6.10 instance

Taken read-only from an instance, then anonymized and genericized. The structure
is preserved: agents, tool policies, sandboxes, channels, bindings, hooks, skills,
plugins and cron jobs.

- Agent and account ids are aliases.
- Every secret, peer id, URL, path and prompt is a `CANARY-<KIND>-<n>` marker.
  No output of the export may contain `CANARY-`.
- Instruction files and skills are placeholders; identifying skill names use
  stable neutral aliases. The original bodies were not copied.
- `memory/` notes, Memory Core dreaming config and Active Memory's `promptAppend`
  and `allowedChatIds` are synthetic additions for memory export tests.
- MCP servers, exec safe bins and approval allowlists are synthetic additions
  for MCP and command-grant export tests.
- `state/*.json` hold rows of the named SQLite tables (subsets of columns).
  Tests build `state/openclaw.sqlite` from them in one loop.
- Workspace `.git` directories and `openclaw.json.*` backups are not included;
  tests add them where needed. The real instance had a Git repository in the
  default workspace only and many manual config backups.
