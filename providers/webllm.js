export const id = "webllm";
export const label = "WebLLM (in-browser)";

const CDN = "https://esm.run/@mlc-ai/web-llm";

const MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama-3.2-1B (1.0 GB) — fast" },
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC", label: "Llama-3.2-3B (2.3 GB) — balanced" },
  { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5-1.5B (1.2 GB) — fast" },
  { id: "Phi-3.5-mini-instruct-q4f32_1-MLC", label: "Phi-3.5-mini (2.5 GB) — reasoning" },
  { id: "SmolLM2-1.7B-Instruct-q4f32_1-MLC", label: "SmolLM2-1.7B (1.1 GB) — tiny" },
];

let enginePromise = null;
let currentModel = null;
let webllmLib = null;

async function loadLib() {
  if (!webllmLib) {
    webllmLib = await import(/* @vite-ignore */ CDN);
  }
  return webllmLib;
}

async function getEngine(model, onProgress) {
  if (enginePromise && currentModel === model) return enginePromise;
  currentModel = model;
  const lib = await loadLib();
  enginePromise = lib.CreateMLCEngine(model, {
    initProgressCallback: (p) => {
      if (onProgress) onProgress(p?.text || "loading model…");
    },
  });
  return enginePromise;
}

export async function listModels() {
  return MODELS.map((m) => ({ id: m.id, label: m.label, provider: id }));
}

export async function healthCheck() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

export async function* streamChat({ model, messages, signal, onStatus }) {
  if (!navigator.gpu) {
    throw new Error("WebGPU not available. Try Chrome/Edge/Arc on desktop.");
  }

  const engine = await getEngine(model || MODELS[0].id, (txt) => {
    if (onStatus) onStatus(txt);
  });

  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
  });

  for await (const chunk of chunks) {
    if (signal?.aborted) break;
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (delta) yield { type: "content", text: delta };
  }
}
