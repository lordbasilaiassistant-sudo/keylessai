import * as pollinations from "./providers/pollinations.js";
import * as pollinationsGet from "./providers/pollinations-get.js";
import * as webllm from "./providers/webllm.js";

export const PROVIDERS = {
  [pollinations.id]: pollinations,
  [pollinationsGet.id]: pollinationsGet,
  [webllm.id]: webllm,
};

export const FAILOVER_ORDER = [
  pollinations.id,
  pollinationsGet.id,
];

export async function listAllModels() {
  const groups = [];
  for (const key of [pollinations.id, pollinationsGet.id, webllm.id]) {
    const p = PROVIDERS[key];
    try {
      const models = await p.listModels();
      groups.push({ provider: key, label: p.label, models });
    } catch {
      groups.push({ provider: key, label: p.label, models: [] });
    }
  }
  return groups;
}

export async function* streamChat({
  provider,
  model,
  messages,
  signal,
  onStatus,
  onProviderChange,
}) {
  if (provider && provider !== "auto") {
    const p = PROVIDERS[provider];
    if (!p) throw new Error(`unknown provider: ${provider}`);
    if (onProviderChange) onProviderChange(provider);
    yield* p.streamChat({ model, messages, signal, onStatus });
    return;
  }

  let lastErr;
  for (const id of FAILOVER_ORDER) {
    const p = PROVIDERS[id];
    try {
      const healthy = await p.healthCheck();
      if (!healthy) {
        lastErr = new Error(`${id} health check failed`);
        continue;
      }
      if (onProviderChange) onProviderChange(id);
      if (onStatus) onStatus(`via ${p.label}…`);
      const pickedModel =
        id === provider || id === "pollinations" || id === "pollinations-get"
          ? model
          : undefined;
      let emitted = false;
      for await (const chunk of p.streamChat({
        model: pickedModel,
        messages,
        signal,
        onStatus,
      })) {
        emitted = true;
        yield chunk;
      }
      if (emitted) return;
    } catch (e) {
      lastErr = e;
      if (onStatus) onStatus(`${p.label} failed: ${e.message}. trying next…`);
    }
  }
  throw lastErr || new Error("all providers failed");
}
