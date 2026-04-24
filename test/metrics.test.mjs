import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ProviderMetrics } from "../src/core/metrics.js";

test("empty metrics stats", () => {
  const m = new ProviderMetrics();
  assert.deepEqual(m.stats(), {});
});

test("records success with ttfb", () => {
  const m = new ProviderMetrics();
  m.recordSuccess("x", 100);
  m.recordSuccess("x", 200);
  const s = m.stats();
  assert.equal(s.x.ok, 2);
  assert.equal(s.x.fail, 0);
  assert.equal(s.x.successRate, 1);
  assert.ok(s.x.ttfbP50Ms >= 100 && s.x.ttfbP50Ms <= 200);
});

test("records failures + success rate", () => {
  const m = new ProviderMetrics();
  m.recordSuccess("x", 50);
  m.recordFailure("x");
  m.recordFailure("x");
  m.recordFailure("x");
  const s = m.stats();
  assert.equal(s.x.ok, 1);
  assert.equal(s.x.fail, 3);
  assert.equal(s.x.successRate, 0.25);
});

test("rolling window drops oldest samples", () => {
  const m = new ProviderMetrics({ window: 5 });
  for (let i = 0; i < 20; i++) m.recordSuccess("x", i * 10);
  const s = m.stats();
  assert.equal(s.x.samples, 5);
  // Most recent 5 were 150,160,170,180,190 — p50 should be around 170
  assert.ok(s.x.ttfbP50Ms >= 150 && s.x.ttfbP50Ms <= 190);
});

test("per-provider independence", () => {
  const m = new ProviderMetrics();
  m.recordSuccess("a", 50);
  m.recordFailure("b");
  const s = m.stats();
  assert.equal(s.a.ok, 1);
  assert.equal(s.b.fail, 1);
  assert.equal(s.a.fail, 0);
  assert.equal(s.b.ok, 0);
});

test("p95 computed correctly", () => {
  const m = new ProviderMetrics();
  for (let i = 1; i <= 100; i++) m.recordSuccess("x", i);
  const s = m.stats();
  // Values 1..100; p95 should be ~95
  assert.ok(s.x.ttfbP95Ms >= 90 && s.x.ttfbP95Ms <= 100);
});
