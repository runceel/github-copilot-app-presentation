import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArchitecture } from "../../.github/extensions/presentation/renderer/architecture.mjs";
import {
  findArchitectureBlocks,
  replaceArchitectureBlock,
} from "../../.github/extensions/presentation/scripts/markdown-blocks.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const EXT_DIR = join(REPO_ROOT, ".github", "extensions", "presentation");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

async function sendFile(res, path) {
  try {
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME[extname(path)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(path));
  } catch (_) {
    res.statusCode = 404;
    res.end("Not found");
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export async function startArchitectureEditorHarness({
  source,
  sourcePath = "slides.md",
  blockIndex = 0,
  theme = "dark",
  saveDelay = 0,
} = {}) {
  parseArchitecture(source);
  let markdown = `# Fixture\n\n\`\`\`architecture\n${source.trimEnd()}\n\`\`\`\n`;
  let baseMarkdown = markdown;
  let draftSource = source;
  let savedSource = source;
  let dirty = false;
  let version = 1;
  let draftRevision = 0;
  let generation = 1;
  let conflict = false;
  const stateDelays = [];
  const saves = [];
  const clients = new Set();

  function broadcast() {
    for (const client of [...clients]) client.write(`data: ${version}\n\n`);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "/index.html") {
      await sendFile(res, join(EXT_DIR, "architecture-editor", "index.html"));
      return;
    }
    if (pathname === "/state") {
      const snapshot = {
        version,
        sourcePath,
        blockIndex,
        source: draftSource,
        generation,
        draftRevision,
        dirty,
        theme,
      };
      const delay = stateDelays.shift() || 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      sendJson(res, 200, snapshot);
      return;
    }
    if (pathname === "/events") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.write(`data: ${version}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (pathname === "/draft") {
      const body = await readBody(req);
      try {
        parseArchitecture(body.source);
      } catch (error) {
        sendJson(res, 422, { ok: false, message: error.message });
        return;
      }
      if (body.generation !== generation) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_generation",
          message: "The editor target was reloaded. Refresh before editing.",
          generation,
          revision: draftRevision,
          dirty,
          version,
        });
        return;
      }
      if (body.revision <= draftRevision) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_draft",
          message: "This draft revision is stale. Reload the editor state before editing.",
          revision: draftRevision,
          dirty,
          version,
        });
        return;
      }
      draftRevision = body.revision;
      draftSource = body.source;
      dirty = draftSource !== savedSource;
      version += 1;
      broadcast();
      sendJson(res, 200, { ok: true, dirty, revision: body.revision, version });
      return;
    }
    if (pathname === "/save") {
      const body = await readBody(req);
      if (body.generation !== generation) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_generation",
          message: "The editor target was reloaded. Refresh before saving.",
        });
        return;
      }
      if (!Number.isInteger(body.revision) || body.revision !== draftRevision) {
        sendJson(res, 409, {
          ok: false,
          error: "stale_revision",
          message: "The draft changed before saving. Save again to use the latest revision.",
        });
        return;
      }
      if (conflict || markdown !== baseMarkdown) {
        sendJson(res, 409, {
          ok: false,
          error: "source_changed",
          message: "The source Markdown changed outside the editor. Reload before saving.",
        });
        return;
      }
      const sourceToSave = draftSource;
      const revisionToSave = draftRevision;
      if (saveDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, saveDelay));
      }
      const next = replaceArchitectureBlock(markdown, blockIndex, sourceToSave);
      if (next === null) {
        sendJson(res, 404, { ok: false, error: "block_not_found" });
        return;
      }
      markdown = next;
      baseMarkdown = next;
      savedSource = sourceToSave;
      dirty = draftSource !== savedSource;
      saves.push(sourceToSave);
      version += 1;
      broadcast();
      sendJson(res, 200, {
        ok: true,
        sourcePath,
        blockIndex,
        generation,
        savedRevision: revisionToSave,
        dirty,
        version,
      });
      return;
    }
    if (pathname === "/editor/editor.js") {
      await sendFile(res, join(EXT_DIR, "architecture-editor", "editor.js"));
      return;
    }
    if (pathname === "/editor/editor.css") {
      await sendFile(res, join(EXT_DIR, "architecture-editor", "editor.css"));
      return;
    }
    if (pathname === "/renderer/slides.css") {
      await sendFile(res, join(EXT_DIR, "renderer", "slides.css"));
      return;
    }
    if (
      [
        "/renderer/architecture.mjs",
        "/renderer/architecture-edit.mjs",
        "/renderer/architecture-document.mjs",
      ].includes(pathname)
    ) {
      await sendFile(res, join(EXT_DIR, pathname.slice(1)));
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    saves,
    get markdown() {
      return markdown;
    },
    get draftSource() {
      return draftSource;
    },
    setConflict(value = true) {
      conflict = value;
    },
    delayNextState(delay) {
      stateDelays.push(delay);
    },
    reloadSource(nextSource) {
      parseArchitecture(nextSource);
      markdown = `# Fixture\n\n\`\`\`architecture\n${nextSource.trimEnd()}\n\`\`\`\n`;
      baseMarkdown = markdown;
      draftSource = nextSource;
      savedSource = nextSource;
      draftRevision = 0;
      generation += 1;
      dirty = false;
      version += 1;
      broadcast();
    },
    async close() {
      for (const client of [...clients]) client.end();
      clients.clear();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
