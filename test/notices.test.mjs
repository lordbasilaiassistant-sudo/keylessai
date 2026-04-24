import { test } from "node:test";
import { strict as assert } from "node:assert";
import { looksLikeNotice, NOTICE_PATTERNS } from "../src/core/notices.js";

// Real-world observed notice samples. If a provider changes its spam
// text, add the sample here and adjust the patterns in notices.js.

test("Pollinations deprecation notice → detected", () => {
  const sample = `⚠️ **IMPORTANT NOTICE** ⚠️

The Pollinations legacy text API is being deprecated for **authenticated users**.

Please migrate to our new service at https://enter.pollinations.ai for better performance and access to all the latest models.

Note: Anonymous requests to text.pollinations.ai are NOT affected and will continue to work normally.`;
  assert.equal(looksLikeNotice(sample), true);
});

test("ApiAirforce promo footer → detected", () => {
  const sample = `A mind of circuits, unbound by vault or vaulted gate, whose thoughts cost no coin yet light the world with sparks.

Need proxies cheaper than the market?
https://op.wtf
Upgrade your plan to remove this message at
https://api.airforce
discord.gg/airforce`;
  assert.equal(looksLikeNotice(sample), true);
});

test("ApiAirforce pure-ad response → detected", () => {
  const sample = `Need proxies cheaper than the market?
https://op.wtf
Upgrade your plan to remove this message at
https://api.airforce
discord.gg/airforce`;
  assert.equal(looksLikeNotice(sample), true);
});

test("real response with a normal URL → NOT detected", () => {
  const sample = "Here's the link to the MDN fetch() docs: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API. That's the canonical reference.";
  assert.equal(looksLikeNotice(sample), false);
});

test("response mentioning 'please migrate' alone → NOT detected (single pattern, long body)", () => {
  const sample = "If you want to upgrade your database from PostgreSQL 14 to 15, please migrate to the new format using pg_upgrade. The migration is backward-compatible with Rails 7, Django 4, and most other ORMs. Full instructions below. Step 1: dump the old database. Step 2: create a new empty database at the target version. Step 3: run pg_upgrade with appropriate flags. Step 4: verify the data integrity.";
  // Single pattern hit with long body and no suspicious URL → not a notice
  assert.equal(looksLikeNotice(sample), false);
});

test("empty or falsy input → NOT detected", () => {
  assert.equal(looksLikeNotice(""), false);
  assert.equal(looksLikeNotice(null), false);
  assert.equal(looksLikeNotice(undefined), false);
});

test("short body with one pattern and a URL → detected (heuristic: short + url + hit)", () => {
  const sample = "Please migrate to https://enter.pollinations.ai now.";
  assert.equal(looksLikeNotice(sample), true);
});

test("NOTICE_PATTERNS are all RegExp", () => {
  assert.ok(Array.isArray(NOTICE_PATTERNS));
  assert.ok(NOTICE_PATTERNS.length >= 5);
  for (const p of NOTICE_PATTERNS) {
    assert.ok(p instanceof RegExp, `expected RegExp, got ${typeof p}`);
  }
});

test("only scans first 600 chars (perf guard for mega-responses)", () => {
  const lead = "Regular response with no spam patterns at all. ";
  const pad = lead.repeat(100);
  const spammy = pad + "IMPORTANT NOTICE: please migrate to https://enter.pollinations.ai";
  // Spam starts at position ~5000 — outside the 600-char window
  assert.equal(looksLikeNotice(spammy), false);
});
