// OpenClaw plugin: export this instance as SysML v2 for Assembly, with doctor
// findings and, on request, procedures and rules inferred from agent prose.
import { isAbsolute, join, relative } from "node:path";
import process from "node:process";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { runExport } from "./core.mjs";

const PURPOSE = "assembly-export.infer";

/** api.runtime is only available inside handlers (registration-mode.md). */
function paths(api) {
  const stateDir = api.runtime.state.resolveStateDir(process.env);
  return {
    stateDir,
    outDir: api.pluginConfig?.outDir ?? join(stateDir, "assembly-export"),
  };
}

/** An isolated call: one user message, no tools, fresh context (models.md).
 * Outside a session, each agent is analysed in its own context (agentId);
 * overrides need plugins.entries.assembly-export.llm.allowAgentIdOverride and
 * allowModelOverride. */
function completeWith(llm, model, selectAgent) {
  return async (prompt, agentId) => {
    const result = await llm.complete({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: "You are a JSON-only function.",
      purpose: PURPOSE,
      ...(selectAgent ? { agentId } : {}),
      ...(model ? { model } : {}),
      execution: { mode: "isolated-agent-runtime", timeoutMs: 180_000 },
    });
    return { text: result.text, model: result.model };
  };
}

/** Chat replies name the output without disclosing absolute host paths. */
function shown(s, stateDir) {
  const at = (path, elsewhere) => {
    const rel = relative(stateDir, path);
    return rel && !rel.startsWith("..") && !isAbsolute(rel)
      ? `<state dir>/${rel}`
      : elsewhere;
  };
  return {
    ...s,
    outDir: at(s.outDir, `${s.version} in the configured output directory`),
    viewer: at(s.viewer, "index.html in the configured output directory"),
  };
}

/** Opens the viewer with the OS opener, run by the runtime's command runner;
 * prints its path when there is no opener or it fails (headless host). */
async function openViewer(api, path) {
  const opener = { darwin: "open", linux: "xdg-open" }[process.platform];
  const opened = opener && await api.runtime.system
    .runCommandWithTimeout([opener, path], 10_000)
    .then((r) => r.code === 0, () => false);
  if (!opened) process.stderr.write(`Viewer: ${path}\n`);
}

function summarize(s) {
  const findings = Object.entries(s.findings).map(([k, v]) => `${v} ${k}`)
    .join(", ") || "none";
  const lines = [
    `Assembly export: ${s.agents} agents → ${s.outDir}`,
    `Viewer: ${s.viewer}`,
    `Doctor: ${findings}`,
  ];
  if (s.inferred) {
    lines.push(
      `Inferred (proposals, not admitted): ${s.inferred.procedures} procedures, ${s.inferred.rules} rules`,
    );
    if (s.inferred.failed.length) {
      lines.push(`Inference failed for ${s.inferred.failed.join("; ")}`);
    }
  }
  return lines.join("\n");
}

export default definePluginEntry({
  id: "assembly-export",
  name: "Assembly Export",
  description:
    "Export this OpenClaw instance as SysML v2 for Assembly, with doctor findings and inferred procedures.",
  register(api) {
    // The export discloses the whole instance: owner only on chat surfaces,
    // operator.admin for gateway clients (plugin-command-execution enforces it).
    api.registerCommand({
      name: "assembly_export",
      description:
        "Export to SysML for Assembly. Add `infer` to propose procedures from agent prose.",
      acceptsArgs: true,
      requireAuth: true,
      requiredScopes: ["operator.admin"],
      handler: async (ctx) => {
        const { stateDir, outDir } = paths(api);
        const infer = (ctx.args ?? "").trim() === "infer";
        const llm = ctx.runtimeContext?.llm;
        if (infer && !llm) {
          return {
            text: "Inference needs an agent session; run it from a chat.",
          };
        }
        const summary = await runExport(
          stateDir,
          null,
          outDir,
          infer ? completeWith(llm) : null,
          new Date(),
        );
        return { text: summarize(shown(summary, stateDir)) };
      },
    });

    // Optional (operators allow it explicitly) and only offered to the owner's
    // unsandboxed sessions: customers talking to an agent never get it.
    api.registerTool(
      (ctx) =>
        ctx.senderIsOwner !== true || ctx.sandboxed ? null : ({
          name: "assembly_export",
          label: "Assembly export",
          description:
            "Export this OpenClaw instance (agents, tool grants, sandboxes, channels, cron, skills) to SysML v2 for Assembly and run its configuration doctor. Returns where the files and the version viewer are and the findings count. Does not call a model.",
          parameters: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          async execute() {
            const { stateDir, outDir } = paths(api);
            const summary = shown(
              await runExport(stateDir, null, outDir, null, new Date()),
              stateDir,
            );
            return {
              content: [{ type: "text", text: summarize(summary) }],
              details: summary,
            };
          },
        }),
      { name: "assembly_export", optional: true },
    );

    api.registerCli(({ program }) => {
      program.command("assembly-export")
        .description("Export this instance to SysML v2 for Assembly")
        .option(
          "--infer",
          "Propose procedures and rules from agent prose with the default agent's model",
        )
        .option(
          "--model <provider/model>",
          "Model for --infer instead of the default agent's (needs llm.allowModelOverride)",
        )
        .option("--out <dir>", "Output directory")
        .option("--open", "Open the version viewer (index.html) when done")
        .action(async (options) => {
          const { stateDir, outDir } = paths(api);
          const summary = await runExport(
            stateDir,
            null,
            options.out ?? outDir,
            options.infer
              ? completeWith(api.runtime.llm, options.model, true)
              : null,
            new Date(),
          );
          process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
          if (options.open) await openViewer(api, summary.viewer);
        });
    }, {
      descriptors: [{
        name: "assembly-export",
        description: "Export this instance to SysML v2 for Assembly",
        hasSubcommands: false,
      }],
    });
  },
});
