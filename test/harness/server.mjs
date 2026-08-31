// Thin static server dedicated to the renderer (test harness).
//
// Production `extension.mjs` depends on the Copilot SDK (`@github/copilot-sdk/extension`) and cannot
// run in CI. Implement **only the minimum endpoints required by the renderer**. Do not duplicate SDK
// logic for state management, persistence, presenter launch, or PDF generation.
//
// The only logic shared with extension.mjs is vendor asset reconstruction, imported directly as
// `reconstructAsset` from `scripts/vendor-assets.mjs`.
//
// Implemented endpoints (those actually called by renderer.js):
//   GET  /                      → renderer/index.html
//   GET  /state                 → current slide (primary polling path)
//   GET  /deck                  → full deck (for the slide list)
//   GET  /events                → SSE notifications for version changes
//   GET  /export-data?token=    → deck data for print mode (required by ?print=1)
//   POST /export-status?token=  → print-mode completion report (renderer throws without a 200)
//   POST /navigate              → slide navigation (index / delta)
//   POST /edit                  → Architecture diagram writeback (edit mode only)
//   POST /present, /export      → stubs that return unsupported
//   GET  /markdown-files        → workspace Markdown list (for import)
//   POST /import                → load and split Markdown, then replace the deck
//   GET  /vendor/mermaid.min.js → reconstruct from split chunks (no complete file exists)
//   GET  /renderer/*, /vendor/* → static files from the Extension directory
//   GET  /assets/*              → assets/ adjacent to Markdown, then root repository assets/

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, normalize, sep, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { reconstructAsset } from "../../.github/extensions/markdstage/scripts/vendor-assets.mjs";
import {
  replaceArchitectureBlock,
  replaceImportedArchitectureBlock,
} from "../../.github/extensions/markdstage/scripts/markdown-blocks.mjs";
import {
  isMarkdownPath,
  listMarkdownFiles,
} from "../../.github/extensions/markdstage/scripts/markdown-files.mjs";
import { buildDeckSlides } from "../../.github/extensions/markdstage/markdown-deck.mjs";
import { createMarkdownWatcher } from "../../.github/extensions/markdstage/scripts/markdown-watcher.mjs";
import { resolveAssetFile } from "../../.github/extensions/markdstage/scripts/asset-paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
export const EXT_DIR = join(REPO_ROOT, ".github", "extensions", "markdstage");
const VENDOR_DIR = join(EXT_DIR, "vendor");
const VENDOR_MANIFEST = join(VENDOR_DIR, "vendor-assets.lock.json");

// Vendor assets distributed in chunks. Process these first because static-file fallback returns 404,
// preventing Mermaid from loading and leaving `mermaid-loading` set forever.
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

// Reject relative paths that escape rootDir to prevent path traversal.
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
 * Start the harness.
 *
 * @param {object} options
 * @param {string[]} options.slides   Array of Markdown fragments, one per slide
 * @param {string}  [options.theme]   dark | light | microsoft | custom
 * @param {number}  [options.index]   Initially displayed slide (zero-based)
 * @param {string}  [options.printToken] Token used in print mode
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

  // Reconstruct once at startup and retain in memory. SHA-256 has been verified for both chunks and
  // combined output, so content is guaranteed correct at this point.
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
    // Architecture diagram edit mode. Production extension.mjs toggles this with a canvas action;
    // the harness fixes it through a startup option.
    architectureEdit: Boolean(architectureEdit),
    // Relative path of imported Markdown, or empty when nothing has been imported.
    sourceName: "",
    sourceWriteback: false,
    sourceWritebackSnapshot: "",
    sourceMode: "snapshot",
    sourceWatchStatus: "inactive",
    sourceWatchError: "",
    sourceWatcher: null,
    presenterRunning: false,
  };
  // Print results posted by the renderer, retained so tests can verify "ready".
  const printReports = [];
  // Diagram edit results posted by the renderer, retained so tests can verify writeback.
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

    // Print mode receives its deck from /export-data rather than /deck.
    if (pathname === "/export-data") {
      if (requestUrl.searchParams.get("token") !== printToken) {
        sendText(res, 404, "Export snapshot not found");
        return;
      }
      sendJson(res, 200, { slides: state.slides, theme: state.theme });
      return;
    }

    // The renderer throws unless response.ok, so always return 2xx.
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
        layout: body.layout && typeof body.layout === "object" ? body.layout : null,
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

    // Toggle edit mode through this path so server state remains the single source of truth, as in
    // production. A renderer opened with `?architectureEdit=1` also calls this endpoint.
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

    // Write back an Architecture diagram by replacing the nth ```architecture fence with the same
    // shared utility used in production, rather than duplicating fence scanning.
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

    // Markdown import (the canvas 📂 button). Use the same shared scanning and splitting modules as
    // production; this harness only replaces the deck.
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

    // PDF export belongs to the SDK / external browser, so keep this as a stub.
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
    /** Print completion reports posted by the renderer (array of { status, error }). */
    printReports,
    /** Diagram edits posted by the renderer (array of { index, block, source }). */
    editReports,
    /** Currently displayed slide number (zero-based). */
    get index() {
      return state.index;
    },
    /** Server-side edit mode, exposed to verify activation through URL parameters. */
    get architectureEdit() {
      return state.architectureEdit;
    },
    get presenterRunning() {
      return state.presenterRunning;
    },
    /** Relative path of imported Markdown, or empty when nothing has been imported. */
    get sourceName() {
      return state.sourceName;
    },
    get sourceMode() {
      return state.sourceMode;
    },
    get sourceWatchStatus() {
      return state.sourceWatchStatus;
    },
    /** Current slide count, which can change on import. */
    get total() {
      return state.slides.length;
    },
    /** Current slide content, used to verify writeback. */
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
