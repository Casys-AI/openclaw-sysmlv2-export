import { ExportError, isRecord } from "../domain/primitives/error.ts";
export { ExportError, invalid, isRecord } from "../domain/primitives/error.ts";
/** Keep diagnostic reasons, never parser input or local filesystem locations. */
function diagnosticText(text: string): string {
  let clean = text.replace(/"[^"\n]*\n[^"]*"|'[^'\n]*\n[^']*'/g, "[data]")
    .replace(/(["'`])(?:file:\/\/|[A-Za-z]:[\\/]|\\\\|\/).*?\1/g, "[path]");
  clean = clean.split(/\r?\n/, 1)[0]
    .replace(/(?:<[^>]+>|_:\S+)\s+<[^>]+>\s+.*$/, "[graph data]");
  if (/parse|syntax|error at|expected/i.test(clean)) {
    clean = clean.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "[data]");
  }
  return clean
    .replace(/file:\/\/[^\s"'<>]+/gi, "[path]")
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]+/g, "[path]")
    .replace(/(^|[\s("'`=:])\/(?:[^/\s"'<>]+\/)*[^/\s"'<>]*/g, "$1[path]")
    .replace(/\s+/g, " ").trim();
}

function diagnosticContext(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return diagnosticText(value);
  if (depth === 4) return "[context omitted]";
  if (Array.isArray(value)) {
    return value.map((entry) => diagnosticContext(entry, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        diagnosticText(key),
        diagnosticContext(entry, depth + 1),
      ]),
    );
  }
  return value;
}

/** The single serialization boundary shared by APE stages and worker errors. */
export function recordDiagnosticError(error: unknown): {
  code?: string;
  context?: string | Record<string, unknown>;
  message: string;
} {
  const record = isRecord(error) ? error : {};
  const context = typeof record.context === "string" || isRecord(record.context)
    ? diagnosticContext(record.context) as string | Record<string, unknown>
    : undefined;
  return {
    ...(typeof record.code === "string"
      ? { code: diagnosticText(record.code) }
      : {}),
    ...(context !== undefined ? { context } : {}),
    message: diagnosticText(
      typeof record.message === "string" ? record.message : String(error),
    ),
  };
}

export function ioError(code: string, context: string): ExportError {
  return new ExportError(
    code,
    context,
    "Check input existence, format and read permissions; no input was modified.",
  );
}
