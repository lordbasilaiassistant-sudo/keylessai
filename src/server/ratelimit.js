/**
 * Token-bucket rate limiter keyed by client IP.
 *
 * Sized for a small local proxy: default 60 requests/minute per IP, burst of
 * 10. Prevents a runaway agent loop (or a LAN peer if the proxy is exposed
 * on 0.0.0.0) from monopolizing the single-flight slot gate.
 *
 * Limiter is in-memory; restarting the proxy resets state. Size bounded —
 * LRU-ish eviction when the map grows past MAX_TRACKED_IPS.
 *
 * @module server/ratelimit
 */

const DEFAULT_RATE = 60;       // sustained req/minute per IP
const DEFAULT_BURST = 10;      // bucket capacity
const DEFAULT_WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 1024;

export class RateLimiter {
  /**
   * @param {object} [options]
   * @param {number} [options.rate=60]       sustained req/window per IP
   * @param {number} [options.burst=10]      instantaneous burst capacity
   * @param {number} [options.windowMs=60000]
   */
  constructor({ rate = DEFAULT_RATE, burst = DEFAULT_BURST, windowMs = DEFAULT_WINDOW_MS } = {}) {
    this.rate = rate;
    this.burst = burst;
    this.windowMs = windowMs;
    this.refillPerMs = rate / windowMs;
    /** @type {Map<string, { tokens: number, lastRefill: number }>} */
    this.buckets = new Map();
  }

  _get(ip) {
    let b = this.buckets.get(ip);
    if (!b) {
      b = { tokens: this.burst, lastRefill: Date.now() };
      // Evict oldest entry if we're over capacity.
      if (this.buckets.size >= MAX_TRACKED_IPS) {
        const first = this.buckets.keys().next().value;
        if (first) this.buckets.delete(first);
      }
    }
    this.buckets.set(ip, b); // move to end for LRU
    const now = Date.now();
    const elapsed = now - b.lastRefill;
    b.tokens = Math.min(this.burst, b.tokens + elapsed * this.refillPerMs);
    b.lastRefill = now;
    return b;
  }

  /**
   * @param {string} ip
   * @returns {{ allowed: boolean, retryAfterSec: number }}
   */
  check(ip) {
    const b = this._get(ip || "unknown");
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, retryAfterSec: 0 };
    }
    const needed = 1 - b.tokens;
    const retryAfterMs = Math.ceil(needed / this.refillPerMs);
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
  }

  stats() {
    return {
      tracked: this.buckets.size,
      ratePerMin: this.rate,
      burst: this.burst,
    };
  }
}

export const defaultLimiter = new RateLimiter();

/** Resolve the client IP from a Node request. Honors X-Forwarded-For only
 * if it looks sane — default proxy is localhost so usually just socket.address. */
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length && xff.length < 200) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "unknown";
}
