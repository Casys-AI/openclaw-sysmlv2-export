import { main } from "./src/composition/cli.ts";
export { main, run } from "./src/composition/cli.ts";
if (import.meta.main) Deno.exitCode = await main(Deno.args);
