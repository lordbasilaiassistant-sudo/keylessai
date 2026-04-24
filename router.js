import * as pollinations from "./providers/pollinations.js";
import * as pollinationsGet from "./providers/pollinations-get.js";
import * as airforce from "./providers/airforce.js";
import { defaultSlotGate } from "./src/queue.js";

export const PROVIDERS = {
  [pollinations.id]: pollinations,
  [pollinationsGet.id]: pollinationsGet,
  [airforce.id]: airforce,
};

export const FAILOVER_ORDER = [
  pollinations.id,
  airforce.id,
  pollinationsGet.id,
];

export const slotGate = defaultSlotGate;

const NOTICE_PATTERNS = [
  /important notice/i,
  /legacy .{0,40}api is being deprecated/i,
  /please migrate to/i,
  /enter\.pollinations\.ai/i,
  /upgrade your plan/i,
  /discord\.gg\/airforce/i,
  /\bapi\.airforce\b/i,
  /need proxies cheaper than/i,
  /op\.wtf/i,
  /remove this message at/i,
];

function looksLikeNotice(text) {
  if (!text) return false;
  const sample = text.slice(0, 600);
  const hits = NOTICE_PATTERNS.filter((re) => re.test(sample)).length;
  if (hits >= 2) return true;
  const hasAnyUrl = /https?:\/\//i.test(sample);
  const looksShortAndMostlyLinks = sample.length < 300 && hasAnyUrl && hits >= 1;
  return looksShortAndMostlyLinks;
}

export async function listAllModels() {
  const groups = [];
  for (const key of FAILOVER_ORDER) {
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

async function* tryOne({ providerId, model, messages, signal, onStatus }) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error(`unknown provider: ${providerId}`);

  const MAX_RETRIES = 3;
  let attempt = 0;
  let lastErr;

  while (attempt < MAX_RETRIES) {
    attempt++;
    let chunks = [];
    let noticed = false;
    let erroredInStream;

    try {
      for await (const chunk of p.streamChat({ model, messages, signal, onStatus })) {
        if (chunk.type !== "content") {
          yield chunk;
          continue;
        }
        chunks.push(chunk.text);

        if (!noticed && chunks.length <= 6) {
          const sofar = chunks.join("");
          if (looksLikeNotice(sofar)) {
            noticed = true;
            if (onStatus) onStatus(`provider injected a notice, retrying…`);
            break;
          }
        }

        if (!noticed) yield chunk;
      }
    } catch (e) {
      erroredInStream = e;
    }

    if (!noticed && !erroredInStream) return;

    if (erroredInStream) {
      const msg = String(erroredInStream.message || erroredInStream);
      const retryable =
        /429|queue full|timeout|502|503|504|network|fetch failed|aborted/i.test(msg);
      lastErr = erroredInStream;
      if (!retryable) throw erroredInStream;
    }

    if (signal?.aborted) throw new Error("aborted");
    const backoff = 400 * attempt + Math.random() * 300;
    if (onStatus) onStatus(`retrying in ${Math.round(backoff)}ms…`);
    await new Promise((r) => setTimeout(r, backoff));
  }

  throw lastErr || new Error(`${providerId} gave only notices/errors after ${MAX_RETRIES} tries`);
}

export async function* streamChat({
  provider,
  model,
  messages,
  signal,
  onStatus,
  onProviderChange,
}) {
  if (slotGate.depth > 0 && onStatus) {
    onStatus(`queued (${slotGate.depth} ahead, ~${Math.round(slotGate.estimatedWaitMs / 1000)}s wait)…`);
  }
  const release = await slotGate.acquire();
  try {
    if (provider && provider !== "auto") {
      if (onProviderChange) onProviderChange(provider);
      yield* tryOne({ providerId: provider, model, messages, signal, onStatus });
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
        let emitted = false;
        for await (const chunk of tryOne({
          providerId: id,
          model,
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
  } finally {
    release();
  }
}
