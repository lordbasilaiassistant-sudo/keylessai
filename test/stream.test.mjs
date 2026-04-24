import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  readWithWatchdog,
  combineSignalWithTimeout,
} from "../src/core/stream.js";

// Minimal ReadableStreamDefaultReader stub whose `read()` is fully controllable.
function makeReader({ chunks, chunkDelayMs = 0, hangAfter = -1 }) {
  let i = 0;
  let cancelled = false;
  return {
    async read() {
      if (cancelled) return { done: true };
      if (i === hangAfter) return new Promise(() => {}); // never resolves
      await new Promise((r) => setTimeout(r, chunkDelayMs));
      if (i >= chunks.length) return { done: true };
      return { done: false, value: chunks[i++] };
    },
    async cancel() {
      cancelled = true;
    },
  };
}

test("reads every chunk from a fast reader", async () => {
  const reader = makeReader({
    chunks: [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])],
    chunkDelayMs: 1,
  });
  const collected = [];
  for await (const v of readWithWatchdog(reader, { heartbeatMs: 1000, deadlineMs: 5000 })) {
    collected.push(v[0]);
  }
  assert.deepEqual(collected, [1, 2, 3]);
});

test("heartbeat timeout fires when reader hangs", async () => {
  const reader = makeReader({ chunks: [new Uint8Array([9])], hangAfter: 1 });
  const t0 = Date.now();
  let err;
  try {
    for await (const _ of readWithWatchdog(reader, { heartbeatMs: 40, deadlineMs: 5000 })) {
      // consume
    }
  } catch (e) {
    err = e;
  }
  assert.ok(err);
  assert.match(err.message, /heartbeat timeout/);
  // Should fire after ~40ms, not 5s
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0}ms`);
});

test("deadline fires with slow-but-steady reader", async () => {
  const chunks = Array.from({ length: 50 }, (_, i) => new Uint8Array([i]));
  const reader = makeReader({ chunks, chunkDelayMs: 10 });
  let err;
  try {
    for await (const _ of readWithWatchdog(reader, { heartbeatMs: 1000, deadlineMs: 60 })) {
      // consume
    }
  } catch (e) {
    err = e;
  }
  assert.ok(err);
  assert.match(err.message, /deadline/);
});

test("caller abort cancels the reader", async () => {
  const reader = makeReader({ chunks: [new Uint8Array([1])], hangAfter: 1 });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 30);
  let err;
  try {
    for await (const _ of readWithWatchdog(reader, {
      signal: ac.signal,
      heartbeatMs: 500,
      deadlineMs: 5000,
    })) {
      // consume
    }
  } catch (e) {
    err = e;
  }
  assert.ok(err);
});

test("combineSignalWithTimeout aborts on timer", async () => {
  const { signal, dispose } = combineSignalWithTimeout(undefined, 20);
  const result = await new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve("aborted"));
    setTimeout(() => resolve("timeout"), 100);
  });
  assert.equal(result, "aborted");
  dispose();
});

test("combineSignalWithTimeout aborts on upstream signal", async () => {
  const up = new AbortController();
  const { signal, dispose } = combineSignalWithTimeout(up.signal, 5000);
  setTimeout(() => up.abort(), 10);
  const result = await new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve("aborted"));
    setTimeout(() => resolve("timeout"), 200);
  });
  assert.equal(result, "aborted");
  dispose();
});
