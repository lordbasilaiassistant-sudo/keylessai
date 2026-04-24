// Browser-side persistence for KeylessAI.
// Two separate keys: one for provider/model preference, one for the chat
// conversation. Versioned so future schema changes can migrate safely.

const STATE_KEY = "keylessai:state";
const LAST_MODEL_KEY = "keylessai:lastModel";
const CONVERSATION_KEY = "keylessai:conversation:v1";
const MAX_STORED_TURNS = 50;

export function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    return {
      provider: saved?.provider || null,
      model: saved?.model || null,
      lastModel: localStorage.getItem(LAST_MODEL_KEY) || null,
    };
  } catch {
    return { provider: null, model: null, lastModel: null };
  }
}

export function savePreferences({ provider, model }) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ provider, model }));
  } catch {}
}

export function setLastModel(modelValue) {
  try {
    localStorage.setItem(LAST_MODEL_KEY, modelValue);
  } catch {}
}

export function loadConversation() {
  try {
    const raw = localStorage.getItem(CONVERSATION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          typeof m.content === "string" &&
          (m.role === "user" || m.role === "assistant")
      )
      .slice(-MAX_STORED_TURNS);
  } catch {
    try { localStorage.removeItem(CONVERSATION_KEY); } catch {}
    return [];
  }
}

export function saveConversation(conversation) {
  try {
    const trimmed = (conversation || []).slice(-MAX_STORED_TURNS);
    if (trimmed.length === 0) {
      localStorage.removeItem(CONVERSATION_KEY);
      return;
    }
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function clearStoredConversation() {
  try { localStorage.removeItem(CONVERSATION_KEY); } catch {}
}
