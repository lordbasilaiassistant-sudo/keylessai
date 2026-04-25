// KeylessAI tool-calling example.
//
// Demonstrates the OpenAI tool-call round trip against the public Worker:
//   1. send a request with `tools` defined
//   2. model emits `tool_calls` (assistant message)
//   3. caller executes the tool locally
//   4. caller posts the tool result back as a `role: "tool"` message
//   5. model integrates the tool output and replies in plain text
//
// Run: `node examples/tool-calling.js`
// (set OPENAI_BASE_URL to a different endpoint to test a self-hosted proxy)

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || "https://keylessai.thryx.workers.dev/v1",
  apiKey: process.env.OPENAI_API_KEY || "not-needed",
});

const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name, e.g. 'San Francisco'" },
        unit: { type: "string", enum: ["c", "f"], description: "Temperature unit" },
      },
      required: ["city"],
    },
  },
}];

// Local tool implementation. In a real app this would hit a real API.
function getWeather({ city, unit = "f" }) {
  const t = unit === "c" ? 22 : 72;
  return JSON.stringify({ city, temperature: t, unit, conditions: "sunny" });
}

const messages = [
  { role: "user", content: "What's the weather in San Francisco?" },
];

const turn1 = await client.chat.completions.create({
  model: "openai-fast",
  messages,
  tools,
  tool_choice: "auto",
});

const assistantMsg = turn1.choices[0].message;
console.log("turn 1 finish_reason:", turn1.choices[0].finish_reason);
console.log("turn 1 tool_calls:", JSON.stringify(assistantMsg.tool_calls, null, 2));

if (!assistantMsg.tool_calls?.length) {
  console.log("model replied with text instead of tool call:", assistantMsg.content);
  process.exit(0);
}

messages.push(assistantMsg);
for (const call of assistantMsg.tool_calls) {
  let result;
  try {
    const args = JSON.parse(call.function.arguments || "{}");
    if (call.function.name === "get_weather") {
      result = getWeather(args);
    } else {
      result = JSON.stringify({ error: `unknown tool ${call.function.name}` });
    }
  } catch (e) {
    result = JSON.stringify({ error: `bad arguments: ${e.message}` });
  }
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: result,
  });
}

const turn2 = await client.chat.completions.create({
  model: "openai-fast",
  messages,
  tools,
});

console.log("\nturn 2 final reply:", turn2.choices[0].message.content);
