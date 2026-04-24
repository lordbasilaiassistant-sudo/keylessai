import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SlotGate } from "../src/queue.js";

test("second caller waits for first to release", async () => {
  const gate = new SlotGate();
  const order = [];

  const a = (async () => {
    const release = await gate.acquire();
    order.push("a-acquired");
    await new Promise((r) => setTimeout(r, 30));
    order.push("a-release");
    release();
  })();

  const b = (async () => {
    await new Promise((r) => setTimeout(r, 5));
    const release = await gate.acquire();
    order.push("b-acquired");
    release();
  })();

  await Promise.all([a, b]);
  assert.deepEqual(order, ["a-acquired", "a-release", "b-acquired"]);
});

test("depth reflects waiting + in-flight", async () => {
  const gate = new SlotGate();
  assert.equal(gate.depth, 0);
  const r1 = await gate.acquire();
  assert.equal(gate.depth, 1);
  const p2 = gate.acquire();
  const p3 = gate.acquire();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(gate.depth, 3);
  r1();
  const r2 = await p2;
  assert.equal(gate.depth, 2);
  r2();
  const r3 = await p3;
  r3();
  assert.equal(gate.depth, 0);
});

test("queue full rejects when maxQueueDepth reached", async () => {
  const gate = new SlotGate({ maxQueueDepth: 2 });
  const r1 = await gate.acquire();
  const p2 = gate.acquire();
  const p3 = gate.acquire();
  await assert.rejects(() => gate.acquire(), /queue full/);
  r1();
  const r2 = await p2;
  r2();
  const r3 = await p3;
  r3();
});

test("timeout rejects pending acquire", async () => {
  const gate = new SlotGate();
  const r1 = await gate.acquire();
  await assert.rejects(
    () => gate.acquire({ timeoutMs: 20 }),
    /queue timeout/
  );
  r1();
});
