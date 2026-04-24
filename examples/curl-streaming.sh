#!/usr/bin/env bash
# KeylessAI via raw curl — streaming SSE chat completions.
# Zero API keys. Pipe the output to any text processor.

curl -N https://text.pollinations.ai/openai \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "model": "openai-fast",
  "messages": [
    {"role": "system", "content": "You are a terse shell assistant."},
    {"role": "user", "content": "Explain the difference between SIGTERM and SIGKILL in 2 lines."}
  ],
  "stream": true
}
EOF
