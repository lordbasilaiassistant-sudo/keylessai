import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  validateChatBody,
  validateCompletionsBody,
  ValidationError,
} from "../src/server/validate.js";

// --- chat body ---

test("valid chat body passes", () => {
  const body = {
    model: "openai-fast",
    messages: [{ role: "user", content: "hello" }],
  };
  assert.doesNotThrow(() => validateChatBody(body));
});

test("non-object body rejected", () => {
  assert.throws(() => validateChatBody(null), ValidationError);
  assert.throws(() => validateChatBody([]), ValidationError);
  assert.throws(() => validateChatBody("string"), ValidationError);
  assert.throws(() => validateChatBody(123), ValidationError);
});

test("empty messages rejected", () => {
  assert.throws(
    () => validateChatBody({ messages: [] }),
    /messages must not be empty/
  );
});

test("messages not an array rejected", () => {
  assert.throws(
    () => validateChatBody({ messages: "not an array" }),
    /messages must be an array/
  );
});

test("invalid role rejected", () => {
  assert.throws(
    () => validateChatBody({ messages: [{ role: "admin", content: "hi" }] }),
    /role must be one of/
  );
});

test("all valid roles accepted", () => {
  for (const role of ["system", "user", "assistant", "tool", "function", "developer"]) {
    assert.doesNotThrow(
      () => validateChatBody({ messages: [{ role, content: "hi" }] }),
      `role=${role}`
    );
  }
});

test("prototype pollution via __proto__ rejected", () => {
  const body = JSON.parse('{"messages":[{"role":"user","content":"hi"}],"__proto__":{"polluted":true}}');
  assert.throws(() => validateChatBody(body), /forbidden keys/);
});

test("prototype pollution via constructor rejected", () => {
  const body = JSON.parse('{"messages":[{"role":"user","content":"hi"}],"constructor":{"polluted":true}}');
  assert.throws(() => validateChatBody(body), /forbidden keys/);
});

test("nested prototype pollution rejected", () => {
  const body = JSON.parse('{"messages":[{"role":"user","content":"hi","__proto__":{"x":1}}]}');
  assert.throws(() => validateChatBody(body), /forbidden keys/);
});

test("messages over limit rejected", () => {
  const messages = Array.from({ length: 300 }, () => ({ role: "user", content: "hi" }));
  assert.throws(() => validateChatBody({ messages }), /at most 200/);
});

test("message content too long rejected", () => {
  const big = "a".repeat(600_000);
  assert.throws(
    () => validateChatBody({ messages: [{ role: "user", content: big }] }),
    /exceeds 500000 chars/
  );
});

test("array content (vision) accepted", () => {
  const body = {
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "describe this" },
        { type: "image_url", image_url: { url: "https://x" } },
      ],
    }],
  };
  assert.doesNotThrow(() => validateChatBody(body));
});

test("null content (tool call) accepted", () => {
  const body = {
    messages: [{ role: "assistant", content: null, tool_calls: [] }],
  };
  assert.doesNotThrow(() => validateChatBody(body));
});

test("bad temperature rejected", () => {
  const m = [{ role: "user", content: "hi" }];
  assert.throws(() => validateChatBody({ messages: m, temperature: "hot" }), /temperature/);
  assert.throws(() => validateChatBody({ messages: m, temperature: -1 }), /temperature/);
  assert.throws(() => validateChatBody({ messages: m, temperature: 5 }), /temperature/);
  assert.throws(() => validateChatBody({ messages: m, temperature: NaN }), /temperature/);
});

test("valid temperature + top_p accepted", () => {
  const m = [{ role: "user", content: "hi" }];
  assert.doesNotThrow(() => validateChatBody({ messages: m, temperature: 0 }));
  assert.doesNotThrow(() => validateChatBody({ messages: m, temperature: 1 }));
  assert.doesNotThrow(() => validateChatBody({ messages: m, temperature: 2 }));
  assert.doesNotThrow(() => validateChatBody({ messages: m, top_p: 0.9 }));
});

test("stream flag must be boolean", () => {
  const m = [{ role: "user", content: "hi" }];
  assert.throws(() => validateChatBody({ messages: m, stream: "true" }), /stream/);
  assert.doesNotThrow(() => validateChatBody({ messages: m, stream: true }));
  assert.doesNotThrow(() => validateChatBody({ messages: m, stream: false }));
});

test("model length cap", () => {
  const m = [{ role: "user", content: "hi" }];
  const longModel = "m".repeat(300);
  assert.throws(() => validateChatBody({ messages: m, model: longModel }), /1\.\.200 chars/);
});

// --- completions body ---

test("valid completions body passes", () => {
  assert.doesNotThrow(() =>
    validateCompletionsBody({ prompt: "hello", model: "openai-fast" })
  );
});

test("missing prompt rejected", () => {
  assert.throws(() => validateCompletionsBody({}), /prompt/);
  assert.throws(() => validateCompletionsBody({ prompt: "" }), /prompt/);
  assert.throws(() => validateCompletionsBody({ prompt: 123 }), /prompt/);
});

test("completions prototype pollution rejected", () => {
  const body = JSON.parse('{"prompt":"hi","__proto__":{"x":1}}');
  assert.throws(() => validateCompletionsBody(body), /forbidden/);
});
