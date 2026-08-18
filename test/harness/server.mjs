// renderer 専用の薄い静的サーバー（テストハーネス）。
//
// 本番の `extension.mjs` は Copilot SDK (`@github/copilot-sdk/extension`) に依存する
// ため CI では起動できない。ここでは **renderer が必要とする最小のエンドポイントだけ**
// を実装する。SDK 側の状態管理・永続化・presenter 起動・PDF 生成といったロジックは
// 一切写経しない（二重メンテを避けるため）。
//
// 唯一 extension.mjs と共有するのは vendor アセットの復元処理で、これは
// `scripts/vendor-assets.mjs` の `reconstructAsset` をそのまま import して使う。
//
// 実装するエンドポイント（renderer.js が実際に叩くもの）:
//   GET  /                      → renderer/index.html
//   GET  /state                 → 現在のスライド（ポーリングの主系）
//   GET  /deck                  → デッキ全体（スライド一覧用）
//   GET  /events                → SSE（version 変更の通知）
//   GET  /export-data?token=    → 印刷モードのデッキ供給（?print=1 で必須）
//   POST /export-status?token=  → 印刷モードの完了報告（200 を返さないと renderer が throw）
//   POST /navigate              → ページ送り（index / delta）
//   POST /present, /export      → 未対応を返すだけのスタブ
//   GET  /vendor/mermaid.min.js → 分割チャンクから復元（ファイルとしては存在しない）
//   GET  /renderer/*, /vendor/* → 拡張ディレクトリからの静的配信
//   GET  /assets/*              → リポジトリ直下 assets/

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, normalize, sep, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { reconstructAsset } from "../../.github/extensions/presentation/scripts/vendor-assets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
export const EXT_DIR = join(REPO_ROOT, ".github", "extensions", "presentation");
const VENDOR_DIR = join(EXT_DIR, "vendor");
const VENDOR_MANIFEST = join(VENDOR_DIR, "vendor-assets.lock.json");

// 分割配布されている vendor アセット。素の静的配信にフォールバックすると 404 になり、
// mermaid が読めず `mermaid-loading` が永久に外れないので必ず先に処理する。
const CHUNKED_VENDOR_ASSETS = new Set(["mermaid.min.js"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] || "application/octet-stream";
}

// rootDir の外へ出る相対パスを弾く（パストラバーサル対策）。
function safeJoin(rootDir, rel) {
  const cleaned = rel.replace(/^[/\\]+/, "");
  const abs = normalize(join(rootDir, cleaned));
  const root = resolve(rootDir);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

async function sendFile(res, absPath) {
  try {
    const buffer = await readFile(absPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(absPath));
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (_) {
    sendText(res, 404, "Not found");
  }
}

async function readJsonBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload_too_large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * ハーネスを起動する。
 *
 * @param {object} options
 * @param {string[]} options.slides   スライド 1 枚分の Markdown 断片の配列
 * @param {string}  [options.theme]   dark | light | microsoft | ms-modern
 * @param {number}  [options.index]   初期表示スライド（0 始まり）
 * @param {string}  [options.printToken] 印刷モードで使うトークン
 */
export async function startHarness({
  slides,
  theme = "dark",
  index = 0,
  printToken = "test-print-token",
} = {}) {
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("startHarness requires a non-empty slides array");
  }

  // 起動時に一度だけ復元してメモリに保持する（チャンク／結合後の両方で SHA-256 検証
  // 済みなので、ここを通った時点で内容の正しさは保証される）。
  const chunkedAssets = new Map();
  for (const name of CHUNKED_VENDOR_ASSETS) {
    chunkedAssets.set(name, await reconstructAsset(VENDOR_DIR, name, VENDOR_MANIFEST));
  }

  const state = {
    version: 1,
    deckVersion: 1,
    slides: slides.slice(),
    index: Math.min(Math.max(index, 0), slides.length - 1),
    theme,
  };
  // renderer が POST してきた印刷結果。テスト側が "ready" を確認するために保持する。
  const printReports = [];
  const sseClients = new Set();

  function broadcast() {
    const message = `data: ${state.version}\n\n`;
    for (const client of [...sseClients]) {
      try {
        client.write(message);
      } catch (_) {
        sseClients.delete(client);
      }
    }
  }

  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    let requestUrl;
    let pathname = "/";
    try {
      requestUrl = new URL(req.url, "http://127.0.0.1");
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch (_) {
      sendText(res, 400, "Bad request");
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      await sendFile(res, join(EXT_DIR, "renderer", "index.html"));
      return;
    }

    if (pathname === "/state") {
      sendJson(res, 200, {
        version: state.version,
        deckVersion: state.deckVersion,
        markdown: state.slides[state.index] ?? "",
        index: state.index,
        total: state.slides.length,
        theme: state.theme,
        mode: "deck",
        presenterRunning: false,
      });
      return;
    }

    if (pathname === "/deck") {
      sendJson(res, 200, { deckVersion: state.deckVersion, slides: state.slides });
      return;
    }

    if (pathname === "/events") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Connection", "keep-alive");
      res.write("retry: 2000\n\n");
      res.write(`data: ${state.version}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // 印刷モードは /deck ではなく /export-data からデッキを受け取る。
    if (pathname === "/export-data") {
      if (requestUrl.searchParams.get("token") !== printToken) {
        sendText(res, 404, "Export snapshot not found");
        return;
      }
      sendJson(res, 200, { slides: state.slides, theme: state.theme });
      return;
    }

    // renderer は response.ok でなければ throw するので必ず 2xx を返す。
    if (pathname === "/export-status") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendText(res, 405, "Method not allowed");
        return;
      }
      if (requestUrl.searchParams.get("token") !== printToken) {
        sendText(res, 404, "Export snapshot not found");
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendText(res, error?.message === "payload_too_large" ? 413 : 400, "Invalid export status");
        return;
      }
      printReports.push({
        status: typeof body.status === "string" ? body.status : "",
        error: typeof body.error === "string" ? body.error : "",
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/navigate") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: "bad_request",
        });
        return;
      }
      const hasIndex = typeof body.index === "number" && Number.isFinite(body.index);
      const hasDelta = typeof body.delta === "number" && Number.isFinite(body.delta);
      if (hasIndex === hasDelta) {
        sendJson(res, 400, { ok: false, error: "exactly one of index or delta is required" });
        return;
      }
      const target = hasIndex ? body.index : state.index + body.delta;
      const clamped = Math.min(Math.max(target, 0), state.slides.length - 1);
      const changed = clamped !== state.index;
      if (changed) {
        state.index = clamped;
        state.version += 1;
        broadcast();
      }
      sendJson(res, 200, {
        ok: true,
        changed,
        version: state.version,
        index: state.index,
        total: state.slides.length,
        mode: "deck",
      });
      return;
    }

    // presenter 起動と PDF 書き出しは SDK / 外部ブラウザ側の責務なのでスタブに留める。
    if (pathname === "/present" || pathname === "/export") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      sendJson(res, 501, { ok: false, error: "not_supported_in_harness" });
      return;
    }

    if (pathname.startsWith("/vendor/")) {
      const assetName = pathname.slice("/vendor/".length);
      const chunked = chunkedAssets.get(assetName);
      if (chunked) {
        res.statusCode = 200;
        res.setHeader("Content-Type", mimeFor(assetName));
        res.setHeader("Cache-Control", "no-store");
        res.end(chunked);
        return;
      }
    }

    if (pathname.startsWith("/renderer/") || pathname.startsWith("/vendor/")) {
      const abs = safeJoin(EXT_DIR, pathname);
      if (!abs) {
        sendText(res, 403, "Forbidden");
        return;
      }
      await sendFile(res, abs);
      return;
    }

    if (pathname.startsWith("/assets/")) {
      const abs = safeJoin(join(REPO_ROOT, "assets"), pathname.slice("/assets".length));
      if (!abs) {
        sendText(res, 403, "Forbidden");
        return;
      }
      await sendFile(res, abs);
      return;
    }

    sendText(res, 404, "Not found");
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });

  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    printToken,
    slides: state.slides,
    theme: state.theme,
    /** renderer が POST してきた印刷完了報告（{ status, error } の配列）。 */
    printReports,
    /** 表示中スライドの番号（0 始まり）。 */
    get index() {
      return state.index;
    },
    async close() {
      for (const client of [...sseClients]) {
        try {
          client.end();
        } catch (_) {
          /* already gone */
        }
      }
      sseClients.clear();
      server.closeAllConnections?.();
      await new Promise((resolvePromise) => server.close(resolvePromise));
    },
  };
}
