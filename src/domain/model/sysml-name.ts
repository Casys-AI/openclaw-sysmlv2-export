export function name(prefix: string, id: string): string {
  const n = `${prefix}_${id}`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)
    ? n
    : `'${
      n.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r")
    }'`;
}
