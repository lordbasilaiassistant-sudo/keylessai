import { createServer } from "node:http";
import { streamChat, listAllModels, PROVIDERS } from "../core/router.js";
import { defaultCache } from "../core/cache.js";
import {
  validateChatBody,
  validateCompletionsBody,
  ValidationError,
} from "./validate.js";
import { defaultLimiter, clientIp } from "./ratelimit.js";

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

function resolveModel(requested) {
  if (!requested) return undefined;
  return MODEL_ALIASES[requested] || requested;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, OpenAI-Beta",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify(obj));
}

function sendError(res, status, message, type = "keylessai_error") {
  sendJson(res, status, { error: { message, type } });
}

const MAX_BODY_BYTES = 1_048_576; // 1 MiB — prevents OOM from hostile/huge POSTs
const MAX_LOG_FIELD = 200;

/** Strip control chars + cap length for anything user-controlled we log. */
function safeLog(s) {
  return String(s || "")
    .replace(/[\x00-\x1F\x7F]/g, "·")
    .slice(0, MAX_LOG_FIELD);
}

/** Sanitize an error message before returning it to a client.
 * Strips absolute file paths (leaks local filesystem), caps length,
 * and scrubs control characters. Internal errors become a generic
 * message — client doesn't need to know our implementation details. */
const MAX_CLIENT_ERROR_MSG = 300;
const INTERNAL_ERROR_PATTERNS = [
  /\b[a-zA-Z]:[\\/][^\s]+/g,       // Windows absolute paths (C:\...)
  /\/(usr|home|root|Users)\/[^\s]+/g, // Unix absolute paths
  /at .+\(.+:\d+:\d+\)/g,           // V8 stack trace frames
  /at .+:\d+:\d+/g,                 // Simpler stack frames
];
function safeErrorMessage(msg, fallback = "internal error") {
  const raw = String(msg || fallback);
  let sanitized = raw;
  for (const re of INTERNAL_ERROR_PATTERNS) {
    sanitized = sanitized.replace(re, "[redacted]");
  }
  return sanitized
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .slice(0, MAX_CLIENT_ERROR_MSG);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      received += c.length;
      if (received > MAX_BODY_BYTES) {
        aborted = true;
        const err = new Error(
          `request body exceeds ${MAX_BODY_BYTES} bytes`
        );
        err.httpStatus = 413;
        err.httpType = "payload_too_large";
        // Pause to stop consuming further data but keep the socket alive so
        // the caller can actually receive the 413 response.
        try { req.pause(); } catch {}
        return reject(err);
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleChatCompletions(req, res, log) {
  let body;
  try {
    body = await readBody(req);
    validateChatBody(body);
  } catch (e) {
    const status = e.httpStatus || 400;
    const type = e.httpType || "invalid_request_error";
    return sendError(res, status, safeErrorMessage(e.message, "bad request"), type);
  }
  return handleChatCompletionsWithBody(req, res, body, log);
}

async function handleChatCompletionsWithBody(req, res, body, log) {
  // Body was already validated in handleChatCompletions OR handleLegacyCompletions.
  const messages = body.messages;

  const requestedModel = body.model || "openai-fast";
  const model = resolveModel(requestedModel);
  const stream = !!body.stream;
  const requestedProvider = body.provider || "auto";

  const id = `chatcmpl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  let activeProvider = null;

  const controller = new AbortController();
  req.on("close", () => controller.abort());

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
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders(),
    });

    const writeSse = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeSse({
      id,
      object: "chat.completion.chunk",
      created,
      model: requestedModel,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    });

    if (cached) {
      log(`✓ cache hit (${cached.length} chars)`);
      writeSse({
        id,
        object: "chat.completion.chunk",
        created,
        model: requestedModel,
        keylessai_provider: "cache",
        choices: [{ index: 0, delta: { content: cached }, finish_reason: null }],
      });
      writeSse({
        id,
        object: "chat.completion.chunk",
        created,
        model: requestedModel,
        keylessai_provider: "cache",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    let streamAssembled = "";
    try {
      for await (const chunk of streamChat({
        provider: requestedProvider,
        model,
        messages,
        signal: controller.signal,
        onProviderChange: (p) => {
          activeProvider = p;
          log(`→ streaming via ${p}`);
        },
      })) {
        if (chunk.type !== "content") continue;
        streamAssembled += chunk.text;
        writeSse({
          id,
          object: "chat.completion.chunk",
          created,
          model: requestedModel,
          keylessai_provider: activeProvider,
          choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }],
        });
      }
      writeSse({
        id,
        object: "chat.completion.chunk",
        created,
        model: requestedModel,
        keylessai_provider: activeProvider,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      res.write("data: [DONE]\n\n");
      res.end();
      if (streamAssembled) defaultCache.put(cacheKey, streamAssembled);
    } catch (e) {
      if (!res.writableEnded) {
        writeSse({
          error: { message: safeErrorMessage(e.message, "upstream failure"), type: "keylessai_upstream_error" },
        });
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
    return;
  }

  if (cached) {
    log(`✓ cache hit (${cached.length} chars, non-stream)`);
    return sendJson(res, 200, {
      id,
      object: "chat.completion",
      created,
      model: requestedModel,
      keylessai_provider: "cache",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: cached },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
    });
  }

  let assembled = "";
  try {
    for await (const chunk of streamChat({
      provider: requestedProvider,
      model,
      messages,
      signal: controller.signal,
      onProviderChange: (p) => {
        activeProvider = p;
      },
    })) {
      if (chunk.type === "content") assembled += chunk.text;
    }
  } catch (e) {
    return sendError(res, 502, safeErrorMessage(e.message, "upstream failure"), "keylessai_upstream_error");
  }

  if (assembled) defaultCache.put(cacheKey, assembled);

  sendJson(res, 200, {
    id,
    object: "chat.completion",
    created,
    model: requestedModel,
    keylessai_provider: activeProvider,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: assembled },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
    },
  });
}

async function handleLegacyCompletions(req, res, log) {
  // Legacy OpenAI text-completions endpoint. Pollinations / airforce don't
  // serve a plain "completions" model anymore, so we transparently wrap
  // `prompt` as a single user message and delegate to chat completions.
  let body;
  try {
    body = await readBody(req);
    validateCompletionsBody(body);
  } catch (e) {
    const status = e.httpStatus || 400;
    const type = e.httpType || "invalid_request_error";
    return sendError(res, status, safeErrorMessage(e.message, "bad request"), type);
  }
  // Rewrite `prompt` to chat-style `messages` and reuse the full pipeline:
  // caching, streaming, notice-detection, queue, provider failover.
  // Re-validate the rewritten body through the chat validator so the same
  // size / role / prototype-pollution guards apply.
  const rewritten = {
    ...body,
    messages: [{ role: "user", content: body.prompt }],
  };
  delete rewritten.prompt;
  try {
    validateChatBody(rewritten);
  } catch (e) {
    return sendError(res, e.httpStatus || 400, safeErrorMessage(e.message, "bad request"), e.httpType || "invalid_request_error");
  }
  return handleChatCompletionsWithBody(req, res, rewritten, log);
}

function handleEmbeddings(req, res) {
  sendJson(res, 501, {
    error: {
      message:
        "embeddings are not available via KeylessAI. No current keyless provider exposes a free embeddings endpoint. For embeddings, self-host a small open model: sentence-transformers (Python), @xenova/transformers (browser/Node, via WASM), or Ollama's nomic-embed-text.",
      type: "not_implemented",
      param: null,
      code: "embeddings_not_supported",
    },
  });
}

async function handleModels(req, res) {
  const groups = await listAllModels();
  const data = [];
  for (const g of groups) {
    for (const m of g.models) {
      data.push({
        id: m.id,
        object: "model",
        owned_by: g.provider,
        keylessai_provider: g.provider,
        keylessai_label: m.label,
      });
    }
  }
  for (const alias of Object.keys(MODEL_ALIASES)) {
    data.push({
      id: alias,
      object: "model",
      owned_by: "keylessai-alias",
      keylessai_provider: "alias",
      keylessai_label: `alias → ${MODEL_ALIASES[alias]}`,
    });
  }
  sendJson(res, 200, { object: "list", data });
}

async function handleHealth(req, res) {
  const { slotGate, breaker, metrics } = await import("../core/router.js");
  const server = req.socket?.server;
  sendJson(res, 200, {
    status: "ok",
    providers: Object.keys(PROVIDERS),
    aliases: Object.keys(MODEL_ALIASES).length,
    version: "0.2.1",
    queue: slotGate
      ? { depth: slotGate.depth, estimatedWaitMs: slotGate.estimatedWaitMs }
      : null,
    active: server && typeof server.active === "number" ? server.active : null,
    cache: defaultCache.stats(),
    circuit: breaker ? breaker.stats() : null,
    latency: metrics ? metrics.stats() : null,
    rateLimiter: defaultLimiter.stats(),
  });
}

function handleRoot(req, res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() });
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>KeylessAI proxy</title>
<style>
  body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#07080b;color:#e8eef7;padding:2rem;max-width:780px;margin:0 auto}
  h1{color:#a8ffda}
  code{background:#12151c;padding:2px 6px;border-radius:4px;border:1px solid #1f2532}
  pre{background:#12151c;border:1px solid #1f2532;padding:14px;border-radius:8px;overflow-x:auto}
  a{color:#7ab8ff}
</style></head>
<body>
<h1>KeylessAI proxy</h1>
<p>This proxy exposes an OpenAI-compatible API at <code>/v1/*</code>. No keys required.</p>
<h3>Point any OpenAI client at this server:</h3>
<pre>export OPENAI_API_BASE="${getBaseUrl(req)}/v1"
export OPENAI_BASE_URL="${getBaseUrl(req)}/v1"
export OPENAI_API_KEY="not-needed"</pre>
<h3>Endpoints</h3>
<ul>
  <li><code>POST /v1/chat/completions</code> — OpenAI chat completions (streaming + non-streaming)</li>
  <li><code>POST /v1/completions</code> — legacy text completions (wraps prompt as a user message)</li>
  <li><code>POST /v1/embeddings</code> — returns 501 (not served by any keyless upstream)</li>
  <li><code>GET /v1/models</code> — list of models and aliases</li>
  <li><code>GET /health</code> — proxy status, queue depth, cache stats</li>
</ul>
<p>Docs: <a href="https://github.com/lordbasilaiassistant-sudo/keylessai" target="_blank">github.com/lordbasilaiassistant-sudo/keylessai</a></p>
</body></html>`);
}

function getBaseUrl(req) {
  const host = req.headers.host || "localhost";
  return `http://${host}`;
}

export function createProxy({ log = console.log } = {}) {
  // Track active requests so shutdown can wait for them to drain.
  let active = 0;
  const bump = () => {
    active++;
  };
  const drop = () => {
    active--;
    if (server._drainResolve && active === 0) {
      server._drainResolve();
    }
  };

  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    bump();
    let _dropped = false;
    const dropOnce = () => {
      if (_dropped) return;
      _dropped = true;
      drop();
    };
    res.on("finish", dropOnce);
    res.on("close", dropOnce);

    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Rate-limit POST endpoints (the expensive ones). GET /health + /models
    // + / are cheap diagnostics, leave them open.
    if (req.method === "POST") {
      const ip = clientIp(req);
      const verdict = defaultLimiter.check(ip);
      if (!verdict.allowed) {
        res.setHeader("Retry-After", String(verdict.retryAfterSec));
        return sendError(
          res,
          429,
          `rate limit exceeded for ${safeLog(ip)} (retry after ${verdict.retryAfterSec}s)`,
          "rate_limit_exceeded"
        );
      }
    }

    try {
      if (req.method === "POST" && (path === "/v1/chat/completions" || path === "/chat/completions")) {
        return await handleChatCompletions(req, res, log);
      }
      if (req.method === "POST" && (path === "/v1/completions" || path === "/completions")) {
        return await handleLegacyCompletions(req, res, log);
      }
      if (req.method === "POST" && (path === "/v1/embeddings" || path === "/embeddings")) {
        return handleEmbeddings(req, res);
      }
      if (req.method === "GET" && (path === "/v1/models" || path === "/models")) {
        return await handleModels(req, res);
      }
      if (req.method === "GET" && path === "/health") {
        return handleHealth(req, res);
      }
      if (req.method === "GET" && path === "/") {
        return handleRoot(req, res);
      }
      sendError(res, 404, `not found: ${req.method} ${path}`, "not_found");
    } catch (e) {
      log(`error handling ${safeLog(req.method)} ${safeLog(req.url)}: ${safeLog(e.message)}`);
      if (!res.headersSent) {
        // Client sees generic message; full error already logged server-side.
        sendError(res, 500, "internal error");
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  /**
   * Graceful drain: stop accepting new connections, wait for in-flight
   * requests to finish, then resolve. Returns immediately if idle.
   *
   * @param {number} [graceMs=30000] Max time to wait before giving up.
   * @returns {Promise<{drained: boolean, remaining: number}>}
   */
  server.drain = function drain(graceMs = 30_000) {
    server.close(); // stops accepting new connections (keeps existing alive)
    if (active === 0) {
      return Promise.resolve({ drained: true, remaining: 0 });
    }
    return new Promise((resolve) => {
      server._drainResolve = () => resolve({ drained: true, remaining: 0 });
      const t = setTimeout(() => {
        server._drainResolve = null;
        resolve({ drained: false, remaining: active });
      }, graceMs);
      if (typeof t.unref === "function") t.unref();
    });
  };

  /** Current in-flight request count (observability). */
  Object.defineProperty(server, "active", { get: () => active });

  return server;
}
