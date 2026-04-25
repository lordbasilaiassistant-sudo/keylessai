/**
 * KeylessAI — free OpenAI-compatible LLM endpoint with zero API keys.
 *
 * Usage (Node):
 * ```js
 * import { createProxy, streamChat } from "keylessai";
 *
 * // Option A: Run a local proxy and point OpenAI SDK at it
 * createProxy().listen(8787);
 *
 * // Option B: Call the router directly
 * for await (const chunk of streamChat({
 *   provider: "auto",
 *   messages: [{ role: "user", content: "hello" }],
 * })) {
 *   if (chunk.type === "content") process.stdout.write(chunk.text);
 * }
 * ```
 *
 * @module keylessai
 */

export { createProxy } from "./server/proxy.js";
export {
  streamChat,
  listAllModels,
  PROVIDERS,
  FAILOVER_ORDER,
  slotGate,
  breaker,
  metrics,
  registerProvider,
  unregisterProvider,
  setFailoverOrder,
  providerSupportsTools,
  ToolsUnsupportedError,
} from "./core/router.js";
export { PromptCache, defaultCache } from "./core/cache.js";
export { SlotGate, defaultSlotGate } from "./core/queue.js";
export { CircuitBreaker, defaultBreaker } from "./core/circuit.js";
export { ProviderMetrics, defaultMetrics } from "./core/metrics.js";
export { looksLikeNotice, NOTICE_PATTERNS } from "./core/notices.js";
