// 2026-04-28 — reusable test helpers for keylessai.
//
// Mirror of thryx-launchpad/server/test/_helpers.mjs (same author, same week).
// Pure node — no extra deps. Importable from any test file:
//   import { expectShape, expectOpenAIChat, stubFetch, withTimer, retry, freezeTime, quietConsole } from './_helpers.mjs';
//
// Why this exists: the existing tests under test/*.test.mjs reimplement the
// same shape assertions (id/object/choices/message.content) and stub fetch
// in slightly different ways. Centralizing keeps the OpenAI-compat contract
// in one place — if someone changes the keylessai response shape, every
// test that uses expectOpenAIChat fails loudly with a clear path.

import { strict as assert } from 'node:assert';

const TYPE_OF = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
};

const TYPE_MARKERS = new Set(['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined', 'function', 'bigint', 'symbol']);

// ---------------------------------------------------------------------------
// expectShape — recursive structural assertion. Schema language:
//   - type-marker string ('string'|'number'|'boolean'|'object'|'array')
//   - any other string → exact literal match
//   - regex → tested against String(value)
//   - function → predicate, must return truthy
//   - object → recursed (use '?key' prefix for optional fields)
// ---------------------------------------------------------------------------
export function expectShape(value, schema, path = 'root') {
  if (schema === null || schema === undefined) {
    assert.equal(value, schema, `${path}: expected literal ${schema}`);
    return;
  }
  if (typeof schema === 'string') {
    if (TYPE_MARKERS.has(schema)) {
      const t = TYPE_OF(value);
      assert.equal(t, schema, `${path}: expected ${schema}, got ${t} (${JSON.stringify(value)?.slice(0, 80)})`);
    } else {
      assert.equal(value, schema, `${path}: expected literal "${schema}", got ${JSON.stringify(value)?.slice(0, 80)}`);
    }
    return;
  }
  if (schema instanceof RegExp) {
    assert.match(String(value), schema, `${path}: ${JSON.stringify(value)} doesn't match ${schema}`);
    return;
  }
  if (typeof schema === 'function') {
    assert.ok(schema(value), `${path}: predicate failed for ${JSON.stringify(value)?.slice(0, 80)}`);
    return;
  }
  if (typeof schema === 'object' && !Array.isArray(schema)) {
    assert.equal(TYPE_OF(value), 'object', `${path}: expected object, got ${TYPE_OF(value)}`);
    for (const [rawKey, sub] of Object.entries(schema)) {
      const optional = rawKey.startsWith('?');
      const key = optional ? rawKey.slice(1) : rawKey;
      if (!(key in value)) {
        if (optional) continue;
        assert.fail(`${path}: missing required key '${key}' (have: ${Object.keys(value).join(',')})`);
      }
      expectShape(value[key], sub, `${path}.${key}`);
    }
    return;
  }
  assert.deepEqual(value, schema, `${path}: literal mismatch`);
}

// ---------------------------------------------------------------------------
// expectOpenAIChat — assert a non-streaming chat completion matches the
// OpenAI shape that keylessai promises in README.
// Tolerates either gpt-4o-mini or any model id (free-form string).
// ---------------------------------------------------------------------------
export function expectOpenAIChat(body, { allowToolCalls = true } = {}) {
  expectShape(body, {
    id: 'string',
    object: /chat\.completion/,
    created: 'number',
    model: 'string',
    choices: 'array',
    '?usage': {
      '?prompt_tokens': 'number',
      '?completion_tokens': 'number',
      '?total_tokens': 'number',
    },
  });
  assert.ok(body.choices.length >= 1, 'choices should be non-empty');
  const c0 = body.choices[0];
  expectShape(c0, {
    index: 'number',
    message: {
      role: 'assistant',
      '?content': (v) => v === null || typeof v === 'string',
      '?tool_calls': 'array',
    },
    '?finish_reason': (v) => v == null || typeof v === 'string',
  });
  if (!allowToolCalls && c0.message.tool_calls) {
    assert.fail('did not expect tool_calls in this response');
  }
}

// ---------------------------------------------------------------------------
// expectOpenAIStreamChunk — assert one decoded SSE chunk matches the
// `chat.completion.chunk` shape. Pass the JSON parsed from `data: {...}`.
// ---------------------------------------------------------------------------
export function expectOpenAIStreamChunk(chunk) {
  expectShape(chunk, {
    id: 'string',
    object: 'chat.completion.chunk',
    created: 'number',
    model: 'string',
    choices: 'array',
  });
  assert.ok(chunk.choices.length >= 1, 'chunk.choices should be non-empty');
  expectShape(chunk.choices[0], {
    index: 'number',
    delta: {
      '?role': 'string',
      '?content': (v) => v == null || typeof v === 'string',
      '?tool_calls': 'array',
    },
    '?finish_reason': (v) => v == null || typeof v === 'string',
  });
}

// ---------------------------------------------------------------------------
// parseSSE — split an SSE response body into an array of decoded JSON
// chunks. Strips `data:` prefix and `[DONE]` sentinel.
// ---------------------------------------------------------------------------
export function parseSSE(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^data:\s*(.+)$/);
    if (!m) continue;
    const payload = m[1].trim();
    if (payload === '[DONE]') continue;
    try { out.push(JSON.parse(payload)); } catch { /* ignore non-JSON */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// stubFetch — install a fake global fetch. Handler receives (url, init) and
// returns: a Response, a {status, body, headers?} object, or any value
// (defaults to 200/json).
// ---------------------------------------------------------------------------
export function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const result = await handler(url, init);
    if (result instanceof Response) return result;
    if (result && typeof result === 'object' && 'status' in result) {
      return new Response(
        typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? null),
        { status: result.status ?? 200, headers: result.headers ?? { 'content-type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify(result ?? null), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return () => { globalThis.fetch = original; };
}

// ---------------------------------------------------------------------------
// makeStreamResponse — build a Response whose body emits the given chunks
// as SSE `data: {json}\n\n` plus a final `data: [DONE]\n\n`. Useful for
// testing stream-handling code without spinning up a real upstream.
// ---------------------------------------------------------------------------
export function makeStreamResponse(chunks, { status = 200 } = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        const payload = typeof c === 'string' ? c : JSON.stringify(c);
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

// ---------------------------------------------------------------------------
// withTimer — measure body, optionally enforce a budget.
// ---------------------------------------------------------------------------
export async function withTimer(label, fn, { maxMs } = {}) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  if (maxMs && ms > maxMs) {
    assert.fail(`${label} took ${ms}ms > budget ${maxMs}ms`);
  }
  return { result, ms };
}

// ---------------------------------------------------------------------------
// retry — flaky-test mitigation with exponential backoff.
// ---------------------------------------------------------------------------
export async function retry(fn, { attempts = 3, baseMs = 100 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// freezeTime — patch Date.now and re-restore. Tests with TTL/cache logic
// (cache.js, circuit.js) need this to be deterministic.
// ---------------------------------------------------------------------------
export function freezeTime(ms) {
  const original = Date.now;
  let now = ms;
  Date.now = () => now;
  return {
    advance(deltaMs) { now += deltaMs; },
    set(newMs) { now = newMs; },
    restore() { Date.now = original; },
  };
}

// ---------------------------------------------------------------------------
// quietConsole — suppress console output during a body, capture lines.
// ---------------------------------------------------------------------------
export async function quietConsole(fn) {
  const captured = { log: [], warn: [], error: [] };
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a) => captured.log.push(a.join(' '));
  console.warn = (...a) => captured.warn.push(a.join(' '));
  console.error = (...a) => captured.error.push(a.join(' '));
  try {
    const result = await fn();
    return { result, captured };
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }
}
