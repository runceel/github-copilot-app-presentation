import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";

import { CanvasError, createCanvas } from "@github/copilot-sdk/extension";

import { parseArchitecture } from "./renderer/architecture.mjs";
import {
  findArchitectureBlocks,
  importedArchitectureBlockIndex,
  replaceArchitectureBlock,
} from "./scripts/markdown-blocks.mjs";
import {
  isMarkdownPath,
  MARKDOWN_MAX_BYTES,
} from "./scripts/markdown-files.mjs";
import { serializeMarkdownSave } from "./scripts/markdown-save-coordinator.mjs";
import { atomicReplaceMarkdown } from "./scripts/atomic-markdown-replace.mjs";

const MAX_DRAFT_BYTES = 256 * 1024;
const THEMES = new Set(["dark", "light", "microsoft"]);

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] || "application/octet-stream";
}

function isPathInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function safeJoin(rootDir, rel) {
  if (typeof rel !== "string" || isAbsolute(rel) || rel.includes("\0")) return null;
  const root = resolve(rootDir);
  const candidate = normalize(join(root, rel.replace(/^[/\\]+/, "")));
  return isPathInside(root, candidate) ? candidate : null;
}

function keyOf(ctx) {
  return `${ctx.sessionId || "?"}::${ctx.instanceId}`;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function sendFile(res, path, cache = false) {
  try {
    const content = await readFile(path);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(path));
    res.setHeader(
      "Cache-Control",
      cache ? "public, max-age=31536000, immutable" : "no-store",
    );
    res.end(content);
  } catch (_) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  }
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

async function resolveMarkdownTarget(workspaceRoot, sourcePath) {
  const root = resolve(workspaceRoot);
  const candidate = safeJoin(root, sourcePath);
  if (!candidate || !isMarkdownPath(candidate)) {
    throw new CanvasError(
      "invalid_source_path",
      "sourcePath must be a Markdown file inside the workspace.",
    );
  }

  let canonicalRoot;
  let canonicalSource;
  try {
    [canonicalRoot, canonicalSource] = await Promise.all([realpath(root), realpath(candidate)]);
  } catch (_) {
    throw new CanvasError("source_file_not_found", `Markdown file not found: ${sourcePath}`);
  }
  if (
    !isPathInside(canonicalRoot, canonicalSource) ||
    resolve(canonicalSource) !== resolve(candidate)
  ) {
    throw new CanvasError(
      "invalid_source_path",
      "sourcePath must resolve directly to a Markdown file inside the workspace.",
    );
  }
  const info = await stat(canonicalSource);
  if (!info.isFile()) {
    throw new CanvasError("source_file_not_found", `Markdown file not found: ${sourcePath}`);
  }
  if (info.size > MARKDOWN_MAX_BYTES) {
    throw new CanvasError("source_file_too_large", "The Markdown file is too large to edit.");
  }
  return {
    root: canonicalRoot,
    path: canonicalSource,
    relativePath: relative(canonicalRoot, canonicalSource),
    mode: info.mode,
  };
}

async function readArchitectureTarget(workspaceRoot, sourcePath, blockIndex) {
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    throw new CanvasError("invalid_block_index", "blockIndex must be a non-negative integer.");
  }
  const target = await resolveMarkdownTarget(workspaceRoot, sourcePath);
  const markdown = await readFile(target.path, "utf8");
  const block = findArchitectureBlocks(markdown)[blockIndex];
  if (!block) {
    throw new CanvasError(
      "block_not_found",
      `Architecture block ${blockIndex} was not found in ${sourcePath}.`,
    );
  }
  try {
    parseArchitecture(block.body);
  } catch (error) {
    throw new CanvasError("invalid_architecture", error?.message || "Invalid Architecture DSL.");
  }
  return { ...target, markdown, source: block.body };
}

function normalizeTheme(value) {
  return THEMES.has(value) ? value : "dark";
}

export function createArchitectureEditorManager({
  extensionDirectory,
  onMarkdownSaved,
  logger,
} = {}) {
  const instances = new Map();
  let copilotSession = null;

  const log = (message, level = "warning") => {
    if (typeof logger === "function") logger(message, level);
  };

  function broadcast(inst) {
    for (const client of [...inst.clients]) {
      try {
        client.write(`data: ${inst.version}\n\n`);
      } catch (_) {
        inst.clients.delete(client);
      }
    }
  }

  async function loadTarget(inst, input, { discard = false } = {}) {
    if (inst.dirty && !discard) {
      throw new CanvasError(
        "unsaved_changes",
        "The editor has unsaved changes. Save or explicitly discard them before reloading.",
      );
    }
    const sourcePath = String(input?.sourcePath || "").trim();
    const blockIndex = input?.blockIndex ?? 0;
    const target = await readArchitectureTarget(inst.workspaceRoot, sourcePath, blockIndex);
    inst.sourcePath = target.relativePath;
    inst.sourceFile = target.path;
    inst.sourceMode = target.mode;
    inst.blockIndex = blockIndex;
    inst.baseMarkdown = target.markdown;
    inst.savedSource = target.source;
    inst.draftSource = target.source;
    inst.draftRevision = 0;
    inst.generation += 1;
    inst.dirty = false;
    inst.theme = normalizeTheme(input?.theme);
    inst.version += 1;
    broadcast(inst);
  }

  function snapshotSaveRequest(inst) {
    return {
      sourceFile: inst.sourceFile,
      sourcePath: inst.sourcePath,
      blockIndex: inst.blockIndex,
      baseMarkdown: inst.baseMarkdown,
      source: inst.draftSource,
      revision: inst.draftRevision,
      generation: inst.generation,
    };
  }

  async function saveInstance(inst, request) {
    const {
      sourceFile,
      sourcePath,
      blockIndex,
      baseMarkdown,
      source: sourceToSave,
      revision: revisionToSave,
      generation: generationToSave,
    } = request;
    const result = await serializeMarkdownSave(sourceFile, async () => {
      if (
        inst.generation !== generationToSave ||
        resolve(inst.sourceFile) !== resolve(sourceFile)
      ) {
        return {
          ok: false,
          error: "stale_generation",
          message: "The editor target was reloaded. Refresh before saving.",
        };
      }
      try {
        parseArchitecture(sourceToSave);
      } catch (error) {
        return {
          ok: false,
          error: "invalid_architecture",
          message: error?.message || "The diagram is invalid.",
        };
      }

      let currentTarget;
      try {
        currentTarget = await resolveMarkdownTarget(inst.workspaceRoot, sourcePath);
      } catch (_) {
        return {
          ok: false,
          error: "source_changed",
          message: "The source Markdown target changed outside the editor. Reload before saving.",
        };
      }
      if (resolve(currentTarget.path) !== resolve(sourceFile)) {
        return {
          ok: false,
          error: "source_changed",
          message: "The source Markdown target changed outside the editor. Reload before saving.",
        };
      }

      let markdown;
      try {
        markdown = await readFile(currentTarget.path, "utf8");
      } catch (_) {
        return {
          ok: false,
          error: "source_file_not_found",
          message: "The source Markdown file no longer exists.",
        };
      }
      if (markdown !== baseMarkdown) {
        return {
          ok: false,
          error: "source_changed",
          message: "The source Markdown changed outside the editor. Reload before saving.",
        };
      }

      const next = replaceArchitectureBlock(markdown, blockIndex, sourceToSave);
      if (next === null) {
        return {
          ok: false,
          error: "block_not_found",
          message: "The Architecture block no longer exists.",
        };
      }
      try {
        await atomicReplaceMarkdown({
          path: currentTarget.path,
          markdown: next,
          expectedMarkdown: markdown,
          mode: currentTarget.mode,
          revalidate: async () => {
            const verified = await resolveMarkdownTarget(inst.workspaceRoot, sourcePath);
            if (resolve(verified.path) !== resolve(sourceFile)) {
              const error = new Error("source_changed");
              error.code = "SOURCE_CHANGED";
              throw error;
            }
          },
        });
      } catch (error) {
        if (error?.code === "SOURCE_CHANGED" || error instanceof CanvasError) {
          return {
            ok: false,
            error: "source_changed",
            message: "The source Markdown changed while it was being saved.",
          };
        }
        return {
          ok: false,
          error: "source_write_failed",
          message: error?.message || "The source Markdown could not be saved.",
        };
      }

      inst.baseMarkdown = next;
      inst.savedSource = sourceToSave;
      inst.dirty = inst.draftSource !== inst.savedSource;
      inst.version += 1;
      broadcast(inst);
      return {
        ok: true,
        sourcePath,
        blockIndex,
        generation: generationToSave,
        savedRevision: revisionToSave,
        dirty: inst.dirty,
        version: inst.version,
        markdown: next,
      };
    });
    if (result.ok && typeof onMarkdownSaved === "function") {
      try {
        await onMarkdownSaved({
          workspaceRoot: inst.workspaceRoot,
          sourcePath: result.sourcePath,
          markdown: result.markdown,
        });
      } catch (error) {
        log(`architecture-editor: presentation sync failed: ${error?.message || error}`);
      }
    }
    if (result.ok) delete result.markdown;
    return result;
  }

  async function startServer(inst) {
    const editorDir = join(extensionDirectory, "architecture-editor");
    const rendererDir = join(extensionDirectory, "renderer");
    const server = createServer(async (req, res) => {
      let requestUrl;
      let pathname;
      try {
        requestUrl = new URL(req.url, "http://127.0.0.1");
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch (_) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }

      if (pathname === "/" || pathname === "/index.html") {
        await sendFile(res, join(editorDir, "index.html"));
        return;
      }
      if (pathname === "/state") {
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
      if (pathname === "/events") {
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
      if (pathname === "/draft") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          sendJson(res, 405, { ok: false, error: "method_not_allowed" });
          return;
        }
        const origin = req.headers.origin;
        if (origin && origin !== new URL(inst.url).origin) {
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
        broadcast(inst);
        sendJson(res, 200, {
          ok: true,
          revision: inst.draftRevision,
          dirty: inst.dirty,
          version: inst.version,
        });
        return;
      }
      if (pathname === "/save") {
        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          sendJson(res, 405, { ok: false, error: "method_not_allowed" });
          return;
        }
        const origin = req.headers.origin;
        if (origin && origin !== new URL(inst.url).origin) {
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
        const request = snapshotSaveRequest(inst);
        const result = await saveInstance(inst, request);
        const conflict = ["source_changed", "stale_generation", "stale_revision"].includes(
          result.error,
        );
        sendJson(res, result.ok ? 200 : conflict ? 409 : 422, result);
        return;
      }
      if (pathname === "/editor/editor.js") {
        await sendFile(res, join(editorDir, "editor.js"));
        return;
      }
      if (pathname === "/editor/editor.css") {
        await sendFile(res, join(editorDir, "editor.css"));
        return;
      }
      if (pathname === "/renderer/slides.css") {
        await sendFile(res, join(rendererDir, "slides.css"));
        return;
      }
      if (
        [
          "/renderer/architecture.mjs",
          "/renderer/architecture-edit.mjs",
          "/renderer/architecture-document.mjs",
        ].includes(pathname)
      ) {
        await sendFile(res, join(extensionDirectory, pathname.replace(/^\//, "")));
        return;
      }
      if (pathname.startsWith("/assets/")) {
        const asset = safeJoin(join(inst.workspaceRoot, "assets"), pathname.slice("/assets/".length));
        if (!asset) {
          res.statusCode = 400;
          res.end("Invalid asset path");
          return;
        }
        try {
          const [canonicalAssets, canonicalAsset] = await Promise.all([
            realpath(join(inst.workspaceRoot, "assets")),
            realpath(asset),
          ]);
          if (!isPathInside(canonicalAssets, canonicalAsset)) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
          }
          await sendFile(res, canonicalAsset, true);
        } catch (_) {
          res.statusCode = 404;
          res.end("Not found");
        }
        return;
      }
      res.statusCode = 404;
      res.end("Not found");
    });

    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
  }

  async function ensureInstance(ctx) {
    const key = keyOf(ctx);
    let inst = instances.get(key);
    if (!inst) {
      inst = {
        key,
        workspaceRoot: resolve(ctx.session?.workingDirectory || process.cwd()),
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
        theme: "dark",
        clients: new Set(),
        server: null,
        url: "",
      };
      instances.set(key, inst);
    }
    const input = ctx.input || {};
    const requestedPath = String(input.sourcePath || "").trim();
    const requestedBlock = input.blockIndex ?? 0;
    const sameTarget =
      inst.sourcePath &&
      normalize(inst.sourcePath) === normalize(requestedPath) &&
      inst.blockIndex === requestedBlock;
    if (!sameTarget) await loadTarget(inst, input);
    else if ("theme" in input) inst.theme = normalizeTheme(input.theme);
    if (!inst.server) {
      const started = await startServer(inst);
      inst.server = started.server;
      inst.url = started.url;
    }
    return inst;
  }

  const canvas = createCanvas({
    id: "architecture-editor",
    displayName: "Architecture Editor",
    description:
      "Markdown 内の既存 Architecture DSL ブロックを本格編集する canvas。ノード、グループ、コネクター、配置、サイズ、スタイルを編集し、明示保存で元 Markdown へ反映する。",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "workspace 内の Markdown ファイルへの相対パス。",
        },
        blockIndex: {
          type: "integer",
          minimum: 0,
          description: "Markdown 全体で 0 から数えた Architecture ブロック番号。",
        },
        theme: {
          type: "string",
          enum: ["dark", "light", "microsoft"],
          description: "エディターの表示テーマ。省略時は dark。",
        },
      },
      required: ["sourcePath", "blockIndex"],
      additionalProperties: false,
    },
    actions: [
      {
        name: "save",
        description: "現在の draft を検証し、競合がなければ元 Markdown へ明示保存する。",
        handler: async (ctx) => {
          const inst = instances.get(keyOf(ctx));
          if (!inst) throw new CanvasError("canvas_not_open", "Architecture Editor is not open.");
          const result = await saveInstance(inst, snapshotSaveRequest(inst));
          if (!result.ok) throw new CanvasError(result.error, result.message);
          return result;
        },
      },
      {
        name: "reload",
        description:
          "元 Markdown から対象ブロックを再読み込みする。未保存変更を破棄する場合は discard=true が必要。",
        inputSchema: {
          type: "object",
          properties: {
            discard: {
              type: "boolean",
              description: "true のとき未保存 draft を破棄して再読み込みする。",
            },
          },
          additionalProperties: false,
        },
        handler: async (ctx) => {
          const inst = instances.get(keyOf(ctx));
          if (!inst) throw new CanvasError("canvas_not_open", "Architecture Editor is not open.");
          await loadTarget(
            inst,
            {
              sourcePath: inst.sourcePath,
              blockIndex: inst.blockIndex,
              theme: inst.theme,
            },
            { discard: ctx.input?.discard === true },
          );
          return { ok: true, version: inst.version, dirty: inst.dirty };
        },
      },
    ],
    open: async (ctx) => {
      const inst = await ensureInstance(ctx);
      return {
        title: `Architecture Editor — ${basename(inst.sourcePath)} #${inst.blockIndex + 1}`,
        url: inst.url,
        status: inst.dirty ? "Unsaved changes" : "Saved",
      };
    },
    onClose: async (ctx) => {
      const key = keyOf(ctx);
      const inst = instances.get(key);
      if (!inst) return;
      for (const client of [...inst.clients]) client.end();
      inst.clients.clear();
      instances.delete(key);
      if (inst.server) {
        inst.server.closeAllConnections?.();
        await new Promise((resolveClose) => inst.server.close(resolveClose));
      }
    },
  });

  return {
    canvas,
    attachSession(session) {
      copilotSession = session;
    },
    canOpenFromPresentation(inst) {
      return Boolean(inst?.sourceWriteback && inst?.sourceWritebackPath);
    },
    async openFromPresentation(inst, slideIndex, blockIndex) {
      if (!this.canOpenFromPresentation(inst)) {
        throw new CanvasError(
          "source_not_available",
          "Load the Markdown through the presentation file picker before opening the detailed editor.",
        );
      }
      if (!copilotSession) {
        throw new CanvasError("session_not_ready", "The canvas session is not ready.");
      }
      const globalBlock = importedArchitectureBlockIndex(
        inst.slides,
        slideIndex,
        blockIndex,
      );
      if (globalBlock === null) {
        throw new CanvasError("block_not_found", "The selected Architecture block was not found.");
      }
      const identity = createHash("sha256")
        .update(`${inst.workspaceRoot}\0${inst.sourceWritebackPath}\0${globalBlock}`)
        .digest("hex")
        .slice(0, 16);
      return copilotSession.rpc.canvas.open({
        canvasId: "architecture-editor",
        instanceId: `architecture-editor-${identity}`,
        input: {
          sourcePath: inst.sourceWritebackPath.split(sep).join("/"),
          blockIndex: globalBlock,
          theme: normalizeTheme(inst.theme),
        },
      });
    },
    async closeAll() {
      for (const inst of [...instances.values()]) {
        for (const client of [...inst.clients]) client.end();
        inst.clients.clear();
        inst.server?.closeAllConnections?.();
        await new Promise((resolveClose) => inst.server?.close(resolveClose) ?? resolveClose());
      }
      instances.clear();
    },
  };
}
