#!/usr/bin/env bash
# KeylessAI via raw curl — ApiAirforce direct, no API key required.
# Endpoint: https://api.airforce/v1/chat/completions (OpenAI-compatible)
# Model: grok-4.1-mini:free — free tier, no auth header.
#
# Notes:
# - Global rate limit is ~1 request per second. Back off accordingly in loops.
# - Many models wrap their reasoning in <think>...</think> tags. Strip those
#   downstream if you only want the final answer.
# - Free-tier models may occasionally return an upstream ad message in place of
#   real content when their quota is cold. Retry after a second, or swap the
#   "model" field for another ":free" model from GET /v1/models
#   (e.g. "step-3.5-flash:free", "gemma3-270m:free").
# - Non-streaming shown here for simplicity; add "stream": true for SSE.

curl -sS https://api.airforce/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "model": "grok-4.1-mini:free",
  "messages": [
    {"role": "user", "content": "Explain what CORS is in 2 sentences."}
  ]
}
EOF
