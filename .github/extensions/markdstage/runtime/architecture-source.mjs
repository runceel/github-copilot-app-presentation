import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { parseArchitecture } from "../renderer/architecture.mjs";
import { ArchitectureError } from "../renderer/architecture-diagnostics.mjs";
import {
  findArchitectureBlocks,
  replaceArchitectureBlock,
} from "../scripts/markdown-blocks.mjs";
import { isMarkdownPath, MARKDOWN_MAX_BYTES } from "../scripts/markdown-files.mjs";
import { serializeMarkdownSave } from "../scripts/markdown-save-coordinator.mjs";
import { atomicReplaceMarkdown } from "../scripts/atomic-markdown-replace.mjs";
import { isPathInside } from "./output-paths.mjs";

function sourceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function resolveArchitectureSourceTarget(workspaceRoot, sourcePath) {
  const root = resolve(workspaceRoot);
  if (
    typeof sourcePath !== "string" ||
    !sourcePath ||
    isAbsolute(sourcePath) ||
    sourcePath.includes("\0")
  ) {
    throw sourceError(
      "invalid_source_path",
      "sourcePath must be a Markdown file inside the workspace.",
    );
  }
  const candidate = resolve(root, sourcePath);
  if (!isPathInside(root, candidate) || !isMarkdownPath(candidate)) {
    throw sourceError(
      "invalid_source_path",
      "sourcePath must be a Markdown file inside the workspace.",
    );
  }

  let canonicalRoot;
  let canonicalSource;
  try {
    [canonicalRoot, canonicalSource] = await Promise.all([realpath(root), realpath(candidate)]);
  } catch (_) {
    throw sourceError("source_file_not_found", `Markdown file not found: ${sourcePath}`);
  }
  if (
    !isPathInside(canonicalRoot, canonicalSource) ||
    resolve(canonicalSource) !== resolve(candidate)
  ) {
    throw sourceError(
      "invalid_source_path",
      "sourcePath must resolve directly to a Markdown file inside the workspace.",
    );
  }
  const info = await stat(canonicalSource);
  if (!info.isFile()) {
    throw sourceError("source_file_not_found", `Markdown file not found: ${sourcePath}`);
  }
  if (info.size > MARKDOWN_MAX_BYTES) {
    throw sourceError("source_file_too_large", "The Markdown file is too large to edit.");
  }
  return {
    root: canonicalRoot,
    path: canonicalSource,
    relativePath: relative(canonicalRoot, canonicalSource),
    mode: info.mode,
  };
}

export async function readArchitectureSourceTarget(workspaceRoot, sourcePath, blockIndex) {
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    throw sourceError("invalid_block_index", "blockIndex must be a non-negative integer.");
  }
  const target = await resolveArchitectureSourceTarget(workspaceRoot, sourcePath);
  const markdown = await readFile(target.path, "utf8");
  const block = findArchitectureBlocks(markdown)[blockIndex];
  if (!block) {
    throw sourceError(
      "block_not_found",
      `Architecture block ${blockIndex} was not found in ${sourcePath}.`,
    );
  }
  try {
    parseArchitecture(block.body);
  } catch (error) {
    if (!(error instanceof ArchitectureError)) throw error;
    throw Object.assign(
      sourceError("invalid_architecture", error.message || "Invalid Architecture DSL."),
      { diagnostic: error.diagnostic, validation: error.validation },
    );
  }
  return { ...target, markdown, source: block.body };
}

export function saveArchitectureSource({
  workspaceRoot,
  sourcePath,
  sourceFile,
  blockIndex,
  source,
  expectedMarkdown,
}) {
  const queuePath = sourceFile || resolve(workspaceRoot, sourcePath);
  return serializeMarkdownSave(queuePath, async () => {
    try {
      parseArchitecture(source);
    } catch (error) {
      if (!(error instanceof ArchitectureError)) throw error;
      return {
        ok: false,
        error: "invalid_architecture",
        message: error?.message || "The diagram is invalid.",
        diagnostic: error.diagnostic,
        validation: error.validation,
      };
    }

    let target;
    try {
      target = await resolveArchitectureSourceTarget(workspaceRoot, sourcePath);
    } catch (error) {
      return {
        ok: false,
        error:
          error?.code === "source_file_too_large" ? "source_file_too_large" : "source_changed",
        message: "The source Markdown target changed outside the editor. Reload before saving.",
      };
    }
    if (sourceFile && resolve(target.path) !== resolve(sourceFile)) {
      return {
        ok: false,
        error: "source_changed",
        message: "The source Markdown target changed outside the editor. Reload before saving.",
      };
    }

    let markdown;
    try {
      markdown = await readFile(target.path, "utf8");
    } catch (_) {
      return {
        ok: false,
        error: "source_file_not_found",
        message: "The source Markdown file no longer exists.",
      };
    }
    if (markdown !== expectedMarkdown) {
      return {
        ok: false,
        error: "source_changed",
        message: "The source Markdown changed outside the editor. Reload before saving.",
      };
    }

    const next = replaceArchitectureBlock(markdown, blockIndex, source);
    if (next === null) {
      return {
        ok: false,
        error: "block_not_found",
        message: "The Architecture block no longer exists.",
      };
    }
    try {
      await atomicReplaceMarkdown({
        path: target.path,
        markdown: next,
        expectedMarkdown: markdown,
        mode: target.mode,
        revalidate: async () => {
          try {
            const verified = await resolveArchitectureSourceTarget(workspaceRoot, sourcePath);
            if (resolve(verified.path) === resolve(target.path)) return;
          } catch (_) {
            // Target replacement and removal are both write conflicts.
          }
          throw sourceError("SOURCE_CHANGED", "source_changed");
        },
      });
    } catch (error) {
      if (error?.code === "SOURCE_CHANGED") {
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
    return {
      ok: true,
      sourcePath: target.relativePath.split(sep).join("/"),
      blockIndex,
      markdown: next,
    };
  });
}
