#!/usr/bin/env node
import { createProxy } from "../src/server/proxy.js";
import {
  streamChat,
  PROVIDERS,
  FAILOVER_ORDER,
  slotGate,
  listAllModels,
} from "../src/core/router.js";
import { defaultCache } from "../src/core/cache.js";

const BANNER = String.raw`
  ╭─────────────────────────────────────────────────╮
  │   KeylessAI — free OpenAI-compatible endpoint    │
  │   no keys · no signup · no bill                 │
  ╰─────────────────────────────────────────────────╯
`;

function parseArgs(argv) {
  const args = { _: [], port: 8787, host: "127.0.0.1", quiet: false, local: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a === "-p") args.port = Number(argv[++i]);
    else if (a === "--host") args.host = argv[++i];
    else if (a === "--quiet" || a === "-q") args.quiet = true;
    else if (a === "--local" || a === "-l") args.local = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args._.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`${BANNER}
Usage:
  npx github:lordbasilaiassistant-sudo/keylessai <command> [options]

Most users don't need this CLI — just point OPENAI_API_BASE at the public
Cloudflare Worker URL. This CLI is for local-first setups, diagnostics,
and running your own on-prem proxy.

Commands:
  serve [--local]       Start a local OpenAI-compatible proxy on 127.0.0.1:8787
  test                  Send a quick test prompt through the provider pool
  doctor                Diagnose provider health, list models, surface Node version
  help                  Show this message

Options (for 'serve'):
  -l, --local           Acknowledge that this runs locally (no-op flag; makes intent explicit in scripts)
  -p, --port <n>        Port to listen on (default: 8787)
      --host <addr>     Host/interface to bind (default: 127.0.0.1, use 0.0.0.0 for LAN)
  -q, --quiet           Suppress per-request logs

After starting 'serve', set:
  export OPENAI_API_BASE="http://127.0.0.1:8787/v1"
  export OPENAI_BASE_URL="http://127.0.0.1:8787/v1"
  export OPENAI_API_KEY="not-needed"

Works with Aider, Cline, Continue, Codex, LangChain, OpenAI SDK, anything.

Docs: https://github.com/lordbasilaiassistant-sudo/keylessai
`);
}

async function cmdServe(args) {
  const server = createProxy({
    log: (msg) => {
      if (!args.quiet) process.stdout.write(`  · ${msg}\n`);
    },
  });

  server.listen(args.port, args.host, () => {
    console.log(BANNER);
    console.log(`  Listening on http://${args.host}:${args.port}\n`);
    console.log("  Point your OpenAI client at this URL:");
    console.log(`    export OPENAI_API_BASE="http://${args.host}:${args.port}/v1"`);
    console.log(`    export OPENAI_BASE_URL="http://${args.host}:${args.port}/v1"`);
    console.log(`    export OPENAI_API_KEY="not-needed"\n`);
    console.log(`  Providers in pool: ${Object.keys(PROVIDERS).join(", ")}`);
    console.log(`  Health: http://${args.host}:${args.port}/health`);
    console.log(`  Models: http://${args.host}:${args.port}/v1/models\n`);
    console.log("  Ctrl+C to stop.\n");
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`  ✗ port ${args.port} already in use. Try --port ${args.port + 1}`);
    } else {
      console.error(`  ✗ server error: ${e.message}`);
    }
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      console.log("\n  force-exiting (second signal)");
      process.exit(1);
    }
    shuttingDown = true;
    const inflight = server.active;
    if (inflight === 0) {
      console.log("\n  shutting down (idle)…");
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500).unref();
      return;
    }
    console.log(`\n  draining ${inflight} in-flight request(s) — press Ctrl+C again to force exit`);
    const { drained, remaining } = await server.drain(30_000);
    if (drained) {
      console.log("  drained cleanly.");
    } else {
      console.log(`  grace period elapsed; ${remaining} request(s) still in flight, exiting anyway.`);
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function cmdTest() {
  console.log(BANNER);
  console.log("  Running a quick test against the provider pool…\n");

  let out = "";
  try {
    for await (const chunk of streamChat({
      provider: "auto",
      messages: [
        { role: "user", content: "Say only: 'KeylessAI proxy is alive.'" },
      ],
      onProviderChange: (p) => console.log(`  → provider: ${p}`),
    })) {
      if (chunk.type === "content") {
        out += chunk.text;
        process.stdout.write(chunk.text);
      }
    }
    console.log("\n\n  ✓ test passed.\n");
    process.exit(0);
  } catch (e) {
    console.error(`\n  ✗ test failed: ${e.message}\n`);
    process.exit(1);
  }
}

async function cmdDoctor() {
  console.log(BANNER);
  console.log("  KeylessAI diagnostics\n");

  const nodeVer = process.versions.node;
  const nodeMajor = parseInt(nodeVer.split(".")[0], 10);
  console.log(`  node:            v${nodeVer} ${nodeMajor >= 18 ? "✓" : "✗ need >=18"}`);
  console.log(`  fetch available: ${typeof fetch === "function" ? "✓" : "✗"}`);
  console.log(`  platform:        ${process.platform}/${process.arch}`);
  console.log("");

  console.log("  === Provider health checks ===");
  for (const id of FAILOVER_ORDER) {
    const p = PROVIDERS[id];
    const t0 = Date.now();
    let ok = false;
    try {
      ok = await p.healthCheck();
    } catch {}
    const ms = Date.now() - t0;
    console.log(`  ${ok ? "✓" : "✗"}  ${id.padEnd(20)} ${p.label.padEnd(28)} ${ms}ms`);
  }
  console.log("");

  console.log("  === Live model lists ===");
  const groups = await listAllModels();
  for (const g of groups) {
    console.log(`  ${g.label} — ${g.models.length} models`);
    for (const m of g.models.slice(0, 10)) {
      console.log(`    · ${m.id}`);
    }
    if (g.models.length > 10) {
      console.log(`    · ... and ${g.models.length - 10} more`);
    }
  }
  console.log("");

  console.log("  === Runtime state ===");
  console.log(`  slot gate depth: ${slotGate.depth}`);
  console.log(`  cache stats:     ${JSON.stringify(defaultCache.stats())}`);
  console.log("");

  console.log("  === End-to-end test ===");
  let out = "";
  let activeProvider = "?";
  try {
    for await (const chunk of streamChat({
      provider: "auto",
      messages: [{ role: "user", content: "Reply with only: doctor ok" }],
      onProviderChange: (p) => {
        activeProvider = p;
      },
    })) {
      if (chunk.type === "content") out += chunk.text;
    }
    console.log(`  ✓ reply from ${activeProvider}: ${out.trim()}\n`);
    process.exit(0);
  } catch (e) {
    console.error(`  ✗ end-to-end failed: ${e.message}\n`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || "serve";

  if (args.help || cmd === "help") {
    printHelp();
    return;
  }
  if (cmd === "serve") return cmdServe(args);
  if (cmd === "test") return cmdTest();
  if (cmd === "doctor") return cmdDoctor();

  console.error(`  unknown command: ${cmd}\n`);
  printHelp();
  process.exit(1);
}

main();
