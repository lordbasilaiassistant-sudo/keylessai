# Changelog

Notable changes. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.1] — 2026-04-28

Robustness fixes from THRYX dogfooding. Stress-testing AUTO-style tool-call traffic against the live Worker surfaced two real failure modes that callers can't recover from on their own.

### Fixed
- **Yqcloud IP-ban content leak** — when `binjie.fun` blocks the Worker's IP, Yqcloud returns the Chinese-language ban notice as `message.content` instead of a real LLM response. The notice detector previously didn't recognize this shape, so it fell through to the caller as if it were a model output. Added 9 patterns matching the ban-message structure (Chinese phrases like "您的ip", "防滥用检测", "滥用本站", "自助购买key", and the leaked spam domains `aichatosrg.com` / `chatavx.com` / `binjie.fun` / `binjie.site` / `binjie09` / `apifox.com/apidoc`). Router now flags + fails over instead of returning the ban as content. 2 new tests in `test/notices.test.mjs` plus 1 negative-control test that a legitimate Chinese-language LLM response with a passing IP mention is NOT flagged.
- **Pollinations tool-call fragmentation** — observed live where one logical tool call streams as two `tool_call_delta` chunks with different indices: first carries `name + truncated JSON args` (e.g. `'{"percent":'`), second carries `empty name + tail of args` (e.g. `'50}'`). The previous accumulator in `src/server/proxy.js` emitted both as separate `message.tool_calls[]` entries, breaking any caller that runs `JSON.parse(arguments)`. The accumulator now stitches: when an entry has empty `name` AND its args don't start with `{` or `[` AND the previous entry's args don't already form valid JSON, the fragment is merged into the previous entry. 6 new tests in `test/tools.test.mjs` covering: clean single calls (no false-stitch), real fragmented case stitches and the resulting JSON parses, genuinely-parallel calls do NOT stitch, complete-JSON-followed-by-empty-name does NOT stitch, out-of-order indices, missing `id` fallback.

### Internal
- Exported `buildToolCallsFromAccumulator` from `src/server/proxy.js` for unit testability. Marked internal in JSDoc; not part of the documented public API.
- Full suite: 136/136 tests passing.

## [0.4.0] — 2026-04-25

Tool calling. The `tools` field is no longer silently dropped — `tool_calls` round-trips end to end on the public Worker and the local proxy.

### Added
- **OpenAI tool calling** — `POST /v1/chat/completions` with a `tools` array now returns `message.tool_calls` (non-stream) or `delta.tool_calls` SSE deltas (stream). `tool_choice`, `parallel_tool_calls`, and `role: "tool"` reply messages are all forwarded through the pipeline. `finish_reason` correctly reports `"tool_calls"` when the model emits a call.
- **Provider capability flags** — every provider now exports `capabilities = { tools: bool }`. Pollinations + ApiAirforce both advertise `true`; Pollinations-GET + Yqcloud are `false`. Custom providers registered via `registerProvider()` default to `false` for safety.
- **Tool-aware failover** — when a request includes `tools`, the router filters `FAILOVER_ORDER` to providers that advertise `capabilities.tools`. If none qualify, it throws `ToolsUnsupportedError` (mapped to a 400 with `code: "tool_calls_unsupported"`) instead of silently degrading to a non-tool provider.
- **`providerSupportsTools(id)` + `ToolsUnsupportedError`** exported from the package surface.
- **Tool schema validation** (`src/server/validate.js`) — `tools.length ≤ 128`, `function.name` length ≤ 64 + charset `[a-zA-Z0-9_-]+`, `tool_choice` shape (`"auto" | "none" | "required" | {type, function}`), `parallel_tool_calls` boolean. All rejections emit a clean 400.
- **`examples/tool-calling.js`** — runnable two-turn round-trip example using the OpenAI Node SDK + a `get_weather` tool.
- **27 new tests** across `test/tools.test.mjs` (9 happy-path) and `test/tools.extreme.test.mjs` (18 adversarial — char-by-char streaming, parallel tool calls, prototype-pollution payloads, mid-stream errors, cache-poisoning attempts, all-providers-circuit-open).

### Changed
- **Cache bypass for tool-bearing requests** — both proxy and Worker now skip `defaultCache` entirely when `body.tools` is present. Tool-call payloads are inherently non-idempotent (each `call_id` participates in a turn-by-turn round trip with the client), so replaying a cached response would either collide call_ids or skip the round trip the client expects.
- **Worker version bumped to 0.4.0** (visible at `GET /health`).

### Fixed
- Pollinations + ApiAirforce streamers previously parsed `delta.tool_calls` from the upstream SSE but discarded it. They now emit `{type: "tool_call_delta", index, id?, name?, arguments?}` chunks that propagate through the router untouched.

## [0.3.0] — 2026-04-24

Public Worker is LIVE. No more localhost-first. Swap one env var and ship.

### Added
- **Public Cloudflare Worker** — live at `https://keylessai.thryx.workers.dev/v1`. Zero install, zero signup, zero keys. The whole proxy (router, cache, queue, circuit breaker, rate limiter, validator, metrics) now runs at the edge on Cloudflare's free tier (100k req/day).
- **Fourth keyless provider: Yqcloud** (`providers/yqcloud.js`) via `api.binjie.fun`. Plain-text streaming, open CORS, works out of the box in the Worker environment. Four real providers now rotate under the router.
- **Adaptive failover ranking** (`src/core/metrics.js` → `score(id)` + `rank(ids)`). Router's `auto` mode now re-orders providers by live success rate × latency penalty every request instead of a fixed order. Best-performing upstream always leads.
- **Input validation hardening** (`src/core/validate.js`) — prototype-pollution block (`__proto__`, `constructor`, `prototype`), 1 MiB body cap, message-count cap, role whitelist, tool-call schema check. All rejections emit a clean 400 with an `invalid_request_error` type.
- **Error message sanitization** — internal error strings are scrubbed before reaching clients (no filesystem paths, no stack frames, no provider internals). Request-id correlation on every error.
- **`rateLimiter` stats on `/health`** — live per-IP bucket state exposed alongside cache, circuit, queue, and latency stats.
- **`worker/` deployment surface** (`worker/index.js`, `worker/wrangler.toml`) — Cloudflare Workers entry using the same shared `src/core/*` runtime as the Node proxy. One codebase, two runtimes.
- **OpenSSF Scorecard + Dependabot + gitleaks + CodeQL** workflows wired into `.github/workflows/`. Public security posture.

### Changed
- **README, AGENTS.md, llms.txt, llms-full.txt, index.html meta, drawer-endpoints.js, examples/*** now all lead with `https://keylessai.thryx.workers.dev/v1`. The `npx keylessai serve --local` flow is preserved as an opt-in alternative for air-gapped / firewalled environments.
- **Landing-page structured data** (JSON-LD `SoftwareApplication`) updated to reference the public Worker endpoint as the primary surface.
- **Model aliasing catalog** now counts 13 aliased names (`gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet-latest`, etc.) all routing to `openai-fast`. Published in `/v1/models` response.

### Fixed
- `llms-full.txt` carried a `/v1/openai` path that leaked through from the pre-Worker Pollinations direct path — corrected to standard `/v1/chat/completions`.
- `examples/curl-streaming.sh` was hitting the upstream `/openai` path; now uses the Worker's `/v1/chat/completions`.
- Every `examples/` file (aider, cline, continue, langchain, openai-sdk-node, openai-sdk-python, litellm-config, claude-code-bridge) has been migrated from direct-upstream URLs to the Worker.

## [0.2.1] — 2026-04-24

Reliability + dogfood pass. No breaking changes. Upgrade is safe for anyone on 0.2.0.

### Added
- **Dogfood test harness** (`dogfood/`) — runnable end-to-end tests that actually exercise real third-party SDKs (OpenAI Node, OpenAI Python, LangChain) + raw curl + /v1/completions + /v1/embeddings. Nightly CI workflow runs them and uploads 30-day transcript artifacts.
- **Stream watchdog** (`src/core/stream.js`) — heartbeat (45s) + overall deadline (180s) + fetch-level timeout (30s). Providers' `streamChat` now uses `readWithWatchdog()` so upstream silent-hangs trigger failover instead of hanging forever.
- **Circuit breaker** (`src/core/circuit.js`) — 5 consecutive failures opens the circuit per provider, 30s cooldown, then half-open. Router skips open providers instantly.
- **Per-provider latency metrics** (`src/core/metrics.js`) — rolling p50/p95 TTFB + success rate over the last 100 samples per provider. Exposed on `/health`.
- **Graceful shutdown** — `server.drain(graceMs)` waits for in-flight requests to finish before exiting; CLI SIGINT/SIGTERM uses it.
- **Request body cap** — 1 MiB limit on POST bodies with a clean 413 response. Prevents OOM from hostile/broken clients.
- **`/v1/completions`** legacy endpoint (wraps `prompt` as a chat message).
- **`/v1/embeddings` 501 stub** with a helpful error pointing users at self-hosted options.
- **CLI `doctor` subcommand** — provider health + latency + model list + end-to-end smoke test.
- **CHANGELOG.md** and **SECURITY.md**.
- **CONTRIBUTING.md**, issue templates, PR template.
- **CSP, Referrer-Policy, X-Content-Type-Options, Permissions-Policy** meta tags.
- **`:focus-visible` ring, ARIA labels, mobile 44px tap targets, `prefers-reduced-motion`** support.
- **Aggregator pool stats strip** on hero (honest live-verified vs upstream-tracked counts).
- **Chat history persistence** across page reloads (localStorage, capped at 50 turns).
- **Markdown rendering** in chat with safe code-block copy + XSS-tested link-scheme filter.
- **Retry + switch-provider actions** on error bubbles; **copy + regenerate actions** on assistant messages.
- **Thinking indicator** while model emits reasoning tokens before real content.
- **Auto-deploy to GitHub Pages** via Actions.
- **Daily provider catalog sync** from `Free-AI-Things/g4f-working` (183 tracked models across 13 upstream providers).
- **Test suite** grew from 0 → 60 tests across 8 modules, gated in CI.
- **JSDoc** on all public exports.
- **`.gitattributes`**, **`.nvmrc`**, **`.vscode/settings.json`** for contributor consistency.

### Changed
- **Organized into `src/{ui,core,server}`** — clean browser / shared / Node-only split.
- **Split 518-line `app.js`** into focused modules: `storage`, `suggestions`, `messages`, `pool-stats`.
- **Router auto mode is now fast-fail**: no health-check round-trip, no same-provider retry, instant failover. Pinned mode keeps modest retry budgets.
- **Cache key now includes `temperature`, `top_p`, `tools`, `response_format`** — fixes silent correctness bug where high-temperature callers got deterministic cached replies.
- **Extracted notice detection** to `src/core/notices.js` with 9 tests covering real-world samples.
- **Extracted drawer endpoint data** to `src/ui/drawer-endpoints.js` for easier editing.

### Fixed
- CSS specificity — inline-code styling was leaking into fenced code blocks.
- Flaky CI queue test (`.unref()` let event loop exit before timer fired).
- Send button was `disabled` during streaming, so clicking it couldn't abort (only Enter worked).

## [0.2.0] — 2026-04-24

Second shipload. Focus: real multi-provider aggregation, production-ready
proxy, and repo maturity for collaborators and forks.

### Added
- **Second real provider**: ApiAirforce (`providers/airforce.js`) with 8 free-tier models (`grok-4.1-mini:free`, `step-3.5-flash:free`, etc.), inline `<think>` stripping, CORS-open
- **Proxy prompt cache** (`src/core/cache.js`) — LRU + 5-min TTL, 15× speedup on identical repeat calls, exposed stats on `/health`
- **Client-side single-flight queue** (`src/core/queue.js`) — serializes parallel callers to stay under Pollinations' 1-concurrent-per-IP limit; eliminates "Queue full" 429s
- **Notice / ad injection detection + retry** in the router — auto-retries with exponential backoff when providers return promo URLs or deprecation notices instead of real responses
- **Model name aliasing** in the proxy — your code can send `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet-latest`, etc. and the proxy transparently routes to the current anonymous-tier model
- **CLI `doctor` subcommand** — provider health checks with latency, live model lists, slot gate + cache stats, end-to-end smoke test
- **Auto-deploy** to GitHub Pages via Actions (ships in ~30s)
- **Daily provider catalog sync** from [Free-AI-Things/g4f-working](https://github.com/Free-AI-Things/g4f-working) — auto-commits an updated `providers/_catalog.json` when upstream changes
- **Test suite** (32 tests): markdown renderer (XSS safety, code blocks, safe link schemes), LRU cache (TTL, eviction, stats), slot gate (serialization, timeouts, overflow), storage (localStorage round-tripping, corruption recovery)
- **CI gate** on every push and PR (`.github/workflows/test.yml`)
- **Aggregator stats strip** on the hero: honest live-verified counts vs upstream-tracked counts
- **Chat persistence** across page reloads (localStorage, capped at 50 turns)
- **Retry + switch-provider actions** on error bubbles
- **Copy + regenerate actions** on assistant messages
- **Markdown rendering** in chat (safe, XSS-tested, code blocks with copy button, lists, headings)
- **Suggestion chips** on empty state
- **CSP, Referrer-Policy, X-Content-Type-Options, Permissions-Policy** meta tags
- **`:focus-visible` ring, ARIA labels, mobile 44px tap targets, `prefers-reduced-motion`** support
- **CONTRIBUTING.md, SECURITY.md, issue + PR templates**
- **JSDoc** on all public exports (`src/index.js`, `core/router.js`, `core/cache.js`, `core/queue.js`)
- **`.gitattributes`** normalizing line endings (no more CRLF warnings)

### Changed
- **Reorganized into `src/{ui,core,server}`** — browser-only / shared-runtime / Node-only are now separate concerns
- **Split the 518-line `app.js` god file** into focused modules: storage, suggestions, messages, pool-stats
- **Hero copy rewritten** to lead with direct URL swap path (no local compute required)
- **README reframed** around the aggregation + spam-filtering value over raw Pollinations
- **Router** serializes through the slot gate, detects spam, and auto-fails over across the pool

### Removed
- WebLLM / Ollama / LM Studio providers — required user local compute, violates the "zero user compute" thesis. Purged from every public asset (README, AGENTS.md, llms.txt, llms-full.txt, index.html meta + JSON-LD, og-image.svg, system prompt, repo description, topics)

### Fixed
- CSS specificity leak — inline-code styling was bleeding into fenced code blocks
- Flaky queue timeout test on CI (`.unref()` allowed event loop to exit before timer fired)
- Pollinations deprecation notice was sometimes served instead of real response — now detected and retried

## [0.1.0] — 2026-04-24

Initial release.

- Static site with chat UI
- Two provider transports: Pollinations SSE (primary) and Pollinations GET (secondary)
- Local proxy CLI via `npx github:lordbasilaiassistant-sudo/keylessai serve`
- OpenAI-compatible `/v1/chat/completions` + `/v1/models` + `/health` endpoints
- MIT licensed
