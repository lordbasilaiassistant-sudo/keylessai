// KeylessAI + OpenAI Node SDK — identical to normal usage, just baseURL and dummy key.
// npm install openai

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://keylessai.thryx.workers.dev/v1",
  apiKey: "not-needed",
});

const stream = await client.chat.completions.create({
  model: "openai-fast",
  messages: [
    { role: "system", content: "You respond in a maximum of 3 sentences." },
    { role: "user", content: "Why would I use a keyless LLM endpoint?" },
  ],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
process.stdout.write("\n");
