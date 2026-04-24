/**
 * Per-provider circuit breaker. Tracks consecutive failures and opens the
 * circuit for a cool-off period when a provider is unambiguously broken.
 * The router calls `isOpen()` before trying a provider and skips it while
 * the circuit is open. On success, failure count resets.
 *
 * @module core/circuit
 */

const DEFAULT_THRESHOLD = 5;        // consecutive failures to open the circuit
const DEFAULT_COOLDOWN_MS = 30_000; // wait this long before trying again

export class CircuitBreaker {
  /**
   * @param {object} [options]
   * @param {number} [options.threshold=5]      Consecutive failures before opening.
   * @param {number} [options.cooldownMs=30000] Time to wait before the circuit half-opens.
   */
  constructor({ threshold = DEFAULT_THRESHOLD, cooldownMs = DEFAULT_COOLDOWN_MS } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    /** @type {Record<string, { fails: number, openedAt: number|null }>} */
    this.state = Object.create(null);
  }

  _get(id) {
    if (!this.state[id]) this.state[id] = { fails: 0, openedAt: null };
    return this.state[id];
  }

  /** @returns {boolean} true if the circuit is currently open (skip this provider). */
  isOpen(id) {
    const s = this._get(id);
    if (s.openedAt === null) return false;
    if (Date.now() - s.openedAt >= this.cooldownMs) {
      // Half-open: allow one probe through.
      s.openedAt = null;
      s.fails = 0;
      return false;
    }
    return true;
  }

  /** Record a success — resets failure count. */
  succeed(id) {
    const s = this._get(id);
    s.fails = 0;
    s.openedAt = null;
  }

  /** Record a failure — may open the circuit. */
  fail(id) {
    const s = this._get(id);
    s.fails++;
    if (s.fails >= this.threshold) {
      s.openedAt = Date.now();
    }
  }

  /** Observability: current snapshot. */
  stats() {
    const out = {};
    for (const [id, s] of Object.entries(this.state)) {
      out[id] = {
        fails: s.fails,
        open: s.openedAt !== null,
        openedMsAgo: s.openedAt ? Date.now() - s.openedAt : null,
      };
    }
    return out;
  }
}

export const defaultBreaker = new CircuitBreaker();
