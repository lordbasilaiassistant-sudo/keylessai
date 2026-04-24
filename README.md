# KeylessAI

**Free LLM inference. Zero API keys. Zero signup. Zero backend.**

A static web app that talks to *public, no-auth* LLM endpoints and falls back to running open models **entirely in your browser** via WebGPU when everything else is down. Fork it, host it, use it. No `.env`, no tokens, no cost.

> Live: https://lordbasilaiassistant-sudo.github.io/keylessai/

## What it does

You type a message. KeylessAI routes it through a pool of free providers — same pattern as an RPC aggregator — and streams the response back. If the first provider is rate-limited or down, the router falls through to the next one. If the whole internet is on fire, switch to **WebLLM** and the app downloads an open model once, then runs inference locally on your GPU.

## Provider pool

| Provider | Auth? | Transport | What you get |
|---|---|---|---|
| **Pollinations.ai** (`/openai`) | None &mdash; `Access-Control-Allow-Origin: *` | SSE streaming, OpenAI-compatible | GPT-OSS 20B (reasoning), tools capable |
| **Pollinations.ai** (`/{prompt}`) | None | Plain GET, non-streaming | Secondary transport &mdash; used if SSE path 5xx's |
| **WebLLM** (MLC) | None &mdash; runs in your browser | WebGPU, local | Llama-3.2 1B/3B, Qwen2.5 1.5B, Phi-3.5-mini, SmolLM2 |

Router picks the first healthy provider in `auto` mode. You can pin a specific one from the UI.

## Architecture

```
index.html  -> loads app.js (ES module)
app.js      -> UI + state
router.js   -> provider failover
providers/
├── pollinations.js      primary (SSE)
├── pollinations-get.js  secondary (GET)
└── webllm.js            offline (WebGPU, lazy-loaded from esm.run CDN)
```

Zero build step. Zero dependencies installed locally. The `@mlc-ai/web-llm` library is pulled from `esm.run` on demand only when the user picks the `webllm` provider &mdash; so the static page stays lightweight for everyone else.

## Run locally

```bash
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080`. That's it.

## Fork + self-host

1. Fork this repo
2. Settings &rarr; Pages &rarr; Source: **Deploy from a branch** &rarr; **main** &rarr; **/ (root)**
3. Wait 60 seconds. Your fork is now live at `https://<you>.github.io/keylessai/`

## Keyless, but not free forever

Pollinations pays for the bandwidth their sponsors cover. WebLLM costs nothing &mdash; your GPU does the work. If this tool is useful to you and you'd like to help cover the domain/hosting when this grows:

- $3 &mdash; https://buy.stripe.com/cNidR2bGo2OD6P3cx58Vi0X
- $5 &mdash; https://buy.stripe.com/14A4gs6m4exl8Xb0On8Vi0Y
- $10 &mdash; https://buy.stripe.com/14AaEQ6m42ODgpD68H8Vi0Z
- You pick &mdash; https://buy.stripe.com/5kQ28k9yg88XflzfJh8Vi0W

Not a subscription. No login. No upsell. The app doesn't lock any features behind donation.

## Privacy

- **Pollinations**: your prompts leave your browser and go to their servers. See their terms.
- **WebLLM**: model weights download once, then everything stays on your device. Fully offline after load.
- **KeylessAI itself**: this repo never collects anything. The site has no analytics, no tracking pixels, no cookies beyond `localStorage` for your provider/model preference.

## Credits

- [Pollinations.ai](https://pollinations.ai/) &mdash; public text generation API
- [MLC-AI WebLLM](https://github.com/mlc-ai/web-llm) &mdash; in-browser WebGPU inference
- Built with [Claude Code](https://claude.com/claude-code)

## License

MIT
