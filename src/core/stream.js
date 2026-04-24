/**
 * Stream utilities: heartbeat watchdog + overall deadline.
 *
 * Why: providers fetch `text/event-stream` responses that can hang forever
 * if the upstream silently stops writing. Without a watchdog the caller is
 * stuck. With one, we abort the stream and the router fails over.
 *
 * @module core/stream
 */

/**
 * Reads chunks from a `ReadableStream` reader, enforcing:
 *   - an overall deadline (default 120s)
 *   - a per-chunk heartbeat (default 45s of silence → abort)
 *
 * Accepts an optional upstream `signal` that's composed with our timers.
 *
 * @param {ReadableStreamDefaultReader} reader
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]              Upstream abort signal (user cancel, etc).
 * @param {number} [options.heartbeatMs=45000]        Max gap between chunks.
 * @param {number} [options.deadlineMs=120000]        Max total stream duration.
 * @returns {AsyncGenerator<Uint8Array>}
 */
export async function* readWithWatchdog(reader, options = {}) {
  const {
    signal,
    heartbeatMs = 45000,
    deadlineMs = 120000,
  } = options;

  const startedAt = Date.now();
  let heartbeatTimer = null;

  const aborted = () => {
    try { reader.cancel().catch(() => {}); } catch {}
  };
  if (signal) {
    if (signal.aborted) {
      throw new Error("aborted by caller");
    }
    signal.addEventListener("abort", aborted, { once: true });
  }

  try {
    while (true) {
      if (Date.now() - startedAt > deadlineMs) {
        throw new Error(`stream deadline exceeded (${deadlineMs}ms)`);
      }

      let resolveBeat;
      const beatPromise = new Promise((resolve, reject) => {
        resolveBeat = resolve;
        heartbeatTimer = setTimeout(
          () => reject(new Error(`stream heartbeat timeout (${heartbeatMs}ms)`)),
          heartbeatMs
        );
      });

      let chunk;
      try {
        chunk = await Promise.race([reader.read(), beatPromise]);
      } finally {
        if (heartbeatTimer) {
          clearTimeout(heartbeatTimer);
          heartbeatTimer = null;
        }
      }

      if (chunk.done) return;
      yield chunk.value;
    }
  } finally {
    if (signal) signal.removeEventListener("abort", aborted);
  }
}

/**
 * Compose an AbortController that fires when any of the given signals fire
 * or when the timeout elapses.
 *
 * @param {AbortSignal|undefined} upstream
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, dispose: () => void }}
 */
export function combineSignalWithTimeout(upstream, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  const onUpstream = () => ac.abort(upstream?.reason || new Error("upstream aborted"));
  if (upstream) {
    if (upstream.aborted) {
      ac.abort(upstream.reason);
    } else {
      upstream.addEventListener("abort", onUpstream, { once: true });
    }
  }
  return {
    signal: ac.signal,
    dispose() {
      clearTimeout(t);
      if (upstream) upstream.removeEventListener("abort", onUpstream);
    },
  };
}
