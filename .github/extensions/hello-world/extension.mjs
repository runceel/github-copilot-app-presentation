// Extension: hello-world
// Hello world を表示するシンプルな canvas
//
// This single-file skeleton is a starting point. For more complex canvases
// (multiple actions with non-trivial logic, shared state, a custom renderer,
// etc.) prefer splitting things out: move each action handler into its own
// function, extract `open`/`onClose` into helpers, and pull large units
// (renderer assets, schema definitions, shared utilities) into sibling files
// imported from this entry point. Keep extension.mjs focused on wiring.

import { createServer } from "node:http";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

// One local HTTP server per open canvas instance. Each instance gets its own
// ephemeral port so multiple canvases (or multiple opens of the same canvas)
// don't collide.
const servers = new Map();

// Counter state is owned by the extension (the Node side) so the agent can read
// it via the `get_count` action regardless of iframe state. Keyed by instanceId.
const counts = new Map(); // instanceId -> number
// Open SSE connections per instance, used to push the value to the iframe(s).
const sseClients = new Map(); // instanceId -> Set<res>

function getCount(instanceId) {
    return counts.get(instanceId) ?? 0;
}

function setCount(instanceId, value) {
    counts.set(instanceId, value);
    broadcast(instanceId, value);
    return value;
}

function broadcast(instanceId, value) {
    const clients = sseClients.get(instanceId);
    if (!clients) return;
    const payload = `data: ${JSON.stringify({ count: value })}\n\n`;
    for (const res of clients) {
        res.write(payload);
    }
}

function renderHtml() {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Counter</title>
    <style>
      html, body { height: 100%; margin: 0; }
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        background: var(--background-color-default, #0d1117);
        color: var(--text-color-default, #e6edf3);
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }
      #count {
        font-family: var(--font-sans-display, var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
        font-size: var(--text-display-medium, clamp(3rem, 12vw, 7rem));
        font-weight: var(--font-weight-semibold, 600);
        font-variant-numeric: tabular-nums;
        margin: 0;
        min-width: 3ch;
        text-align: center;
      }
      .buttons { display: flex; gap: 1rem; }
      button {
        font-family: inherit;
        font-size: var(--text-title-large, 1.6rem);
        font-weight: var(--font-weight-semibold, 600);
        width: 4rem;
        height: 4rem;
        border-radius: 999px;
        border: 1px solid var(--border-color-default, #30363d);
        background: var(--background-color-default, #161b22);
        color: var(--text-color-default, #e6edf3);
        cursor: pointer;
        transition: filter 0.1s ease;
      }
      button:hover { filter: brightness(1.3); }
      button:active { transform: scale(0.96); }
    </style>
  </head>
  <body>
    <div id="count">0</div>
    <div class="buttons">
      <button id="dec" aria-label="decrement">−</button>
      <button id="inc" aria-label="increment">＋</button>
    </div>
    <script>
      const el = document.getElementById("count");
      function render(v) { el.textContent = String(v); }
      async function bump(path) {
        const r = await fetch(path, { method: "POST" });
        const data = await r.json();
        render(data.count);
      }
      document.getElementById("inc").addEventListener("click", () => bump("/increment"));
      document.getElementById("dec").addEventListener("click", () => bump("/decrement"));
      const es = new EventSource("/events");
      es.onmessage = (e) => {
        try { render(JSON.parse(e.data).count); } catch {}
      };
    </script>
  </body>
</html>`;
}

function readBody(res, json) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(json));
}

async function startServer(instanceId) {
    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");

        if (req.method === "POST" && url.pathname === "/increment") {
            return readBody(res, { count: setCount(instanceId, getCount(instanceId) + 1) });
        }
        if (req.method === "POST" && url.pathname === "/decrement") {
            return readBody(res, { count: setCount(instanceId, getCount(instanceId) - 1) });
        }
        if (req.method === "GET" && url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write(`data: ${JSON.stringify({ count: getCount(instanceId) })}\n\n`);
            let clients = sseClients.get(instanceId);
            if (!clients) {
                clients = new Set();
                sseClients.set(instanceId, clients);
            }
            clients.add(res);
            req.on("close", () => clients.delete(res));
            return;
        }

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderHtml());
    });
    // Port 0 = let the OS pick a free ephemeral port. Bind to loopback only.
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "hello-world",
            displayName: "Counter",
            description: "インクリメント／デクリメントボタン付きのカウンター。現在値は get_count アクションで読み取れる。",
            actions: [
                {
                    name: "get_count",
                    description: "このカウンター canvas の現在値を返す",
                    handler: async (ctx) => {
                        return { count: getCount(ctx.instanceId) };
                    },
                },
                {
                    name: "set_count",
                    description: "カウンターの値を指定した数値に設定する",
                    inputSchema: {
                        type: "object",
                        properties: { value: { type: "number" } },
                        required: ["value"],
                    },
                    handler: async (ctx) => {
                        return { count: setCount(ctx.instanceId, ctx.input.value) };
                    },
                },
            ],
            // Called when the agent or host opens the canvas. We boot a local
            // HTTP server on an ephemeral port and hand its URL back to the
            // host so it can render the canvas. Re-opens with the same
            // instanceId reuse the existing server.
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return {
                    title: "Counter",
                    url: entry.url,
                };
            },
            // Tear the per-instance server down when the canvas is closed so
            // ports are not leaked across the lifetime of the extension.
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    sseClients.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
