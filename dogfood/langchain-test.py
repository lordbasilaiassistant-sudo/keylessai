"""Dogfood: LangChain's ChatOpenAI against our proxy.

pip install langchain-openai langchain-core
"""
import os, sys, pathlib
from langchain_openai import ChatOpenAI

BASE = os.environ.get("KEYLESSAI_PROXY_URL", "http://127.0.0.1:8790/v1")
lines = []
def log(s):
    print(s)
    lines.append(s)

log(f"[dogfood/langchain] base_url={BASE}")

ok = True
try:
    llm = ChatOpenAI(
        base_url=BASE,
        api_key="not-needed",
        model="openai-fast",
        streaming=True,
    )
    buf = ""
    for chunk in llm.stream("Reply with exactly: LANGCHAIN OK"):
        buf += chunk.content or ""
    log(f"  stream out: {buf!r}")
    if not buf:
        log("  [FAIL] empty stream")
        ok = False
except Exception as e:
    log(f"  [FAIL] threw: {e}")
    ok = False

pathlib.Path("dogfood/transcripts").mkdir(parents=True, exist_ok=True)
pathlib.Path("dogfood/transcripts/langchain.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

log("  [OK] pass" if ok else "  [FAIL] fail")
sys.exit(0 if ok else 1)
