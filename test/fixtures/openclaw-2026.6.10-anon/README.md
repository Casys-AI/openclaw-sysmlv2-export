# Anonymized and genericized OpenClaw 2026.6.10 instance

Taken read-only from an instance, then anonymized and genericized. The structure
is preserved: agents, tool policies, sandboxes, channels, bindings, hooks, skills,
plugins and cron jobs.

- Agent and account ids are aliases.
- Every secret, peer id, URL, path and prompt is a `CANARY-<KIND>-<n>` marker.
  No output of the export may contain `CANARY-`.
- Instruction files and skills are placeholders; identifying skill names use
  stable neutral aliases. The original bodies were not copied.
- `state/cron_jobs.json` holds rows of the `cron_jobs` table (subset of
  columns). Tests build `state/openclaw.sqlite` from it.
- Workspace `.git` directories and `openclaw.json.*` backups are not included;
  tests add them where needed. The real instance had a Git repository in the
  default workspace only and many manual config backups.
