import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renderMarkdownHtml } from "../src/ui/markdown.js";

test("escapes raw HTML", () => {
  const out = renderMarkdownHtml("plain <script>alert(1)</script> text");
  assert.ok(!/<script/.test(out), "script tag must be escaped");
  assert.match(out, /&lt;script&gt;/);
  assert.match(out, /&lt;\/script&gt;/);
});

test("renders fenced code block with language and copy button", () => {
  const out = renderMarkdownHtml("```python\nprint(\"hello\")\n```");
  assert.match(out, /<div class="mdcode">/);
  assert.match(out, /class="mdcode-lang">python</);
  assert.match(out, /<button[^>]*class="mdcode-copy"/);
  assert.match(out, /print\(&quot;hello&quot;\)/);
});

test("inline code and bold work together", () => {
  const out = renderMarkdownHtml("use `grep` and **ripgrep**");
  assert.match(out, /<code>grep<\/code>/);
  assert.match(out, /<strong>ripgrep<\/strong>/);
});

test("ordered list", () => {
  const out = renderMarkdownHtml("1. first\n2. second\n3. third");
  assert.match(out, /<ol class="md-list">/);
  assert.match(out, /<li>first<\/li><li>second<\/li><li>third<\/li>/);
});

test("unordered list", () => {
  const out = renderMarkdownHtml("- one\n- two\n- three");
  assert.match(out, /<ul class="md-list">/);
  assert.match(out, /<li>one<\/li><li>two<\/li><li>three<\/li>/);
});

test("safe link opens in new tab with noopener", () => {
  const out = renderMarkdownHtml("[DDG](https://duckduckgo.com)");
  assert.match(out, /<a href="https:\/\/duckduckgo\.com"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
});

test("javascript: scheme link is rejected", () => {
  const out = renderMarkdownHtml("[evil](javascript:alert(1))");
  assert.ok(!/<a /.test(out), "must not emit <a> for javascript: scheme");
  assert.match(out, /\[evil\]/);
});

test("numbers in prose are not confused with placeholder sentinels", () => {
  const out = renderMarkdownHtml("we have 5 ways and 3 options");
  assert.match(out, /we have 5 ways and 3 options/);
});

test("heading + paragraph", () => {
  const out = renderMarkdownHtml("## Title\n\nparagraph content");
  assert.match(out, /<h3 class="md-h">Title<\/h3>/);
  assert.match(out, /<p class="md-p">paragraph content<\/p>/);
});

test("empty input returns empty string", () => {
  assert.equal(renderMarkdownHtml(""), "");
  assert.equal(renderMarkdownHtml(null), "");
});

test("mixed content with multiple blocks", () => {
  const input = `## Header

A paragraph with \`inline\` code.

- item 1
- item 2

\`\`\`js
const x = 42;
\`\`\``;
  const out = renderMarkdownHtml(input);
  assert.match(out, /<h3 class="md-h">Header<\/h3>/);
  assert.match(out, /<p class="md-p">A paragraph with <code>inline<\/code> code\.<\/p>/);
  assert.match(out, /<ul class="md-list">/);
  assert.match(out, /<div class="mdcode">/);
});
