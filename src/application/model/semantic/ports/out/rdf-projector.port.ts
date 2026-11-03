import type { PreparedElements } from "../../../diagnostics/ports/out/toolkit-elements.port.ts";
export interface ModelGraphStore {
  load(nquads: string): void;
  free(): void;
}
export interface RdfProjector<Store extends ModelGraphStore> {
  project(
    input: PreparedElements & { build: { artifactDigest: string } },
  ): Iterator<{ nquads: string; quadCount: number }>;
  createStore(): Promise<Store>;
}
