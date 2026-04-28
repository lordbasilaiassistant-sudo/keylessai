import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  streamChat,
  registerProvider,
  unregisterProvider,
  setFailoverOrder,
  providerSupportsTools,
  ToolsUnsupportedError,
  FAILOVER_ORDER,
  PROVIDERS,
} from "../src/core/router.js";
import { createProxy, buildToolCallsFromAccumulator } from "../src/server/proxy.js";

function makeStubProvider({ id, tools = false, chunks = [] }) {
  return {
    id,
    label: `Stub ${id}`,
    capabilities: { tools },
    async listModels() { return [{ id: `${id}-m`, label: `${id}`, provider: id }]; },
    async healthCheck() { return true; },
    async* streamChat() {
      for (const c of chunks) yield c;
    },
  };
}

test("providerSupportsTools reflects pollinations + airforce capability", () => {
  assert.equal(providerSupportsTools("pollinations"), true);
  assert.equal(providerSupportsTools("airforce"), true);
  assert.equal(providerSupportsTools("pollinations-get"), false);
  assert.equal(providerSupportsTools("yqcloud"), false);
});

test("providerSupportsTools returns false for unknown provider", () => {
  assert.equal(providerSupportsTools("nonsense-id"), false);
});

test("registerProvider without capabilities defaults to tools=false", () => {
  registerProvider({
    id: "tools-default-test",
    label: "no caps",
    listModels: async () => [],
    healthCheck: async () => true,
    streamChat: async function* () {},
  });
  try {
    assert.equal(providerSupportsTools("tools-default-test"), false);
  } finally {
    unregisterProvider("tools-default-test");
  }
});

test("auto mode filters out non-tool providers when tools requested", async () => {
  const originalOrder = [...FAILOVER_ORDER];
  // Inject a tool-capable stub and a non-tool stub. Force the order so the
  // non-tool one would be tried first if the filter were broken.
  registerProvider(makeStubProvider({
    id: "stub-no-tools",
    tools: false,
    chunks: [{ type: "content", text: "WRONG — should not be reached" }],
  }), { prepend: true });
  registerProvider(makeStubProvider({
    id: "stub-tools",
    tools: true,
    chunks: [
      { type: "tool_call_delta", index: 0, id: "call_1", name: "get_weather", arguments: "" },
      { type: "tool_call_delta", index: 0, arguments: '{"city":"NYC"}' },
    ],
  }), { prepend: true });

  // Replace FAILOVER_ORDER with just our two stubs so real providers aren't hit.
  setFailoverOrder(["stub-no-tools", "stub-tools"]);

  try {
    const out = [];
    for await (const c of streamChat({
      provider: "auto",
      messages: [{ role: "user", content: "weather?" }],
      tools: [{ type: "function", function: { name: "get_weather" } }],
    })) {
      out.push(c);
    }
    assert.equal(out.length, 2);
    assert.equal(out[0].type, "tool_call_delta");
    assert.equal(out[0].id, "call_1");
    assert.equal(out[0].name, "get_weather");
    assert.equal(out[1].arguments, '{"city":"NYC"}');
  } finally {
    setFailoverOrder(originalOrder);
    unregisterProvider("stub-no-tools");
    unregisterProvider("stub-tools");
  }
});

test("auto mode throws ToolsUnsupportedError when no tool-capable provider exists", async () => {
  const originalOrder = [...FAILOVER_ORDER];
  registerProvider(makeStubProvider({
    id: "only-no-tools",
    tools: false,
    chunks: [{ type: "content", text: "x" }],
  }));
  setFailoverOrder(["only-no-tools"]);

  try {
    let err;
    try {
      const it = streamChat({
        provider: "auto",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "noop" } }],
      });
      // Need to invoke .next() for the body of the async generator to run.
      await it.next();
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.ok(err instanceof ToolsUnsupportedError, `expected ToolsUnsupportedError, got ${err?.name}`);
    assert.equal(err.code, "tool_calls_unsupported");
  } finally {
    setFailoverOrder(originalOrder);
    unregisterProvider("only-no-tools");
  }
});

test("pinned provider that lacks capability rejects tool requests", async () => {
  registerProvider(makeStubProvider({
    id: "pinned-no-tools",
    tools: false,
    chunks: [{ type: "content", text: "x" }],
  }));
  try {
    let err;
    try {
      const it = streamChat({
        provider: "pinned-no-tools",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "noop" } }],
      });
      await it.next();
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof ToolsUnsupportedError);
  } finally {
    unregisterProvider("pinned-no-tools");
  }
});

test("non-stream proxy assembles tool_calls into message.tool_calls", async () => {
  const originalOrder = [...FAILOVER_ORDER];
  registerProvider(makeStubProvider({
    id: "stub-acc",
    tools: true,
    chunks: [
      { type: "tool_call_delta", index: 0, id: "call_abc", name: "get_weather" },
      { type: "tool_call_delta", index: 0, arguments: '{"ci' },
      { type: "tool_call_delta", index: 0, arguments: 'ty":"NYC"}' },
    ],
  }));
  setFailoverOrder(["stub-acc"]);

  const server = createProxy({ log: () => {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai-fast",
        stream: false,
        messages: [{ role: "user", content: "weather?" }],
        tools: [{ type: "function", function: { name: "get_weather" } }],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.choices[0].finish_reason, "tool_calls");
    assert.equal(data.choices[0].message.content, null);
    assert.equal(data.choices[0].message.tool_calls.length, 1);
    const tc = data.choices[0].message.tool_calls[0];
    assert.equal(tc.id, "call_abc");
    assert.equal(tc.type, "function");
    assert.equal(tc.function.name, "get_weather");
    assert.equal(tc.function.arguments, '{"city":"NYC"}');
  } finally {
    await new Promise((r) => server.close(r));
    setFailoverOrder(originalOrder);
    unregisterProvider("stub-acc");
  }
});

test("streaming proxy emits OpenAI-shaped tool_calls deltas", async () => {
  const originalOrder = [...FAILOVER_ORDER];
  registerProvider(makeStubProvider({
    id: "stub-stream",
    tools: true,
    chunks: [
      { type: "tool_call_delta", index: 0, id: "call_x", name: "do_thing", arguments: "" },
      { type: "tool_call_delta", index: 0, arguments: "{}" },
    ],
  }));
  setFailoverOrder(["stub-stream"]);

  const server = createProxy({ log: () => {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai-fast",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "do_thing" } }],
      }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data:") && !l.includes("[DONE]"));
    const parsed = lines.map((l) => JSON.parse(l.slice(5).trim()));

    // First payload is the role:"assistant" prelude
    assert.equal(parsed[0].choices[0].delta.role, "assistant");

    // Find the chunks containing tool_calls
    const toolChunks = parsed.filter((p) => p.choices?.[0]?.delta?.tool_calls);
    assert.ok(toolChunks.length >= 2, `expected at least 2 tool_call deltas, got ${toolChunks.length}`);
    const first = toolChunks[0].choices[0].delta.tool_calls[0];
    assert.equal(first.index, 0);
    assert.equal(first.id, "call_x");
    assert.equal(first.type, "function");
    assert.equal(first.function.name, "do_thing");

    // Final chunk has finish_reason: "tool_calls"
    const finish = parsed.find((p) => p.choices?.[0]?.finish_reason);
    assert.equal(finish.choices[0].finish_reason, "tool_calls");
  } finally {
    await new Promise((r) => server.close(r));
    setFailoverOrder(originalOrder);
    unregisterProvider("stub-stream");
  }
});

test("toolDeltaChunk shape matches OpenAI: index always set, type=function, function nested", async () => {
  // Indirect check via the streaming endpoint above already covers this; this
  // is a defensive direct check on the wire shape.
  const originalOrder = [...FAILOVER_ORDER];
  registerProvider(makeStubProvider({
    id: "stub-shape",
    tools: true,
    chunks: [
      // No id, no name, just an arguments fragment — must still produce a
      // well-formed OpenAI delta.
      { type: "tool_call_delta", index: 2, arguments: "frag" },
    ],
  }));
  setFailoverOrder(["stub-shape"]);

  const server = createProxy({ log: () => {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai-fast",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "x" } }],
      }),
    });
    const text = await res.text();
    const toolLine = text.split("\n").find((l) =>
      l.startsWith("data:") && l.includes('"tool_calls"')
    );
    const parsed = JSON.parse(toolLine.slice(5).trim());
    const tc = parsed.choices[0].delta.tool_calls[0];
    assert.equal(tc.index, 2);
    assert.equal(tc.type, "function");
    assert.equal(typeof tc.function, "object");
    assert.equal(tc.function.arguments, "frag");
    // id must be omitted when not provided (OpenAI spec)
    assert.equal("id" in tc, false);
    // name must be omitted when not provided
    assert.equal("name" in tc.function, false);
  } finally {
    await new Promise((r) => server.close(r));
    setFailoverOrder(originalOrder);
    unregisterProvider("stub-shape");
  }
});

// ---------------------------------------------------------------------------
// Defensive stitch: Pollinations occasionally fragments one logical tool call
// across two indices — first carries name + truncated JSON args, second
// carries empty name + tail of args. Observed live 2026-04-28 returning:
//   tool_calls: [
//     { function: { name: "swap_thryx_for_eth", arguments: '{"percent":' } },
//     { function: { name: "",                   arguments: '50}' } }
//   ]
// AUTO-style consumers JSON.parse(arguments) and silently fall to args={},
// which then fails tool validation. The stitcher detects this shape and
// merges the fragment into the previous entry instead of emitting two.
// ---------------------------------------------------------------------------

test("buildToolCallsFromAccumulator: clean single tool call passes through", () => {
  const acc = { 0: { id: "call_x", name: "buy_token", arguments: '{"address":"0xaa","amount":"0.001"}' } };
  const out = buildToolCallsFromAccumulator(acc);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "call_x");
  assert.equal(out[0].function.name, "buy_token");
  assert.equal(out[0].function.arguments, '{"address":"0xaa","amount":"0.001"}');
});

test("buildToolCallsFromAccumulator: stitches fragmented tool call (Pollinations bug)", () => {
  const acc = {
    0: { id: "call_a", name: "swap_thryx_for_eth", arguments: '{"percent":' },
    1: { id: "call_b", name: "",                   arguments: '50}' },
  };
  const out = buildToolCallsFromAccumulator(acc);
  // Should collapse into a single tool call with the args concatenated.
  assert.equal(out.length, 1, `expected 1 stitched call, got ${out.length}: ${JSON.stringify(out)}`);
  assert.equal(out[0].function.name, "swap_thryx_for_eth");
  assert.equal(out[0].function.arguments, '{"percent":50}');
  // And the JSON should now actually parse.
  assert.deepEqual(JSON.parse(out[0].function.arguments), { percent: 50 });
});

test("buildToolCallsFromAccumulator: does NOT stitch genuinely-parallel tool calls", () => {
  // Two distinct named tool calls — both should be kept separate even though
  // their args happen to be small.
  const acc = {
    0: { id: "call_a", name: "fn_one", arguments: '{"x":1}' },
    1: { id: "call_b", name: "fn_two", arguments: '{"y":2}' },
  };
  const out = buildToolCallsFromAccumulator(acc);
  assert.equal(out.length, 2);
  assert.equal(out[0].function.name, "fn_one");
  assert.equal(out[1].function.name, "fn_two");
});

test("buildToolCallsFromAccumulator: does NOT stitch when previous is already complete JSON", () => {
  // First call is complete; second has empty name but starts with '{' so
  // looks like a fresh JSON. Should NOT merge — keeps both.
  const acc = {
    0: { id: "call_a", name: "fn_one", arguments: '{"x":1}' },
    1: { id: "call_b", name: "",       arguments: '{"y":2}' },
  };
  const out = buildToolCallsFromAccumulator(acc);
  // Two entries — empty-name second one stays separate because its args
  // form valid JSON of their own and the previous args are already complete.
  assert.equal(out.length, 2);
});

test("buildToolCallsFromAccumulator: out-of-order indices sort correctly", () => {
  const acc = {
    1: { id: "call_b", name: "fn_two", arguments: '{}' },
    0: { id: "call_a", name: "fn_one", arguments: '{}' },
  };
  const out = buildToolCallsFromAccumulator(acc);
  assert.equal(out[0].function.name, "fn_one");
  assert.equal(out[1].function.name, "fn_two");
});

test("buildToolCallsFromAccumulator: missing id falls back to call_<n>", () => {
  const acc = { 0: { id: undefined, name: "fn", arguments: '{}' } };
  const out = buildToolCallsFromAccumulator(acc);
  assert.equal(out[0].id, "call_0");
});
