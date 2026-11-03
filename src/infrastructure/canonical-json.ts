/** Stable keys; entity arrays are sorted by id at construction. Ordered model
 * fallbacks and bind modes retain their semantic order. No locale or clock. */
export function canonical(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
        : v,
    2,
  ) + "\n";
}
