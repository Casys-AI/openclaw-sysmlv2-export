/** The runtime's own error, short and with anything token-like masked. */
export function modelError(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const name = typeof code === "string" ? code : (e as Error)?.name ?? "Error";
  const message = String((e as Error)?.message ?? "").slice(0, 160)
    .replace(/CANARY-[A-Za-z0-9_-]+|[A-Za-z0-9_\-]{24,}/g, "[redacted]");
  return message ? `${name}: ${message}` : name;
}
