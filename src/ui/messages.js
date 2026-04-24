// Message rendering, action buttons, and small helpers for the chat UI.
// Pure DOM construction — no direct state mutation beyond the passed wrap.

import { renderMarkdownHtml, attachCodeCopyHandlers } from "./markdown.js";

export function addMessage(messagesEl, role, text, { provider } = {}) {
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

export function appendAssistantActions(wrap, text, { onRegenerate }) {
  const actions = document.createElement("div");
  actions.className = "msg-actions msg-actions-hover";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "msg-action";
  copyBtn.textContent = "⧉ copy";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "copied";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "⧉ copy";
        copyBtn.classList.remove("copied");
      }, 1200);
    } catch {
      copyBtn.textContent = "!";
    }
  });

  const regenBtn = document.createElement("button");
  regenBtn.type = "button";
  regenBtn.className = "msg-action";
  regenBtn.textContent = "↻ regenerate";
  regenBtn.addEventListener("click", () => {
    if (typeof onRegenerate === "function") onRegenerate(wrap);
  });

  actions.appendChild(copyBtn);
  actions.appendChild(regenBtn);
  wrap.appendChild(actions);
}

export function appendErrorActions(wrap, triedProviders, { onRetry, onSwitchProvider }) {
  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "msg-action";
  retryBtn.textContent = "↻ retry";
  retryBtn.addEventListener("click", () => {
    if (typeof onRetry === "function") onRetry(wrap);
  });

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.className = "msg-action";
  switchBtn.textContent = "↔ switch provider";
  switchBtn.addEventListener("click", () => {
    if (typeof onSwitchProvider === "function") onSwitchProvider();
  });

  actions.appendChild(retryBtn);
  actions.appendChild(switchBtn);

  if (triedProviders && triedProviders.length) {
    const tried = document.createElement("span");
    tried.className = "msg-tried";
    tried.textContent = `tried: ${triedProviders.join(" → ")}`;
    actions.appendChild(tried);
  }

  wrap.appendChild(actions);
}

export function findLastAssistantIndex(conversation) {
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i].role === "assistant") return i;
  }
  return -1;
}
