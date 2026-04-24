# Dogfood tests

End-to-end tests that actually run real third-party harnesses against our proxy. These catch broken docs — if we claim "KeylessAI works with OpenAI Python SDK" and this directory doesn't have a passing test, the claim is a lie.

## Targets

| Harness | Script | What it proves |
|---|---|---|
| curl | `curl.sh` | Raw HTTP + SSE streaming |
| OpenAI Node SDK | `openai-node.mjs` | Official Node SDK handles our proxy unchanged |
| OpenAI Python SDK | `openai-python.py` | Official Python SDK handles our proxy unchanged |
| LangChain | `langchain.py` | `ChatOpenAI(base_url=...)` swap works end-to-end |
| Model alias resolution | `aliased-models.mjs` | `gpt-4o`, `claude-3-5-sonnet-latest` etc. resolve to `openai-fast` |
| Legacy completions | `legacy-completions.sh` | `/v1/completions` (prompt → messages) works |
| Embeddings 501 | `embeddings-stub.sh` | `/v1/embeddings` returns proper 501 error shape |
| LiteLLM bridge | `litellm-bridge.py` | Anthropic → OpenAI translation (for Claude Code) |

## Running

```bash
# Prereqs: node >=18, py (Windows Python launcher) or python3
./dogfood/run-all.sh           # boots proxy, runs every test, kills proxy
./dogfood/run-all.sh node      # just the Node-based tests (no Python needed)
```

Each test:
1. Assumes proxy is running at `$KEYLESSAI_PROXY_URL` (default `http://127.0.0.1:8790/v1`)
2. Sends a deterministic prompt
3. Asserts non-empty, non-spammy output
4. Writes transcript to `dogfood/transcripts/{script}.txt` for auditability

Transcripts are committed so you can diff actual LLM output across provider/model changes.

## Not dogfooded (yet)

Manual-only because they need a GUI or interactive TTY:
- Aider (interactive prompt, needs a git repo)
- Cline / Roo Code (VS Code extension)
- Continue.dev (VS Code/JetBrains extension)
- Codex CLI (interactive, needs TTY)

These are documented with runnable config snippets in `examples/` but not tested end-to-end here.
