"""Dogfood: official OpenAI Python SDK against our proxy.

Exits 0 on success, 1 on failure. Writes transcript to dogfood/transcripts/.
"""
import os, sys, pathlib
from openai import OpenAI

BASE = os.environ.get("KEYLESSAI_PROXY_URL", "http://127.0.0.1:8790/v1")
lines = []
def log(s):
    print(s)
    lines.append(s)

log(f"[dogfood/openai-python] base_url={BASE}")
client = OpenAI(base_url=BASE, api_key="not-needed")

ok = True
try:
    res = client.chat.completions.create(
        model="openai-fast",
        messages=[{"role": "user", "content": "Reply with exactly: PYTHON OK"}],
    )
    log(f"  non-stream: {res.choices[0].message.content}")

    # Streaming with an aliased model name
    log("  streaming with model=claude-3-5-sonnet-latest (aliased)…")
    stream = client.chat.completions.create(
        model="claude-3-5-sonnet-latest",
        messages=[{"role": "user", "content": "Reply with three emojis"}],
        stream=True,
    )
    buf = ""
    for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        buf += delta
    log(f"  stream out: {buf}")
    if not buf:
        log("  [FAIL] stream produced no content")
        ok = False
except Exception as e:
    log(f"  [FAIL] threw: {e}")
    ok = False

pathlib.Path("dogfood/transcripts").mkdir(parents=True, exist_ok=True)
pathlib.Path("dogfood/transcripts/openai-python.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

log("  [OK] pass" if ok else "  [FAIL] fail")
sys.exit(0 if ok else 1)
