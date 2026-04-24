import { test } from "node:test";
import { strict as assert } from "node:assert";
import { RateLimiter } from "../src/server/ratelimit.js";

test("allows bursts up to capacity", () => {
  const rl = new RateLimiter({ rate: 60, burst: 5, windowMs: 60_000 });
  for (let i = 0; i < 5; i++) {
    assert.equal(rl.check("1.2.3.4").allowed, true, `req ${i} should pass`);
  }
  assert.equal(rl.check("1.2.3.4").allowed, false, "6th should be throttled");
});

test("retryAfter scales with deficit", () => {
  const rl = new RateLimiter({ rate: 60, burst: 2, windowMs: 60_000 });
  rl.check("x"); rl.check("x");
  const v = rl.check("x");
  assert.equal(v.allowed, false);
  assert.ok(v.retryAfterSec >= 1);
});

test("refills over time", async () => {
  const rl = new RateLimiter({ rate: 1000, burst: 1, windowMs: 1000 }); // 1k/s → ~1 token/ms
  rl.check("y");
  assert.equal(rl.check("y").allowed, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(rl.check("y").allowed, true, "should have refilled after 30ms");
});

test("independent per IP", () => {
  const rl = new RateLimiter({ rate: 60, burst: 2, windowMs: 60_000 });
  rl.check("a"); rl.check("a");
  assert.equal(rl.check("a").allowed, false);
  assert.equal(rl.check("b").allowed, true);
});

test("tracking capped at MAX_TRACKED_IPS", () => {
  const rl = new RateLimiter({ rate: 60, burst: 5 });
  // Push past the internal 1024 cap
  for (let i = 0; i < 1100; i++) {
    rl.check(`10.0.0.${i}`);
  }
  assert.ok(rl.stats().tracked <= 1024);
});
