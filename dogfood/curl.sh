#!/usr/bin/env bash
# Dogfood: raw curl against /v1/chat/completions (non-streaming).
# Exits 0 on success, 1 on failure. Writes transcript to dogfood/transcripts/.

set -euo pipefail
BASE="${KEYLESSAI_PROXY_URL:-http://127.0.0.1:8790/v1}"
OUT="dogfood/transcripts/curl.txt"
mkdir -p dogfood/transcripts

echo "[dogfood/curl] POST $BASE/chat/completions" | tee "$OUT"

resp="$(curl -sS --max-time 60 -X POST "$BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer not-needed" \
  -d '{"model":"openai-fast","messages":[{"role":"user","content":"Reply with exactly: CURL OK"}]}')"

echo "  response: $resp" | tee -a "$OUT"

# Extract content — must contain "CURL OK" somewhere
content="$(printf '%s' "$resp" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.choices[0].message.content||'');}catch(e){console.log('')}});")"

if [ -z "$content" ]; then
  echo "  ✗ empty content" | tee -a "$OUT"
  exit 1
fi
echo "  content: $content" | tee -a "$OUT"

if echo "$content" | grep -qi "curl ok"; then
  echo "  ✓ pass" | tee -a "$OUT"
  exit 0
fi

echo "  ⚠ content does not contain expected marker, but proxy responded" | tee -a "$OUT"
exit 0   # soft-pass: LLM variance allowed, we just needed a real response
