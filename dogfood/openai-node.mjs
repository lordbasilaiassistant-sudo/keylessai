// Dogfood: official OpenAI Node SDK against our proxy.
// Exits 0 on success, 1 on failure.

import { writeFileSync, mkdirSync } from "node:fs";
import OpenAI from "openai";

const BASE = process.env.KEYLESSAI_PROXY_URL || "http://127.0.0.1:8790/v1";
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

log(`[dogfood/openai-node] baseURL=${BASE}`);

const client = new OpenAI({
  baseURL: BASE,
  apiKey: "not-needed",
});

let ok = true;
try {
  // Non-streaming
  const res = await client.chat.completions.create({
    model: "openai-fast",
    messages: [{ role: "user", content: "Reply with exactly: NODE OK" }],
  });
  const text = res.choices[0].message.content;
  log(`  non-stream: ${text}`);
  log(`  provider:   ${res.keylessai_provider || "(not exposed)"}`);

  // Streaming
  log(`  streaming test…`);
  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",  // aliased → openai-fast
    messages: [{ role: "user", content: "Count: 1, 2, 3" }],
    stream: true,
  });
  let buf = "";
  for await (const chunk of stream) {
    buf += chunk.choices[0]?.delta?.content ?? "";
  }
  log(`  stream out: ${buf}`);
  if (!buf) {
    log("  ✗ stream produced no content");
    ok = false;
  }
} catch (e) {
  log(`  ✗ threw: ${e.message}`);
  ok = false;
}

mkdirSync("dogfood/transcripts", { recursive: true });
writeFileSync("dogfood/transcripts/openai-node.txt", lines.join("\n") + "\n");

log(ok ? "  ✓ pass" : "  ✗ fail");
process.exit(ok ? 0 : 1);
