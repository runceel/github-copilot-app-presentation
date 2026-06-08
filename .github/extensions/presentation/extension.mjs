// Extension: presentation
// Markdown スライドをネイティブ canvas に表示するプレゼン拡張機能。
//
// The agent loads the whole deck up front by calling the `load_deck` action
// with an array of small markdown fragments (optional front matter + body), then
// flips pages by calling `goto_slide` with an index — no per-page markdown
// regeneration, so navigation is fast. (`show_slide` remains for ad-hoc single
// slide updates.) Each open canvas instance gets its own loopback HTTP server
// that serves a tiny iframe shell (renderer/) plus the vendored markdown/diagram
// libraries (vendor/), exposes the current slide at /state, pushes "changed"
// nudges over SSE (/events), and serves repo-root images at /assets/*. All slide
// rendering happens client-side in renderer/renderer.js; this file is just the
// wiring.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, normalize, sep, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
// Rehydrate state lives outside the committed extension source so reloads can
// restore the last slide without polluting (or depending on writability of)
// the extension folder.
const DATA_DIR = join(tmpdir(), "copilot-presentation-canvas");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
};

function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] || "application/octet-stream";
}

// key uniquely identifies one running panel for one session, avoiding
// collisions when the same instanceId ("presentation") is reused elsewhere.
function keyOf(ctx) {
  return `${ctx.sessionId || "?"}::${ctx.instanceId}`;
}

function dataFileFor(key) {
  return join(DATA_DIR, key.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".json");
}

// instances: key -> { server, url, version, markdown, slides, index, clients:Set, assetsRoot, dataFile }
const instances = new Map();

// Clamp an arbitrary index into [0, total-1] (or 0 when the deck is empty), so
// "next past the end" / "prev before the start" simply stay on the edge slide.
function clampIndex(value, total) {
  let i = Number(value);
  if (!Number.isFinite(i)) return 0;
  i = Math.trunc(i);
  if (total <= 0) return 0;
  if (i < 0) return 0;
  if (i >= total) return total - 1;
  return i;
}

// Allowed deck-wide themes; anything else (or unset) falls back to the default.
const THEMES = new Set(["dark", "light", "microsoft"]);
const DEFAULT_THEME = "dark";
function normalizeTheme(value) {
  const t = typeof value === "string" ? value.trim().toLowerCase() : "";
  return THEMES.has(t) ? t : DEFAULT_THEME;
}

let logger = null;
function log(message, level = "info") {
  try {
    logger?.(message, { level });
  } catch (_) {
    /* never let logging throw */
  }
}

// Resolve the repository root so /assets maps to the repo-root `assets/` folder
// (sibling of slides.md), robust across project / user / gist installs.
function resolveRepoRoot(workingDirectory) {
  if (workingDirectory) {
    try {
      const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: workingDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (root) return root;
    } catch (_) {
      /* not a git repo / git unavailable — fall through */
    }
    let dir = resolve(workingDirectory);
    for (;;) {
      if (existsSync(join(dir, ".git"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  // Fallback: this file lives at <root>/.github/extensions/presentation/.
  return resolve(EXT_DIR, "..", "..", "..");
}

// Join `rel` onto `rootDir` and guarantee the result stays under rootDir
// (defends /assets and static routes against path traversal).
function safeJoin(rootDir, rel) {
  const cleaned = rel.replace(/^[/\\]+/, "");
  const abs = normalize(join(rootDir, cleaned));
  const root = resolve(rootDir);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

async function sendFile(res, absPath, { cache } = {}) {
  try {
    const buf = await readFile(absPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(absPath));
    res.setHeader(
      "Cache-Control",
      cache ? "public, max-age=31536000, immutable" : "no-store",
    );
    res.end(buf);
  } catch (_) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  }
}

function handleSse(req, res, inst) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  res.write("retry: 2000\n\n");
  res.write(`data: ${inst.version}\n\n`);
  inst.clients.add(res);
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {
      /* dropped client cleaned up on close */
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    inst.clients.delete(res);
  });
}

function broadcast(inst) {
  const msg = `data: ${inst.version}\n\n`;
  for (const res of [...inst.clients]) {
    try {
      res.write(msg);
    } catch (_) {
      inst.clients.delete(res);
    }
  }
}

async function persist(inst) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      inst.dataFile,
      JSON.stringify({
        version: inst.version,
        markdown: inst.markdown,
        slides: inst.slides,
        index: inst.index,
        theme: inst.theme,
      }),
      "utf8",
    );
  } catch (e) {
    log(`presentation: persist failed: ${e?.message || e}`, "warning");
  }
}

// Push the slide at inst.index (from the loaded deck) to the canvas: update the
// current markdown, bump the monotonic version, nudge connected clients, and
// persist so a reload can restore the whole deck and position.
async function applyDeckSlide(inst) {
  inst.markdown = inst.slides.length ? inst.slides[inst.index] : "";
  inst.version += 1;
  broadcast(inst);
  await persist(inst);
}

async function startServer(inst) {
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    let pathname = "/";
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    } catch (_) {
      res.statusCode = 400;
      res.end("Bad request");
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      await sendFile(res, join(EXT_DIR, "renderer", "index.html"), { cache: false });
      return;
    }
    if (pathname === "/state") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ version: inst.version, markdown: inst.markdown, theme: inst.theme }));
      return;
    }
    if (pathname === "/events") {
      handleSse(req, res, inst);
      return;
    }
    if (pathname.startsWith("/renderer/") || pathname.startsWith("/vendor/")) {
      const abs = safeJoin(EXT_DIR, pathname);
      if (!abs) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      await sendFile(res, abs, { cache: pathname.startsWith("/vendor/") });
      return;
    }
    if (pathname.startsWith("/assets/")) {
      if (!inst.assetsRoot) {
        res.statusCode = 404;
        res.end("No assets");
        return;
      }
      const abs = safeJoin(inst.assetsRoot, pathname.slice("/assets".length));
      if (!abs) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      await sendFile(res, abs, { cache: true });
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/` };
}

async function ensureInstance(ctx) {
  const key = keyOf(ctx);
  let inst = instances.get(key);
  if (!inst) {
    const repoRoot = resolveRepoRoot(ctx.session?.workingDirectory);
    inst = {
      server: null,
      url: null,
      version: 0,
      markdown: "",
      slides: [],
      index: 0,
      clients: new Set(),
      assetsRoot: join(repoRoot, "assets"),
      dataFile: dataFileFor(key),
      theme: DEFAULT_THEME,
    };
    // Rehydrate the last deck (e.g. after extensions_reload) if present.
    try {
      const saved = JSON.parse(await readFile(inst.dataFile, "utf8"));
      if (typeof saved.markdown === "string") inst.markdown = saved.markdown;
      if (typeof saved.version === "number") inst.version = saved.version;
      if (Array.isArray(saved.slides) && saved.slides.every((s) => typeof s === "string")) {
        inst.slides = saved.slides;
      }
      if (typeof saved.index === "number") inst.index = clampIndex(saved.index, inst.slides.length);
      if (typeof saved.theme === "string") inst.theme = normalizeTheme(saved.theme);
    } catch (_) {
      /* no saved state — start blank */
    }
    instances.set(key, inst);
  }
  if (!inst.server) {
    const { server, url } = await startServer(inst);
    inst.server = server;
    inst.url = url;
  }
  return inst;
}

const session = await joinSession({
  canvases: [
    createCanvas({
      id: "presentation",
      displayName: "Presentation",
      description:
        "Markdown スライドをテーマ付きで表示するプレゼン用 canvas。load_deck で全スライドを一括登録し、goto_slide でページをスムーズに切り替える。show_slide で1枚だけ差し替えることもできる。",
      actions: [
        {
          name: "load_deck",
          description:
            "プレゼン全体を一括登録する。slides に各スライド1枚分の Markdown 断片（任意のフロントマター + 本文）の配列を渡すと、デッキを保持して index（既定 0）のスライドを表示する。任意の theme（dark/light/microsoft、既定 dark）でデッキ全体の配色を指定できる。以降のページ送りは goto_slide で行うと、その都度 Markdown を生成し直さずに済むため速い。",
          inputSchema: {
            type: "object",
            properties: {
              slides: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description:
                  "スライド1枚分の Markdown 断片の配列。各要素の先頭に deck/kicker/page/total/title/layout/theme のフロントマターを任意で付けられる。表示順に並べる。",
              },
              index: {
                type: "number",
                description: "最初に表示するスライドの 0 始まりインデックス（省略時は 0）。",
              },
              theme: {
                type: "string",
                enum: ["dark", "light", "microsoft"],
                description:
                  "デッキ全体の配色テーマ。dark（既定・ダーク）/ light（明るい中立）/ microsoft（Fluent 配色）。省略時は dark。ユーザーがテーマに関わるテイストを伝えたら適切な値を選ぶ。",
              },
            },
            required: ["slides"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const slides = ctx.input?.slides;
            if (
              !Array.isArray(slides) ||
              slides.length === 0 ||
              !slides.every((s) => typeof s === "string")
            ) {
              throw new CanvasError(
                "invalid_input",
                "slides (non-empty array of strings) is required",
              );
            }
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "presentation canvas is not open; open it before calling load_deck",
              );
            }
            inst.slides = slides.slice();
            inst.index = clampIndex(ctx.input?.index ?? 0, inst.slides.length);
            inst.theme = normalizeTheme(ctx.input?.theme);
            await applyDeckSlide(inst);
            return {
              ok: true,
              version: inst.version,
              index: inst.index,
              total: inst.slides.length,
              theme: inst.theme,
            };
          },
        },
        {
          name: "goto_slide",
          description:
            "load_deck で登録済みのデッキ内で、表示するスライドを 0 始まりインデックスで切り替える。範囲外の値は端のスライドに丸められる（最後で次へ→据え置き）。Markdown を生成し直さないのでページ送りが速い。",
          inputSchema: {
            type: "object",
            properties: {
              index: {
                type: "number",
                description: "表示するスライドの 0 始まりインデックス。",
              },
            },
            required: ["index"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "presentation canvas is not open",
              );
            }
            if (!inst.slides.length) {
              throw new CanvasError(
                "no_deck",
                "no deck loaded; call load_deck first",
              );
            }
            if (typeof ctx.input?.index !== "number") {
              throw new CanvasError("invalid_input", "index (number) is required");
            }
            inst.index = clampIndex(ctx.input.index, inst.slides.length);
            await applyDeckSlide(inst);
            return {
              ok: true,
              version: inst.version,
              index: inst.index,
              total: inst.slides.length,
            };
          },
        },
        {
          name: "show_slide",
          description:
            "現在のスライドを1枚だけ更新する。1枚分の小さな Markdown 断片（任意のフロントマター + 本文）を渡すと canvas が即座に切り替わる。デッキ未登録のときの単発表示や、その場限りの差し替えに使う。",
          inputSchema: {
            type: "object",
            properties: {
              markdown: {
                type: "string",
                description:
                  "表示するスライド1枚分の Markdown。先頭に `---` で囲んだ deck/kicker/page/total/title/layout/theme のフロントマターを任意で付けられる（theme 省略時は現在のデッキテーマを引き継ぐ）。",
              },
            },
            required: ["markdown"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const markdown = ctx.input?.markdown;
            if (typeof markdown !== "string") {
              throw new CanvasError("invalid_input", "markdown (string) is required");
            }
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "presentation canvas is not open; open it before calling show_slide",
              );
            }
            inst.markdown = markdown;
            inst.version += 1;
            broadcast(inst);
            await persist(inst);
            return { ok: true, version: inst.version };
          },
        },
        {
          name: "reset",
          description: "スライドをクリアし、待機中のプレースホルダー表示に戻す。",
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "presentation canvas is not open",
              );
            }
            inst.markdown = "";
            inst.slides = [];
            inst.index = 0;
            inst.theme = DEFAULT_THEME;
            inst.version += 1;
            broadcast(inst);
            await persist(inst);
            return { ok: true, version: inst.version };
          },
        },
      ],
      open: async (ctx) => {
        const inst = await ensureInstance(ctx);
        return { title: "Presentation", url: inst.url };
      },
      onClose: async (ctx) => {
        const key = keyOf(ctx);
        const inst = instances.get(key);
        if (!inst) return;
        for (const res of [...inst.clients]) {
          try {
            res.end();
          } catch (_) {
            /* ignore */
          }
        }
        inst.clients.clear();
        instances.delete(key);
        if (inst.server) {
          const server = inst.server;
          inst.server = null;
          inst.url = null;
          await new Promise((r) => server.close(() => r()));
        }
      },
    }),
  ],
});

logger = (message, opts) => session.log(message, opts);
