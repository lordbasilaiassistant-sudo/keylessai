#!/usr/bin/env bash
# Dogfood: /v1/completions (legacy OpenAI endpoint).
set -euo pipefail
BASE="${KEYLESSAI_PROXY_URL:-http://127.0.0.1:8790/v1}"
OUT="dogfood/transcripts/legacy-completions.txt"
mkdir -p dogfood/transcripts

echo "[dogfood/legacy-completions] POST $BASE/completions" | tee "$OUT"

resp="$(curl -sS --max-time 60 -X POST "$BASE/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-fast","prompt":"Reply with exactly: LEGACY OK","max_tokens":30}')"

echo "  response: $resp" | tee -a "$OUT"

content="$(printf '%s' "$resp" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.choices[0].message.content||'');}catch(e){console.log('')}});")"

if [ -z "$content" ]; then
  echo "  ✗ empty content" | tee -a "$OUT"
  exit 1
fi

echo "  ✓ pass (content=$content)" | tee -a "$OUT"
