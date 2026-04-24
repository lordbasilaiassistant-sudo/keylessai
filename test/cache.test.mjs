import { test } from "node:test";
import { strict as assert } from "node:assert";
import { PromptCache } from "../src/core/cache.js";

test("hit returns stored value", () => {
  const c = new PromptCache();
  const key = c.keyFor({ model: "openai-fast", messages: [{ role: "user", content: "hi" }] });
  c.put(key, "hello world");
  assert.equal(c.get(key), "hello world");
});

test("miss returns null", () => {
  const c = new PromptCache();
  assert.equal(c.get("nonexistent"), null);
});

test("keys depend on model and messages content", () => {
  const c = new PromptCache();
  const k1 = c.keyFor({ model: "a", messages: [{ role: "user", content: "hi" }] });
  const k2 = c.keyFor({ model: "b", messages: [{ role: "user", content: "hi" }] });
  const k3 = c.keyFor({ model: "a", messages: [{ role: "user", content: "bye" }] });
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
});

test("keys include sampling params (temperature, top_p, tools)", () => {
  const c = new PromptCache();
  const base = { model: "a", messages: [{ role: "user", content: "hi" }] };
  const deterministic = c.keyFor({ ...base, temperature: 0 });
  const creative = c.keyFor({ ...base, temperature: 0.9 });
  const withTools = c.keyFor({ ...base, tools: [{ type: "function", function: { name: "foo" } }] });
  const noTemp = c.keyFor(base);
  assert.notEqual(deterministic, creative);
  assert.notEqual(deterministic, withTools);
  assert.notEqual(noTemp, deterministic);
});

test("TTL expires entries", async () => {
  const c = new PromptCache({ ttlMs: 20 });
  c.put("k", "v");
  assert.equal(c.get("k"), "v");
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(c.get("k"), null);
});

test("LRU eviction at max capacity", () => {
  const c = new PromptCache({ max: 3 });
  c.put("a", "1");
  c.put("b", "2");
  c.put("c", "3");
  // Access 'a' to refresh it as most-recently-used
  c.get("a");
  c.put("d", "4");
  // 'b' should be evicted (oldest un-accessed)
  assert.equal(c.get("b"), null);
  assert.equal(c.get("a"), "1");
  assert.equal(c.get("c"), "3");
  assert.equal(c.get("d"), "4");
});

test("stats track hits and misses", () => {
  const c = new PromptCache();
  c.put("k", "v");
  c.get("k");        // hit
  c.get("k");        // hit
  c.get("missing");  // miss
  const s = c.stats();
  assert.equal(s.hits, 2);
  assert.equal(s.misses, 1);
  assert.equal(s.hitRate, 2 / 3);
  assert.equal(s.size, 1);
});

test("clear empties cache", () => {
  const c = new PromptCache();
  c.put("k", "v");
  c.clear();
  assert.equal(c.get("k"), null);
  assert.equal(c.stats().size, 0);
});
