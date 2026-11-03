/** Regular files of verified pinned ustar archives (runtime Toolkit and test
 * oracle). Callers check the archive hash first; returned paths are map keys,
 * never filesystem write destinations. */
export function readToolkitTar(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const text = (from: number, to: number) =>
    new TextDecoder().decode(bytes.subarray(from, to)).split("\0")[0];
  let offset = 0;
  while (offset + 512 <= bytes.length && bytes[offset] !== 0) {
    const prefix = text(offset + 345, offset + 500);
    const name = (prefix ? `${prefix}/` : "") + text(offset, offset + 100);
    const size = parseInt(text(offset + 124, offset + 136).trim(), 8);
    const start = offset + 512, type = bytes[offset + 156];
    if (type === 0 || type === 48) {
      files.set(name, bytes.slice(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}
