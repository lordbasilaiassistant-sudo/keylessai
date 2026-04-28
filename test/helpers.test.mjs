// 2026-04-28 — exercises test/_helpers.mjs against canned OpenAI-shaped
// payloads + canned SSE streams. If anyone changes the helpers in a way
// that breaks these assertions, every other test that uses the helpers
// will start failing too — this gives us early warning.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  expectShape,
  expectOpenAIChat,
  expectOpenAIStreamChunk,
  parseSSE,
  stubFetch,
  makeStreamResponse,
  withTimer,
  retry,
  freezeTime,
  quietConsole,
} from './_helpers.mjs';

const FIXTURE_CHAT = {
  id: 'chatcmpl-keyless-abc123',
  object: 'chat.completion',
  created: 1714350000,
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'hello' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
};

const FIXTURE_TOOL_CALL = {
  id: 'chatcmpl-keyless-tool',
  object: 'chat.completion',
  created: 1714350001,
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Phoenix"}' } },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
};

test('expectOpenAIChat passes for canonical fixture', () => {
  expectOpenAIChat(FIXTURE_CHAT);
});

test('expectOpenAIChat accepts tool_calls when allowed', () => {
  expectOpenAIChat(FIXTURE_TOOL_CALL);
});

test('expectOpenAIChat rejects tool_calls when forbidden', () => {
  assert.throws(() => expectOpenAIChat(FIXTURE_TOOL_CALL, { allowToolCalls: false }), /tool_calls/);
});

test('expectOpenAIChat catches missing choices', () => {
  const bad = { ...FIXTURE_CHAT, choices: [] };
  assert.throws(() => expectOpenAIChat(bad), /non-empty/);
});

test('expectOpenAIChat catches wrong object marker', () => {
  const bad = { ...FIXTURE_CHAT, object: 'text_completion' };
  assert.throws(() => expectOpenAIChat(bad), /chat\\\.completion/);
});

test('expectShape literal string match (for code fields)', () => {
  expectShape({ code: 'AUTH_REQUIRED' }, { code: 'AUTH_REQUIRED' });
  assert.throws(
    () => expectShape({ code: 'OTHER' }, { code: 'AUTH_REQUIRED' }),
    /expected literal "AUTH_REQUIRED"/
  );
});

test('parseSSE decodes data lines and skips [DONE]', () => {
  const text = [
    'data: {"a":1}',
    '',
    'data: {"a":2}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');
  const chunks = parseSSE(text);
  assert.deepEqual(chunks, [{ a: 1 }, { a: 2 }]);
});

test('makeStreamResponse + parseSSE round-trip', async () => {
  const chunks = [
    { id: 'a', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: { role: 'assistant' } }] },
    { id: 'a', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: { content: 'hi' } }] },
    { id: 'a', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ];
  const res = makeStreamResponse(chunks);
  const text = await res.text();
  const decoded = parseSSE(text);
  assert.equal(decoded.length, 3);
  for (const c of decoded) expectOpenAIStreamChunk(c);
});

test('stubFetch installs and restores', async () => {
  const restore = stubFetch((url) => {
    if (url.includes('keyless')) return FIXTURE_CHAT;
    return { status: 404, body: { error: 'no' } };
  });
  try {
    const r = await fetch('https://keylessai.thryx.workers.dev/v1/chat/completions');
    const body = await r.json();
    expectOpenAIChat(body);
  } finally {
    restore();
  }
  assert.equal(typeof globalThis.fetch, 'function');
});

test('withTimer enforces budget', async () => {
  const { ms } = await withTimer('fast', () => Promise.resolve(42), { maxMs: 50 });
  assert.ok(ms < 50);
  await assert.rejects(
    () => withTimer('slow', () => new Promise((r) => setTimeout(r, 30)), { maxMs: 5 }),
    /budget 5ms/
  );
});

test('retry with backoff', async () => {
  let n = 0;
  const result = await retry(async () => {
    n++;
    if (n < 3) throw new Error(`flake ${n}`);
    return 'ok';
  }, { attempts: 5, baseMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(n, 3);
});

test('freezeTime advances and restores', () => {
  const t = freezeTime(1_000);
  try {
    assert.equal(Date.now(), 1_000);
    t.advance(500);
    assert.equal(Date.now(), 1_500);
  } finally {
    t.restore();
  }
});

test('quietConsole captures', async () => {
  const { result, captured } = await quietConsole(async () => {
    console.log('a'); console.warn('b'); console.error('c');
    return 1;
  });
  assert.equal(result, 1);
  assert.equal(captured.log[0], 'a');
  assert.equal(captured.warn[0], 'b');
  assert.equal(captured.error[0], 'c');
});

test('expectShape regex match', () => {
  expectShape({ id: 'chatcmpl-abc' }, { id: /^chatcmpl-/ });
});

test('expectShape predicate function', () => {
  expectShape({ count: 7 }, { count: (v) => v > 5 });
});

test('expectShape optional keys with ? prefix', () => {
  expectShape(
    { ok: true },
    { ok: 'boolean', '?usage': 'object' }
  );
});
