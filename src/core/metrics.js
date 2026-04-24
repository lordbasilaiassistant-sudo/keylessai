/**
 * Rolling per-provider metrics: success/fail counts + time-to-first-byte
 * latency (p50/p95 over the last N requests).
 *
 * Not a full observability stack — just enough for operators to see "which
 * provider has been flaking" and "which provider is slowest today" via
 * /health.
 *
 * @module core/metrics
 */

const DEFAULT_WINDOW = 100;

export class ProviderMetrics {
  /**
   * @param {object} [options]
   * @param {number} [options.window=100] How many recent samples to keep per provider.
   */
  constructor({ window = DEFAULT_WINDOW } = {}) {
    this.window = window;
    /** @type {Record<string, { ok:number, fail:number, ttfbMs:number[] }>} */
    this.state = Object.create(null);
  }

  _get(id) {
    if (!this.state[id]) {
      this.state[id] = { ok: 0, fail: 0, ttfbMs: [] };
    }
    return this.state[id];
  }

  /** Record a successful request with TTFB (time to first byte) in ms. */
  recordSuccess(id, ttfbMs) {
    const s = this._get(id);
    s.ok++;
    s.ttfbMs.push(ttfbMs);
    if (s.ttfbMs.length > this.window) s.ttfbMs.shift();
  }

  /** Record a failed request. */
  recordFailure(id) {
    this._get(id).fail++;
  }

  /**
   * Score a provider for adaptive routing. Higher = better.
   *
   * Combines success rate (weighted heavily) and inverse TTFB. A provider
   * with no samples gets a neutral score so it's not starved out when we've
   * never tried it.
   *
   * @param {string} id
   * @returns {number} score in roughly [0, 100]
   */
  score(id) {
    const s = this.state[id];
    if (!s || s.ok + s.fail === 0) return 50; // neutral prior
    const total = s.ok + s.fail;
    const successRate = s.ok / total;
    // Don't starve a brand-new provider after one bad sample — require 5+
    // samples before we trust the score fully.
    const confidence = Math.min(1, total / 5);
    const prior = 0.5;
    const smoothed = prior * (1 - confidence) + successRate * confidence;

    // Latency component: 2000ms TTFB = penalty 0.5, 500ms = 0.0
    const samples = s.ttfbMs;
    const avgTtfb = samples.length
      ? samples.reduce((a, b) => a + b, 0) / samples.length
      : 1000;
    const latencyPenalty = Math.min(0.5, Math.max(0, (avgTtfb - 500) / 3000));

    return Math.round((smoothed - latencyPenalty) * 100);
  }

  /**
   * Return provider ids sorted by score (best first).
   * @param {string[]} ids
   * @returns {string[]}
   */
  rank(ids) {
    return [...ids].sort((a, b) => this.score(b) - this.score(a));
  }

  /**
   * Snapshot. Returns per-provider counts + latency percentiles over the
   * last `window` successful requests.
   */
  stats() {
    const out = {};
    for (const [id, s] of Object.entries(this.state)) {
      const total = s.ok + s.fail;
      const samples = [...s.ttfbMs].sort((a, b) => a - b);
      const p = (pct) => samples.length
        ? samples[Math.min(samples.length - 1, Math.floor(samples.length * pct))]
        : null;
      out[id] = {
        ok: s.ok,
        fail: s.fail,
        successRate: total ? s.ok / total : null,
        ttfbP50Ms: p(0.5),
        ttfbP95Ms: p(0.95),
        samples: samples.length,
        score: this.score(id),
      };
    }
    return out;
  }
}

export const defaultMetrics = new ProviderMetrics();
