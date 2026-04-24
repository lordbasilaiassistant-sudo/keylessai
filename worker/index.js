// KeylessAI Cloudflare Worker — the PUBLIC API endpoint.
//
// Same router as the local proxy (src/core/router.js + providers/*.js) but
// wrapped in the Workers fetch-event API instead of Node http. Zero Node
// dependencies — works on Cloudflare's V8 isolate, Deno Deploy, Vercel
// Edge, and any other web-standard fetch runtime.
//
// Deploy:
//   cd worker
//   npx wrangler deploy
//
// Free tier: 100,000 requests/day. Cannot bill you unless you explicitly
// enable Workers Paid. If traffic exceeds the cap, requests 429 for the
// rest of the day — graceful degradation, no surprise invoices.

import { streamChat, listAllModels, PROVIDERS, slotGate, breaker, metrics } from "../src/core/router.js";
import { defaultCache } from "../src/core/cache.js";
import { defaultLimiter, clientIp } from "../src/server/ratelimit.js";
import { validateChatBody, validateCompletionsBody } from "../src/server/validate.js";

const MODEL_ALIASES = {
  "gpt-3.5-turbo": "openai-fast",
  "gpt-4": "openai-fast",
  "gpt-4-turbo": "openai-fast",
  "gpt-4o": "openai-fast",
  "gpt-4o-mini": "openai-fast",
  "gpt-4.1": "openai-fast",
  "o1-mini": "openai-fast",
  "o1-preview": "openai-fast",
  "o3-mini": "openai-fast",
  "claude-3-haiku-20240307": "openai-fast",
  "claude-3-5-sonnet-20241022": "openai-fast",
  "claude-3-5-sonnet-latest": "openai-fast",
  "claude-3-opus-20240229": "openai-fast",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, OpenAI-Beta",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY_BYTES = 1_048_576;
const MAX_CLIENT_ERROR_MSG = 300;
const INTERNAL_ERROR_PATTERNS = [
  /\b[a-zA-Z]:[\\/][^\s]+/g,
  /\/(usr|home|root|Users)\/[^\s]+/g,
  /at [^(\n]{1,300}\([^)\n]{1,500}:\d+:\d+\)/g,
  /at [^\s:\n]{1,300}:\d+:\d+/g,
];

function safeErrorMessage(msg, fallback = "internal error") {
  let s = String(msg || fallback);
  for (const re of INTERNAL_ERROR_PATTERNS) s = s.replace(re, "[redacted]");
  return s.replace(/[\x00-\x1F\x7F]/g, " ").slice(0, MAX_CLIENT_ERROR_MSG);
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });
}

function errorResp(status, message, type = "keylessai_error") {
  return json(status, { error: { message: safeErrorMessage(message), type } });
}

function resolveModel(name) {
  if (!name) return undefined;
  return MODEL_ALIASES[name] || name;
}

async function readBody(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    const err = new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    err.httpStatus = 413;
    err.httpType = "payload_too_large";
    throw err;
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    const err = new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    err.httpStatus = 413;
    err.httpType = "payload_too_large";
    throw err;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("invalid json body");
    err.httpStatus = 400;
    throw err;
  }
}

function workerClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

async function handleChatCompletions(request) {
  let body;
  try {
    body = await readBody(request);
    validateChatBody(body);
  } catch (e) {
    return errorResp(
      e.httpStatus || 400,
      e.message,
      e.httpType || "invalid_request_error"
    );
  }
  return runChat(body);
}

async function handleLegacyCompletions(request) {
  let body;
  try {
    body = await readBody(request);
    validateCompletionsBody(body);
  } catch (e) {
    return errorResp(e.httpStatus || 400, e.message, e.httpType || "invalid_request_error");
  }
  const rewritten = {
    ...body,
    messages: [{ role: "user", content: body.prompt }],
  };
  delete rewritten.prompt;
  try {
    validateChatBody(rewritten);
  } catch (e) {
    return errorResp(400, e.message, "invalid_request_error");
  }
  return runChat(rewritten);
}

async function runChat(body) {
  const requestedModel = body.model || "openai-fast";
  const model = resolveModel(requestedModel);
  const stream = !!body.stream;
  const messages = body.messages;

  const id = `chatcmpl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  let activeProvider = null;

  const cacheKey = defaultCache.keyFor({
    model,
    messages,
    temperature: body.temperature,
    top_p: body.top_p,
    tools: body.tools,
    response_format: body.response_format,
  });
  const cached = defaultCache.get(cacheKey);

  if (stream) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const write = (chunk) => writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));

    // Fire-and-forget streaming into the TransformStream.
    (async () => {
      write({
        id,
        object: "chat.completion.chunk",
        created,
        model: requestedModel,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });

      if (cached) {
        write({
          id,
          object: "chat.completion.chunk",
          created,
          model: requestedModel,
          keylessai_provider: "cache",
          choices: [{ index: 0, delta: { content: cached }, finish_reason: null }],
        });
        write({
          id,
          object: "chat.completion.chunk",
          created,
          model: requestedModel,
          keylessai_provider: "cache",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
        return;
      }

      let assembled = "";
      try {
        for await (const chunk of streamChat({
          provider: "auto",
          model,
          messages,
          onProviderChange: (p) => (activeProvider = p),
        })) {
          if (chunk.type !== "content") continue;
          assembled += chunk.text;
          write({
            id,
            object: "chat.completion.chunk",
            created,
            model: requestedModel,
            keylessai_provider: activeProvider,
            choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }],
          });
        }
        write({
          id,
          object: "chat.completion.chunk",
          created,
          model: requestedModel,
          keylessai_provider: activeProvider,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
        if (assembled) defaultCache.put(cacheKey, assembled);
      } catch (e) {
        write({ error: { message: safeErrorMessage(e.message), type: "keylessai_upstream_error" } });
      } finally {
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS,
      },
    });
  }

  if (cached) {
    return json(200, {
      id,
      object: "chat.completion",
      created,
      model: requestedModel,
      keylessai_provider: "cache",
      choices: [{ index: 0, message: { role: "assistant", content: cached }, finish_reason: "stop" }],
      usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
    });
  }

  let assembled = "";
  try {
    for await (const chunk of streamChat({
      provider: "auto",
      model,
      messages,
      onProviderChange: (p) => (activeProvider = p),
    })) {
      if (chunk.type === "content") assembled += chunk.text;
    }
  } catch (e) {
    return errorResp(502, e.message, "keylessai_upstream_error");
  }

  if (assembled) defaultCache.put(cacheKey, assembled);

  return json(200, {
    id,
    object: "chat.completion",
    created,
    model: requestedModel,
    keylessai_provider: activeProvider,
    choices: [{ index: 0, message: { role: "assistant", content: assembled }, finish_reason: "stop" }],
    usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
  });
}

async function handleModels() {
  const groups = await listAllModels();
  const data = [];
  for (const g of groups) {
    for (const m of g.models) {
      data.push({
        id: m.id,
        object: "model",
        owned_by: g.provider,
        keylessai_provider: g.provider,
      });
    }
  }
  for (const alias of Object.keys(MODEL_ALIASES)) {
    data.push({ id: alias, object: "model", owned_by: "keylessai-alias" });
  }
  return json(200, { object: "list", data });
}

async function handleHealth() {
  return json(200, {
    status: "ok",
    version: "0.3.0",
    runtime: "cloudflare-worker",
    providers: Object.keys(PROVIDERS),
    aliases: Object.keys(MODEL_ALIASES).length,
    queue: { depth: slotGate.depth, estimatedWaitMs: slotGate.estimatedWaitMs },
    cache: defaultCache.stats(),
    circuit: breaker.stats(),
    latency: metrics.stats(),
    rateLimiter: defaultLimiter.stats(),
  });
}

function handleRoot(request) {
  const origin = new URL(request.url).origin;
  const body = `<!doctype html>
<html><head><meta charset="utf-8"><title>KeylessAI public endpoint</title>
<style>
  body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#07080b;color:#e8eef7;padding:2rem;max-width:780px;margin:0 auto;line-height:1.6}
  h1{color:#a8ffda;margin:0 0 0.2em}
  code{background:#12151c;padding:2px 6px;border-radius:4px;border:1px solid #1f2532}
  pre{background:#12151c;border:1px solid #1f2532;padding:14px;border-radius:8px;overflow-x:auto}
  a{color:#7ab8ff}
</style></head>
<body>
<h1>KeylessAI</h1>
<p>Free OpenAI-compatible LLM endpoint. No keys. No signup. No local install.</p>
<h3>Use from any OpenAI client:</h3>
<pre>export OPENAI_API_BASE="${origin}/v1"
export OPENAI_BASE_URL="${origin}/v1"
export OPENAI_API_KEY="not-needed"</pre>
<h3>Endpoints</h3>
<ul>
  <li><code>POST /v1/chat/completions</code></li>
  <li><code>POST /v1/completions</code></li>
  <li><code>POST /v1/embeddings</code> (returns 501 with guidance)</li>
  <li><code>GET /v1/models</code></li>
  <li><code>GET /health</code></li>
</ul>
<p>Source: <a href="https://github.com/lordbasilaiassistant-sudo/keylessai">github.com/lordbasilaiassistant-sudo/keylessai</a></p>
</body></html>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Rate-limit POST paths. Use Cloudflare's provided client IP.
    if (request.method === "POST") {
      const verdict = defaultLimiter.check(workerClientIp(request));
      if (!verdict.allowed) {
        return errorResp(
          429,
          `rate limit exceeded (retry after ${verdict.retryAfterSec}s)`,
          "rate_limit_exceeded"
        );
      }
    }

    try {
      if (request.method === "POST" && (path === "/v1/chat/completions" || path === "/chat/completions")) {
        return await handleChatCompletions(request);
      }
      if (request.method === "POST" && (path === "/v1/completions" || path === "/completions")) {
        return await handleLegacyCompletions(request);
      }
      if (request.method === "POST" && (path === "/v1/embeddings" || path === "/embeddings")) {
        return errorResp(
          501,
          "embeddings not available via KeylessAI — no keyless upstream provides them. Self-host sentence-transformers or use nomic-embed-text via Ollama.",
          "not_implemented"
        );
      }
      if (request.method === "GET" && (path === "/v1/models" || path === "/models")) {
        return await handleModels();
      }
      if (request.method === "GET" && path === "/health") {
        return await handleHealth();
      }
      if (request.method === "GET" && path === "/") {
        return handleRoot(request);
      }
      return errorResp(404, `not found: ${request.method} ${path}`, "not_found");
    } catch (e) {
      return errorResp(500, "internal error");
    }
  },
};
