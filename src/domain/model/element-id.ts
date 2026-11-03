/** Stable diagram element IDs shared by views and finding subjects.
 * Parts are preserved verbatim, including any colons in source identifiers. */
export function elementId(
  ...parts:
    | [kind: "instance" | "hooks" | "messaging"]
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
        | "mcp"
        | "hook"
        | "capability",
      id: string,
    ]
    | [kind: "grant" | "delegation", from: string, to: string]
): string {
  return parts.join(":");
}
