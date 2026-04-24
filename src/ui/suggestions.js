const SUGGESTIONS = [
  {
    label: "Build",
    prompt: "Write a Python script that renames every file in a folder to lowercase.",
  },
  {
    label: "Explain",
    prompt: "Explain this regex: /^(?!.*\\s)[a-zA-Z0-9_-]{3,16}$/",
  },
  {
    label: "Debug",
    prompt: "What are 5 likely reasons a fetch() call works locally but fails in production?",
  },
  {
    label: "Refactor",
    prompt: "Rewrite this in TypeScript with proper types:\n\nfunction greet(name) { return 'hi ' + name }",
  },
  {
    label: "SQL",
    prompt: "Given a users table with (id, email, created_at), write a query to get the 5 newest users per email domain.",
  },
  {
    label: "Shell",
    prompt: "One-line bash: find all .log files modified in the last 24h and compress them.",
  },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSuggestions(container, onPick) {
  if (!container) return;
  container.innerHTML = "";
  for (const s of SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.innerHTML = `<small>${escapeHtml(s.label)}</small>${escapeHtml(s.prompt.split("\n")[0])}`;
    btn.addEventListener("click", () => onPick(s.prompt));
    container.appendChild(btn);
  }
}
