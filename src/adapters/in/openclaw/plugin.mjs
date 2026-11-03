// OpenClaw plugin: export this instance as SysML v2 for Assembly and, on
// request, procedures and rules inferred from agent prose.
import { isAbsolute, join, relative } from "node:path";
import process from "node:process";
/** api.runtime is only available inside handlers (registration-mode.md). */
function paths(api) {
  const stateDir = api.runtime.state.resolveStateDir(process.env);
  return {
    stateDir,
    outDir: api.pluginConfig?.outDir ?? join(stateDir, "sysmlv2-export"),
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
  const lines = [
    `SysML v2 export: ${s.agents} agents → ${s.outDir}`,
    `Viewer: ${s.viewer}`,
  ];
  const findings = [
    [s.findings.error, "error"],
    [s.findings.warning, "warning"],
    [s.findings.info, "note"],
  ].filter(([count]) => count).map(([count, label]) =>
    `${count} ${label}${count === 1 ? "" : "s"}`
  );
  lines.push(
    `Findings: ${findings.length ? findings.join(", ") : "no finding"}`,
  );
  lines.push(
    `Checks: ${s.ape.status} (${s.ape.count} ${
      s.ape.count === 1 ? "finding" : "findings"
    })${s.ape.code ? ` — ${s.ape.code}` : ""}; details in validation.json`,
  );
  if (s.inferred) {
    lines.push(
      `Inferred (proposals, not admitted): ${s.inferred.procedures} procedures, ${s.inferred.rules} rules`,
    );
    if (s.inferred.failed.length) {
      lines.push(`Inference failed for ${s.inferred.failed.join("; ")}`);
    }
  }
  const v = s.validation;
  lines.push(
    `Validation: ${v.status} (${v.errors} errors)${
      v.code ? ` — ${v.code}` : ""
    }${v.recovery ? `; ${v.recovery}` : ""}`,
  );
  return lines.join("\n");
}

export function createPluginEntry(
  definePluginEntry,
  { pluginList, runExport, toolkitStatus, completeWith },
) {
  /** OpenClaw's plugin inventory (docs/cli/plugins/list.md). api.runtime gives
   * an external plugin no plugin registry and gateway.request rejects it
   * (plugins/sdk-runtime/gateway-and-nodes.md), so the plugin runs the current
   * CLI the way OpenClaw re-invokes itself: this Node binary and the entry in
   * argv[1] (dist/openclaw-cli-invocation). Read-only, about two seconds. */
  async function inventory(api) {
    return pluginList(
      await api.runtime.system.runCommandWithTimeout(
        [process.execPath, process.argv[1], "plugins", "list", "--json"],
        60_000,
      ),
    );
  }

  return definePluginEntry({
    id: "sysmlv2-export",
    name: "OpenClaw SysML v2 Export",
    description:
      "Export an OpenClaw instance as SysML v2 for Assembly, with optional inferred procedures and a version viewer.",
    register(api) {
      // The export discloses the whole instance: owner only on chat surfaces,
      // operator.admin for gateway clients (plugin-command-execution enforces it).
      api.registerCommand({
        name: "sysmlv2_export",
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
            await inventory(api),
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
            name: "sysmlv2_export",
            label: "SysML v2 export",
            description:
              "Export this OpenClaw instance (agents, tool grants, plugins, sandboxes, channels, cron, skills) to SysML v2 for Assembly. Returns where the files and the version viewer are. Does not call a model.",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            async execute() {
              const { stateDir, outDir } = paths(api);
              const summary = shown(
                await runExport(
                  stateDir,
                  await inventory(api),
                  outDir,
                  null,
                  new Date(),
                ),
                stateDir,
              );
              return {
                content: [{ type: "text", text: summarize(summary) }],
                details: summary,
              };
            },
          }),
        { name: "sysmlv2_export", optional: true },
      );

      api.registerCli(({ program }) => {
        program.command("sysmlv2-toolkit")
          .description(
            "Verify the SysML WebAssembly Toolkit bundled with the plugin",
          )
          .command("status")
          .description("Verify the bundled Toolkit files against their pins")
          .action(async () => {
            try {
              const result = await toolkitStatus();
              process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            } catch (error) {
              if (typeof error?.toJSON !== "function") throw error;
              process.stdout.write(
                `${JSON.stringify(error.toJSON(), null, 2)}\n`,
              );
              process.exitCode = 1;
            }
          });
        program.command("sysmlv2-export")
          .description("Export this instance to SysML v2 for Assembly")
          .option(
            "--infer",
            "Propose procedures and rules from agent prose, each agent with its own model (needs llm.allowAgentIdOverride)",
          )
          .option(
            "--model <provider/model>",
            "Model for --infer instead of each agent's own (needs llm.allowModelOverride)",
          )
          .option("--out <dir>", "Output directory")
          .option("--open", "Open the version viewer (index.html) when done")
          .action(async (options) => {
            const { stateDir, outDir } = paths(api);
            const summary = await runExport(
              stateDir,
              await inventory(api),
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
          name: "sysmlv2-export",
          description: "Export this instance to SysML v2 for Assembly",
          hasSubcommands: false,
        }, {
          name: "sysmlv2-toolkit",
          description:
            "Verify the SysML WebAssembly Toolkit bundled with the plugin",
          hasSubcommands: true,
        }],
      });
    },
  });
}
