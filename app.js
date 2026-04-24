import { streamChat, listAllModels, PROVIDERS } from "./src/core/router.js";
import { renderMarkdownHtml, attachCodeCopyHandlers } from "./src/ui/markdown.js";
import {
  loadPreferences,
  savePreferences,
  setLastModel,
  loadConversation,
  saveConversation,
  clearStoredConversation,
} from "./src/ui/storage.js";
import { renderSuggestions } from "./src/ui/suggestions.js";
import {
  addMessage,
  appendAssistantActions,
  appendErrorActions,
  findLastAssistantIndex,
} from "./src/ui/messages.js";
import { updatePoolStats } from "./src/ui/pool-stats.js";

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
const heroEl = $("hero");
const suggestionsEl = $("suggestions");

const state = {
  conversation: [],
  streaming: false,
  controller: null,
  activeProvider: null,
  modelGroups: [],
};

// ===== Hero + suggestions =====

function hideHero() {
  if (heroEl && !heroEl.hidden) heroEl.hidden = true;
}

function showHero() {
  if (heroEl) heroEl.hidden = false;
}

// ===== Status + streaming lock =====

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

// ===== Model selector =====

async function populateModels() {
  const groups = await listAllModels();
  state.modelGroups = groups;
  renderModelOptions();
  updatePoolStats(groups);
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

  const prefs = loadPreferences();
  if (prefs.lastModel) {
    for (const opt of modelSelect.options) {
      if (opt.value === prefs.lastModel) {
        opt.selected = true;
        break;
      }
    }
  }

  if (!modelSelect.value && modelSelect.options.length) {
    modelSelect.options[0].selected = true;
  }
}

// ===== Conversation + messages glue =====

function restoreConversation() {
  state.conversation = loadConversation();
  for (const msg of state.conversation) {
    const opts = msg.role === "assistant" ? { provider: "restored" } : {};
    const { wrap } = addMessage(messagesEl, msg.role, msg.content, opts);
    if (msg.role === "assistant" && msg.content) {
      attachAssistantActions(wrap, msg.content);
    }
  }
  if (state.conversation.length > 0) hideHero();
}

function attachAssistantActions(wrap, text) {
  appendAssistantActions(wrap, text, {
    onRegenerate: () => {
      if (state.streaming) return;
      const idx = findLastAssistantIndex(state.conversation);
      if (idx >= 0) {
        state.conversation.splice(idx, 1);
        saveConversation(state.conversation);
      }
      wrap.remove();
      void requestAssistant();
    },
  });
}

function attachErrorActions(wrap, triedProviders) {
  appendErrorActions(wrap, triedProviders, {
    onRetry: () => {
      if (state.streaming) return;
      wrap.remove();
      void requestAssistant();
    },
    onSwitchProvider: () => {
      providerSelect.focus();
      try {
        providerSelect.showPicker?.();
      } catch {}
    },
  });
}

// ===== Send + stream =====

async function send(userText) {
  addMessage(messagesEl, "user", userText);
  state.conversation.push({ role: "user", content: userText });
  saveConversation(state.conversation);
  await requestAssistant();
}

async function requestAssistant() {
  const selection = safeParse(modelSelect.value) || {};
  const providerChoice = providerSelect.value;
  const routerProvider =
    providerChoice === "auto" ? "auto" : selection.provider || providerChoice;
  const modelId = selection.model;

  const { wrap, bubble, roleEl } = addMessage(messagesEl, "assistant", "", {
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
      attachAssistantActions(wrap, streamed);
    }
    state.conversation.push({ role: "assistant", content: streamed });
    saveConversation(state.conversation);
    setStatus(`done · ${state.activeProvider || "?"}`, "ok");
  } catch (err) {
    bubble.classList.remove("cursor");
    if (controller.signal.aborted) {
      setStatus("aborted", "");
      if (streamed) {
        state.conversation.push({ role: "assistant", content: streamed });
        saveConversation(state.conversation);
      }
    } else {
      bubble.textContent = streamed || `error: ${err.message || String(err)}`;
      wrap.classList.add("error");
      attachErrorActions(wrap, triedProviders);
      setStatus(err.message || "error", "err");
    }
  } finally {
    setStreaming(false);
    state.controller = null;
  }
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
  try { return JSON.parse(s); } catch { return null; }
}

// ===== Event wiring =====

providerSelect.addEventListener("change", () => {
  renderModelOptions();
  savePreferences({ provider: providerSelect.value, model: modelSelect.value });
});

modelSelect.addEventListener("change", () => {
  setLastModel(modelSelect.value);
  savePreferences({ provider: providerSelect.value, model: modelSelect.value });
});

newChatBtn.addEventListener("click", () => {
  if (state.streaming) state.controller?.abort();
  state.conversation = [];
  clearStoredConversation();
  messagesEl.innerHTML = "";
  setStatus("");
  showHero();
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

// ===== Init =====

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
  const prefs = loadPreferences();
  if (prefs.provider) providerSelect.value = prefs.provider;
  if (prefs.model) setLastModel(prefs.model);

  renderSuggestions(suggestionsEl, (prompt) => {
    hideHero();
    void send(prompt);
  });

  restoreConversation();
  checkDonatedRedirect();

  try {
    await populateModels();
    setStatus("ready · keyless", "ok");
  } catch (e) {
    setStatus(`init failed: ${e.message}`, "err");
  }
  inputEl.focus();
})();
