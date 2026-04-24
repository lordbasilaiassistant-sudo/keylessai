#!/usr/bin/env bash
# Run Aider (AI pair programmer) for $0 using KeylessAI.
# https://aider.chat
#
# Requires: pip install aider-chat

set -euo pipefail

export OPENAI_API_BASE="https://text.pollinations.ai"
export OPENAI_BASE_URL="https://text.pollinations.ai"
export OPENAI_API_KEY="not-needed"

# The 'openai/' prefix tells LiteLLM (which aider uses internally)
# to treat this as an OpenAI-compatible provider.
aider --model openai/openai-fast "$@"
