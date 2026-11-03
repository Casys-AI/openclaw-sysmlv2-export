import { obj } from "./input.ts";

// OpenClaw 2026.10.9 docs/reference/secretref-credential-surface.md and
// dist/target-registry-query-BxzYFe4n.mjs: these four credential surfaces
// accept SecretInput. hooks.token and skill/sandbox env strings do not.
const surfaces = [
  ["channels", "discord", "accounts", "*", "token"],
  ["channels", "telegram", "accounts", "*", "botToken"],
  ["gateway", "auth", "token"],
  ["models", "providers", "*", "apiKey"],
];

/** JSON Pointer keeps arbitrary account/provider identifiers unambiguous. */
function pointer(parts: string[]): string {
  return "/" + parts.map((p) => p.replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/");
}
export function credentialPathParts(path: string): string[] {
  return path.slice(1).split("/").map((p) =>
    p.replaceAll("~1", "/").replaceAll("~0", "~")
  );
}
export function isCredentialPath(path: string): boolean {
  const parts = credentialPathParts(path);
  return pointer(parts) === path &&
    surfaces.some((surface) =>
      surface.length === parts.length &&
      surface.every((p, i) => p === "*" || p === parts[i])
    );
}

// dist/model-auth-markers-BKfhEhYJ.mjs, isNonSecretApiKeyMarker.
// dist/provider-env-vars-B-QpGHAE.mjs, listKnownProviderAuthEnvVarNamesCore,
// plus dist/extensions/*/openclaw.plugin.json setup.providers[].envVars,
// providerUsageAuthEnvVars and nonSecretAuthMarkers (pinned bundled metadata).
const modelAuthMarkers = new Set([
  "ANTHROPIC_ADMIN_API_KEY",
  "ANTHROPIC_ADMIN_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_OAUTH_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_PROFILE",
  "AZURE_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_SPEECH_API_KEY",
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_REGION",
  "CEREBRAS_API_KEY",
  "CLAWROUTER_API_KEY",
  "CODEX_API_KEY",
  "COPILOT_GITHUB_TOKEN",
  "DASHSCOPE_API_KEY",
  "DEEPGRAM_API_KEY",
  "DEEPSEEK_API_KEY",
  "ELEVENLABS_API_KEY",
  "FAL_API_KEY",
  "FAL_KEY",
  "FIREWORKS_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_CLOUD_API_KEY",
  "HF_TOKEN",
  "HUGGINGFACE_HUB_TOKEN",
  "KIE_API_KEY",
  "LITELLM_API_KEY",
  "LM_API_TOKEN",
  "MINIMAX_API_KEY",
  "MINIMAX_CODE_PLAN_KEY",
  "MINIMAX_CODING_API_KEY",
  "MINIMAX_OAUTH_TOKEN",
  "MODELSTUDIO_API_KEY",
  "NOVITA_API_KEY",
  "NVIDIA_API_KEY",
  "OLLAMA_API_KEY",
  "OPENAI_ADMIN_KEY",
  "OPENAI_API_KEY",
  "OPENCODE_API_KEY",
  "OPENCODE_ZEN_API_KEY",
  "OPENROUTER_API_KEY",
  "PERPLEXITY_API_KEY",
  "QWEN_API_KEY",
  "RUNWAYML_API_SECRET",
  "RUNWAY_API_KEY",
  "SENSEAUDIO_API_KEY",
  "SGLANG_API_KEY",
  "SPEECH_KEY",
  "SPEECH_REGION",
  "TOGETHER_API_KEY",
  "VLLM_API_KEY",
  "VOYAGE_API_KEY",
  "XAI_API_KEY",
  "XI_API_KEY",
  "apple-fm-local",
  "codex-app-server",
  "custom-local",
  "gcp-vertex-credentials",
  "lmstudio-local",
  "minimax-oauth",
  "ollama-local",
  "openclaw:claude-cli-native-auth",
  "secretref-managed",
]);

/** Extract paths before redaction; no credential value leaves this function. */
export function plaintextCredentialPaths(raw: unknown): string[] {
  const paths: string[] = [];
  const visit = (value: unknown, surface: string[], parts: string[]): void => {
    if (surface.length) {
      const [key, ...rest] = surface;
      const entries = key === "*"
        ? Object.entries(obj(value))
        : [[key, obj(value)[key]]] as [string, unknown][];
      for (const [name, child] of entries) visit(child, rest, [...parts, name]);
      return;
    }
    // dist/types.secrets-DD-Q2SS_.mjs, parseEnvTemplateSecretRef:
    // authored $NAME / ${NAME} are references; structured refs are not strings.
    // dist/config-secret-target-DS4jAbAd.mjs, classifyConfigSecretTarget:
    // whitespace and provider auth markers are not plaintext credentials.
    const text = typeof value === "string" ? value.trim() : "";
    const reference = /^\$(?:[A-Z][A-Z0-9_]{0,127}|\{[A-Z][A-Z0-9_]{0,127}\})$/;
    const marker = parts[0] === "models" &&
      (modelAuthMarkers.has(text) || /^(?:oauth:|secretref-env:)/.test(text));
    if (text && !reference.test(text) && !marker) paths.push(pointer(parts));
  };
  for (const surface of surfaces) visit(raw, surface, []);
  return paths.sort();
}
