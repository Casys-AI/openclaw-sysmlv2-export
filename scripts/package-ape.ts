/** Copy runtime assets verbatim; this build step never downloads dependencies. */
const plugin = new URL("../plugin/", import.meta.url);
const wasm = new URL("web_bg.wasm", import.meta.resolve("oxigraph/web"));
await Deno.copyFile(wasm, new URL("oxigraph_bg.wasm", plugin));

const source = new URL("../rules/ape/", import.meta.url);
const target = new URL("rules/ape/", plugin);
async function queries(directory: URL, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isDirectory) {
      paths.push(
        ...await queries(
          new URL(`${entry.name}/`, directory),
          `${prefix}${entry.name}/`,
        ),
      );
    } else if (entry.isFile && entry.name.endsWith(".rq")) {
      paths.push(`${prefix}${entry.name}`);
    }
  }
  return paths;
}
const rules = await queries(source);
if (rules.length === 0) throw new Error("No APE rule queries to package");
try {
  await Deno.remove(target, { recursive: true });
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
await Deno.mkdir(target, { recursive: true });
for (const name of rules.sort()) {
  const destination = new URL(name, target);
  await Deno.mkdir(new URL(".", destination), { recursive: true });
  await Deno.copyFile(new URL(name, source), destination);
}
console.log(`Packaged Oxigraph WASM and ${rules.length} APE queries`);
