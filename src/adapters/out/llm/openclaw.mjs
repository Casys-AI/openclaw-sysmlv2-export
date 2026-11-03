const PURPOSE = "sysmlv2-export.infer";

export function completeWith(llm, model, selectAgent) {
  return async (prompt, agentId) => {
    const result = await llm.complete({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: "You are a JSON-only function.",
      purpose: PURPOSE,
      ...(selectAgent ? { agentId } : {}),
      ...(model ? { model } : {}),
      execution: { mode: "isolated-agent-runtime", timeoutMs: 180_000 },
    });
    return { text: result.text, model: result.model };
  };
}
