// Single-flight slot gate: acquire() resolves when a slot is free,
// release() hands the slot to the next waiter. Only one holder at a time.
//
// Pollinations' anonymous tier allows 1 concurrent request per IP; going
// over returns a "Queue full" 429. This gate serializes calls within
// a single process (Node proxy, browser tab, Worker) so we don't collide
// with ourselves. Different processes on the same NAT may still collide —
// that's what the router's backoff retry handles.

/**
 * Single-flight gate. Only one acquirer holds the slot at a time; others
 * wait in FIFO order. Bounded queue + optional per-call timeout.
 */
export class SlotGate {
  /**
   * @param {object} [options]
   * @param {number} [options.maxQueueDepth=100]    Reject new acquires beyond this.
   * @param {number} [options.defaultTimeoutMs=120000] Default timeout when caller doesn't specify.
   */
  constructor({ maxQueueDepth = 100, defaultTimeoutMs = 120000 } = {}) {
    this.maxQueueDepth = maxQueueDepth;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.waiting = [];
    this.inflight = false;
  }

  get depth() {
    return this.waiting.length + (this.inflight ? 1 : 0);
  }

  get estimatedWaitMs() {
    return this.depth * 5000;
  }

  async acquire({ timeoutMs } = {}) {
    if (!this.inflight) {
      this.inflight = true;
      return () => this.#release();
    }
    if (this.waiting.length >= this.maxQueueDepth) {
      throw new Error(
        `keylessai: queue full (${this.waiting.length} waiting). Try again later.`
      );
    }
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + (timeoutMs || this.defaultTimeoutMs);
      const entry = { resolve, reject, deadline };
      this.waiting.push(entry);
      if (timeoutMs) {
        // Do NOT unref — the pending await is expecting this timer to fire
        // and reject the promise. Unref'ing lets the event loop exit before
        // the timeout resolves, which leaves the test/caller hanging.
        setTimeout(() => {
          const idx = this.waiting.indexOf(entry);
          if (idx >= 0) {
            this.waiting.splice(idx, 1);
            reject(new Error("keylessai: queue timeout waiting for slot"));
          }
        }, timeoutMs);
      }
    }).then(() => () => this.#release());
  }

  #release() {
    const now = Date.now();
    while (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (now > next.deadline) {
        next.reject(new Error("keylessai: queue timeout waiting for slot"));
        continue;
      }
      next.resolve();
      return;
    }
    this.inflight = false;
  }
}

export const defaultSlotGate = new SlotGate();
