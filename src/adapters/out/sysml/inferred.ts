import type { Snapshot } from "../../../domain/model/snapshot.ts";
import { name } from "../../../domain/model/sysml-name.ts";
import {
  type Inference,
  type Source,
  sourceFiles,
} from "../../../domain/model/inference.ts";
const doc = (s: string) => `doc /* ${s.replaceAll("*/", "* /")} */`;

/** Emits the proposals as a separate package, each element linked to the
 * digest of the file it was inferred from. */
export function emitInferred(
  snapshot: Snapshot,
  inference: Inference,
): Map<string, string> {
  const lines = [
    "package OpenClawInferred {",
    "    private import ScalarValues::*;",
    `    ${
      doc(
        `Proposals inferred by ${inference.model} from agent instruction sources. Not admitted: accept or decline each one.`,
      )
    }`,
  ];
  const fileOf = (agentId: string, s: Source) => {
    const agent = snapshot.agents.find((a) => a.id === agentId)!;
    const f = sourceFiles(snapshot, agent).get(s.file)!;
    return `source ${s.file}:${s.fromLine}-${s.toLine} sha256 ${f.sha256}`;
  };
  for (
    const a of [...inference.agents].sort((x, y) =>
      x.agentId < y.agentId ? -1 : 1
    )
  ) {
    for (const p of a.procedures) {
      lines.push(
        `    action def ${name(a.agentId, p.id.replaceAll("-", "_"))} {`,
        `        ${
          doc(
            `Inferred procedure "${p.title}". Trigger: ${
              p.trigger.replace(/\.$/, "")
            }. ${fileOf(a.agentId, p.source)}`,
          )
        }`,
      );
      for (const s of p.steps) {
        const to = s.target ? ` → ${s.target}` : "";
        lines.push(
          `        action ${name("step", s.id.replaceAll("-", "_"))} { ${
            doc(`${s.kind}${to}: ${s.text}`)
          } }`,
        );
      }
      for (let i = 1; i < p.steps.length; i++) {
        lines.push(
          `        first ${
            name("step", p.steps[i - 1].id.replaceAll("-", "_"))
          } then ${name("step", p.steps[i].id.replaceAll("-", "_"))};`,
        );
      }
      lines.push("    }");
    }
    for (const r of a.rules) {
      lines.push(
        `    requirement def ${name(a.agentId, r.id.replaceAll("-", "_"))} {`,
        `        ${
          doc(`Inferred ${r.kind}: ${r.text} ${fileOf(a.agentId, r.source)}`)
        }`,
        "    }",
      );
    }
  }
  lines.push("}");
  return new Map([["OpenClawInferred.sysml", lines.join("\n") + "\n"]]);
}
