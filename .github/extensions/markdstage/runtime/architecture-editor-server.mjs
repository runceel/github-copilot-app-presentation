import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";

import { parseArchitecture } from "../renderer/architecture.mjs";
import {
  ARCHITECTURE_ASSET_MAX_BYTES,
  importArchitectureAsset,
  listArchitectureAssets,
} from "../scripts/architecture-assets.mjs";
import { resolveAssetFile } from "../scripts/asset-paths.mjs";
import {
  readArchitectureSourceTarget,
  saveArchitectureSource,
} from "./architecture-source.mjs";
import { sendFile } from "./static-files.mjs";

const MAX_DRAFT_BYTES = 256 * 1024;
const THEMES = new Set(["dark", "light", "microsoft"]);

function normalizeTheme(value) {
  return THEMES.has(value) ? value : "dark";
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readJsonBody(req, limit = MAX_DRAFT_BYTES) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settle(rejectBody, new Error("payload_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        settle(resolveBody, JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (_) {
        settle(rejectBody, new Error("invalid_json"));
      }
    });
    req.on("error", (error) => settle(rejectBody, error));
  });
}

function readBinaryBody(req, limit = ARCHITECTURE_ASSET_MAX_BYTES) {
  return new Promise((resolveBody, rejectBody) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      rejectBody(new Error("asset_too_large"));
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settle(rejectBody, new Error("asset_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!settled) settle(resolveBody, Buffer.concat(chunks));
    });
    req.on("error", (error) => settle(rejectBody, error));
  });
}

function assetErrorStatus(error) {
  if (error?.code === "asset_too_large" || error?.message === "asset_too_large") return 413;
  if (
    [
      "asset_content_type_mismatch",
      "asset_signature_mismatch",
      "unsupported_asset_type",
    ].includes(error?.code)
  ) {
    return 415;
  }
  if (
    [
      "asset_root_outside_workspace",
      "invalid_asset_path",
      "asset_source_outside_workspace",
      "asset_outside_workspace",
    ].includes(error?.code)
  ) {
    return 403;
  }
  if (error?.code === "asset_write_failed" || error?.code === "asset_root_unavailable") return 500;
  return 400;
}

function hostAllowed(req, port) {
  const host = req.headers.host;
  return (
    host === `127.0.0.1:${port}` ||
    host === `localhost:${port}` ||
    host === `[::1]:${port}`
  );
}

function editorSaveStatus(result) {
  if (["source_changed", "stale_generation", "stale_revision"].includes(result.error)) return 409;
  if (result.error === "source_file_too_large") return 413;
  if (result.error === "source_write_failed") return 500;
  return 422;
}

export async function startArchitectureEditorServer({
  extensionDirectory,
  workspaceRoot,
  sourcePath,
  blockIndex = 0,
  theme = "dark",
  onMarkdownSaved,
  logger,
  token = randomBytes(24).toString("base64url"),
} = {}) {
  const inst = {
    workspaceRoot: resolve(workspaceRoot),
    sourcePath: "",
    sourceFile: "",
    sourceMode: 0,
    blockIndex: 0,
    baseMarkdown: "",
    savedSource: "",
    draftSource: "",
    draftRevision: 0,
    generation: 0,
    dirty: false,
    version: 0,
    theme: normalizeTheme(theme),
    clients: new Set(),
  };
  const base = `/${token}`;
  let port = 0;
  let closed = false;
  let operationQueue = Promise.resolve();

  const log = (message, level = "warning") => {
    if (typeof logger === "function") logger(message, level);
  };

  const broadcast = () => {
    for (const client of [...inst.clients]) {
      try {
        client.write(`data: ${inst.version}\n\n`);
      } catch (_) {
        inst.clients.delete(client);
      }
    }
  };

  const serializeOperation = (operation) => {
    const current = operationQueue.catch(() => {}).then(operation);
    operationQueue = current;
    return current;
  };

  const loadTarget = async (input, { discard = false } = {}) => {
    if (inst.dirty && !discard) {
      const error = new Error(
        "The editor has unsaved changes. Save or explicitly discard them before reloading.",
      );
      error.code = "unsaved_changes";
      throw error;
    }
    const nextSourcePath = String(input?.sourcePath || "").trim();
    const nextBlockIndex = input?.blockIndex ?? 0;
    const target = await readArchitectureSourceTarget(
      inst.workspaceRoot,
      nextSourcePath,
      nextBlockIndex,
    );
    inst.sourcePath = target.relativePath;
    inst.sourceFile = target.path;
    inst.sourceMode = target.mode;
    inst.blockIndex = nextBlockIndex;
    inst.baseMarkdown = target.markdown;
    inst.savedSource = target.source;
    inst.draftSource = target.source;
    inst.draftRevision = 0;
    inst.generation += 1;
    inst.dirty = false;
    inst.theme = normalizeTheme(input?.theme);
    inst.version += 1;
    broadcast();
  };

  const snapshotSaveRequest = () => ({
    sourceFile: inst.sourceFile,
    sourcePath: inst.sourcePath,
    blockIndex: inst.blockIndex,
    baseMarkdown: inst.baseMarkdown,
    source: inst.draftSource,
    revision: inst.draftRevision,
    generation: inst.generation,
  });

  const saveInstance = (request) =>
    serializeOperation(async () => {
      if (
        inst.generation !== request.generation ||
        resolve(inst.sourceFile) !== resolve(request.sourceFile)
      ) {
        return {
          ok: false,
          error: "stale_generation",
          message: "The editor target was reloaded. Refresh before saving.",
        };
      }
      const result = await saveArchitectureSource({
        workspaceRoot: inst.workspaceRoot,
        sourcePath: request.sourcePath,
        sourceFile: request.sourceFile,
        blockIndex: request.blockIndex,
        source: request.source,
        expectedMarkdown: request.baseMarkdown,
      });
      if (!result.ok) return result;

      inst.baseMarkdown = result.markdown;
      inst.savedSource = request.source;
      inst.dirty = inst.draftSource !== inst.savedSource;
      inst.version += 1;
      broadcast();
      const response = {
        ok: true,
        sourcePath: result.sourcePath,
        blockIndex: request.blockIndex,
        generation: request.generation,
        savedRevision: request.revision,
        dirty: inst.dirty,
        version: inst.version,
      };
      if (typeof onMarkdownSaved === "function") {
        try {
          await onMarkdownSaved({
            workspaceRoot: inst.workspaceRoot,
            sourcePath: result.sourcePath,
            markdown: result.markdown,
          });
        } catch (error) {
          log(`architecture-editor: MarkdStage sync failed: ${error?.message || error}`);
        }
      }
      return response;
    });

  await loadTarget({ sourcePath, blockIndex, theme });

  const editorDir = join(extensionDirectory, "architecture-editor");
  const rendererDir = join(extensionDirectory, "renderer");
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!hostAllowed(req, port)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    let requestUrl;
    let pathname;
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
      res.end("Not found");
      return;
    }
    const route = pathname.slice(base.length) || "/";
    const sameOrigin = () => {
      const origin = req.headers.origin;
      return !origin || origin === `http://127.0.0.1:${port}`;
    };

    if (route === "/" || route === "/index.html") {
      await sendFile(res, join(editorDir, "index.html"));
      return;
    }
    if (route === "/state") {
      sendJson(res, 200, {
        version: inst.version,
        sourcePath: inst.sourcePath.split(sep).join("/"),
        blockIndex: inst.blockIndex,
        source: inst.draftSource,
        generation: inst.generation,
        draftRevision: inst.draftRevision,
        dirty: inst.dirty,
        theme: inst.theme,
      });
      return;
    }
    if (route === "/events") {
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
          inst.clients.delete(res);
        }
      }, 15_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        inst.clients.delete(res);
      });
      return;
    }
    if (route === "/asset-library") {
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      try {
        const assets = await listArchitectureAssets(inst.workspaceRoot, inst.sourcePath);
        sendJson(res, 200, { ok: true, assets });
      } catch (error) {
        sendJson(res, assetErrorStatus(error), {
          ok: false,
          error: error?.code || "asset_list_failed",
          message: error?.message || "Images could not be listed.",
        });
      }
      return;
    }
    if (route === "/asset-upload") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        sendJson(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      try {
        const content = await readBinaryBody(req);
        const imported = await importArchitectureAsset(inst.workspaceRoot, {
          filename: requestUrl.searchParams.get("name") || "",
          contentType: req.headers["content-type"],
          content,
        });
        sendJson(res, 201, { ok: true, asset: imported });
      } catch (error) {
        sendJson(res, assetErrorStatus(error), {
          ok: false,
          error: error?.code || error?.message || "asset_upload_failed",
          message: error?.message || "The image could not be imported.",
        });
      }
      return;
    }
    if (route === "/draft") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        sendJson(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: error?.message || "bad_request",
        });
        return;
      }
      if (
        typeof body.source !== "string" ||
        !Number.isInteger(body.generation) ||
        !Number.isInteger(body.revision) ||
        body.revision < 0
      ) {
        sendJson(res, 400, { ok: false, error: "invalid_draft" });
        return;
      }
      if (body.generation !== inst.generation) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_generation",
          message: "The editor target was reloaded. Refresh before editing.",
          generation: inst.generation,
          revision: inst.draftRevision,
          dirty: inst.dirty,
          version: inst.version,
        });
        return;
      }
      try {
        parseArchitecture(body.source);
      } catch (error) {
        sendJson(res, 422, {
          ok: false,
          error: "invalid_architecture",
          message: error?.message || "Invalid Architecture DSL.",
        });
        return;
      }
      if (body.revision <= inst.draftRevision) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_draft",
          message: "This draft revision is stale. Reload the editor state before editing.",
          revision: inst.draftRevision,
          dirty: inst.dirty,
          version: inst.version,
        });
        return;
      }
      inst.draftRevision = body.revision;
      inst.draftSource = body.source;
      inst.dirty = inst.draftSource !== inst.savedSource;
      inst.version += 1;
      broadcast();
      sendJson(res, 200, {
        ok: true,
        revision: inst.draftRevision,
        dirty: inst.dirty,
        version: inst.version,
      });
      return;
    }
    if (route === "/save") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendJson(res, 405, { ok: false, error: "method_not_allowed" });
        return;
      }
      if (!sameOrigin()) {
        sendJson(res, 403, { ok: false, error: "origin_not_allowed" });
        return;
      }
      let body;
      try {
        body = await readJsonBody(req, 4096);
      } catch (error) {
        sendJson(res, error?.message === "payload_too_large" ? 413 : 400, {
          ok: false,
          error: error?.message || "bad_request",
        });
        return;
      }
      if (!Number.isInteger(body.generation) || body.generation !== inst.generation) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_generation",
          message: "The editor target was reloaded. Refresh before saving.",
        });
        return;
      }
      if (!Number.isInteger(body.revision) || body.revision !== inst.draftRevision) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_revision",
          message: "The draft changed before saving. Save again to use the latest revision.",
        });
        return;
      }
      const result = await saveInstance(snapshotSaveRequest());
      sendJson(res, result.ok ? 200 : editorSaveStatus(result), result);
      return;
    }
    if (route === "/editor/editor.js") {
      await sendFile(res, join(editorDir, "editor.js"));
      return;
    }
    if (route === "/editor/editor.css") {
      await sendFile(res, join(editorDir, "editor.css"));
      return;
    }
    if (route === "/renderer/slides.css") {
      await sendFile(res, join(rendererDir, "slides.css"));
      return;
    }
    if (
      [
        "/renderer/architecture.mjs",
        "/renderer/architecture-edit.mjs",
        "/renderer/architecture-document.mjs",
      ].includes(route)
    ) {
      await sendFile(res, join(extensionDirectory, route.replace(/^\//, "")));
      return;
    }
    if (route.startsWith("/assets/")) {
      try {
        const asset = await resolveAssetFile(
          inst.workspaceRoot,
          inst.sourcePath,
          route.slice("/assets/".length),
        );
        if (!asset) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        await sendFile(res, asset, { cache: true });
      } catch (error) {
        res.statusCode = assetErrorStatus(error);
        res.end(res.statusCode === 403 ? "Forbidden" : "Not found");
      }
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  });

  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}${base}/`;

  return {
    url,
    get sourcePath() {
      return inst.sourcePath;
    },
    get blockIndex() {
      return inst.blockIndex;
    },
    get dirty() {
      return inst.dirty;
    },
    get version() {
      return inst.version;
    },
    setTheme(nextTheme) {
      inst.theme = normalizeTheme(nextTheme);
    },
    save() {
      return saveInstance(snapshotSaveRequest());
    },
    reload(input = {}, options = {}) {
      return serializeOperation(() =>
        loadTarget(
          {
            sourcePath: input.sourcePath ?? inst.sourcePath,
            blockIndex: input.blockIndex ?? inst.blockIndex,
            theme: input.theme ?? inst.theme,
          },
          options,
        ),
      );
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const client of [...inst.clients]) client.end();
      inst.clients.clear();
      server.closeAllConnections?.();
      await new Promise((done) => server.close(done));
    },
  };
}
