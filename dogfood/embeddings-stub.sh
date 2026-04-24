#!/usr/bin/env bash
# Dogfood: /v1/embeddings should return a clean 501 with OpenAI-shape error.
set -euo pipefail
BASE="${KEYLESSAI_PROXY_URL:-http://127.0.0.1:8790/v1}"
OUT="dogfood/transcripts/embeddings-stub.txt"
mkdir -p dogfood/transcripts

echo "[dogfood/embeddings-stub] POST $BASE/embeddings" | tee "$OUT"

http_code="$(curl -sS -o /tmp/kl-emb-resp -w "%{http_code}" -X POST "$BASE/embeddings" \
  -H "Content-Type: application/json" \
  -d '{"input":"hello","model":"text-embedding-3-small"}')"

body="$(cat /tmp/kl-emb-resp)"
echo "  http_code: $http_code" | tee -a "$OUT"
echo "  body:      $body" | tee -a "$OUT"

if [ "$http_code" != "501" ]; then
  echo "  ✗ expected 501, got $http_code" | tee -a "$OUT"
  exit 1
fi

# Verify error shape matches OpenAI spec
type="$(printf '%s' "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.error?.type||'');}catch(e){console.log('')}});")"

if [ "$type" != "not_implemented" ]; then
  echo "  ✗ expected error.type=not_implemented, got '$type'" | tee -a "$OUT"
  exit 1
fi

echo "  ✓ pass" | tee -a "$OUT"
