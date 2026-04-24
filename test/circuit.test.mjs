import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CircuitBreaker } from "../src/core/circuit.js";

test("isOpen returns false on fresh provider", () => {
  const b = new CircuitBreaker();
  assert.equal(b.isOpen("x"), false);
});

test("opens after threshold consecutive fails", () => {
  const b = new CircuitBreaker({ threshold: 3 });
  b.fail("x"); b.fail("x");
  assert.equal(b.isOpen("x"), false);
  b.fail("x");
  assert.equal(b.isOpen("x"), true);
});

test("succeed resets fail count", () => {
  const b = new CircuitBreaker({ threshold: 3 });
  b.fail("x"); b.fail("x");
  b.succeed("x");
  b.fail("x"); b.fail("x"); // only 2 fails now, not open
  assert.equal(b.isOpen("x"), false);
});

test("circuit auto-closes after cooldown (half-open)", async () => {
  const b = new CircuitBreaker({ threshold: 2, cooldownMs: 30 });
  b.fail("x"); b.fail("x");
  assert.equal(b.isOpen("x"), true);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(b.isOpen("x"), false, "should half-open after cooldown");
});

test("independent per-provider tracking", () => {
  const b = new CircuitBreaker({ threshold: 2 });
  b.fail("a"); b.fail("a");
  assert.equal(b.isOpen("a"), true);
  assert.equal(b.isOpen("b"), false);
});

test("stats exposes per-provider state", () => {
  const b = new CircuitBreaker({ threshold: 3 });
  b.fail("x"); b.fail("x");
  const s = b.stats();
  assert.equal(s.x.fails, 2);
  assert.equal(s.x.open, false);
});
