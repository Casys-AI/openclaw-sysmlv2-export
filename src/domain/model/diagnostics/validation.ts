import type { ApeReport } from "./ape.ts";

export interface Diagnostic {
  code: string;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
}
export interface CompileDiagnostics {
  errors: Diagnostic[];
  warnings: Diagnostic[];
}
export interface Diagnostics extends CompileDiagnostics {
  ape: ApeReport;
}
export interface ValidationSummary {
  /** `skipped` only appears in exports made before the Toolkit was bundled. */
  status: "passed" | "failed" | "skipped";
  errors: number;
  code?: string;
  recovery?: string;
}
