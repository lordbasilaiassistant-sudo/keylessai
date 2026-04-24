import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  registerProvider,
  unregisterProvider,
  setFailoverOrder,
  PROVIDERS,
  FAILOVER_ORDER,
} from "../src/core/router.js";

function makeStubProvider(id) {
  return {
    id,
    label: `Stub ${id}`,
    async listModels() { return [{ id: `${id}-m`, label: `${id} model`, provider: id }]; },
    async healthCheck() { return true; },
    async* streamChat() { yield { type: "content", text: `from ${id}` }; },
  };
}

test("registerProvider adds to PROVIDERS + FAILOVER_ORDER", () => {
  const p = makeStubProvider("testprov1");
  registerProvider(p);
  try {
    assert.equal(PROVIDERS["testprov1"], p);
    assert.ok(FAILOVER_ORDER.includes("testprov1"));
  } finally {
    unregisterProvider("testprov1");
  }
});

test("registerProvider with prepend puts it first in failover", () => {
  const p = makeStubProvider("testprov2");
  registerProvider(p, { prepend: true });
  try {
    assert.equal(FAILOVER_ORDER[0], "testprov2");
  } finally {
    unregisterProvider("testprov2");
  }
});

test("registerProvider addToFailover:false skips order", () => {
  const p = makeStubProvider("testprov3");
  registerProvider(p, { addToFailover: false });
  try {
    assert.equal(PROVIDERS["testprov3"], p);
    assert.ok(!FAILOVER_ORDER.includes("testprov3"));
  } finally {
    unregisterProvider("testprov3");
  }
});

test("registerProvider throws on malformed input", () => {
  assert.throws(() => registerProvider(null), /must be an object/);
  assert.throws(() => registerProvider({}), /missing required field/);
  assert.throws(() => registerProvider({ id: "" }), /missing/);
  assert.throws(() => registerProvider({
    id: "x",
    label: "x",
    listModels: () => {},
    healthCheck: () => {},
    streamChat: "not a function",
  }), /streamChat must be a function/);
});

test("unregisterProvider removes from both PROVIDERS and FAILOVER_ORDER", () => {
  registerProvider(makeStubProvider("testprov4"));
  assert.ok(PROVIDERS["testprov4"]);
  assert.ok(FAILOVER_ORDER.includes("testprov4"));
  assert.equal(unregisterProvider("testprov4"), true);
  assert.equal(PROVIDERS["testprov4"], undefined);
  assert.ok(!FAILOVER_ORDER.includes("testprov4"));
});

test("unregisterProvider returns false for unknown id", () => {
  assert.equal(unregisterProvider("nope-does-not-exist"), false);
});

test("setFailoverOrder replaces the array", () => {
  const originalOrder = [...FAILOVER_ORDER];
  try {
    setFailoverOrder(["pollinations"]);
    assert.deepEqual([...FAILOVER_ORDER], ["pollinations"]);
  } finally {
    setFailoverOrder(originalOrder);
  }
});

test("setFailoverOrder rejects unknown provider id", () => {
  assert.throws(() => setFailoverOrder(["not-a-real-provider"]), /unknown provider/);
});

test("setFailoverOrder rejects non-array", () => {
  assert.throws(() => setFailoverOrder("pollinations"), /must be an array/);
});

test("re-registering updates position (not duplicate)", () => {
  const p = makeStubProvider("testprov5");
  registerProvider(p);
  registerProvider(p, { prepend: true });
  try {
    assert.equal(FAILOVER_ORDER.filter((id) => id === "testprov5").length, 1);
    assert.equal(FAILOVER_ORDER[0], "testprov5");
  } finally {
    unregisterProvider("testprov5");
  }
});
