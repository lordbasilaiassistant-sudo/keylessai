const drawer = document.getElementById("apiDrawer");
const scrim = document.getElementById("drawerScrim");
const closeBtn = document.getElementById("drawerClose");
const apiBtn = document.getElementById("apiBtn");
const apiLink = document.getElementById("apiLink");
const body = document.getElementById("drawerBody");

const ENDPOINTS = [
  {
    method: "post",
    url: "http://127.0.0.1:8787/v1/chat/completions",
    title: "KeylessAI local proxy — the unified endpoint",
    desc:
      "Run <code>npx github:lordbasilaiassistant-sudo/keylessai serve</code> in a terminal. You now have a local OpenAI-compatible endpoint with model-name aliasing (gpt-4o, gpt-4o-mini, claude-3-5-sonnet-latest etc. all work), provider failover, and CORS. Point any OpenAI client at <code>http://127.0.0.1:8787/v1</code>.",
    tabs: [
      {
        name: "one-liner",
        code: `# 1. Start the proxy (zero install, zero deps beyond Node 18+).
npx github:lordbasilaiassistant-sudo/keylessai serve

# 2. In your app:
export OPENAI_API_BASE="http://127.0.0.1:8787/v1"
export OPENAI_BASE_URL="http://127.0.0.1:8787/v1"
export OPENAI_API_KEY="not-needed"

# 3. Run your existing OpenAI code unchanged.
# Model names like gpt-4o, gpt-4o-mini, claude-3-5-sonnet-latest are aliased.`,
      },
      {
        name: "aider",
        code: `# In terminal 1:
npx github:lordbasilaiassistant-sudo/keylessai serve

# In terminal 2:
export OPENAI_API_BASE="http://127.0.0.1:8787/v1"
export OPENAI_API_KEY="not-needed"

aider --model gpt-4o     # the proxy aliases gpt-4o → openai-fast`,
      },
      {
        name: "cline / roo",
        code: `// VS Code settings.json — after starting the proxy:
{
  "cline.apiProvider": "openai",
  "cline.openAiBaseUrl": "http://127.0.0.1:8787/v1",
  "cline.openAiApiKey": "not-needed",
  "cline.openAiModelId": "openai-fast"
}

// Roo uses same keys with roo-cline. prefix.`,
      },
      {
        name: "continue",
        code: `// ~/.continue/config.json
{
  "models": [{
    "title": "KeylessAI (local proxy)",
    "provider": "openai",
    "apiBase": "http://127.0.0.1:8787/v1",
    "apiKey": "not-needed",
    "model": "openai-fast"
  }]
}`,
      },
      {
        name: "codex",
        code: `# OpenAI's Codex CLI — reads OPENAI_BASE_URL
export OPENAI_BASE_URL="http://127.0.0.1:8787/v1"
export OPENAI_API_KEY="not-needed"

codex`,
      },
      {
        name: "claude code",
        code: `# Claude Code speaks Anthropic format, not OpenAI.
# Bridge via LiteLLM proxy in front of KeylessAI:

pip install 'litellm[proxy]'

cat > litellm.yaml <<EOF
model_list:
  - model_name: claude-3-5-sonnet-20241022
    litellm_params:
      model: openai/openai-fast
      api_base: http://127.0.0.1:8787/v1
      api_key: not-needed
EOF

litellm --config litellm.yaml --port 4000 &

export ANTHROPIC_BASE_URL="http://127.0.0.1:4000"
export ANTHROPIC_API_KEY="not-needed"
claude    # now running on KeylessAI, free`,
      },
      {
        name: "openai sdk",
        code: `// Node — unchanged OpenAI SDK:
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8787/v1",
  apiKey: "not-needed",
});

const stream = await client.chat.completions.create({
  model: "gpt-4o-mini",  // aliased
  messages: [{ role: "user", content: "hello" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
      },
      {
        name: "langchain",
        code: `# Python — LangChain
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="not-needed",
    model="gpt-4o",  # aliased
    streaming=True,
)

for chunk in llm.stream("Explain autonomous agents in 2 sentences."):
    print(chunk.content, end="", flush=True)`,
      },
    ],
  },
  {
    method: "post",
    url: "https://text.pollinations.ai/openai",
    title: "No-install path — point directly at Pollinations",
    desc:
      "For CI jobs, serverless environments, or any context where you can't run a local proxy, skip KeylessAI entirely and hit Pollinations directly. You lose model aliasing and failover, gain full portability.",
    tabs: [
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
      {
        name: "python",
        code: `from openai import OpenAI

client = OpenAI(
    base_url="https://text.pollinations.ai",
    api_key="not-needed",
)

res = client.chat.completions.create(
    model="openai-fast",
    messages=[{"role": "user", "content": "hello"}],
)
print(res.choices[0].message.content)`,
      },
      {
        name: "node",
        code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://text.pollinations.ai",
  apiKey: "not-needed",
});

const res = await client.chat.completions.create({
  model: "openai-fast",
  messages: [{ role: "user", content: "hello" }],
});
console.log(res.choices[0].message.content);`,
      },
    ],
  },
  {
    method: "get",
    url: "https://text.pollinations.ai/{prompt}?model=openai-fast",
    title: "Pollinations simple GET — shell one-liner",
    desc:
      "URL-encode your prompt into the path, get plain text back. Perfect for shell scripts and systems that only speak HTTP GET.",
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
    ],
  },
  {
    method: "npm",
    url: "@mlc-ai/web-llm",
    title: "WebLLM — in-browser WebGPU inference",
    desc:
      "Run open models (Llama-3.2, Qwen2.5, Phi-3.5, SmolLM2) entirely in the browser via WebGPU. First download is 1-4 GB; after that, inference costs zero network. Fully offline, fully private. This is what the chat above uses when you pick the <code>webllm</code> provider.",
    tabs: [
      {
        name: "browser",
        code: `<script type="module">
import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const engine = await CreateMLCEngine(
  "Llama-3.2-1B-Instruct-q4f32_1-MLC",
  { initProgressCallback: p => console.log(p.text) }
);

const stream = await engine.chat.completions.create({
  messages: [{ role: "user", content: "hello" }],
  stream: true,
});

for await (const chunk of stream) {
  document.body.textContent += chunk.choices[0]?.delta?.content ?? "";
}
<\/script>`,
      },
    ],
  },
];

function renderEndpoint(ep) {
  const section = document.createElement("section");
  section.className = "endpoint";

  const head = document.createElement("div");
  head.className = "endpoint-head";
  head.innerHTML = `
    <span class="method ${ep.method}">${ep.method.toUpperCase()}</span>
    <span class="endpoint-url"></span>
  `;
  head.querySelector(".endpoint-url").textContent = ep.url;
  section.appendChild(head);

  const title = document.createElement("div");
  title.style.fontSize = "14px";
  title.style.color = "var(--text)";
  title.style.fontWeight = "600";
  title.textContent = ep.title;
  section.appendChild(title);

  const desc = document.createElement("div");
  desc.className = "endpoint-desc";
  desc.innerHTML = ep.desc;
  section.appendChild(desc);

  const tabs = document.createElement("div");
  tabs.className = "tabs";
  const panels = [];
  ep.tabs.forEach((t, i) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (i === 0 ? " active" : "");
    btn.textContent = t.name;
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      panels.forEach((p, pi) => (p.style.display = pi === i ? "" : "none"));
    });
    tabs.appendChild(btn);
  });
  section.appendChild(tabs);

  ep.tabs.forEach((t, i) => {
    const wrap = document.createElement("div");
    wrap.className = "code-block";
    wrap.style.display = i === 0 ? "" : "none";
    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    codeEl.textContent = t.code;
    pre.appendChild(codeEl);
    wrap.appendChild(pre);

    const copy = document.createElement("button");
    copy.className = "copy";
    copy.textContent = "copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(t.code);
        copy.textContent = "copied";
        copy.classList.add("copied");
        setTimeout(() => {
          copy.textContent = "copy";
          copy.classList.remove("copied");
        }, 1200);
      } catch {
        copy.textContent = "!";
      }
    });
    wrap.appendChild(copy);

    panels.push(wrap);
    section.appendChild(wrap);
  });

  return section;
}

function renderDrawer() {
  body.innerHTML = "";
  const lede = document.createElement("div");
  lede.className = "api-lede";
  lede.innerHTML = `
    Run <code>npx github:lordbasilaiassistant-sudo/keylessai serve</code> &mdash; you now have a
    <strong>unified OpenAI-compatible endpoint on your machine</strong>. Any existing OpenAI SDK, Aider, Cline, Continue,
    Codex, LangChain, or custom harness can point at it with zero code changes. Model names like
    <code>gpt-4o</code> and <code>claude-3-5-sonnet-latest</code> are aliased transparently.
  `;
  body.appendChild(lede);

  ENDPOINTS.forEach((ep) => {
    body.appendChild(renderEndpoint(ep));
  });
}

function openDrawer() {
  renderDrawer();
  drawer.classList.add("open");
  scrim.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  drawer.classList.remove("open");
  scrim.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

apiBtn.addEventListener("click", openDrawer);
apiLink.addEventListener("click", (e) => {
  e.preventDefault();
  openDrawer();
});
closeBtn.addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
});
