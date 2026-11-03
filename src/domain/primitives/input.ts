import { invalid } from "./error.ts";
export type Obj = Record<string, unknown>;
export function obj(v: unknown): Obj {
  if (v === undefined) return {};
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid();
  return v as Obj;
}
export function arr(v: unknown): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) invalid();
  return v;
}
export function text(
  v: unknown,
  fallback: string | null = null,
): string | null {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string") invalid();
  return v;
}
export function required(v: unknown): string {
  const s = text(v);
  if (s === null || s.length === 0) invalid("Missing required string");
  return s;
}
export function strings(v: unknown): string[] {
  return arr(v).map(required);
}
export function boolean(v: unknown, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") invalid();
  return v;
}
export function number(
  v: unknown,
  fallback: number | null = null,
): number | null {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) invalid();
  return v;
}
export function enumeration<T extends string>(
  v: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  if (v === undefined) return fallback;
  if (typeof v !== "string" || !choices.includes(v as T)) {
    invalid("Unsupported configuration value");
  }
  return v as T;
}
export function json(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    invalid("Malformed JSON input");
  }
}
