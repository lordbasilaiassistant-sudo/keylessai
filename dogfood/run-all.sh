#!/usr/bin/env bash
# Boot the proxy, run every dogfood script, tear down.
# Optional arg: "node" to skip Python-based tests.

set -euo pipefail
MODE="${1:-all}"
PORT="${PORT:-8790}"
PROXY_URL="http://127.0.0.1:${PORT}/v1"
export KEYLESSAI_PROXY_URL="$PROXY_URL"

cleanup() {
  if [ -n "${PROXY_PID:-}" ]; then
    kill "$PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Dogfood run (mode=$MODE) ==="
echo ""

echo "[1/N] Installing node deps for dogfood/openai-node + aliased-models…"
(cd dogfood && npm init -y > /dev/null 2>&1 && npm install openai --silent > /dev/null 2>&1 || true)

if [ "$MODE" = "all" ]; then
  # Check for python launcher. On Windows we have `py`, on Linux we use python3.
  if command -v py > /dev/null 2>&1; then
    PYTHON="py"
  elif command -v python3 > /dev/null 2>&1; then
    PYTHON="python3"
  elif command -v python > /dev/null 2>&1; then
    PYTHON="python"
  else
    echo "  ! no python found, skipping python tests"
    MODE="node"
  fi

  if [ "$MODE" = "all" ]; then
    echo "[2/N] Installing python deps (openai + langchain-openai)…"
    $PYTHON -m pip install --quiet --upgrade pip 2>/dev/null || true
    $PYTHON -m pip install --quiet openai langchain-openai langchain-core 2>/dev/null || true
  fi
fi

echo "[3/N] Starting proxy on :$PORT…"
node ./bin/keylessai.js serve --port "$PORT" --quiet > /tmp/dogfood-proxy.log 2>&1 &
PROXY_PID=$!

# Wait up to 5s for proxy to be ready
for i in 1 2 3 4 5; do
  if curl -sSf -o /dev/null "http://127.0.0.1:${PORT}/health" 2>/dev/null; then
    echo "  proxy ready (pid=$PROXY_PID)"
    break
  fi
  sleep 1
done

echo ""
fail=0

run() {
  local name="$1"
  shift
  echo "--- $name ---"
  if "$@"; then
    echo "  PASS"
  else
    echo "  FAIL"
    fail=$((fail + 1))
  fi
  echo ""
}

run "curl / raw HTTP"           bash ./dogfood/curl.sh
run "legacy completions"        bash ./dogfood/legacy-completions.sh
run "embeddings 501 stub"       bash ./dogfood/embeddings-stub.sh
run "openai-node SDK"           node --experimental-vm-modules ./dogfood/openai-node.mjs
run "model alias resolution"    node ./dogfood/aliased-models.mjs

if [ "$MODE" = "all" ]; then
  run "openai-python SDK"       $PYTHON ./dogfood/openai-python.py
  run "langchain"               $PYTHON ./dogfood/langchain-test.py
fi

echo ""
echo "=== Summary ==="
if [ "$fail" -eq 0 ]; then
  echo "  ✓ all passed"
  exit 0
else
  echo "  ✗ $fail script(s) failed"
  exit 1
fi
