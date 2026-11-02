# OpenClaw export — v0 specification

Read an OpenClaw instance without changing it, keep a sanitized snapshot, emit
SysML v2 on the Assembly library, run doctor findings and diff two snapshots.
v0 is one-way: nothing is written back to OpenClaw.

Target: OpenClaw **2026.6.10**. The anonymized fixture in
[`test/fixtures/openclaw-2026.6.10-anon/`](test/fixtures/openclaw-2026.6.10-anon/README.md)
comes from a real instance.

## Decisions — 2 November 2026

1. **Effective permissions.** Resolve each agent's tool policy (profile,
   `alsoAllow`, `deny`, sandbox `tools.allow`/`deny`, defaults) into the
   explicit set of tools the agent can actually use, per layer (host or
   sandbox). The model holds positive grants only: no grant means no right. The
   raw OpenClaw policy is kept as provenance (snapshot, `doc` text), never as a
   negative grant.
2. **Vocabulary.** A package `OpenClawImport` specializes `AssemblyCore` and
   holds the new definitions (`OpenClawAgent`, `ToolGrant`, `CronSchedule`,
   `ChannelAccount`, `Sandbox`…). Nothing changes in Assembly's library
   (`apps/live-builder/models/` there). Definitions may move into the core
   later.
   `core.sysml`, `cases.sysml` and `skills.sysml` are copied into `sysml/`
   and written into every export directory, so it compiles alone.
3. **Prose.** Instruction files, skills, cron prompts and hook templates are
   referenced by relative path, SHA-256 and byte size. Their bodies never enter
   the snapshot, the SysML or any output.

## Pipeline

Each step is a pure function with a thin CLI. Steps composeAssembly's , found through ; none calls the
next.

| Step | Signature | Notes |
| --- | --- | --- |
| collect | `collect(home) → Snapshot` | Only step that reads the instance. Read-only. |
| emit | `emit(snapshot) → Map<path, text>` | Deterministic SysML text. |
| validate | `validate(files) → Diagnostics` | Compiles with the pinned Toolkit. |
| doctor | `doctor(snapshot) → Finding[]` | Coded findings. |
| diff | `diff(a, b) → Change[]` | Structural, from two snapshots. |

**collect** reads `openclaw.json`, each agent workspace (top-level Markdown
files by name, size and SHA-256, and presence of `.git`Assembly's , found through ; no other file name is
collected), skills as OpenClaw discovers them (`SKILL.md` anywhere under
`skills/`Assembly's , found through ; inner symlinks followed once, outer ones skipped with a finding,
broken ones reportedAssembly's , found through ; only the frontmatter `name` is read), sibling backups
`openclaw.json.*` (count only) and cron jobs from `state/openclaw.sqlite`,
table `cron_jobs`, opened with a read-only URI and the columns listed in the
fixture's `state/cron_jobs.json`. Relative workspace paths resolve against the
OpenClaw home. It uses only `node:` APIs (`fs`, `path`, `crypto`, `sqlite`) so
the same file runs under Deno 2.9 and Node 22.

**Never in a snapshot or any output:** environment values, tokens, API keys,
provider base URLs, peer/guild/user ids, `allowFrom` lists, bind source paths,
extra hosts, prompts and file bodies. Secret-bearing fields are counted
(`plaintextSecretCount`), not copied. Environment variables keep their names.

**Redaction has two layers.** The first is projection: the snapshot is built
field by field from an allowlist, so an unknown field never passes. The second
reuses `jsr:@logtape/redaction@2.4.2` (same version as `@logtape/logtape` in
the repository): `redactProperties` with `DEFAULT_REDACT_FIELDS` plus the
fields above runs on the raw config before projection, and the output tests
scan with its `EMAIL_ADDRESS_PATTERN` and `JWT_PATTERN` besides the canaries.
Do not write a third redaction mechanism.

**Snapshot** is JSON with `schema: "openclaw-snapshot/1"`, sorted keys, arrays
sorted by id, no clock reads. Same instance → same bytes.

## Mapping

| OpenClaw | SysML (`OpenClawImport` + instance package) |
| --- | --- |
| agent (`agents.list`, implicit `main`) | `part def … :> OpenClawAgent`, with `OpenClawAgent :> AssemblyCore::SoftwareOperator`Assembly's , found through ; id, display name, emoji, primary and fallback models |
| effective tools | `ToolGrant` items (tool, layer) referenced by the agent |
| sandbox | `Sandbox` part: mode, scope, workspace access, image, read-only root, network, memory, cpus, bind count and modes, environment names |
| channel account | `ChannelAccount` part (channel, account id, DM and group policies) |
| binding | connection agent ↔ account, with the peer kind only |
| cron job | case type with `AssemblyCases::EnvelopeKind::deterministic` and a `CronSchedule :> AssemblyCases::Schedule` (expression, time zone)Assembly's , found through ; `every` maps to `AssemblyCases::Every` |
| heartbeat | case type with `reassessment` envelope and `Every` |
| hook mapping | `ExternalTrigger` (name, target agent, delivery channel) |
| workspace skill | `APESkills::InitialSkill` (id, source path, digest) |
| bundled skill entry | `BundledSkill` (name, enabled) |
| instruction file | `InstructionFile` (path, sha256, bytes) |
| `subagents.allowAgents` | delegation rule (from, to) |
| `tools.agentToAgent` | messaging policy (allowed targets) |
| model provider | provider name, API kind, model ids |
| `tools.exec`, `tools.elevated` | `ExecutionPosture` (security, ask, elevated, elevated channels count) |

Runtime state (last run, errors, tokens) stays in the snapshot for the doctor
and the diff. It is not model content. Identifiers become valid SysML namesAssembly's , found through ;
names that cannot be made valid use quoted names.

Resolve OpenClaw semantics from its 2026.6.10 sources or docs, and cite the
file in a comment. When a rule stays ambiguous, emit an `info` finding instead
of guessing.

## Doctor

A finding is `{ code, severity: "error" | "warning" | "info", subject, context,
recovery }`. Initial rules:

| Code | Severity | Condition |
| --- | --- | --- |
| `EXEC_WITHOUT_APPROVAL` | error | `exec` reachable with security `full` and ask `off` |
| `AGENT_WITHOUT_SANDBOX` | warning | agent with `exec` and no sandbox |
| `EXTERNAL_BIND_SOURCES` | warning | `dangerouslyAllowExternalBindSources: true` |
| `AGENT_TO_AGENT_WILDCARD` | warning | `agentToAgent.allow` contains `*` |
| `PLAINTEXT_SECRET_IN_CONFIG` | error | `plaintextSecretCount > 0` |
| `CRON_FAILING` | warning | `consecutive_errors ≥ 3` |
| `WORKSPACE_UNVERSIONED` | warning | workspace without `.git` |
| `MANUAL_CONFIG_BACKUPS` | info | at least one `openclaw.json.*` sibling |
| `MALFORMED_SKILLS_DIR` | warning | `SKILL.md` at the root of `skills/`, or a broken skill link |

Folders without `SKILL.md` are legitimate groups (`docs/tools/skills.md`) and
are not reported.

## Diff

Changes between two snapshots: agent added/removed, model, grants, sandbox,
binding, skill added/removed/digest, instruction digest, cron job and schedule.
Each change names its subject and before/after values (never secrets).

## Invariants and tests

- **Canaries.** Every secret in the fixture is a `CANARY-*` marker. No
  `CANARY-` may appear in a snapshot, SysML, finding or change.
- **Determinism.** Collect and emit twice give identical bytes.
- **Toolkit.** An export directory of the fixture, compiled alone (it carries
  the Assembly library), has zero errors with Assembly's `ToolkitCompiler`,
  found through `ASSEMBLY_DIR`; needs `SYSML_TOOLKIT_DIR`.
- **Golden files.** Snapshot, SysML, findings for the fixture, reviewed.
- **Doctor.** One positive and one negative case per rule.
- **Collector.** Tests copy the fixture to a temp dir, build
  `state/openclaw.sqlite` from `state/cron_jobs.json` and add `.git` or backups
  where a case needs them. No binary is committed.

## Interfaces

`deno task` entries: `collect --home <dir> --out <file>`,
`export --snapshot <file> --out <dir>`, `doctor --snapshot <file>`,
`diff <a> <b>`. Output is JSON on stdout. Errors are
`{ code, context, recovery }` with a non-zero exit.

## Qualification — 2 November 2026

The collector ran read-only on a real 2026.6.10 instance (Node 22) and, after
its upgrade, the plugin ran on the same instance in 2026.10.9 (Node 24), with
inference through Claude Sonnet 5.5. Both exports compiled with the pinned
Toolkit with zero errors and zero warnings. Real outputs never enter this
repository.

## v1 AI inference layer — OpenClaw plugin

Prose (instruction files, cron prompts) describes roles, procedures,
escalation and hand-offs that the config does not hold. An optional AI step,
packaged as an OpenClaw plugin so the prose never leaves the host and the
owner's own model is used, proposes action flows and requirements from the
instruction files. Cron prompts are not read yet.

Implemented on 2 November 2026 in `plugin/` (see the README). Contract:
`src/infer.ts` (`openclaw-inference/1`). On a local 2026.10.9 instance with
three synthetic agents, Sonnet 5.5 returned 8 procedures and 18 rulesAssembly's , found through ; the
proposals matched the prose (refund limit, escalation to the dispatcher) and
the whole SysML compiled with the Toolkit with zero errors.

- Inferred elements go to a separate package, marked inferred, each linked to
  the digest of its source file. They are proposals the owner accepts or
  declines, never mixed with extracted facts, so the diff stays deterministic.
- Inferred text passes the same redaction and an owner review before any export
  or sharing.
- The plugin calls the deterministic collector first.

**Versions and viewer (2 November 2026).** Each plugin run writes a new
`<outDir>/<UTC time>/` directory and lists it in `versions.json`, newest
first. A static `index.html`, regenerated after each run, browses the versions
and shows per-file unified diffs against the previous one, computed at export
time (`npm:diff@9.0.0`). The Deno CLI keeps its single output directory.

## Out of scope for v0

Writing back to OpenClaw, running against a live host (done separately),
sessions and traces, memory databases, flows, plugin internals, any
change to Assembly.
