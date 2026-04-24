// API reference drawer content. Extracted from drawer.js so editing the
// endpoints/snippets list doesn't force re-reading the drawer render code.

export const ENDPOINTS = [
  {
    method: "post",
    url: "https://text.pollinations.ai/openai",
    title: "Direct swap — zero install, zero compute, one env var",
    desc:
      "This is the primary path. Nothing runs on your machine. You change one environment variable and your existing OpenAI code works. Pass <code>openai-fast</code> as the model (or <code>openai</code>, its alias).",
    tabs: [
      {
        name: "env (bash)",
        code: `# Works with ANY tool that reads these env vars.
export OPENAI_API_BASE="https://text.pollinations.ai"
export OPENAI_BASE_URL="https://text.pollinations.ai"
export OPENAI_API_KEY="not-needed"
export OPENAI_MODEL="openai-fast"

# That's the whole setup. No install, no daemon, no signup.`,
      },
      {
        name: "aider",
        code: `# pip install aider-chat
export OPENAI_API_BASE="https://text.pollinations.ai"
export OPENAI_API_KEY="not-needed"

aider --model openai/openai-fast

# Or one-off:
aider --openai-api-base https://text.pollinations.ai \\
      --openai-api-key  not-needed \\
      --model openai/openai-fast`,
      },
      {
        name: "cline / roo",
        code: `// VS Code settings.json
{
  "cline.apiProvider": "openai",
  "cline.openAiBaseUrl": "https://text.pollinations.ai",
  "cline.openAiApiKey": "not-needed",
  "cline.openAiModelId": "openai-fast"
}

// Roo Code uses "roo-cline." prefix with the same keys.`,
      },
      {
        name: "continue",
        code: `// ~/.continue/config.json
{
  "models": [{
    "title": "KeylessAI (gpt-oss-20b)",
    "provider": "openai",
    "apiBase": "https://text.pollinations.ai",
    "apiKey": "not-needed",
    "model": "openai-fast"
  }]
}`,
      },
      {
        name: "codex",
        code: `# OpenAI's Codex CLI
export OPENAI_BASE_URL="https://text.pollinations.ai"
export OPENAI_API_KEY="not-needed"

codex --model openai-fast`,
      },
      {
        name: "openai sdk",
        code: `// Node — unchanged OpenAI SDK:
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://text.pollinations.ai",
  apiKey: "not-needed",
});

const stream = await client.chat.completions.create({
  model: "openai-fast",
  messages: [{ role: "user", content: "hello" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
      },
      {
        name: "python sdk",
        code: `# Python — unchanged OpenAI SDK:
from openai import OpenAI

client = OpenAI(
    base_url="https://text.pollinations.ai",
    api_key="not-needed",
)

stream = client.chat.completions.create(
    model="openai-fast",
    messages=[{"role": "user", "content": "hello"}],
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`,
      },
      {
        name: "langchain",
        code: `# Python — LangChain
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="https://text.pollinations.ai",
    api_key="not-needed",
    model="openai-fast",
    streaming=True,
)
for chunk in llm.stream("Explain autonomous agents in 2 sentences."):
    print(chunk.content, end="", flush=True)`,
      },
      {
        name: "curl",
        code: `curl -N https://text.pollinations.ai/openai \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai-fast",
    "messages": [{"role":"user","content":"hello"}],
    "stream": true
  }'`,
      },
    ],
  },
  {
    method: "get",
    url: "https://text.pollinations.ai/{prompt}?model=openai-fast",
    title: "Simple GET — shell one-liner",
    desc:
      "URL-encode your prompt, get plain text back. Ideal for scripts, cron jobs, anywhere only HTTP GET is available.",
    tabs: [
      {
        name: "curl",
        code: `curl "https://text.pollinations.ai/$(echo 'write a haiku about JSON' | jq -sRr @uri)?model=openai-fast"`,
      },
      {
        name: "fetch",
        code: `const prompt = "write a haiku about JSON";
const res = await fetch(
  \`https://text.pollinations.ai/\${encodeURIComponent(prompt)}?model=openai-fast\`
);
console.log(await res.text());`,
      },
      {
        name: "python",
        code: `import urllib.parse, requests
prompt = "write a haiku about JSON"
url = f"https://text.pollinations.ai/{urllib.parse.quote(prompt)}?model=openai-fast"
print(requests.get(url).text)`,
      },
    ],
  },
  {
    method: "post",
    url: "claude code bridge (anthropic format)",
    title: "Claude Code — bridge via LiteLLM",
    desc:
      "Claude Code speaks Anthropic's Messages API. LiteLLM proxy translates Anthropic &harr; OpenAI so Claude Code can talk to Pollinations. Runs as a local Python process that you launch when you want it.",
    tabs: [
      {
        name: "setup",
        code: `pip install 'litellm[proxy]'

cat > litellm.yaml <<EOF
model_list:
  - model_name: claude-3-5-sonnet-20241022
    litellm_params:
      model: openai/openai-fast
      api_base: https://text.pollinations.ai
      api_key: not-needed
EOF

litellm --config litellm.yaml --port 4000 &

export ANTHROPIC_BASE_URL="http://127.0.0.1:4000"
export ANTHROPIC_API_KEY="not-needed"
claude   # now on KeylessAI, free.`,
      },
    ],
  },
  {
    method: "npm",
    url: "npx github:lordbasilaiassistant-sudo/keylessai serve",
    title: "Optional: local proxy (for model-name aliasing)",
    desc:
      "Only use this if your tool hardcodes model names like <code>gpt-4o</code> or <code>claude-3-5-sonnet-latest</code> and you can't change them. The proxy accepts any OpenAI model name and transparently routes it to <code>openai-fast</code>. Runs as a tiny local Node process &mdash; no inference, just HTTP forwarding.",
    tabs: [
      {
        name: "run",
        code: `# Starts on 127.0.0.1:8787. No install beyond Node 18+.
npx github:lordbasilaiassistant-sudo/keylessai serve

# Then:
export OPENAI_API_BASE="http://127.0.0.1:8787/v1"
export OPENAI_API_KEY="not-needed"
# Now your tool can use "gpt-4o", "claude-3-5-sonnet-latest", etc. —
# the proxy transparently maps them to openai-fast.`,
      },
    ],
  },
];
