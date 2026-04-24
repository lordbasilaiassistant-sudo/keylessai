# KeylessAI Cloudflare Worker

The **public** API endpoint. Deploys to Cloudflare Workers' free tier (100k req/day, literally cannot bill you without opting into Workers Paid). One command:

```bash
cd worker
npx wrangler login   # one-time browser flow
npx wrangler deploy
```

On success wrangler prints a URL of the form `https://keylessai.<your-cf-subdomain>.workers.dev`. That's your public endpoint. Everyone on the internet can now use it as `OPENAI_API_BASE` with no keys, no install, no signup.

## What the Worker does

Same router / providers / cache / queue / circuit-breaker / metrics / validate / rate-limiter as the local proxy (`src/core/*`, `src/server/*`, `providers/*`) — the Worker just wraps them in the Web Fetch API instead of Node http. Endpoint surface is identical:

- `POST /v1/chat/completions` (streaming + non-streaming)
- `POST /v1/completions` (legacy, wraps prompt as a chat message)
- `POST /v1/embeddings` → clean 501 with guidance
- `GET /v1/models` (real models + OpenAI/Anthropic aliases)
- `GET /health` (queue depth, cache stats, circuit state, latency p50/p95, rate-limiter stats)
- `GET /` (HTML landing page with your Worker's URL baked in)

## Cost model (honest)

Cloudflare Workers free tier: **100,000 requests/day**. Over the cap, CF returns a generic error for the rest of the day. **You are never billed** unless you enable Workers Paid plan.

Scaling past 100k/day without paying:
- Donors each deploy their own free Worker, publish the URL, client rotates (community mesh — on the roadmap)
- Individual users fall back to the local proxy path (`npx github:.../keylessai serve --local`) for dedicated capacity
- Users fork your Worker to run in their own CF account (true zero cost per deploy)

## Custom domain (optional)

After deploying to `*.workers.dev`, you can point your own DNS at Cloudflare and bind a custom domain in the Workers dashboard. Worker code doesn't change.

## Testing after deploy

```bash
# Replace WORKER_URL with the URL wrangler printed
export OPENAI_API_BASE="${WORKER_URL}/v1"
curl -N "$OPENAI_API_BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-fast","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

Or use the official OpenAI SDKs — they're drop-in compatible.

## Re-deploying after code changes

Just `npx wrangler deploy` again. In-place update, no downtime.
