# Security policy

## Threat model (what KeylessAI actually does)

- Serves a static web page from GitHub Pages
- Makes outbound `fetch()` calls to public keyless LLM endpoints (Pollinations, ApiAirforce) when a user asks a question
- Optional local-only Node proxy (`npx keylessai serve`) that performs the same fetches from the user's machine and exposes an OpenAI-compatible endpoint on `127.0.0.1`
- Stores chat history in the browser's `localStorage` (never transmitted off-device)
- Accepts Stripe donations via Stripe-hosted Payment Links (we never handle card data)

KeylessAI does **not**:

- Collect user accounts, email addresses, or any PII
- Run analytics, tracking pixels, or telemetry
- Accept or store API keys, tokens, cookies, or passwords
- Persist any data server-side (there is no server)
- Evaluate untrusted code on behalf of the user

Supply-chain surface is minimized: zero production dependencies (Node's built-in `fetch`, `http`, and `crypto` only). The `Inter` font is loaded from `rsms.me` and that's the only third-party origin in `Content-Security-Policy`.

## Reporting a vulnerability

If you believe you've found a security issue, **do not open a public issue**. Instead, email `drlordbasil@gmail.com` with:

- A description of the issue
- Reproduction steps or a proof of concept
- What you think an attacker could do with it
- Whether you'd like credit and, if so, how you'd like to be named

You can expect:

- Acknowledgement within 7 days
- A fix, a detailed rebuttal, or a timeline for a fix within 14 days
- Credit in the release notes once the fix is public

If the issue is time-sensitive (actively exploited, affects deployed forks, etc.) please mark the subject line with `SECURITY URGENT`.

## What counts as a vulnerability

In-scope:

- XSS in the chat renderer (markdown → DOM path in `src/ui/markdown.js`)
- CSP bypass allowing exfiltration to an unauthorized origin
- Request-smuggling or SSRF in the local proxy (`src/server/proxy.js`)
- Any path where a crafted provider response could cause code execution in the user's browser or Node process
- Secret leakage — note that the repo intentionally contains **zero** secrets; if you find one, report it
- Supply-chain: a transitive npm dep (currently: none) introducing risk

Out of scope:

- Abuse of upstream providers (Pollinations, ApiAirforce) — report those to the upstream maintainers
- Rate-limit evasion or terms-of-service violations
- Social-engineering attacks against users of KeylessAI forks
- Vulnerabilities in browsers, Node itself, or the user's OS

## Disclosure policy

Responsible disclosure. We'll coordinate public release of the issue with the fix. No legal action against good-faith researchers who follow this policy.
