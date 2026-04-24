# Changelog

Notable changes. This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Drawer endpoint data extracted to `src/ui/drawer-endpoints.js` for easier editing
- CHANGELOG.md (this file)

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
