import type {
  FileChange,
  Scene,
} from "../../../../../domain/model/presentation.ts";
import type { Snapshot } from "../../../../../domain/model/snapshot.ts";
import type { DiagramView } from "../../../../../domain/model/views.ts";

export interface ViewerPresentation {
  /** `tableRows`: the rows of the table the page shows under the diagram (0
   * for none), which leave the diagram a wider canvas. */
  layoutView(view: DiagramView, tableRows: number): Promise<Scene>;
  changes(
    older: Record<string, string>,
    newer: Record<string, string>,
  ): FileChange[];
  canonical(value: unknown): string;
  parseSnapshot(value: unknown): Snapshot;
  renderPage(data: unknown): string;
}
