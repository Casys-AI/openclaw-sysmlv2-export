import { readToolkitTar } from "../../src/adapters/out/sysml-toolkit/tar.ts";

// Test-only OpenSysML v0.11.0 oracle. The release archives are pinned by hash.
const RELEASES: Record<string, { sha256: string; executable: string }> = {
  "darwin-aarch64": {
    sha256: "9bff5c4195062b5e2cbf9ca69360f64569d03b0b5ff1c7e91c872cdec00efceb",
    executable: "sysml-darwin-arm64",
  },
  "linux-x86_64": {
    sha256: "4a7e8f8b59fd9d839cd364b275b73a5d68a6c4ae3e5adf039c9f1d846a6b5b9d",
    executable: "sysml-linux-amd64",
  },
};

/** Convert test sources with the pinned native oracle; no runtime dependency. */
export async function compileOpenSysml(
  sources: Map<string, string>,
  archive: string,
): Promise<string> {
  const release = RELEASES[`${Deno.build.os}-${Deno.build.arch}`];
  if (!release) throw new Error("Unsupported OpenSysML oracle platform");
  const compressed = await Deno.readFile(archive);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", compressed)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== release.sha256) {
    throw new Error("OpenSysML archive SHA256 mismatch");
  }
  const tar = new Uint8Array(
    await new Response(
      new Blob([compressed]).stream().pipeThrough(
        new DecompressionStream("gzip"),
      ),
    ).arrayBuffer(),
  );
  const executable = readToolkitTar(tar).get(release.executable);
  const decoder = new TextDecoder();
  if (!executable) throw new Error("OpenSysML executable missing from archive");
  const dir = await Deno.makeTempDir({ prefix: "opensysml-test-" });
  try {
    const binary = `${dir}/sysml`;
    await Deno.writeFile(binary, executable, { mode: 0o700 });
    const paths: string[] = [];
    for (const [name, contents] of sources) {
      const path = `${dir}/${name}`;
      await Deno.writeTextFile(path, contents);
      paths.push(path);
    }
    const output = `${dir}/model.ttl`;
    const result = await new Deno.Command(binary, {
      args: ["-no-record-cache", "-convert", "ttl", "-o", output, ...paths],
      cwd: dir,
      clearEnv: true,
      env: { XDG_CACHE_HOME: dir, TMPDIR: dir },
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!result.success) {
      throw new Error(
        `OpenSysML exited ${result.code}: ${decoder.decode(result.stderr)}`,
      );
    }
    return await Deno.readTextFile(output);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
