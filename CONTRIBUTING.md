# Contributing to KeylessAI

Thanks for helping expand the keyless frontier. Keep it tight.

## What belongs here

KeylessAI only wraps endpoints that are **callable today with zero auth**:

- No API key, no cookie, no session token, no signup, no waitlist.
- Either CORS-open to a browser, or trivially proxiable through a public relay.

If the endpoint needs a login, a paid tier, or a rotating token scraped from someone's site — it does not belong. Open a discussion before building.

## Add a provider

Every provider is a single ES module in `providers/` that exports:

```js
export const id = "myprovider";            // lowercase, stable slug
export const label = "MyProvider";         // display name

export async function listModels() { /* -> [{ id, label, provider }] */ }
export async function healthCheck() { /* -> boolean */ }
export async function* streamChat({ model, messages, signal }) {
  // yield { type: "content", text } (and optionally { type: "reasoning", text })
}
```

Canonical example: [`providers/airforce.js`](providers/airforce.js). Copy its shape — same exports, same yield protocol, same timeout discipline (`AbortSignal.timeout` on probes).

Rules of thumb:
- `listModels()` should hit the live `/models` endpoint first, with a hardcoded fallback list if the fetch fails.
- `healthCheck()` is a fast HEAD/GET with a 3s timeout. Return `true`/`false`, never throw.
- `streamChat()` is an async generator. Parse SSE inline, strip provider-specific junk (see airforce's `<think>` handling), forward `signal` to `fetch` so aborts work.
- No dependencies. Browser `fetch` + `ReadableStream` only.

## Testing

Before every commit:

```bash
node --check providers/yourprovider.js
node --check <every other file you changed>
```

For a new provider, also paste a **live curl** in the PR body that proves the endpoint works keyless today — no headers beyond `Content-Type`, from a clean shell:

```bash
curl -sS https://api.example.com/v1/models | head
```

If the curl needs auth to work, the provider is not eligible.

## Commit style

Match the existing log: `fix #N: short imperative summary`.

```
fix #8: add CONTRIBUTING.md + issue and PR templates
```

One issue per commit when practical. Reference the issue number so GitHub auto-closes on merge.

## PR checklist

- [ ] `node --check` passes on every changed `.js` file
- [ ] Live curl in the PR body (for provider additions)
- [ ] No new dependencies added to `package.json`
- [ ] No secrets, keys, or personal endpoints committed
- [ ] Linked issue in the title (`fix #N: ...`)

That's it. Ship small, ship often.
