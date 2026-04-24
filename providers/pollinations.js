const BASE = "https://text.pollinations.ai";

export const id = "pollinations";
export const label = "Pollinations";

export async function listModels() {
  try {
    const res = await fetch(`${BASE}/models`, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data
      .filter((m) => (m.tier || "anonymous") === "anonymous")
      .filter((m) => (m.output_modalities || ["text"]).includes("text"))
      .map((m) => ({
        id: m.name,
        label: `${m.name} — ${m.description || ""}`.slice(0, 80),
        provider: id,
      }));
  } catch (e) {
    return [
      { id: "openai-fast", label: "openai-fast — GPT-OSS 20B", provider: id },
    ];
  }
}

export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function* streamChat({ model, messages, signal }) {
  const res = await fetch(`${BASE}/openai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "openai-fast",
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`pollinations ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("pollinations: no stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content.length) {
        yield { type: "content", text: delta.content };
      }
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length) {
        yield { type: "reasoning", text: delta.reasoning_content };
      }
    }
  }
}
