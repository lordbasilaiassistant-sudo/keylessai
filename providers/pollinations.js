import { readWithWatchdog, combineSignalWithTimeout } from "../src/core/stream.js";

const BASE = "https://text.pollinations.ai";
const FETCH_TIMEOUT_MS = 30000;
const HEARTBEAT_MS = 45000;
const DEADLINE_MS = 180000;

export const id = "pollinations";
export const label = "Pollinations";
export const capabilities = { tools: true };

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

export async function* streamChat({ model, messages, signal, tools, tool_choice, parallel_tool_calls }) {
  // Compose: caller's abort signal + 30s initial-connection timeout.
  const { signal: fetchSignal, dispose } = combineSignalWithTimeout(signal, FETCH_TIMEOUT_MS);
  const upstreamBody = {
    model: model || "openai-fast",
    messages,
    stream: true,
  };
  if (Array.isArray(tools) && tools.length > 0) upstreamBody.tools = tools;
  if (tool_choice !== undefined) upstreamBody.tool_choice = tool_choice;
  if (parallel_tool_calls !== undefined) upstreamBody.parallel_tool_calls = parallel_tool_calls;

  let res;
  try {
    res = await fetch(`${BASE}/openai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(upstreamBody),
      signal: fetchSignal,
    });
  } finally {
    dispose();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`pollinations ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("pollinations: no stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Stream chunks guarded by heartbeat (no data for 45s → abort) + deadline (180s total).
  for await (const value of readWithWatchdog(reader, {
    signal,
    heartbeatMs: HEARTBEAT_MS,
    deadlineMs: DEADLINE_MS,
  })) {
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
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          if (!tc || typeof tc !== "object") continue;
          const out = { type: "tool_call_delta", index: typeof tc.index === "number" ? tc.index : 0 };
          if (typeof tc.id === "string") out.id = tc.id;
          const fn = tc.function;
          if (fn && typeof fn === "object") {
            if (typeof fn.name === "string") out.name = fn.name;
            if (typeof fn.arguments === "string") out.arguments = fn.arguments;
          }
          yield out;
        }
      }
    }
  }
}
