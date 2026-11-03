import type { Inference } from "./inference.ts";
import type { Snapshot } from "./snapshot.ts";

/** What went into a version, set against the previous one:
 * - `same`: the configuration and the inference are the same, so every change
 *   of the emitted files comes from the export itself;
 * - `inference`: only the inferred behaviour differs;
 * - `changed`: the configuration differs;
 * - `schema`: not comparable, a snapshot is unreadable here (an older format). */
export type InputsVerdict = "same" | "inference" | "changed" | "schema";

/** A version as far as the verdict reads it. */
export interface Inputs {
  snapshot: Snapshot | null;
  inference: Inference | null;
}

/** The configuration a snapshot records, without what the export observed
 * rather than configured:
 * - `ambiguities`: the collector's notes, derived from the rest;
 * - `backupCount`, `memory.daily`, `memory.otherCount`: files that pile up on
 *   the host as the instance runs;
 * - `cron[].runtime`: the last run and its errors;
 * - a binding's id: it ends with its position in the list, so a binding is
 *   known by the agent, account and peer it joins, and bindings are a set.
 * `plaintextCredentialPaths` is configuration, but `null` only says the
 * collector did not look: it counts when both versions recorded it. */
function configuration(s: Snapshot, credentials: boolean) {
  const {
    ambiguities: _n,
    backupCount: _b,
    plaintextCredentialPaths,
    ...rest
  } = s;
  return {
    ...rest,
    ...(credentials ? { plaintextCredentialPaths } : {}),
    agents: s.agents.map((
      { memory: { daily: _d, otherCount: _o, ...m }, ...a },
    ) => ({
      ...a,
      memory: m,
    })),
    cron: s.cron.map(({ runtime: _r, ...job }) => job),
    bindings: s.bindings.map(({ id: _i, ...b }) => b).sort((x, y) =>
      JSON.stringify(x) < JSON.stringify(y) ? -1 : 1
    ),
  };
}

/** The inferred behaviour, without the model or any other run metadata. */
const behaviour = (i: Inference | null) =>
  i && i.agents.map(({ agentId, role, procedures, rules }) => ({
    agentId,
    role,
    procedures,
    rules,
  }));

export function inputsVerdict(
  before: Inputs,
  after: Inputs,
  canonical: (value: unknown) => string,
): InputsVerdict {
  const [a, b] = [before.snapshot, after.snapshot];
  if (!a || !b) return "schema";
  const credentials = !!a.plaintextCredentialPaths &&
    !!b.plaintextCredentialPaths;
  if (
    canonical(configuration(a, credentials)) !==
      canonical(configuration(b, credentials))
  ) return "changed";
  return canonical(behaviour(before.inference)) ===
      canonical(behaviour(after.inference))
    ? "same"
    : "inference";
}
