import type { Agent, Snapshot } from "../model/snapshot.ts";
export const ORIGINS = ["builtin", "plugin", "mcp", "cli"] as const;
export interface Tool {
  /** Catalog key: the tool name, or `cli:<command>` for a CLI tool. */
  key: string;
  toolId: string;
  origin: typeof ORIGINS[number];
  provider: string | null;
  optional: boolean;
}
export interface Grant {
  id: string;
  tool: Tool;
  layer: string;
  commandKind: string | null;
  argsRestricted: boolean | null;
}

/** The agent's effective grants, each with the catalog tool it references:
 * policy grants, then the CLI commands reachable through each exec grant.
 * The SysML catalog and the viewer's diagrams both read them from here. */
export function grants(snapshot: Snapshot, a: Agent): Grant[] {
  const tool = (toolId: string): Tool => {
    // docs/gateway/config-tools/tool-policy.md: configured MCP tools belong to
    // bundle-mcp, named after their server; a plugin's declared name is its tool.
    const server = snapshot.mcpServers.find((s) =>
      s.enabled && toolId === `${s.toolPrefix}__*`
    );
    const plugin = server
      ? undefined
      : snapshot.plugins?.find((p) => p.enabled && p.tools.includes(toolId));
    return {
      key: toolId,
      toolId,
      origin: server ? "mcp" : plugin ? "plugin" : "builtin",
      provider: server?.id ?? plugin?.id ?? null,
      optional: plugin?.optionalTools.includes(toolId) ?? false,
    };
  };
  const result: Grant[] = a.grants.map((g) => ({
    id: g.id,
    tool: tool(g.tool),
    layer: g.layer,
    commandKind: null,
    argsRestricted: null,
  }));
  // docs/tools/exec-approvals.md, exec.security: command allowlists apply
  // only to allowlist security and cannot grant access to the exec tool.
  if (a.execution.effective.security !== "allowlist") return result;
  for (const exec of a.grants.filter((g) => g.tool === "exec")) {
    for (const c of a.execution.commands) {
      result.push({
        id: `${exec.layer}:cli:${c.id}`,
        tool: {
          key: `cli:${c.command}`,
          toolId: c.command,
          origin: "cli",
          provider: "exec",
          optional: false,
        },
        layer: exec.layer,
        commandKind: c.kind,
        argsRestricted: c.argsRestricted,
      });
    }
  }
  return result;
}
