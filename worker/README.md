# KeylessAI Cloudflare Worker

The **public** API endpoint. Deploys to Cloudflare Workers' free tier (100k req/day, literally cannot bill you without you enabling paid mode). One command:

```bash
cd worker
npx wrangler deploy
```

You get a URL like `https://keylessai.<your-subdomain>.workers.dev`. Everyone on the internet can now use that as `OPENAI_API_BASE` with no keys, no install, no signup.

## What the Worker does

Same router/providers/cache/queue/circuit-breaker as the local proxy (`src/core/*` and `providers/*`) — the Worker just wraps them in the Web Fetch API instead of Node http. Same features:

- `/v1/chat/completions` (streaming + non-streaming)
- `/v1/completions` legacy
- `/v1/models` + aliases (`gpt-4o`, `claude-3-5-sonnet-latest`, etc.)
- `/v1/embeddings` → clean 501
- `/health` with cache/queue/circuit/latency stats
- Per-IP rate limit (token bucket)
- Body cap (1 MiB), input validation, spam filtering, adaptive failover

## Cost math

Cloudflare Workers free tier: 100,000 requests/day. If a user averages 30 requests/day, that's 3,300 users. If you hit the cap, requests 429 for the rest of the day — **you are never billed** unless you enable Workers Paid plan.

For scaling past 100k/day without paying: self-host via multiple free workers (see the `worker-mesh` design in the main repo roadmap) or point users at the local-proxy path (`npx github:lordbasilaiassistant-sudo/keylessai serve`).

## Deploy steps

1. Have a Cloudflare account (free).
2. `npx wrangler login` (one-time) — opens a browser, authorizes once.
3. `cd worker && npx wrangler deploy`
4. Copy the URL it prints, update the main README with it.

## Custom domain

Point a DNS record at Cloudflare, then in the Workers dashboard bind your domain. Nothing in the worker code changes.

## Testing

After deploy:

```bash
export OPENAI_API_BASE="https://keylessai.<your-subdomain>.workers.dev/v1"
curl -N "$OPENAI_API_BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-fast","messages":[{"role":"user","content":"hi"}],"stream":true}'
```
