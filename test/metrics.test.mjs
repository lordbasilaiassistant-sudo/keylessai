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

test("score: neutral prior for unseen provider", () => {
  const m = new ProviderMetrics();
  assert.equal(m.score("unknown"), 50);
});

test("score: perfect record outranks flaky one", () => {
  const m = new ProviderMetrics();
  for (let i = 0; i < 10; i++) m.recordSuccess("good", 500);
  for (let i = 0; i < 5; i++) m.recordSuccess("bad", 500);
  for (let i = 0; i < 5; i++) m.recordFailure("bad");
  assert.ok(m.score("good") > m.score("bad"), "perfect > flaky");
});

test("score: fast provider outranks slow one with same success rate", () => {
  const m = new ProviderMetrics();
  for (let i = 0; i < 10; i++) m.recordSuccess("fast", 300);
  for (let i = 0; i < 10; i++) m.recordSuccess("slow", 2500);
  assert.ok(m.score("fast") > m.score("slow"), "fast > slow");
});

test("rank: orders providers best-first", () => {
  const m = new ProviderMetrics();
  for (let i = 0; i < 10; i++) m.recordSuccess("good", 400);
  for (let i = 0; i < 10; i++) m.recordFailure("bad");
  for (let i = 0; i < 5; i++) m.recordSuccess("mid", 1500);
  const ordered = m.rank(["bad", "mid", "good"]);
  assert.equal(ordered[0], "good");
  assert.equal(ordered[2], "bad");
});

test("score: new provider with one failure isn't starved (confidence weighting)", () => {
  const m = new ProviderMetrics();
  // Established good provider
  for (let i = 0; i < 20; i++) m.recordSuccess("established", 500);
  // New provider with one bad outcome — shouldn't drop below 20
  m.recordFailure("new");
  const neu = m.score("new");
  assert.ok(neu >= 20, `new-with-1-fail got ${neu}, too starved`);
});
