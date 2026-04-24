/**
 * Provider orchestration: health checks, failover, notice/ad detection,
 * retry-with-backoff, and client-side serialization through the slot gate.
 *
 * @module core/router
 */

import * as pollinations from "../../providers/pollinations.js";
import * as pollinationsGet from "../../providers/pollinations-get.js";
import * as airforce from "../../providers/airforce.js";
import { defaultSlotGate } from "./queue.js";
import { looksLikeNotice } from "./notices.js";
import { defaultBreaker } from "./circuit.js";
import { defaultMetrics } from "./metrics.js";

export const breaker = defaultBreaker;
export const metrics = defaultMetrics;

/** Registry of all installed providers, keyed by their `id`. */
export const PROVIDERS = {
  [pollinations.id]: pollinations,
  [pollinationsGet.id]: pollinationsGet,
  [airforce.id]: airforce,
};

/** Order the router tries providers in when `provider: "auto"`. */
export const FAILOVER_ORDER = [
  pollinations.id,
  airforce.id,
  pollinationsGet.id,
];

/**
 * Shared slot gate. Every `streamChat` call acquires it before starting so
 * parallel callers serialize cleanly under Pollinations' 1-concurrent-per-IP
 * rate limit. Exposed for observability (`gate.depth`, `gate.estimatedWaitMs`).
 */
export const slotGate = defaultSlotGate;

/**
 * Lists models from every registered provider.
 *
 * @returns {Promise<Array<{provider: string, label: string, models: Array<{id: string, label: string, provider: string}>}>>}
 */
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

// Retry budgets differ by failure mode AND by routing mode:
//
//   - In `auto` (failover) mode, we want the fastest recovery possible.
//     Any failure -> instantly try next provider. No same-provider retry,
//     no delay. The retry budget is the length of FAILOVER_ORDER itself.
//
//   - In pinned mode (user picked a specific provider), we respect the pin
//     and do modest same-provider retries for transient errors. Notices
//     still bail fast (they rarely clear within seconds).
const MAX_NOTICE_RETRIES = 2;      // 1 retry for notice, then bail (pinned only)
const MAX_TRANSIENT_RETRIES = 3;   // for 429/5xx/network hiccups (pinned only)
const NOTICE_RETRY_DELAY_MS = 100; // effectively "immediate"

async function* tryOne({ providerId, model, messages, signal, onStatus, failFast = false }) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error(`unknown provider: ${providerId}`);

  let attempt = 0;
  let lastErr;

  while (true) {
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

    if (signal?.aborted) throw new Error("aborted");

    // failFast mode (auto routing): never retry same provider. The router's
    // outer loop will move to the next provider in the pool immediately.
    if (failFast) {
      if (erroredInStream) throw erroredInStream;
      throw new Error(`${providerId}: notice/ad`);
    }

    if (erroredInStream) {
      const msg = String(erroredInStream.message || erroredInStream);
      const retryable =
        /429|queue full|timeout|502|503|504|network|fetch failed|heartbeat|deadline/i.test(msg);
      lastErr = erroredInStream;
      if (!retryable) throw erroredInStream;
      if (attempt >= MAX_TRANSIENT_RETRIES) {
        throw new Error(`${providerId}: transient failures exhausted (${msg})`);
      }
      // Real backoff for transient — let rate limits / upstream blips clear.
      const backoff = 400 * attempt + Math.random() * 300;
      if (onStatus) onStatus(`retrying in ${Math.round(backoff)}ms…`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    // Notice case (pinned mode only): short delay, tight retry budget.
    if (attempt >= MAX_NOTICE_RETRIES) {
      throw lastErr || new Error(`${providerId}: persistent notice/ad`);
    }
    await new Promise((r) => setTimeout(r, NOTICE_RETRY_DELAY_MS));
  }
}

/**
 * Streams a chat completion through the provider pool with failover, retry,
 * and notice/ad detection. Yields chunks: `{type:"content",text:string}` for
 * regular tokens, `{type:"reasoning",text:string}` for thinking tokens.
 *
 * @param {object} options
 * @param {string} [options.provider="auto"]      Provider id, or "auto" for failover across FAILOVER_ORDER.
 * @param {string} [options.model]                Provider-specific model id. If omitted, provider picks its default.
 * @param {Array<{role:string,content:string}>} options.messages
 * @param {AbortSignal} [options.signal]          Abort the stream.
 * @param {(msg:string)=>void} [options.onStatus] Fires on each internal state change (queued, retrying, via X, etc.).
 * @param {(id:string)=>void} [options.onProviderChange] Fires with the active provider id whenever it changes.
 * @returns {AsyncGenerator<{type:"content"|"reasoning",text:string}>}
 */
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

    // Auto mode: hit providers in FAILOVER_ORDER, no health checks (saves
    // a /models round-trip per provider), no same-provider retries (failFast),
    // no delay between providers. First provider that streams actual content
    // wins; any failure -> immediate jump to the next.
    // Circuit breaker skips providers that have failed 5+ times in a row
    // for 30 seconds.
    let lastErr;
    for (const id of FAILOVER_ORDER) {
      const p = PROVIDERS[id];
      if (breaker.isOpen(id)) {
        if (onStatus) onStatus(`${p.label} circuit open — skipping`);
        lastErr = new Error(`${id}: circuit open`);
        continue;
      }
      const startedAt = Date.now();
      let ttfbMs = null;
      try {
        if (onProviderChange) onProviderChange(id);
        if (onStatus) onStatus(`via ${p.label}…`);
        let emitted = false;
        for await (const chunk of tryOne({
          providerId: id,
          model,
          messages,
          signal,
          onStatus,
          failFast: true,
        })) {
          if (!emitted && chunk.type === "content") {
            ttfbMs = Date.now() - startedAt;
          }
          emitted = true;
          yield chunk;
        }
        if (emitted) {
          breaker.succeed(id);
          if (ttfbMs !== null) metrics.recordSuccess(id, ttfbMs);
          return;
        }
        breaker.fail(id);
        metrics.recordFailure(id);
      } catch (e) {
        lastErr = e;
        breaker.fail(id);
        metrics.recordFailure(id);
        if (onStatus) onStatus(`${p.label} failed: ${e.message}. next provider…`);
      }
    }
    throw lastErr || new Error("all providers failed");
  } finally {
    release();
  }
}
