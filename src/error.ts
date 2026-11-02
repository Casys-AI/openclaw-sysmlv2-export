export class ExportError extends Error {
  readonly code: string;
  readonly context: string;
  readonly recovery: string;
  constructor(code: string, context: string, recovery: string) {
    super(code);
    this.name = "ExportError";
    this.code = code;
    this.context = context;
    this.recovery = recovery;
  }
  toJSON() {
    return { code: this.code, context: this.context, recovery: this.recovery };
  }
}
export function invalid(context = "Invalid input shape"): never {
  throw new ExportError(
    "INVALID_INPUT",
    context,
    "Use a valid OpenClaw 2026.6.10 or 2026.10.x input or openclaw-snapshot/5 snapshot.",
  );
}
export function ioError(code: string, context: string): ExportError {
  return new ExportError(
    code,
    context,
    "Check input existence, format and read permissions; no input was modified.",
  );
}
