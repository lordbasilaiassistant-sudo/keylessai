import { streamChat, listAllModels, PROVIDERS } from "./router.js";
import { renderMarkdownHtml, attachCodeCopyHandlers } from "./src/markdown.js";

const $ = (id) => document.getElementById(id);
const messagesEl = $("messages");
const inputEl = $("input");
const sendBtn = $("sendBtn");
const composerEl = $("composer");
const statusEl = $("status");
const providerSelect = $("providerSelect");
const modelSelect = $("modelSelect");
const newChatBtn = $("newChatBtn");
const thanksEl = $("thanks");
const aboutLink = $("aboutLink");
const aboutDialog = $("aboutDialog");

const state = {
  conversation: [],
  streaming: false,
  controller: null,
  activeProvider: null,
  modelGroups: [],
};

const heroEl = document.getElementById("hero");
const suggestionsEl = document.getElementById("suggestions");

const SUGGESTIONS = [
  { label: "Build", prompt: "Write a Python script that renames every file in a folder to lowercase." },
  { label: "Explain", prompt: "Explain this regex: /^(?!.*\\s)[a-zA-Z0-9_-]{3,16}$/" },
  { label: "Debug", prompt: "What are 5 likely reasons a fetch() call works locally but fails in production?" },
  { label: "Refactor", prompt: "Rewrite this in TypeScript with proper types:\n\nfunction greet(name) { return 'hi ' + name }" },
  { label: "SQL", prompt: "Given a users table with (id, email, created_at), write a query to get the 5 newest users per email domain." },
  { label: "Shell", prompt: "One-line bash: find all .log files modified in the last 24h and compress them." },
];

function renderSuggestions() {
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = "";
  for (const s of SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.innerHTML = `<small>${s.label}</small>${escapeHtml(s.prompt.split("\n")[0])}`;
    btn.addEventListener("click", () => {
      hideHero();
      void send(s.prompt);
    });
    suggestionsEl.appendChild(btn);
  }
}

function hideHero() {
  if (heroEl && !heroEl.hidden) {
    heroEl.hidden = true;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CONVERSATION_KEY = "keylessai:conversation:v1";
const MAX_STORED_TURNS = 50;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("keylessai:state") || "null");
    if (saved?.provider) providerSelect.value = saved.provider;
    if (saved?.model) localStorage.setItem("keylessai:lastModel", saved.model);
  } catch {}
}

function saveState() {
  try {
    localStorage.setItem(
      "keylessai:state",
      JSON.stringify({
        provider: providerSelect.value,
        model: modelSelect.value,
      })
    );
  } catch {}
}

function saveConversation() {
  try {
    const trimmed = state.conversation.slice(-MAX_STORED_TURNS);
    if (trimmed.length === 0) {
      localStorage.removeItem(CONVERSATION_KEY);
      return;
    }
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(trimmed));
  } catch {}
}

function loadConversation() {
  try {
    const raw = localStorage.getItem(CONVERSATION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    state.conversation = parsed
      .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .slice(-MAX_STORED_TURNS);
    for (const msg of state.conversation) {
      addMessage(msg.role, msg.content, msg.role === "assistant" ? { provider: "restored" } : {});
    }
    if (state.conversation.length > 0) {
      hideHero();
    }
  } catch {
    // corrupt state — clear it
    try { localStorage.removeItem(CONVERSATION_KEY); } catch {}
  }
}

function clearConversation() {
  state.conversation = [];
  try { localStorage.removeItem(CONVERSATION_KEY); } catch {}
}

function addMessage(role, text, { provider } = {}) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const roleEl = document.createElement("div");
  roleEl.className = "role";
  roleEl.textContent = role;
  if (provider) {
    const badge = document.createElement("span");
    badge.className = "provider-badge";
    badge.textContent = provider;
    roleEl.appendChild(badge);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "assistant" && text) {
    bubble.innerHTML = renderMarkdownHtml(text);
    attachCodeCopyHandlers(bubble);
  } else {
    bubble.textContent = text || "";
  }
  wrap.appendChild(roleEl);
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { wrap, bubble, roleEl };
}

function setStatus(text, kind = "") {
  statusEl.textContent = text || "";
  statusEl.className = `status ${kind}`;
}

function setStreaming(on) {
  state.streaming = on;
  sendBtn.disabled = on;
  sendBtn.textContent = on ? "stop" : "send";
  sendBtn.classList.toggle("primary", !on);
}

async function populateModels() {
  const groups = await listAllModels();
  state.modelGroups = groups;
  renderModelOptions();
}

function renderModelOptions() {
  const selectedProvider = providerSelect.value;
  modelSelect.innerHTML = "";

  const autoOpt = document.createElement("option");
  autoOpt.value = JSON.stringify({ provider: null, model: null, auto: true });
  autoOpt.textContent =
    selectedProvider === "auto"
      ? "auto — best available everywhere"
      : "auto — provider default";
  modelSelect.appendChild(autoOpt);

  const groups =
    selectedProvider === "auto"
      ? state.modelGroups
      : state.modelGroups.filter((g) => g.provider === selectedProvider);

  for (const group of groups) {
    if (!group.models.length) continue;
    const og = document.createElement("optgroup");
    og.label = group.label;
    for (const m of group.models) {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ provider: m.provider, model: m.id });
      opt.textContent = m.label || m.id;
      og.appendChild(opt);
    }
    modelSelect.appendChild(og);
  }

  const last = localStorage.getItem("keylessai:lastModel");
  if (last) {
    for (const opt of modelSelect.options) {
      if (opt.value === last) {
        opt.selected = true;
        break;
      }
    }
  }

  if (!modelSelect.value && modelSelect.options.length) {
    modelSelect.options[0].selected = true;
  }
}

providerSelect.addEventListener("change", () => {
  renderModelOptions();
  saveState();
});

modelSelect.addEventListener("change", () => {
  localStorage.setItem("keylessai:lastModel", modelSelect.value);
  saveState();
});

newChatBtn.addEventListener("click", () => {
  if (state.streaming) state.controller?.abort();
  clearConversation();
  messagesEl.innerHTML = "";
  setStatus("");
  if (heroEl) heroEl.hidden = false;
  inputEl.focus();
});

aboutLink.addEventListener("click", (e) => {
  e.preventDefault();
  aboutDialog.showModal();
});

composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.streaming) {
    state.controller?.abort();
    return;
  }
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  autoResize();
  hideHero();
  void send(text);
});

function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 220) + "px";
}
inputEl.addEventListener("input", autoResize);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerEl.requestSubmit();
  }
});

async function send(userText) {
  addMessage("user", userText);
  state.conversation.push({ role: "user", content: userText });
  saveConversation();
  await requestAssistant();
}

async function requestAssistant() {
  const selection = safeParse(modelSelect.value) || {};
  const providerChoice = providerSelect.value;
  const routerProvider =
    providerChoice === "auto" ? "auto" : selection.provider || providerChoice;
  const modelId = selection.model;

  const { wrap, bubble, roleEl } = addMessage("assistant", "", {
    provider: routerProvider === "auto" ? "auto" : routerProvider,
  });
  bubble.classList.add("cursor");

  const controller = new AbortController();
  state.controller = controller;
  setStreaming(true);
  setStatus("connecting…");

  const triedProviders = [];
  let streamed = "";
  try {
    for await (const chunk of streamChat({
      provider: routerProvider,
      model: modelId,
      messages: buildMessagesForSend(),
      signal: controller.signal,
      onStatus: (s) => setStatus(s),
      onProviderChange: (p) => {
        state.activeProvider = p;
        if (!triedProviders.includes(p)) triedProviders.push(p);
        const badge = roleEl.querySelector(".provider-badge");
        if (badge) badge.textContent = p;
      },
    })) {
      if (chunk.type === "content") {
        streamed += chunk.text;
        bubble.innerHTML = renderMarkdownHtml(streamed);
        attachCodeCopyHandlers(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    bubble.classList.remove("cursor");
    if (!streamed) {
      bubble.textContent = "(no output)";
    } else {
      bubble.innerHTML = renderMarkdownHtml(streamed);
      attachCodeCopyHandlers(bubble);
    }
    state.conversation.push({ role: "assistant", content: streamed });
    saveConversation();
    setStatus(`done · ${state.activeProvider || "?"}`, "ok");
  } catch (err) {
    bubble.classList.remove("cursor");
    if (controller.signal.aborted) {
      setStatus("aborted", "");
      if (streamed) {
        state.conversation.push({ role: "assistant", content: streamed });
        saveConversation();
      }
    } else {
      bubble.textContent = streamed || `error: ${err.message || String(err)}`;
      wrap.classList.add("error");
      appendErrorActions(wrap, triedProviders);
      setStatus(err.message || "error", "err");
    }
  } finally {
    setStreaming(false);
    state.controller = null;
  }
}

function appendErrorActions(wrap, triedProviders) {
  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "msg-action";
  retryBtn.textContent = "↻ retry";
  retryBtn.addEventListener("click", () => {
    if (state.streaming) return;
    wrap.remove();
    void requestAssistant();
  });

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "msg-action";
  switchBtn.textContent = "↔ switch provider";
  switchBtn.addEventListener("click", () => {
    providerSelect.focus();
    try {
      providerSelect.showPicker?.();
    } catch {}
  });

  actions.appendChild(retryBtn);
  actions.appendChild(switchBtn);

  if (triedProviders.length) {
    const tried = document.createElement("span");
    tried.className = "msg-tried";
    tried.textContent = `tried: ${triedProviders.join(" → ")}`;
    actions.appendChild(tried);
  }

  wrap.appendChild(actions);
}

function buildMessagesForSend() {
  return [
    {
      role: "system",
      content:
        "You are KeylessAI, a helpful assistant accessed through free public LLM endpoints (no API keys required on the user's side). Keep answers concise and useful. If asked about the infrastructure, explain that you're served by keyless providers like Pollinations or ApiAirforce, aggregated with automatic failover.",
    },
    ...state.conversation,
  ];
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function checkDonatedRedirect() {
  const params = new URLSearchParams(location.search);
  if (params.get("donated") === "true") {
    thanksEl.hidden = false;
    params.delete("donated");
    const clean =
      location.pathname + (params.toString() ? `?${params}` : "") + location.hash;
    history.replaceState({}, "", clean);
    setTimeout(() => {
      thanksEl.style.transition = "opacity 1s";
      thanksEl.style.opacity = "0";
      setTimeout(() => {
        thanksEl.hidden = true;
        thanksEl.style.opacity = "1";
      }, 1000);
    }, 6000);
  }
}

(async function init() {
  loadState();
  renderSuggestions();
  loadConversation();
  checkDonatedRedirect();
  try {
    await populateModels();
    setStatus("ready · keyless", "ok");
  } catch (e) {
    setStatus(`init failed: ${e.message}`, "err");
  }
  inputEl.focus();
})();
