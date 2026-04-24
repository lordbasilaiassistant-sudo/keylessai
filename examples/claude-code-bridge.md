# Using KeylessAI with Claude Code, Codex, OpenHands, and other harnesses

**Short version:** if the harness speaks the OpenAI chat-completions protocol, KeylessAI is a one-line `baseURL` swap to `https://keylessai.thryx.workers.dev/v1`. If it speaks Anthropic's Messages API (Claude Code, some custom Anthropic-style harnesses), run a LiteLLM proxy in the middle to translate.

## Harness compatibility matrix

| Harness | Protocol | Works? | How |
|---|---|---|---|
| **Codex CLI** (OpenAI) | OpenAI | direct | `OPENAI_API_BASE=https://keylessai.thryx.workers.dev/v1 OPENAI_API_KEY=not-needed codex ...` |
| **Aider** | OpenAI-compat (LiteLLM) | direct | `aider --model openai/openai-fast --openai-api-base https://keylessai.thryx.workers.dev/v1 --openai-api-key not-needed` |
| **Cline / Roo Code** | OpenAI | direct | `openAiBaseUrl` + `openAiModelId` in VS Code settings |
| **Continue.dev** | OpenAI | direct | `provider: "openai"`, `apiBase`, `apiKey: "not-needed"` |
| **OpenHands (fka OpenDevin)** | OpenAI via LiteLLM | direct | Set `LLM_BASE_URL=https://keylessai.thryx.workers.dev/v1`, `LLM_API_KEY=not-needed`, `LLM_MODEL=openai/openai-fast` |
| **SWE-agent** | OpenAI or Anthropic | direct (OpenAI mode) | `--model openai/openai-fast --openai-api-base https://keylessai.thryx.workers.dev/v1` |
| **Claude Code** | Anthropic Messages | **via LiteLLM bridge** | see below |
| **Cursor** | proprietary | partial | Cursor's "custom model" feature accepts an OpenAI endpoint. Settings &rarr; Models &rarr; Override OpenAI Base URL &rarr; `https://keylessai.thryx.workers.dev/v1` |
| **LangGraph / LangChain agents** | OpenAI | direct | `ChatOpenAI(base_url="https://keylessai.thryx.workers.dev/v1", api_key="not-needed")` |
| **CrewAI** | OpenAI via LiteLLM | direct | `OPENAI_API_BASE=https://keylessai.thryx.workers.dev/v1 OPENAI_MODEL_NAME=openai-fast` |
| **AutoGen / AG2** | OpenAI | direct | `config_list = [{"model": "openai-fast", "base_url": "https://keylessai.thryx.workers.dev/v1", "api_key": "not-needed"}]` |

## Direct (OpenAI-compat) harnesses

If the harness's docs say "set `OPENAI_API_BASE`" or "supports a custom OpenAI-compatible endpoint," you are done after:

```bash
export OPENAI_API_BASE="https://keylessai.thryx.workers.dev/v1"
export OPENAI_BASE_URL="https://keylessai.thryx.workers.dev/v1"
export OPENAI_API_KEY="not-needed"
export OPENAI_MODEL="openai-fast"
```

## Claude Code (Anthropic-format harness) via LiteLLM

Claude Code sends Anthropic-format Messages API calls to whatever `ANTHROPIC_BASE_URL` points at. The OpenAI-compat Worker at `keylessai.thryx.workers.dev` doesn't speak Anthropic format. [LiteLLM](https://github.com/BerriAI/litellm) is a protocol translator that accepts either format and forwards in the other &mdash; perfect middle layer.

### Step 1: install and configure LiteLLM

```bash
pip install 'litellm[proxy]'
```

Create `litellm-anthropic.yaml`:

```yaml
model_list:
  - model_name: claude-3-5-sonnet-20241022
    litellm_params:
      model: openai/openai-fast
      api_base: https://keylessai.thryx.workers.dev/v1
      api_key: not-needed

  - model_name: claude-3-haiku-20240307
    litellm_params:
      model: openai/openai-fast
      api_base: https://keylessai.thryx.workers.dev/v1
      api_key: not-needed
```

The trick: we **alias** the Anthropic model names Claude Code asks for to the one free model KeylessAI has access to. The harness never knows it's talking to GPT-OSS-20B.

### Step 2: run the proxy

```bash
litellm --config litellm-anthropic.yaml --port 4000
```

### Step 3: point Claude Code at the proxy

```bash
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_API_KEY="not-needed"
claude
```

Claude Code now sends Anthropic-shaped requests to your local LiteLLM, which translates them into OpenAI-shaped requests to the KeylessAI Worker, which fans out to keyless upstream providers and returns free GPT-OSS-20B completions, which LiteLLM translates back to Anthropic shape. Claude Code sees a normal Anthropic response and works.

## Honest limitations

- The anonymous tier is `openai-fast` / GPT-OSS 20B &mdash; a real model, but not GPT-4 or Claude 3.5. It's excellent for prototyping, boilerplate, small edits, and planning loops. It will struggle on:
  - Very long context (current limit ~32k observed)
  - Multi-file refactors across 1000+ LOC
  - Hard algorithmic/reasoning problems
- Recommended play: **use KeylessAI for the 90% of cheap calls, reserve your paid key for the hard ones.** With LiteLLM you can route by complexity (`router_settings.routing_strategy: "cost-based"` or custom rules).

## One-liner for the impatient

Want to just try it?

```bash
# OpenAI-compat harness? (Aider, Codex, Cline, Continue, anything else)
export OPENAI_API_BASE=https://keylessai.thryx.workers.dev/v1 OPENAI_API_KEY=not-needed OPENAI_MODEL=openai-fast

# Anthropic-compat harness? (Claude Code)
pip install 'litellm[proxy]' && curl -s https://raw.githubusercontent.com/lordbasilaiassistant-sudo/keylessai/main/examples/litellm-config.yaml -o lite.yaml && litellm --config lite.yaml --port 4000 &
export ANTHROPIC_BASE_URL=http://localhost:4000 ANTHROPIC_API_KEY=not-needed
```
