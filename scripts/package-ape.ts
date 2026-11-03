/** Copy runtime assets verbatim; this build step never downloads dependencies. */
const plugin = new URL("../plugin/", import.meta.url);
const wasm = new URL("web_bg.wasm", import.meta.resolve("oxigraph/web"));
await Deno.copyFile(wasm, new URL("oxigraph_bg.wasm", plugin));
const directories = ["ape", "openclaw"];
for (const directory of directories) {
  const target = new URL(`rules/${directory}/`, plugin);
  try {
    await Deno.remove(target, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}
let count = 0;
for (const directory of directories) {
  const source = new URL(`../rules/${directory}/`, import.meta.url);
  const target = new URL(`rules/${directory}/`, plugin);
  const names: string[] = [];
  for await (const entry of Deno.readDir(source)) {
    if (entry.isFile && entry.name.endsWith(".ttl")) names.push(entry.name);
  }
  if (!names.length) throw new Error(`No ${directory} shapes to package`);
  await Deno.mkdir(target, { recursive: true });
  for (const name of names.sort()) {
    await Deno.copyFile(new URL(name, source), new URL(name, target));
  }
  count += names.length;
}
console.log(`Packaged Oxigraph WASM and ${count} shapes`);
