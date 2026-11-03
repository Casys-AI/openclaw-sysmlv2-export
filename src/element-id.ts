/** Stable diagram element IDs shared by views and finding subjects.
 * Parts are preserved verbatim, including any colons in source identifiers. */
export function elementId(
  ...parts:
    | [kind: "instance"]
    | [
      kind:
        | "agent"
        | "cron"
        | "heartbeat"
        | "account"
        | "binding"
        | "channel"
        | "tool"
        | "origin"
        | "plugin"
        | "mcp",
      id: string,
    ]
    | [kind: "grant", agentId: string, tool: string]
): string {
  return parts.join(":");
}
