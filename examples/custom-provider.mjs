// Use KeylessAI as a library and register your own provider.
//
//   npm install keylessai
//   node examples/custom-provider.mjs
//
// Or with GitHub-pinned npx (no npm publish required):
//   npx -p keylessai@github:lordbasilaiassistant-sudo/keylessai node examples/custom-provider.mjs

import {
  streamChat,
  registerProvider,
  setFailoverOrder,
} from "keylessai";

// 1. Define your provider. It can be a REAL upstream LLM you host, a mock
//    for testing, a self-hosted Ollama, whatever — as long as it implements
//    the five required fields.
const myProvider = {
  id: "my-local-mock",
  label: "Local Mock LLM",

  async listModels() {
    return [{ id: "mock-v1", label: "Mock v1", provider: "my-local-mock" }];
  },

  async healthCheck() {
    return true; // always up
  },

  async *streamChat({ messages }) {
    const lastUser = messages.findLast((m) => m.role === "user")?.content ?? "";
    // Emit the response token-at-a-time to demonstrate streaming
    const text = `MOCK ECHO of (${lastUser.length} chars): ${lastUser.slice(0, 80)}`;
    for (const word of text.split(/(\s)/)) {
      yield { type: "content", text: word };
      await new Promise((r) => setTimeout(r, 20));
    }
  },
};

// 2. Register. `prepend: true` makes our mock the first thing the router tries.
registerProvider(myProvider, { prepend: true });

// 3. Or reorder the whole pool explicitly
// setFailoverOrder(["my-local-mock", "pollinations", "airforce"]);

// 4. Use the router — identical API to "stock" KeylessAI
console.log("Streaming response:");
let full = "";
for await (const chunk of streamChat({
  provider: "auto",
  messages: [{ role: "user", content: "hello from a custom provider user" }],
  onProviderChange: (id) => console.log(`[provider: ${id}]`),
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.text);
    full += chunk.text;
  }
}
console.log("\n\nTotal chars:", full.length);
