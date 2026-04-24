#!/usr/bin/env node
import { createProxy } from "../src/proxy.js";
import { streamChat, PROVIDERS } from "../router.js";

const BANNER = String.raw`
  ╭─────────────────────────────────────────────────╮
  │   KeylessAI — free OpenAI-compatible endpoint    │
  │   no keys · no signup · no bill                 │
  ╰─────────────────────────────────────────────────╯
`;

function parseArgs(argv) {
  const args = { _: [], port: 8787, host: "127.0.0.1", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a === "-p") args.port = Number(argv[++i]);
    else if (a === "--host") args.host = argv[++i];
    else if (a === "--quiet" || a === "-q") args.quiet = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args._.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`${BANNER}
Usage:
  npx github:lordbasilaiassistant-sudo/keylessai <command> [options]

Commands:
  serve                 Start a local OpenAI-compatible proxy (default: 127.0.0.1:8787)
  test                  Send a quick test prompt to the provider pool
  help                  Show this message

Options (for 'serve'):
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

  const shutdown = () => {
    console.log("\n  shutting down…");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || "serve";

  if (args.help || cmd === "help") {
    printHelp();
    return;
  }
  if (cmd === "serve") return cmdServe(args);
  if (cmd === "test") return cmdTest();

  console.error(`  unknown command: ${cmd}\n`);
  printHelp();
  process.exit(1);
}

main();
