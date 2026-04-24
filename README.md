# KeylessAI &mdash; Free OpenAI API Alternative (No API Key Required)

> **A drop-in OpenAI-compatible endpoint with zero API keys, zero signup, zero cost, and zero user compute.** Point your OpenAI client at `https://keylessai.thryx.workers.dev/v1` &mdash; that's it. Your existing OpenAI code, Aider, Cline, Continue.dev, LangChain, Codex, and anything else that speaks the OpenAI chat-completions protocol just works. Model-name aliasing (`gpt-4o`, `claude-3-5-sonnet-latest`, etc.), adaptive multi-provider failover, prompt cache, circuit breaker, rate limiting &mdash; all handled at the edge.

[![Deploy](https://github.com/lordbasilaiassistant-sudo/keylessai/actions/workflows/deploy.yml/badge.svg)](https://github.com/lordbasilaiassistant-sudo/keylessai/actions/workflows/deploy.yml)
[![Tests](https://github.com/lordbasilaiassistant-sudo/keylessai/actions/workflows/test.yml/badge.svg)](https://github.com/lordbasilaiassistant-sudo/keylessai/actions/workflows/test.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/lordbasilaiassistant-sudo/keylessai/badge)](https://scorecard.dev/viewer/?uri=github.com/lordbasilaiassistant-sudo/keylessai)
[![Live](https://img.shields.io/badge/live-keylessai-a8ffda?style=flat-square&logo=github)](https://lordbasilaiassistant-sudo.github.io/keylessai/)
[![License: MIT](https://img.shields.io/badge/license-MIT-7ab8ff?style=flat-square)](LICENSE)
[![No API Keys](https://img.shields.io/badge/api%20keys-0-a8ffda?style=flat-square)](#)
[![Stars](https://img.shields.io/github/stars/lordbasilaiassistant-sudo/keylessai?style=flat-square&color=ffd27a)](https://github.com/lordbasilaiassistant-sudo/keylessai/stargazers)

**Live demo:** https://lordbasilaiassistant-sudo.github.io/keylessai/

---

## Why this exists

If you run autonomous coding agents, chatbots, or LangChain pipelines, your OpenAI bill can easily hit **hundreds to thousands a month**. KeylessAI routes those same calls to **public, no-auth LLM endpoints** &mdash; most notably [Pollinations.ai](https://pollinations.ai), which exposes an OpenAI-compatible chat endpoint on their anonymous tier. Swap one env var; your agent bill goes to $0.

KeylessAI adds the layer on top of raw Pollinations that makes this usable in production: multi-provider aggregation (Pollinations + [ApiAirforce](https://api.airforce/) today, more as they appear), a client-side single-flight queue so parallel callers don't blow through the 1-concurrent-per-IP limit, and aggressive filtering of the deprecation notices and promo-URL ads that upstream providers occasionally inject into responses.

## The one-liner

```bash
export OPENAI_API_BASE="https://keylessai.thryx.workers.dev/v1"
export OPENAI_BASE_URL="https://keylessai.thryx.workers.dev/v1"
export OPENAI_API_KEY="not-needed"
# now run your agent — no changes to your code
```

That's the whole setup. Hits a Cloudflare Worker at the edge that wraps our router: 4 keyless upstream providers with adaptive failover, prompt cache, circuit breaker, per-IP rate limiting, model-name aliasing so `gpt-4o` / `claude-3-5-sonnet-latest` / etc. resolve automatically. Cloudflare's free tier covers 100k req/day; past that it degrades to 429s instead of billing anyone.

Try it right now:

```bash
curl https://keylessai.thryx.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'
```

### Other ways to use it

Same router, same code, different packaging:

- **Library import** (`npm install github:lordbasilaiassistant-sudo/keylessai`) — runs in your own Node process. Used by [`keylessai-daily`](https://github.com/lordbasilaiassistant-sudo/keylessai-daily) to auto-update its README every day via GitHub Actions.
- **Local proxy** (`npx github:lordbasilaiassistant-sudo/keylessai serve --local`) — same OpenAI-compatible HTTP surface, running on `127.0.0.1:8787`. For air-gapped environments or when you prefer zero external dependencies.
- **Self-hosted Worker** — fork the repo and `cd worker && npx wrangler deploy` to your own Cloudflare account. Source is in [`worker/`](worker/).

## Works with

Once `npx keylessai serve` is running, every OpenAI-compatible tool works against `https://keylessai.thryx.workers.dev/v1` with no code changes:

| Tool | Integration |
|---|---|
| [Aider](https://aider.chat/) | `OPENAI_API_BASE=https://keylessai.thryx.workers.dev/v1 OPENAI_API_KEY=not-needed aider --model gpt-4o` &nbsp;_(gpt-4o gets aliased)_ |
| [Cline](https://github.com/cline/cline) / Roo Code | Settings &rarr; OpenAI provider, baseUrl = `https://keylessai.thryx.workers.dev/v1`, key = `not-needed` |
| [Continue.dev](https://continue.dev/) | `~/.continue/config.json` &rarr; provider `"openai"`, `apiBase: "https://keylessai.thryx.workers.dev/v1"`, `apiKey: "not-needed"` |
| [Codex CLI](https://github.com/openai/codex) | `export OPENAI_BASE_URL=https://keylessai.thryx.workers.dev/v1 OPENAI_API_KEY=not-needed && codex` |
| [Claude Code](https://claude.com/claude-code) | via [LiteLLM bridge](examples/claude-code-bridge.md) &mdash; translate Anthropic format to OpenAI |
| [LangChain](https://python.langchain.com/) | `ChatOpenAI(base_url="https://keylessai.thryx.workers.dev/v1", api_key="not-needed", model="openai-fast")` |
| [OpenAI SDK (Python)](https://github.com/openai/openai-python) | `OpenAI(base_url="https://keylessai.thryx.workers.dev/v1", api_key="not-needed")` &mdash; pass any model name |
| [OpenAI SDK (Node)](https://github.com/openai/openai-node) | `new OpenAI({ baseURL: "https://keylessai.thryx.workers.dev/v1", apiKey: "not-needed" })` |
| [LlamaIndex](https://docs.llamaindex.ai/) | `OpenAI(api_base="https://keylessai.thryx.workers.dev/v1", api_key="not-needed")` |
| [LiteLLM proxy](https://github.com/BerriAI/litellm) | `api_base: https://keylessai.thryx.workers.dev/v1, api_key: not-needed` |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | `LLM_BASE_URL=https://keylessai.thryx.workers.dev/v1 LLM_API_KEY=not-needed LLM_MODEL=openai/openai-fast` |
| Anything OpenAI-compatible | Point `baseURL` at `https://keylessai.thryx.workers.dev/v1`, pass any key |

## Quick examples

Start the proxy first:
```bash
npx github:lordbasilaiassistant-sudo/keylessai serve
# → listening on https://keylessai.thryx.workers.dev
```

**Python (streaming):**
```python
from openai import OpenAI

client = OpenAI(
    base_url="https://keylessai.thryx.workers.dev/v1",
    api_key="not-needed",
)

for chunk in client.chat.completions.create(
    model="gpt-4o",  # aliased — actually served by openai-fast
    messages=[{"role": "user", "content": "write a haiku about free AI"}],
    stream=True,
):
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

**curl (streaming):**
```bash
curl -N https://keylessai.thryx.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer anything" \
  -d '{
    "model":"gpt-4o-mini",
    "messages":[{"role":"user","content":"hello"}],
    "stream":true
  }'
```

**LangChain:**
```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="https://keylessai.thryx.workers.dev/v1",
    api_key="not-needed",
    model="gpt-4o",  # aliased
    streaming=True,
)
for chunk in llm.stream("Explain server-sent events in 2 sentences."):
    print(chunk.content, end="", flush=True)
```

**Health check + model list:**
```bash
curl https://keylessai.thryx.workers.dev/health
curl https://keylessai.thryx.workers.dev/v1/models
```

## What you get

### Hosted: the browser chat + docs
https://lordbasilaiassistant-sudo.github.io/keylessai/

- Chat UI with provider/model selectors and automatic failover
- `</>API` drawer with copy-paste snippets for every supported tool

### Provider pool the chat + proxy route through

| Provider | Auth? | Transport | Model(s) |
|---|---|---|---|
| **Pollinations.ai `/openai`** | None &mdash; `Access-Control-Allow-Origin: *` | SSE streaming, OpenAI-compatible | `openai-fast` (GPT-OSS 20B, tool-capable, reasoning) |
| **ApiAirforce `/v1/chat/completions`** | None &mdash; CORS open | SSE streaming, OpenAI-compatible | `grok-4.1-mini:free`, `step-3.5-flash:free`, `gemma3-270m:free`, `moirai-agent`, `translategemma-27b` |
| **Pollinations.ai `/{prompt}`** | None | Plain GET, non-streaming | Secondary transport, same model |

The router retries providers in order on any failure, serializes calls through a single-flight queue to stay under per-IP rate limits, and auto-detects ad injections / deprecation notices with retry-then-failover. You can also pin a specific provider.

## Honest caveats

- **The anonymous tier is not GPT-4.** It's `openai-fast` / GPT-OSS 20B &mdash; genuinely good at prototyping, glue code, Q&A, JSON emission, and small agent loops. It won't beat Claude 3.5 or GPT-4o on hard reasoning or long-context coding. If your agent needs that, use this for the 90% of cheap calls and reserve your paid key for the hard ones.
- **Public endpoints are public endpoints.** Pollinations and ApiAirforce are free because their sponsors cover bandwidth. Be respectful &mdash; don't hammer them with 1000 rps from a hot loop. If you're building a product that relies on this, self-host Pollinations (their code is open source) or add more providers to the pool.
- **Privacy.** Calls to the upstream providers leave your machine &mdash; treat them like any third-party LLM call. For full privacy, use a local-only stack (llama.cpp, Ollama, LM Studio) outside KeylessAI.

## Use as a library

KeylessAI is also an ES-module library. Anything the proxy does programmatically, you can do from your own Node code — including registering custom providers alongside Pollinations/ApiAirforce so your app fails over across *your* backends too.

```bash
# Install from GitHub (no npm publish required yet):
npm install github:lordbasilaiassistant-sudo/keylessai
# or pin a tag:
npm install github:lordbasilaiassistant-sudo/keylessai#v0.2.1
```

```js
import {
  streamChat,
  registerProvider,
  setFailoverOrder,
  createProxy,
  PROVIDERS,
  slotGate,
  defaultCache,
} from "keylessai";

// Register your own provider — could be a self-hosted Ollama, a paid API
// you want to fall back to, a mock for testing, anything that implements
// the five required fields.
registerProvider({
  id: "my-local-mock",
  label: "Local Mock",
  async listModels() { return [{ id: "mock-1", label: "mock", provider: "my-local-mock" }]; },
  async healthCheck() { return true; },
  async* streamChat({ messages }) {
    yield { type: "content", text: "hello from my own provider" };
  },
}, { prepend: true }); // try mine first

// Use the router directly
for await (const chunk of streamChat({
  provider: "auto",
  messages: [{ role: "user", content: "hi" }],
})) {
  if (chunk.type === "content") process.stdout.write(chunk.text);
}

// Or boot the OpenAI-compatible proxy and point your OpenAI SDK at it
createProxy().listen(8787);
```

Runnable example: [`examples/custom-provider.mjs`](examples/custom-provider.mjs)

## Live demos

- **[keylessai-daily](https://github.com/lordbasilaiassistant-sudo/keylessai-daily)** &mdash; a repo whose README writes itself. A GitHub Action calls KeylessAI every day at 09:23 UTC, generates a haiku / tip / joke / one-liner, and appends it to the README. Nobody touches the repo. Total cost: $0. Proof-of-life for the whole stack.

## Self-host

This is a pure static site. To run locally:

```bash
git clone https://github.com/lordbasilaiassistant-sudo/keylessai
cd keylessai
python3 -m http.server 8080
# or: npx serve .
```

To deploy your own copy: fork the repo, enable GitHub Pages on `main` branch root. That's it.

## API drawer contents (at a glance)

Click `</> API` on the live site to see:
- **Drop-in OpenAI replacement** &mdash; bash env vars, Aider, Cline/Roo, Continue.dev, LangChain, OpenAI JS, OpenAI Python
- **Raw HTTP** &mdash; curl, fetch, Python requests for streaming SSE
- **Simple GET** &mdash; URL-encoded prompt, plain-text response
- **Model listing** &mdash; which anonymous-tier models are currently available
- **ApiAirforce direct** &mdash; secondary provider, curl + SDK examples

Every snippet has a one-click **copy** button.

## Support the project

If this saves you $50 on your API bill, consider kicking back $3. No subscription. No login. No feature gates.

| | | |
|---|---|---|
| [$3](https://buy.stripe.com/cNidR2bGo2OD6P3cx58Vi0X) | [$5](https://buy.stripe.com/14A4gs6m4exl8Xb0On8Vi0Y) | [$10](https://buy.stripe.com/14AaEQ6m42ODgpD68H8Vi0Z) |
| [You pick (pay-what-you-want)](https://buy.stripe.com/5kQ28k9yg88XflzfJh8Vi0W) | | |

## Roadmap

- More providers &mdash; hunting additional truly keyless endpoints (HuggingChat spaces, mistral.rs demos, etc.)
- Markdown rendering + syntax highlighting in chat
- Local chat history
- GitHub Actions auto-deploy on push
- CSP + security headers
- Screenshot gallery

See the [issues tab](https://github.com/lordbasilaiassistant-sudo/keylessai/issues) for the full list. PRs welcome &mdash; adding a new provider is ~60 lines (see [`providers/pollinations.js`](providers/pollinations.js) for the shape).

## Credits

- [Pollinations.ai](https://pollinations.ai/) &mdash; public keyless text generation API
- [ApiAirforce](https://api.airforce/) &mdash; free-tier OpenAI-compatible endpoint
- [Free-AI-Things/g4f-working](https://github.com/Free-AI-Things/g4f-working) &mdash; daily-maintained list of currently-working keyless providers
- Built with [Claude Code](https://claude.com/claude-code)

## License

[MIT](LICENSE)
