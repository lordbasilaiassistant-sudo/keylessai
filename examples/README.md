# Examples

Copy-paste integrations for every tool KeylessAI works with. No keys required.

| File | Tool | One-liner |
|---|---|---|
| [`aider.sh`](aider.sh) | [Aider](https://aider.chat) | AI pair-programmer for $0 |
| [`cline-config.json`](cline-config.json) | [Cline / Roo Code](https://github.com/cline/cline) | VS Code autonomous coding extension |
| [`continue-config.json`](continue-config.json) | [Continue.dev](https://continue.dev) | VS Code / JetBrains autocomplete + chat |
| [`langchain-example.py`](langchain-example.py) | [LangChain](https://python.langchain.com) | chain KeylessAI into your pipeline |
| [`openai-sdk-node.js`](openai-sdk-node.js) | [OpenAI JS SDK](https://github.com/openai/openai-node) | unchanged SDK, one baseURL swap |
| [`openai-sdk-python.py`](openai-sdk-python.py) | [OpenAI Python SDK](https://github.com/openai/openai-python) | unchanged SDK, one baseURL swap |
| [`litellm-config.yaml`](litellm-config.yaml) | [LiteLLM](https://github.com/BerriAI/litellm) | unify KeylessAI with your other providers behind one proxy |
| [`curl-streaming.sh`](curl-streaming.sh) | curl | raw HTTP, no dependencies |
| [`claude-code-bridge.md`](claude-code-bridge.md) | Claude Code / Codex / OpenHands / Cursor | including Anthropic-format harness bridge via LiteLLM |

## The core config (works for 90% of tools)

```bash
export OPENAI_API_BASE="https://text.pollinations.ai"
export OPENAI_BASE_URL="https://text.pollinations.ai"
export OPENAI_API_KEY="not-needed"
export OPENAI_MODEL="openai-fast"
```

Paste this into your shell, then run any OpenAI-compatible tool. That's the entire integration.
