// Tiny LRU + TTL cache for deterministic prompt results.
// Keyed on (model + messages) so identical calls during retry loops, agent
// iteration, or test runs don't hammer the upstream provider.
//
// Intentionally excludes streaming state — we cache the final assembled
// content only; streaming callers get it replayed as a single chunk.

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX = 128;

/**
 * LRU + TTL cache for identical `(model, messages)` requests. Used by the
 * proxy to avoid hammering rate-limited upstream providers during retry loops.
 */
export class PromptCache {
  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs=300000] Entry lifetime (ms).
   * @param {number} [options.max=128]      Max entries before LRU eviction.
   */
  constructor({ ttlMs = DEFAULT_TTL_MS, max = DEFAULT_MAX } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  keyFor({ model, messages }) {
    return JSON.stringify({
      m: model || "",
      msgs: (messages || []).map((m) => ({ r: m.role, c: m.content })),
    });
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expires < Date.now()) {
      this.map.delete(key);
      this.misses++;
      return null;
    }
    // LRU refresh
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.value;
  }

  put(key, value) {
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
    }
  }

  stats() {
    return {
      size: this.map.size,
      max: this.max,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses ? this.hits / (this.hits + this.misses) : 0,
    };
  }

  clear() {
    this.map.clear();
  }
}

export const defaultCache = new PromptCache();
