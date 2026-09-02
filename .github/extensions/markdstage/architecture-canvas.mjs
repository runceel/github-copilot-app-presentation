import { createHash } from "node:crypto";
import { basename, normalize, resolve, sep } from "node:path";

import { CanvasError, createCanvas } from "@github/copilot-sdk/extension";

import { importedArchitectureBlockIndex } from "./scripts/markdown-blocks.mjs";
import { startArchitectureEditorServer } from "./runtime/architecture-editor-server.mjs";

const THEMES = new Set(["dark", "light", "microsoft"]);

function keyOf(ctx) {
  return `${ctx.sessionId || "?"}::${ctx.instanceId}`;
}

function normalizeTheme(value) {
  return THEMES.has(value) ? value : "dark";
}

function asCanvasError(error, fallbackCode = "architecture_editor_failed") {
  if (error instanceof CanvasError) return error;
  return new CanvasError(
    error?.code || fallbackCode,
    error?.message || "Architecture Editor could not complete the request.",
  );
}

export function createArchitectureEditorManager({
  extensionDirectory,
  onMarkdownSaved,
  logger,
} = {}) {
  const instances = new Map();
  let copilotSession = null;

  async function ensureInstance(ctx) {
    const key = keyOf(ctx);
    let inst = instances.get(key);
    const input = ctx.input || {};
    const requestedPath = String(input.sourcePath || "").trim();
    const requestedBlock = input.blockIndex ?? 0;
    if (!inst) {
      try {
        inst = await startArchitectureEditorServer({
          extensionDirectory,
          workspaceRoot: resolve(ctx.session?.workingDirectory || process.cwd()),
          sourcePath: requestedPath,
          blockIndex: requestedBlock,
          theme: input.theme,
          onMarkdownSaved,
          logger,
        });
      } catch (error) {
        throw asCanvasError(error);
      }
      instances.set(key, inst);
      return inst;
    }
    const sameTarget =
      inst.sourcePath &&
      normalize(inst.sourcePath) === normalize(requestedPath) &&
      inst.blockIndex === requestedBlock;
    try {
      if (!sameTarget) await inst.reload(input);
      else if ("theme" in input) inst.setTheme(input.theme);
    } catch (error) {
      throw asCanvasError(error);
    }
    return inst;
  }

  const canvas = createCanvas({
    id: "architecture-editor",
    displayName: "Architecture Editor",
    description:
      "A canvas for comprehensive editing of an existing Architecture DSL block in Markdown. Edit nodes, groups, connectors, placement, size, and styles, then explicitly save the changes back to the source Markdown.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "Path to the Markdown file relative to the workspace.",
        },
        blockIndex: {
          type: "integer",
          minimum: 0,
          description: "Zero-based index of the Architecture block in the complete Markdown document.",
        },
        theme: {
          type: "string",
          enum: ["dark", "light", "microsoft"],
          description: "Editor display theme. Defaults to dark when omitted.",
        },
      },
      required: ["sourcePath", "blockIndex"],
      additionalProperties: false,
    },
    actions: [
      {
        name: "save",
        description: "Validate the current draft and explicitly save it to the source Markdown if there are no conflicts.",
        handler: async (ctx) => {
          const inst = instances.get(keyOf(ctx));
          if (!inst) throw new CanvasError("canvas_not_open", "Architecture Editor is not open.");
          const result = await inst.save();
          if (!result.ok) throw new CanvasError(result.error, result.message);
          return result;
        },
      },
      {
        name: "reload",
        description:
          "Reload the target block from the source Markdown. Set discard=true to discard unsaved changes.",
        inputSchema: {
          type: "object",
          properties: {
            discard: {
              type: "boolean",
              description: "When true, discard the unsaved draft and reload.",
            },
          },
          additionalProperties: false,
        },
        handler: async (ctx) => {
          const inst = instances.get(keyOf(ctx));
          if (!inst) throw new CanvasError("canvas_not_open", "Architecture Editor is not open.");
          try {
            await inst.reload({}, { discard: ctx.input?.discard === true });
          } catch (error) {
            throw asCanvasError(error);
          }
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
      instances.delete(key);
      await inst.close();
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
          "Load the Markdown through the MarkdStage file picker before opening the detailed editor.",
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
        extensionId: inst.extensionId,
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
      await Promise.all([...instances.values()].map((inst) => inst.close()));
      instances.clear();
    },
  };
}
