import { PAGE } from "./page.ts";
import { METRICS } from "./layout.ts";

export function renderPage(data: unknown) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return PAGE.replace("__METRICS__", JSON.stringify(METRICS)).replace(
    "__DATA__",
    () => json,
  );
}
