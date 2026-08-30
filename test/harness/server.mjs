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
//   POST /edit                  → Architecture 図の書き戻し（編集モード時のみ）
//   POST /present, /export      → 未対応を返すだけのスタブ
//   GET  /markdown-files        → workspace 内の Markdown 一覧（インポート用）
//   POST /import                → Markdown を読み込み、分割してデッキを差し替える
//   GET  /vendor/mermaid.min.js → 分割チャンクから復元（ファイルとしては存在しない）
//   GET  /renderer/*, /vendor/* → 拡張ディレクトリからの静的配信
//   GET  /assets/*              → Markdown 隣接 assets/、次にリポジトリ直下 assets/

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, normalize, sep, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { reconstructAsset } from "../../.github/extensions/presentation/scripts/vendor-assets.mjs";
import {
  replaceArchitectureBlock,
  replaceImportedArchitectureBlock,
} from "../../.github/extensions/presentation/scripts/markdown-blocks.mjs";
import {
  isMarkdownPath,
  listMarkdownFiles,
} from "../../.github/extensions/presentation/scripts/markdown-files.mjs";
import { buildDeckSlides } from "../../.github/extensions/presentation/markdown-deck.mjs";
import { createMarkdownWatcher } from "../../.github/extensions/presentation/scripts/markdown-watcher.mjs";
import { resolveAssetFile } from "../../.github/extensions/presentation/scripts/asset-paths.mjs";

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
 * @param {string}  [options.theme]   dark | light | microsoft | custom
 * @param {number}  [options.index]   初期表示スライド（0 始まり）
 * @param {string}  [options.printToken] 印刷モードで使うトークン
 */
export async function startHarness({
  slides,
  theme = "dark",
  index = 0,
  printToken = "test-print-token",
  architectureEdit = false,
  markdownRoot = "",
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
    // Architecture 図の編集モード。本番の extension.mjs では canvas アクションで
    // 切り替わるが、ハーネスでは起動時のオプションで固定する。
    architectureEdit: Boolean(architectureEdit),
    // インポートされた Markdown の相対パス（未インポートなら空）。
    sourceName: "",
    sourceWriteback: false,
    sourceWritebackSnapshot: "",
    sourceMode: "snapshot",
    sourceWatchStatus: "inactive",
    sourceWatchError: "",
    sourceWatcher: null,
    presenterRunning: false,
  };
  // renderer が POST してきた印刷結果。テスト側が "ready" を確認するために保持する。
  const printReports = [];
  // renderer が POST してきた図の編集結果。テスト側が書き戻しを確認するために保持する。
  const editReports = [];
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

  function stopSourceWatcher() {
        if (!state.sourceWatcher) return;
        state.sourceWatcher.close();
        state.sourceWatcher = null;
      }

  async function reloadSource() {
        if (!state.sourceWriteback || state.sourceMode !== "live") return;
        const sourcePath = state.sourceName ? safeJoin(markdownRoot, state.sourceName) : null;
        try {
          if (!sourcePath || !isMarkdownPath(sourcePath)) throw new Error("source_file_unavailable");
          const markdown = await readFile(sourcePath, "utf8");
          const imported = buildDeckSlides(markdown);
          if (!imported.length) throw new Error("empty_markdown");
          if (markdown !== state.sourceWritebackSnapshot) {
            state.slides = imported;
            state.index = Math.min(state.index, state.slides.length - 1);
            state.sourceWritebackSnapshot = markdown;
            state.deckVersion += 1;
            state.version += 1;
          }
          state.sourceWatchStatus = "watching";
          state.sourceWatchError = "";
          broadcast();
        } catch (error) {
          state.sourceWatchStatus = "error";
          state.sourceWatchError =
            error?.message === "empty_markdown" ? "empty_markdown" : "source_file_not_found";
          broadcast();
        }
      }

  function startSourceWatcher() {
        stopSourceWatcher();
        if (!state.sourceWriteback || state.sourceMode !== "live") return;
        const sourcePath = state.sourceName ? safeJoin(markdownRoot, state.sourceName) : null;
        if (!sourcePath) {
          state.sourceWatchStatus = "error";
          state.sourceWatchError = "source_file_unavailable";
          return;
        }
        try {
          state.sourceWatcher = createMarkdownWatcher({
            path: sourcePath,
            onChange: reloadSource,
            onError: () => {
              state.sourceWatchStatus = "error";
              state.sourceWatchError = "watch_failed";
              broadcast();
            },
          });
          state.sourceWatchStatus = "watching";
          state.sourceWatchError = "";
        } catch (_) {
          state.sourceWatchStatus = "error";
          state.sourceWatchError = "watch_failed";
        }
      }

  async function setSourceMode(mode) {
        if (!state.sourceWriteback) return false;
        state.sourceMode = mode === "live" ? "live" : "snapshot";
        if (state.sourceMode === "live") {
          startSourceWatcher();
          await reloadSource();
        } else {
          stopSourceWatcher();
          state.sourceWatchStatus = "inactive";
          state.sourceWatchError = "";
          broadcast();
        }
        return true;
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
      const offset = Math.max(
        -1,
        Math.min(1, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0),
      );
      const targetIndex = Math.min(
        Math.max(state.index + offset, 0),
        state.slides.length - 1,
      );
      sendJson(res, 200, {
        version: state.version,
        deckVersion: state.deckVersion,
        markdown: state.slides[targetIndex] ?? "",
        index: targetIndex,
        total: state.slides.length,
        theme: state.theme,
        mode: "deck",
        sourceBacked: state.sourceWriteback,
        sourceMode: state.sourceMode,
        sourceWatchStatus: state.sourceWatchStatus,
        sourceWatchError: state.sourceWatchError,
        presenterRunning: state.presenterRunning,
        architectureEdit: state.architectureEdit,
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

    // 編集モードの切り替え。本番同様、サーバー状態を唯一の真実にするための経路。
    // `?architectureEdit=1` で開かれた renderer もここを叩く。
    if (pathname === "/edit-mode") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: "bad_request" });
        return;
      }
      if (typeof body.enabled !== "boolean") {
        sendJson(res, 400, { ok: false, error: "enabled (boolean) is required" });
        return;
      }
      const changed = state.architectureEdit !== body.enabled;
      state.architectureEdit = body.enabled;
      sendJson(res, 200, { ok: true, changed, architectureEdit: state.architectureEdit });
      return;
    }

    // Architecture 図の書き戻し。本番と同じ共有ユーティリティで n 番目の
    // ```architecture フェンスを差し替える（フェンス走査を写経しないため）。
    if (pathname === "/edit") {
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
      if (!state.architectureEdit) {
        sendJson(res, 409, { ok: false, error: "edit_mode_disabled" });
        return;
      }
      if (typeof body.source !== "string" || !body.source.trim()) {
        sendJson(res, 400, { ok: false, error: "source (string) is required" });
        return;
      }
      const target = Number.isInteger(body.index) ? body.index : state.index;
      const block = Number.isInteger(body.block) ? body.block : 0;
      const deckVersion = Number.isInteger(body.deckVersion)
        ? body.deckVersion
        : state.deckVersion;
      if (target < 0 || target >= state.slides.length) {
        sendJson(res, 400, { ok: false, error: "index_out_of_range" });
        return;
      }
      if (deckVersion !== state.deckVersion) {
        sendJson(res, 409, { ok: false, error: "deck_changed" });
        return;
      }
      const next = replaceArchitectureBlock(state.slides[target], block, body.source);
      if (next === null) {
        sendJson(res, 404, { ok: false, error: "block_not_found" });
        return;
      }
      if (state.sourceWriteback) {
        const sourcePath = state.sourceName ? safeJoin(markdownRoot, state.sourceName) : null;
        if (!sourcePath || !isMarkdownPath(sourcePath)) {
          sendJson(res, 409, { ok: false, error: "source_file_unavailable" });
          return;
        }
        let sourceMarkdown;
        try {
          sourceMarkdown = await readFile(sourcePath, "utf8");
        } catch (_) {
          sendJson(res, 404, { ok: false, error: "source_file_not_found" });
          return;
        }
        const fileEdit = replaceImportedArchitectureBlock(
          sourceMarkdown,
          state.slides,
          target,
          block,
          body.source,
          state.sourceWritebackSnapshot,
        );
        if (!fileEdit.ok) {
          sendJson(res, fileEdit.reason === "block_not_found" ? 404 : 409, {
            ok: false,
            error: fileEdit.reason,
          });
          return;
        }
        try {
          await writeFile(sourcePath, fileEdit.markdown, "utf8");
          state.sourceWritebackSnapshot = fileEdit.markdown;
        } catch (_) {
          sendJson(res, 500, { ok: false, error: "source_write_failed" });
          return;
        }
      }
      state.slides[target] = next;
      state.deckVersion += 1;
      state.version += 1;
      editReports.push({ index: target, block, source: body.source });
      broadcast();
      sendJson(res, 200, {
        ok: true,
        version: state.version,
        deckVersion: state.deckVersion,
        index: target,
        block,
        markdown: state.slides[state.index] ?? "",
        fileSaved: state.sourceWriteback,
      });
      return;
    }

    // Markdown インポート（canvas の 📂 ボタン）。走査と分割は本番と同じ共有
    // モジュールを使い、ここではデッキの差し替えだけを行う。
    if (pathname === "/markdown-files") {
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!markdownRoot) {
        sendJson(res, 200, { ok: true, files: [], truncated: false, current: "" });
        return;
      }
      const listed = await listMarkdownFiles(markdownRoot);
      sendJson(res, 200, { ok: true, ...listed, current: state.sourceName });
      return;
    }

    if (pathname === "/import") {
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
      const rel = typeof body.path === "string" ? body.path.trim() : "";
      if (
        body.sourceMode !== undefined &&
        body.sourceMode !== "snapshot" &&
        body.sourceMode !== "live"
      ) {
        sendJson(res, 400, { ok: false, error: "invalid_source_mode" });
        return;
      }
      const abs = markdownRoot && rel ? safeJoin(markdownRoot, rel) : null;
      if (!abs) {
        sendJson(res, 400, { ok: false, error: "path_outside_workspace" });
        return;
      }
      if (!isMarkdownPath(abs)) {
        sendJson(res, 400, { ok: false, error: "not_markdown" });
        return;
      }
      let text;
      try {
        text = await readFile(abs, "utf8");
      } catch (_) {
        sendJson(res, 404, { ok: false, error: "file_not_found" });
        return;
      }
      const imported = buildDeckSlides(text);
      if (!imported.length) {
        sendJson(res, 400, { ok: false, error: "empty_markdown" });
        return;
      }
      state.slides = imported;
      state.index = 0;
      state.sourceName = rel;
      state.sourceWriteback = true;
      state.sourceWritebackSnapshot = text;
      state.sourceMode = body.sourceMode === "live" ? "live" : "snapshot";
      state.sourceWatchStatus = "inactive";
      state.sourceWatchError = "";
      state.deckVersion += 1;
      state.version += 1;
      if (state.sourceMode === "live") {
        startSourceWatcher();
        await reloadSource();
      }
      broadcast();
      sendJson(res, 200, {
        ok: true,
        version: state.version,
        index: state.index,
        total: state.slides.length,
        theme: state.theme,
        sourceName: state.sourceName,
        sourceMode: state.sourceMode,
        sourceWatchStatus: state.sourceWatchStatus,
      });
      return;
    }

    if (pathname === "/source-mode") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (_) {
        sendJson(res, 400, { ok: false, error: "bad_request" });
        return;
      }
      if (body.mode !== "snapshot" && body.mode !== "live") {
        sendJson(res, 400, { ok: false, error: "invalid_source_mode" });
        return;
      }
      const previous = state.sourceMode;
      if (!(await setSourceMode(body.mode))) {
        sendJson(res, 409, { ok: false, error: "source_not_available" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        changed: previous !== state.sourceMode,
        sourceMode: state.sourceMode,
        sourceWatchStatus: state.sourceWatchStatus,
        sourceWatchError: state.sourceWatchError,
      });
      return;
    }

    if (pathname === "/present") {
      if (req.method === "POST") {
        state.presenterRunning = true;
      } else if (req.method === "DELETE") {
        state.presenterRunning = false;
      } else {
        res.setHeader("Allow", "POST, DELETE");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // PDF 書き出しは SDK / 外部ブラウザ側の責務なのでスタブに留める。
    if (pathname === "/export") {
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
      try {
        const sourcePath = state.sourceName ? safeJoin(markdownRoot, state.sourceName) : "";
        const abs = await resolveAssetFile(
          REPO_ROOT,
          sourcePath || "",
          pathname.slice("/assets/".length),
        );
        if (!abs) {
          sendText(res, 404, "Not found");
          return;
        }
        await sendFile(res, abs);
      } catch (error) {
        const forbidden = [
          "invalid_asset_path",
          "asset_source_outside_workspace",
          "asset_root_outside_workspace",
          "asset_outside_workspace",
        ].includes(error?.code);
        sendText(res, forbidden ? 403 : 404, forbidden ? "Forbidden" : "Not found");
      }
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
    /** renderer が POST してきた図の編集（{ index, block, source } の配列）。 */
    editReports,
    /** 表示中スライドの番号（0 始まり）。 */
    get index() {
      return state.index;
    },
    /** サーバー側の編集モード。URL パラメーター経由の有効化を検証するために公開する。 */
    get architectureEdit() {
      return state.architectureEdit;
    },
    get presenterRunning() {
      return state.presenterRunning;
    },
    /** インポート済み Markdown の相対パス（未インポートなら空）。 */
    get sourceName() {
      return state.sourceName;
    },
    get sourceMode() {
      return state.sourceMode;
    },
    get sourceWatchStatus() {
      return state.sourceWatchStatus;
    },
    /** 現在のスライド枚数（インポートで増減する）。 */
    get total() {
      return state.slides.length;
    },
    /** 現在のスライド本文（書き戻しの検証用）。 */
    slideAt(i) {
      return state.slides[i];
    },
    async close() {
      stopSourceWatcher();
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
