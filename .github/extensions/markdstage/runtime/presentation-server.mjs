// Loopback presentation server used by the MarkdStage CLI.
//
// Security model:
//   * The listener binds to 127.0.0.1 only.
//   * Every route lives below an unguessable per-process URL token, so other
//     local processes cannot discover the deck by scanning ports.
//   * Mutating routes require a same-origin `Origin` header, and every request
//     must carry a loopback `Host` header (DNS-rebinding protection).
//   * Mutable state responses are `no-store`; files stay inside the workspace.
//
// The routes mirror the Canvas Extension endpoints the renderer calls, so the
// browser experience (navigation, presenter view, next-slide preview, notes,
// overview, custom themes, Mermaid, Architecture DSL, local assets) is identical.

import { createServer } from "node:http";
import { realpath, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { resolveAssetFile } from "../scripts/asset-paths.mjs";
import { importedArchitectureBlockIndex } from "../scripts/markdown-blocks.mjs";
import { isMarkdownPath, listMarkdownFiles } from "../scripts/markdown-files.mjs";
import { startArchitectureEditorServer } from "./architecture-editor-server.mjs";
import { saveArchitectureSource } from "./architecture-source.mjs";
import { isPathInside } from "./output-paths.mjs";
import { safeJoin, sendChunkedVendorAsset, sendFile } from "./static-files.mjs";

const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = resolve(RUNTIME_DIR, "..");
const VENDOR_DIR = join(EXT_DIR, "vendor");
const VENDOR_MANIFEST = join(VENDOR_DIR, "vendor-assets.lock.json");
const MAX_BODY_BYTES = 4096;
const MAX_EDIT_BODY_BYTES = 256 * 1024;

export function createUrlToken() {
  return randomBytes(24).toString("base64url");
}

function json(res, status, payload, { cache = "no-store" } = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectPromise(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolvePromise(text ? JSON.parse(text) : {});
      } catch (_) {
        rejectPromise(new Error("invalid_json"));
      }
    });
    req.on("error", rejectPromise);
  });
}

function hostAllowed(req, port) {
  const host = req.headers.host;
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

function broadcast(session) {
  const message = `data: ${session.version}\n\n`;
  for (const client of [...session.clients]) {
    try {
      client.write(message);
    } catch (_) {
      session.clients.delete(client);
    }
  }
}

/**
 * Start the presentation server for a deck session.
 *
 * Returns `{ url, token, port, close, broadcast }`. `session.url` is set to the
 * token-scoped base URL so the shared output runtime can render from it.
 */
export async function startPresentationServer(
  session,
  { editable = false, onLog, token = createUrlToken() } = {},
) {
  const base = `/${token}`;
  const architectureEditors = new Map();
  const editingAvailable = editable === true;
  let port = 0;

  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!hostAllowed(req, port)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Forbidden");
      return;
    }

    let requestUrl;
    let pathname = "/";
    try {
      requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch (_) {
      res.statusCode = 400;
      res.end("Bad request");
      return;
    }

    if (pathname !== base && !pathname.startsWith(`${base}/`)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }
    const route = pathname.slice(base.length) || "/";

    const sameOrigin = () => {
      const origin = req.headers.origin;
      return !origin || origin === `http://127.0.0.1:${port}`;
    };

    if (route === "/" || route === "/index.html") {
      await sendFile(res, join(EXT_DIR, "renderer", "index.html"), { cache: false });
      return;
    }

    if (route === "/state") {
      const offset = Math.max(
        -1,
        Math.min(1, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0),
      );
      const total = session.slides.length;
      const targetIndex = Math.max(0, Math.min(total - 1, session.index + offset));
      json(res, 200, {
        version: session.version,
        deckVersion: session.deckVersion,
        markdown: offset && total ? session.slides[targetIndex] : session.markdown,
        index: offset ? targetIndex : session.index,
        total,
        theme: session.theme,
        themeLocked: session.themeLocked,
        customThemeFile: session.customThemeFile,
        customThemeCss: session.customThemeCss,
        customThemeMeta: session.customThemeMeta,
        mode: session.mode,
        sourceBacked: editingAvailable,
        sourceModeAvailable: false,
        sourceMode: editingAvailable ? "live" : "snapshot",
        sourceWatchStatus: session.watchStatus || "inactive",
        sourceWatchError: session.watchError || "",
        presenterRunning: false,
        presenterWindowAvailable: false,
        presenterViewAvailable: false,
        pdfExportAvailable: false,
        markdownImportAvailable: false,
        architectureEditAvailable: editingAvailable,
        architectureEdit: editingAvailable && Boolean(session.architectureEdit),
        architectureDetailedEdit: editingAvailable,
        architectureDetailedEditTarget: editingAvailable ? "window" : "",
      });
      return;
    }

    if (route === "/deck") {
      json(res, 200, { deckVersion: session.deckVersion, slides: session.slides });
      return;
    }

    if (route === "/events") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Connection", "keep-alive");
      res.write("retry: 2000\n\n");
      res.write(`data: ${session.version}\n\n`);
      session.clients.add(res);
      const heartbeat = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch (_) {
          /* dropped client cleaned up on close */
        }
      }, 15000);
      req.on("close", () => {
        clearInterval(heartbeat);
        session.clients.delete(res);
      });
      return;
    }

    if (route === "/navigate") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        json(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        res.setHeader("Connection", "close");
        json(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: error?.message || "bad_request",
        });
        return;
      }
      const hasIndex = typeof body.index === "number" && Number.isFinite(body.index);
      const hasDelta = typeof body.delta === "number" && Number.isFinite(body.delta);
      if (hasIndex === hasDelta) {
        json(res, 400, {
          ok: false,
          error: "exactly one of index or delta is required",
        });
        return;
      }
      if (!session.slides.length) {
        json(res, 409, { ok: false, error: "no_deck" });
        return;
      }
      const changed = session.navigate(hasIndex ? body.index : session.index + body.delta);
      if (changed) broadcast(session);
      json(res, 200, {
        ok: true,
        changed,
        version: session.version,
        index: session.index,
        total: session.slides.length,
        mode: session.mode,
      });
      return;
    }

    // Print and capture renders read their frozen deck snapshot here.
    if (route === "/export-data") {
      const jobToken = requestUrl.searchParams.get("token") || "";
      const job = session.exportJobs.get(jobToken);
      if (!job) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Export snapshot not found");
        return;
      }
      json(res, 200, {
        slides: job.slides,
        theme: job.theme,
        themeLocked: job.themeLocked,
        customThemeCss: job.customThemeCss,
        customThemeMeta: job.customThemeMeta,
      });
      return;
    }

    if (route === "/export-status") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.statusCode = 405;
        res.end("Method not allowed");
        return;
      }
      const jobToken = requestUrl.searchParams.get("token") || "";
      const job = session.exportJobs.get(jobToken);
      if (!job) {
        res.statusCode = 404;
        res.end("Export snapshot not found");
        return;
      }
      let body;
      try {
        body = await readJsonBody(req, 256 * 1024);
      } catch (error) {
        res.statusCode = error?.message === "payload_too_large" ? 413 : 400;
        res.end("Invalid export status");
        return;
      }
      if (body.status !== "ready" && body.status !== "error") {
        res.statusCode = 400;
        res.end("Invalid export status");
        return;
      }
      job.status = body.status;
      job.error = typeof body.error === "string" ? body.error.slice(0, 2_000) : "";
      job.layout =
        body.layout && typeof body.layout === "object" && Array.isArray(body.layout.slides)
          ? body.layout
          : null;
      res.statusCode = 204;
      res.end();
      return;
    }

    if (route === "/markdown-files") {
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      const { files, truncated } = await listMarkdownFiles(session.workspaceRoot);
      json(res, 200, {
        ok: true,
        files,
        truncated,
        current: session.sourceName || "",
      });
      return;
    }

    // Loading another workspace Markdown file from the browser 📂 button.
    if (route === "/import") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        json(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        res.setHeader("Connection", "close");
        json(res, 400, { ok: false, error: error?.message || "bad_request" });
        return;
      }
      const requested = typeof body.path === "string" ? body.path.trim() : "";
      if (!requested) {
        json(res, 400, { ok: false, error: "path (string) is required" });
        return;
      }
      const root = resolve(session.workspaceRoot);
      const candidate = safeJoin(root, requested);
      if (!candidate || !isPathInside(root, candidate) || !isMarkdownPath(candidate)) {
        json(res, 400, { ok: false, error: "path_outside_workspace" });
        return;
      }
      let canonical;
      try {
        canonical = await realpath(candidate);
        const info = await stat(canonical);
        if (!info.isFile() || !isPathInside(await realpath(root), canonical)) {
          throw new Error("not_a_file");
        }
      } catch (_) {
        json(res, 404, { ok: false, error: "file_not_found" });
        return;
      }
      try {
        session.file = canonical;
        session.sourceName = relative(root, canonical).split(sep).join("/");
        await session.load();
        broadcast(session);
      } catch (error) {
        json(res, 400, { ok: false, error: error?.code || "import_failed" });
        return;
      }
      json(res, 200, {
        ok: true,
        version: session.version,
        index: session.index,
        total: session.slides.length,
        theme: session.theme,
        sourceName: session.sourceName,
        sourceMode: "snapshot",
        sourceWatchStatus: session.watchStatus || "inactive",
      });
      return;
    }

    if (editingAvailable && route === "/edit-mode") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        json(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        res.setHeader("Connection", "close");
        json(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: error?.message || "bad_request",
        });
        return;
      }
      if (typeof body.enabled !== "boolean") {
        json(res, 400, { ok: false, error: "enabled (boolean) is required" });
        return;
      }
      const changed = Boolean(session.architectureEdit) !== body.enabled;
      session.architectureEdit = body.enabled;
      json(res, 200, {
        ok: true,
        changed,
        architectureEdit: session.architectureEdit,
      });
      return;
    }

    if (editingAvailable && route === "/edit") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        json(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req, MAX_EDIT_BODY_BYTES);
      } catch (error) {
        res.setHeader("Connection", "close");
        json(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: error?.message || "bad_request",
        });
        return;
      }
      if (!session.architectureEdit) {
        json(res, 409, { ok: false, error: "edit_mode_disabled" });
        return;
      }
      if (typeof body.source !== "string" || !body.source.trim()) {
        json(res, 400, { ok: false, error: "source (string) is required" });
        return;
      }
      const index = Number.isInteger(body.index) ? body.index : session.index;
      const block = Number.isInteger(body.block) ? body.block : 0;
      const deckVersion = Number.isInteger(body.deckVersion)
        ? body.deckVersion
        : session.deckVersion;
      if (index < 0 || index >= session.slides.length) {
        json(res, 400, { ok: false, error: "index_out_of_range" });
        return;
      }
      if (deckVersion !== session.deckVersion) {
        json(res, 409, { ok: false, error: "deck_changed" });
        return;
      }
      const globalBlock = importedArchitectureBlockIndex(session.slides, index, block);
      if (globalBlock === null) {
        json(res, 404, { ok: false, error: "block_not_found" });
        return;
      }
      const result = await saveArchitectureSource({
        workspaceRoot: session.workspaceRoot,
        sourcePath: session.sourceName,
        sourceFile: session.file,
        blockIndex: globalBlock,
        source: body.source,
        expectedMarkdown: session.sourceMarkdown,
      });
      if (!result.ok) {
        const status =
          result.error === "source_changed"
            ? 409
            : result.error === "block_not_found"
              ? 404
              : result.error === "source_file_too_large"
                ? 413
                : result.error === "source_write_failed"
                  ? 500
                  : 422;
        json(res, status, result);
        return;
      }
      try {
        await session.load({ preserveIndex: true });
      } catch (error) {
        json(res, 500, {
          ok: false,
          error: "source_reload_failed",
          message: error?.message || "The saved deck could not be reloaded.",
        });
        return;
      }
      broadcast(session);
      json(res, 200, {
        ok: true,
        version: session.version,
        deckVersion: session.deckVersion,
        index,
        block,
        markdown: session.markdown,
        fileSaved: true,
      });
      return;
    }

    if (editingAvailable && route === "/architecture-editor/open") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        json(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        json(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: error?.message || "bad_request",
        });
        return;
      }
      const slideIndex = Number.isInteger(body.index) ? body.index : session.index;
      const blockIndex = Number.isInteger(body.block) ? body.block : 0;
      const globalBlock = importedArchitectureBlockIndex(
        session.slides,
        slideIndex,
        blockIndex,
      );
      if (globalBlock === null) {
        json(res, 404, { ok: false, error: "block_not_found" });
        return;
      }
      const key = `${session.file}\0${globalBlock}`;
      let entry = architectureEditors.get(key);
      const refreshExisting = Boolean(entry?.editor);
      if (!entry) {
        entry = { editor: null };
        entry.promise = startArchitectureEditorServer({
          extensionDirectory: EXT_DIR,
          workspaceRoot: session.workspaceRoot,
          sourcePath: session.sourceName,
          blockIndex: globalBlock,
          theme: session.theme,
          logger: onLog,
          onMarkdownSaved: async ({ sourcePath }) => {
            if (resolve(session.workspaceRoot, sourcePath) !== resolve(session.file)) {
              return;
            }
            await session.load({ preserveIndex: true });
            broadcast(session);
          },
        });
        architectureEditors.set(key, entry);
      }
      try {
        const editor = entry.editor ?? (await entry.promise);
        entry.editor = editor;
        if (refreshExisting && !editor.dirty) {
          await editor.reload(
            {
              sourcePath: session.sourceName,
              blockIndex: globalBlock,
              theme: session.theme,
            },
            { discard: true },
          );
        } else {
          editor.setTheme(session.theme);
        }
        json(res, 200, { ok: true, url: editor.url });
      } catch (error) {
        if (!entry.editor && architectureEditors.get(key) === entry) {
          architectureEditors.delete(key);
        }
        json(res, error?.code === "block_not_found" ? 404 : 409, {
          ok: false,
          error: error?.code || "editor_open_failed",
          message: error?.message || "Architecture Editor could not be opened.",
        });
        return;
      }
      return;
    }

    // Routes that are unavailable in this CLI server mode stay explicit so the
    // browser reports an actionable message instead of a bare 404.
    if (
      route === "/present" ||
      route === "/export" ||
      route === "/edit" ||
      route === "/edit-mode" ||
      route === "/source-mode" ||
      route === "/architecture-editor/open"
    ) {
      json(res, 501, {
        ok: false,
        error: "not_supported",
        message:
          "This action is available in the MarkdStage canvas. Use the markdstage CLI commands instead (for example: markdstage export).",
      });
      return;
    }

    if (route === "/vendor/mermaid.min.js") {
      await sendChunkedVendorAsset(res, VENDOR_DIR, VENDOR_MANIFEST, "mermaid.min.js", (message) =>
        onLog?.(message, "error"),
      );
      return;
    }

    if (route.startsWith("/renderer/") || route.startsWith("/vendor/")) {
      const abs = safeJoin(EXT_DIR, route);
      if (!abs) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      await sendFile(res, abs, { cache: route.startsWith("/vendor/") });
      return;
    }

    if (route.startsWith("/theme-assets/")) {
      const assetPath = route.slice("/theme-assets/".length);
      if (!session.customThemeDir || !session.customThemeAssets.has(assetPath)) {
        res.statusCode = 404;
        res.end("Theme asset not found");
        return;
      }
      const themeRoot = resolve(session.workspaceRoot, session.customThemeDir);
      const candidate = safeJoin(themeRoot, assetPath);
      if (!candidate) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      try {
        const [realThemeRoot, realAsset, realWorkspaceRoot] = await Promise.all([
          realpath(themeRoot),
          realpath(candidate),
          realpath(session.workspaceRoot),
        ]);
        if (
          !isPathInside(realWorkspaceRoot, realThemeRoot) ||
          !isPathInside(realThemeRoot, realAsset)
        ) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        await sendFile(res, realAsset, { cache: true });
      } catch (_) {
        res.statusCode = 404;
        res.end("Theme asset not found");
      }
      return;
    }

    if (route.startsWith("/assets/")) {
      try {
        const abs = await resolveAssetFile(
          session.workspaceRoot,
          session.sourceName,
          route.slice("/assets/".length),
        );
        if (!abs) {
          res.statusCode = 404;
          res.end("Asset not found");
          return;
        }
        await sendFile(res, abs, { cache: true });
      } catch (error) {
        const forbidden = [
          "invalid_asset_path",
          "asset_source_outside_workspace",
          "asset_root_outside_workspace",
          "asset_outside_workspace",
        ].includes(error?.code);
        res.statusCode = forbidden ? 403 : 404;
        res.end(forbidden ? "Forbidden" : "Asset not found");
      }
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  });

  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}${base}/`;
  session.url = url;

  return {
    server,
    url,
    token,
    port,
    broadcast: () => broadcast(session),
    close: async () => {
      await Promise.all(
        [...architectureEditors.values()].map(async (entry) =>
          (entry.editor ?? (await entry.promise.catch(() => null)))?.close().catch(() => {}),
        ),
      );
      architectureEditors.clear();
      await new Promise((done) => {
        for (const client of [...session.clients]) {
          try {
            client.end();
          } catch (_) {
            /* the client may already be gone */
          }
        }
        session.clients.clear();
        server.close(() => done());
        server.closeAllConnections?.();
      });
    },
  };
}
