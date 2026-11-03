import { createHash } from "node:crypto";

/** Hash the exact ordered native element JSON representation. */
export function artifactDigest(
  elements: readonly Record<string, unknown>[],
): string {
  const hash = createHash("sha256").update("[");
  elements.forEach((element, index) => {
    if (index) hash.update(",");
    hash.update(JSON.stringify(element));
  });
  return hash.update("]").digest("hex");
}
