import { test, beforeEach } from "node:test";
import { strict as assert } from "node:assert";

// Minimal localStorage polyfill for Node — matches the Web Storage API
// surface our storage module actually uses.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  return store;
}

// Install BEFORE importing storage.js — module evaluation may read from it.
installLocalStorage();

const storage = await import("../src/ui/storage.js");

beforeEach(() => {
  localStorage.clear();
});

test("loadPreferences returns all-nulls when empty", () => {
  const prefs = storage.loadPreferences();
  assert.deepEqual(prefs, { provider: null, model: null, lastModel: null });
});

test("savePreferences + loadPreferences roundtrip", () => {
  storage.savePreferences({ provider: "pollinations", model: "openai-fast" });
  const prefs = storage.loadPreferences();
  assert.equal(prefs.provider, "pollinations");
  assert.equal(prefs.model, "openai-fast");
});

test("setLastModel is independent key", () => {
  storage.setLastModel('{"provider":"airforce","model":"grok-4.1-mini:free"}');
  const prefs = storage.loadPreferences();
  assert.match(prefs.lastModel, /grok-4\.1-mini/);
});

test("loadConversation returns empty array when missing", () => {
  assert.deepEqual(storage.loadConversation(), []);
});

test("saveConversation + loadConversation roundtrip", () => {
  const c = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
  storage.saveConversation(c);
  assert.deepEqual(storage.loadConversation(), c);
});

test("saveConversation caps at 50 turns (keeps most recent)", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg ${i}`,
  }));
  storage.saveConversation(many);
  const loaded = storage.loadConversation();
  assert.equal(loaded.length, 50);
  assert.equal(loaded[0].content, "msg 10");
  assert.equal(loaded[49].content, "msg 59");
});

test("saveConversation([]) clears the key", () => {
  storage.saveConversation([{ role: "user", content: "hi" }]);
  storage.saveConversation([]);
  assert.deepEqual(storage.loadConversation(), []);
});

test("loadConversation filters malformed entries", () => {
  const mixed = [
    { role: "user", content: "valid" },
    { role: "user", content: null },        // invalid
    { bogus: true },                         // invalid
    { role: "assistant", content: "ok" },
    { role: "system", content: "skip" },     // wrong role
  ];
  localStorage.setItem("keylessai:conversation:v1", JSON.stringify(mixed));
  const loaded = storage.loadConversation();
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].content, "valid");
  assert.equal(loaded[1].content, "ok");
});

test("corrupt JSON is cleared gracefully", () => {
  localStorage.setItem("keylessai:conversation:v1", "{not json");
  assert.deepEqual(storage.loadConversation(), []);
  // Should have removed the corrupt key on read
  assert.equal(localStorage.getItem("keylessai:conversation:v1"), null);
});

test("clearStoredConversation is idempotent", () => {
  storage.clearStoredConversation();
  storage.clearStoredConversation();
  assert.deepEqual(storage.loadConversation(), []);
});
