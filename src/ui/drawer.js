import { ENDPOINTS } from "./drawer-endpoints.js";

const drawer = document.getElementById("apiDrawer");
const scrim = document.getElementById("drawerScrim");
const closeBtn = document.getElementById("drawerClose");
const apiBtn = document.getElementById("apiBtn");
const apiLink = document.getElementById("apiLink");
const body = document.getElementById("drawerBody");

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
    <strong>The whole point: zero setup, zero compute, zero cost.</strong><br/>
    Set <code>OPENAI_API_BASE=https://keylessai.thryx.workers.dev/v1</code> and pass any non-empty string as the API key.
    Every OpenAI-compatible tool &mdash; Aider, Cline, Continue, Codex, LangChain, the official OpenAI SDK &mdash; just works.
    Model: <code>openai-fast</code>.
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
