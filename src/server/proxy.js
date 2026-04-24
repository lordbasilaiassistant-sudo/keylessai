import { createServer } from "node:http";
import { streamChat, listAllModels, PROVIDERS } from "../core/router.js";
import { defaultCache } from "../core/cache.js";

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

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
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
  } catch (e) {
    return sendError(res, 400, e.message, "invalid_request_error");
  }

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) {
    return sendError(res, 400, "messages is required", "invalid_request_error");
  }

  const requestedModel = body.model || "openai-fast";
  const model = resolveModel(requestedModel);
  const stream = !!body.stream;
  const requestedProvider = body.provider || "auto";

  const id = `chatcmpl-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);
  let activeProvider = null;

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const cacheKey = defaultCache.keyFor({ model, messages });
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
          error: { message: e.message || String(e), type: "keylessai_upstream_error" },
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
    return sendError(res, 502, e.message || "upstream failure", "keylessai_upstream_error");
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
  const { slotGate } = await import("../core/router.js");
  sendJson(res, 200, {
    status: "ok",
    providers: Object.keys(PROVIDERS),
    aliases: Object.keys(MODEL_ALIASES).length,
    version: "0.2.0",
    queue: slotGate
      ? { depth: slotGate.depth, estimatedWaitMs: slotGate.estimatedWaitMs }
      : null,
    cache: defaultCache.stats(),
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
  <li><code>GET /v1/models</code> — list of models and aliases</li>
  <li><code>GET /health</code> — proxy status</li>
</ul>
<p>Docs: <a href="https://github.com/lordbasilaiassistant-sudo/keylessai" target="_blank">github.com/lordbasilaiassistant-sudo/keylessai</a></p>
</body></html>`);
}

function getBaseUrl(req) {
  const host = req.headers.host || "localhost";
  return `http://${host}`;
}

export function createProxy({ log = console.log } = {}) {
  return createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (req.method === "POST" && (path === "/v1/chat/completions" || path === "/chat/completions")) {
        return await handleChatCompletions(req, res, log);
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
      log(`error handling ${req.method} ${req.url}: ${e.message}`);
      if (!res.headersSent) {
        sendError(res, 500, e.message || "internal error");
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
}
