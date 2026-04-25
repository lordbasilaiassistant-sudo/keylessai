// Yqcloud via api.binjie.fun — the backend powering chat9.yqcloud.top.
//
// Keyless. CORS allow-* to any origin (verified 2026-04-24). Sub-2s p50
// response time. Single-model endpoint that the upstream routes behind
// the scenes; we expose it as "default".
//
// Requires the Origin header to match chat9.yqcloud.top — the server
// rejects requests without it.

import { readWithWatchdog, combineSignalWithTimeout } from "../src/core/stream.js";

const BASE = "https://api.binjie.fun";
const ORIGIN = "https://chat9.yqcloud.top";
const FETCH_TIMEOUT_MS = 30000;
const HEARTBEAT_MS = 45000;
const DEADLINE_MS = 180000;

export const id = "yqcloud";
export const label = "Yqcloud (via binjie.fun)";
export const capabilities = { tools: false };

const MODELS = [
  { id: "default", label: "default — keyless chat via Yqcloud" },
];

export async function listModels() {
  return MODELS.map((m) => ({ id: m.id, label: m.label, provider: id }));
}

export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/api/generateStream`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

// Yqcloud is a single-prompt API. Flatten the OpenAI chat messages into a
// single prompt, preserving role context.
function messagesToPrompt(messages) {
  const lines = [];
  for (const m of messages) {
    if (!m.content || typeof m.content !== "string") continue;
    if (m.role === "system") lines.push(m.content);
    else if (m.role === "user") lines.push(`User: ${m.content}`);
    else if (m.role === "assistant") lines.push(`Assistant: ${m.content}`);
  }
  return lines.join("\n\n");
}

export async function* streamChat({ messages, signal }) {
  const prompt = messagesToPrompt(messages);
  if (!prompt) throw new Error("yqcloud: empty prompt");

  const { signal: fetchSignal, dispose } = combineSignalWithTimeout(signal, FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}/api/generateStream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
      },
      body: JSON.stringify({
        prompt,
        userId: `keylessai-${Math.random().toString(36).slice(2, 10)}`,
        network: false,
        system: "",
        withoutContext: false,
        stream: true,
      }),
      signal: fetchSignal,
    });
  } finally {
    dispose();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`yqcloud ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.body) throw new Error("yqcloud: no stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // Yqcloud returns plain text chunks (not SSE). Forward each decoded
  // chunk directly.
  for await (const value of readWithWatchdog(reader, {
    signal,
    heartbeatMs: HEARTBEAT_MS,
    deadlineMs: DEADLINE_MS,
  })) {
    const text = decoder.decode(value, { stream: true });
    if (text) yield { type: "content", text };
  }
}
