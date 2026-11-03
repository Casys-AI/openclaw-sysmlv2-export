import { createViewer } from "../application/model/viewer/viewer.ts";
import { layoutView } from "../adapters/out/viewer/layout.ts";
import { changes } from "../adapters/out/viewer/changes.ts";
import { renderPage } from "../adapters/out/viewer/render.ts";
import { canonical } from "../infrastructure/canonical-json.ts";
import { parseSnapshot } from "../infrastructure/snapshot-codec.ts";
export { changes } from "../adapters/out/viewer/changes.ts";
export type {
  FileChange,
  ViewerVersion,
} from "../application/model/viewer/viewer.ts";
export const { viewerPage } = createViewer({
  layoutView,
  changes,
  canonical,
  parseSnapshot,
  renderPage,
});
