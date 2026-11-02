# Anonymized OpenClaw 2026.6.10 instance

A test fixture with the shape of an OpenClaw 2026.6.10 instance: six agents with
their tool policies, sandboxes, channels, bindings, hooks, skills, plugins and
cron jobs. It was derived from a real configuration: the structure and policies
are kept, while names, identifiers, secrets and prose were replaced.

- Agent and account ids are aliases; identifying skill names use stable neutral
  aliases.
- Every secret, peer id, URL, path and prompt is a `CANARY-<KIND>-<n>` marker.
  No output of the export may contain `CANARY-`.
- Instruction files and skills are placeholders; the original bodies were not
  copied.
- `memory/` notes, the Memory Core dreaming settings, Active Memory's
  `promptAppend` and `allowedChatIds`, MCP servers, exec safe bins and approval
  allowlists are synthetic additions for the tests that cover them.
- `state/*.json` hold rows (a subset of columns) of the named SQLite tables. The
  tests build `state/openclaw.sqlite` from them; no binary is committed.
- Workspace `.git` directories and `openclaw.json.*` backups are not included;
  the tests add them where a case needs them.
