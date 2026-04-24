import { test } from "node:test";
import { strict as assert } from "node:assert";

// Mirror the INTERNAL_ERROR_PATTERNS used in worker/index.js and
// src/server/proxy.js. These scrub internal stack frames and filesystem
// paths from error messages before they reach a client. The patterns must
// be ReDoS-safe — a hostile upstream error string must complete in linear
// time.
const INTERNAL_ERROR_PATTERNS = [
  /\b[a-zA-Z]:[\\/][^\s]+/g,
  /\/(usr|home|root|Users)\/[^\s]+/g,
  /at [^(\n]{1,300}\([^)\n]{1,500}:\d+:\d+\)/g,
  /at [^\s:\n]{1,300}:\d+:\d+/g,
];

function sanitize(msg) {
  let s = String(msg || "");
  for (const re of INTERNAL_ERROR_PATTERNS) s = s.replace(re, "[redacted]");
  return s;
}

test("redacts Windows absolute paths", () => {
  const out = sanitize("boom at C:\\Users\\drlor\\secret\\file.js failed");
  assert.match(out, /\[redacted\]/);
  assert.ok(!/drlor/.test(out));
});

test("redacts Unix absolute paths", () => {
  const out = sanitize("error at /home/deploy/secret/config.js during load");
  assert.match(out, /\[redacted\]/);
  assert.ok(!/deploy/.test(out));
});

test("redacts V8 stack frames with parens", () => {
  const out = sanitize("TypeError: x is not a function\n    at doStuff (/srv/app/main.js:42:7)");
  assert.match(out, /\[redacted\]/);
  assert.ok(!/main\.js/.test(out));
});

test("redacts simpler stack frames without parens", () => {
  const out = sanitize("error at /srv/app/handler.js:10:15");
  assert.match(out, /\[redacted\]/);
});

test("ReDoS-resistant: runs in <50ms on pathological input", () => {
  // Prior regex `/at .+\(.+:\d+:\d+\)/g` exhibited catastrophic
  // backtracking when fed a long string that *almost* matches. The
  // bounded form must linearize.
  const pathological = "at " + "a".repeat(10000) + "(b:not-a-digit-here!";
  const start = performance.now();
  sanitize(pathological);
  const elapsed = performance.now() - start;
  assert.ok(
    elapsed < 50,
    `sanitize took ${elapsed}ms on pathological input — ReDoS regression`
  );
});

test("benign messages pass through unchanged", () => {
  const out = sanitize("upstream returned 502 Bad Gateway");
  assert.equal(out, "upstream returned 502 Bad Gateway");
});
