// Dogfood: prove every OpenAI/Anthropic model alias in the proxy resolves
// to a working upstream call.

import { writeFileSync, mkdirSync } from "node:fs";
import OpenAI from "openai";

const BASE = process.env.KEYLESSAI_PROXY_URL || "http://127.0.0.1:8790/v1";
const client = new OpenAI({ baseURL: BASE, apiKey: "not-needed" });

const ALIASES = [
  "gpt-3.5-turbo",
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-haiku-20240307",
  "claude-3-5-sonnet-latest",
];

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

log(`[dogfood/aliased-models] baseURL=${BASE}`);

let passed = 0;
let failed = 0;

for (const model of ALIASES) {
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: `You were called with model name '${model}'. Reply with exactly: OK ${model}`,
        },
      ],
    });
    const text = (res.choices[0]?.message?.content || "").trim();
    const provider = res.keylessai_provider || "?";
    log(`  ${model.padEnd(32)} → ${provider.padEnd(16)} "${text.slice(0, 80)}"`);
    if (text) passed++; else failed++;
  } catch (e) {
    log(`  ${model.padEnd(32)} → ERROR: ${e.message}`);
    failed++;
  }
}

mkdirSync("dogfood/transcripts", { recursive: true });
writeFileSync("dogfood/transcripts/aliased-models.txt", lines.join("\n") + "\n");

log(`\n  ${passed} passed, ${failed} failed of ${ALIASES.length} aliases`);
process.exit(failed > 0 ? 1 : 0);
