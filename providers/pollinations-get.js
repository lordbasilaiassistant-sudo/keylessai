const BASE = "https://text.pollinations.ai";

export const id = "pollinations-get";
export const label = "Pollinations (GET)";
export const capabilities = { tools: false };

export async function listModels() {
  return [
    { id: "openai-fast", label: "openai-fast — simple GET transport", provider: id },
  ];
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

function messagesToPrompt(messages) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return (system ? `System: ${system}\n` : "") + turns + "\nAssistant:";
}

export async function* streamChat({ model, messages, signal }) {
  const prompt = messagesToPrompt(messages);
  const url = `${BASE}/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model || "openai-fast")}`;
  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) {
    throw new Error(`pollinations-get ${res.status}`);
  }
  const text = await res.text();
  yield { type: "content", text };
}
