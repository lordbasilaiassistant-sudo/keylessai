// Tiny safe markdown renderer — zero deps.
// Supports: fenced code (with language + copy), inline code, bold, italic,
// links, ordered/unordered lists, h2/h3 headings, paragraphs.
// Always escapes user content; never sets innerHTML with raw input.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// NUL-prefixed sentinels can't appear in user text, HTML output, or regex patterns.
const PH_OPEN = "PH_";
const PH_CLOSE = "";

function applyInline(s) {
  const placeholders = [];
  const take = (raw) => {
    placeholders.push(raw);
    return `${PH_OPEN}${placeholders.length - 1}${PH_CLOSE}`;
  };

  let out = escapeHtml(s);

  out = out.replace(/`([^`\n]+)`/g, (_, code) => take(`<code>${code}</code>`));

  out = out.replace(/\*\*([^*\n]+)\*\*/g, (_, t) => take(`<strong>${t}</strong>`));
  out = out.replace(/__([^_\n]+)__/g, (_, t) => take(`<strong>${t}</strong>`));
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, (_, lead, t) =>
    `${lead}${take(`<em>${t}</em>`)}`
  );
  out = out.replace(/(^|[\s(])_([^_\n]+)_/g, (_, lead, t) =>
    `${lead}${take(`<em>${t}</em>`)}`
  );

  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
    take(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
  );

  const phRe = new RegExp(`\\u0001PH_(\\d+)\\u0002`, "g");
  out = out.replace(phRe, (_, i) => placeholders[Number(i)]);
  return out;
}

function toCodeBlockHtml(lang, raw) {
  const langLabel = (lang || "").trim() || "code";
  const escaped = escapeHtml(raw);
  const dataAttr = escapeHtml(raw).replace(/"/g, "&quot;");
  return `<div class="mdcode"><div class="mdcode-head"><span class="mdcode-lang">${escapeHtml(
    langLabel
  )}</span><button type="button" class="mdcode-copy" data-code="${dataAttr}">copy</button></div><pre><code>${escaped}</code></pre></div>`;
}

export function renderMarkdownHtml(src) {
  if (!src) return "";
  const lines = String(src).split("\n");
  const parts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      parts.push(toCodeBlockHtml(lang, body.join("\n")));
      continue;
    }

    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      parts.push(`<h3 class="md-h">${applyInline(h2[1])}</h3>`);
      i++;
      continue;
    }
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      parts.push(`<h4 class="md-h">${applyInline(h3[1])}</h4>`);
      i++;
      continue;
    }

    if (/^\s*([-*])\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*([-*])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*])\s+/, ""));
        i++;
      }
      parts.push(
        `<ul class="md-list">${items.map((t) => `<li>${applyInline(t)}</li>`).join("")}</ul>`
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      parts.push(
        `<ol class="md-list">${items.map((t) => `<li>${applyInline(t)}</li>`).join("")}</ol>`
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{2,}\s+/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    parts.push(`<p class="md-p">${applyInline(paraLines.join("\n"))}</p>`);
  }

  return parts.join("");
}

export function attachCodeCopyHandlers(root) {
  if (!root) return;
  for (const btn of root.querySelectorAll(".mdcode-copy")) {
    if (btn.dataset.bound === "1") continue;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-code") || "";
      const decoded = code
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
      try {
        await navigator.clipboard.writeText(decoded);
        btn.textContent = "copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "copy";
          btn.classList.remove("copied");
        }, 1200);
      } catch {
        btn.textContent = "!";
      }
    });
  }
}
