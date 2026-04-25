import { readWithWatchdog, combineSignalWithTimeout } from "../src/core/stream.js";

const BASE = "https://api.airforce/v1";
const FETCH_TIMEOUT_MS = 30000;
const HEARTBEAT_MS = 45000;
const DEADLINE_MS = 180000;

export const id = "airforce";
export const label = "ApiAirforce";
export const capabilities = { tools: true };

const FREE_MODELS = [
  { id: "grok-4.1-mini:free", note: "reasoning, tool-capable" },
  { id: "step-3.5-flash:free", note: "fast general" },
  { id: "gemma3-270m:free", note: "tiny" },
  { id: "roleplay:free", note: "dialogue" },
  { id: "moirai-agent", note: "agent tasks" },
  { id: "translategemma-27b", note: "translation" },
];

export async function listModels() {
  try {
    const res = await fetch(`${BASE}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const free = rows
      .filter((m) => m.id && (m.id.endsWith(":free") || m.pricepermilliontokens === 0))
      .filter((m) => (m.status || "operational") !== "outage")
      .map((m) => ({
        id: m.id,
        label: `${m.id} — ${m.status || "op"}`,
        provider: id,
      }));
    if (free.length) return free;
  } catch {
    // fall through
  }
  return FREE_MODELS.map((m) => ({
    id: m.id,
    label: `${m.id} — ${m.note}`,
    provider: id,
  }));
}

export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function stripThinkTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/, "");
}

export async function* streamChat({ model, messages, signal, tools, tool_choice, parallel_tool_calls }) {
  const { signal: fetchSignal, dispose } = combineSignalWithTimeout(signal, FETCH_TIMEOUT_MS);
  const upstreamBody = {
    model: model || "grok-4.1-mini:free",
    messages,
    stream: true,
  };
  if (Array.isArray(tools) && tools.length > 0) upstreamBody.tools = tools;
  if (tool_choice !== undefined) upstreamBody.tool_choice = tool_choice;
  if (parallel_tool_calls !== undefined) upstreamBody.parallel_tool_calls = parallel_tool_calls;

  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
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
    throw new Error(`airforce ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("airforce: no stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inThinkBlock = false;

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

      let text = typeof delta.content === "string" ? delta.content : "";
      if (!text) {
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length) {
          yield { type: "reasoning", text: delta.reasoning_content };
        }
        continue;
      }

      // Strip airforce's <think>...</think> blocks inline across chunks.
      let out = "";
      for (let i = 0; i < text.length; i++) {
        if (!inThinkBlock && text.slice(i, i + 7) === "<think>") {
          inThinkBlock = true;
          i += 6;
          continue;
        }
        if (inThinkBlock && text.slice(i, i + 8) === "</think>") {
          inThinkBlock = false;
          i += 7;
          continue;
        }
        if (!inThinkBlock) out += text[i];
      }

      if (out) yield { type: "content", text: out };
    }
  }
}
