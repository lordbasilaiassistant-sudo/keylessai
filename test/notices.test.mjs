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

test("Yqcloud IP-ban content leak → detected", () => {
  // Real-world sample observed 2026-04-28: when binjie.fun blocks the
  // worker's IP, yqcloud returns the ban notice AS the LLM response body.
  // Multiple distinct ban-shape patterns in one body → high confidence.
  const sample = "sorry, 您的ip已由于触发防滥用检测而被封禁,请勿滥用本站,本服务网址是https://chat18.aichatosrg.com 或者 https://cat.chatavx.com/ 如果你不在本网站，请前往本网站使用即可 如需合作接口调用请联系微信kelemm220 或者前往 https://binjie09.shop 自助购买key, 认为是误封需要解封的请前往https://www.ip.cn/";
  assert.equal(looksLikeNotice(sample), true);
});

test("Yqcloud short ban line → detected via short+url+hit heuristic", () => {
  // Sometimes the response is truncated to just the leading ban sentence.
  const sample = "您的ip已由于触发防滥用检测而被封禁，请前往 https://www.ip.cn/";
  assert.equal(looksLikeNotice(sample), true);
});

test("legitimate Chinese-language response with one IP mention → NOT detected", () => {
  // A real LLM response that happens to mention "ip" in Chinese should not
  // trigger. The heuristic requires 2+ ban-specific patterns OR short body
  // + url + 1 hit. Long body + only one weak match → not a notice.
  const sample = "用户的IP地址通常用于网络识别。每个设备连接到互联网时都会获得一个IP地址。这里有更多关于网络协议、IPv4 vs IPv6 的细节，以及如何配置 DHCP 服务器。完整教程包括步骤1：安装路由器；步骤2：配置网络设置；步骤3：测试连接。完整文档见 https://developer.mozilla.org/zh-CN/docs/Web/HTTP";
  assert.equal(looksLikeNotice(sample), false);
});
