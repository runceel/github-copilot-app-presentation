// Canvas-independent deck session.
//
// A session owns the deck (slides split from one Markdown file), the resolved
// theme, and the current slide index. It carries exactly the fields the shared
// output runtime (PDF export, PNG capture, layout inspection) expects, so the
// CLI and the Canvas Extension drive the same implementation.

import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { buildDeckSlides } from "../markdown-deck.mjs";
import { ensureBackCover } from "../deck-state.mjs";
import { MARKDOWN_MAX_BYTES, isMarkdownPath } from "../scripts/markdown-files.mjs";
import { resolveWorkspaceRoot } from "../scripts/workspace-root.mjs";
import { DEFAULT_THEME, normalizeTheme, resolveFrontMatterTheme } from "../renderer/theme.mjs";
import { MarkdStageError } from "./errors.mjs";
import { loadCustomTheme } from "./custom-theme.mjs";
import { isPathInside } from "./output-paths.mjs";

export function clampIndex(value, total) {
  let index = Number(value);
  if (!Number.isFinite(index)) return 0;
  index = Math.trunc(index);
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

// Front matter selects the theme unless the caller passes an explicit one; an
// explicit theme locks the deck so per-slide front matter cannot override it.
export function resolveDeckTheme({ slides, explicitTheme, explicitThemeFile }) {
  const frontMatter = resolveFrontMatterTheme(slides);
  const hasExplicitTheme = typeof explicitTheme === "string" && explicitTheme.trim().length > 0;
  const theme = hasExplicitTheme ? normalizeTheme(explicitTheme) : frontMatter.theme;
  const themeFile = explicitThemeFile?.trim() || frontMatter.themeFile;
  return {
    theme: themeFile && (!hasExplicitTheme || theme === "custom") ? "custom" : theme,
    themeFile,
    themeLocked: hasExplicitTheme,
  };
}

export async function resolveDeckFile(file, workspaceRoot) {
  if (typeof file !== "string" || !file.trim()) {
    throw new MarkdStageError("invalid_input", "A Markdown file path is required.");
  }
  const absolute = resolve(file);
  if (!isMarkdownPath(absolute)) {
    throw new MarkdStageError(
      "invalid_markdown_path",
      `Only .md and .markdown files can be presented: ${file}`,
    );
  }
  let canonicalFile;
  let canonicalRoot;
  try {
    [canonicalFile, canonicalRoot] = await Promise.all([
      realpath(absolute),
      realpath(workspaceRoot),
    ]);
  } catch (_) {
    throw new MarkdStageError("file_not_found", `Could not read Markdown file: ${file}`);
  }
  if (!isPathInside(canonicalRoot, canonicalFile)) {
    throw new MarkdStageError(
      "path_outside_workspace",
      `Markdown files must stay inside the workspace (${canonicalRoot}).`,
    );
  }
  const info = await stat(canonicalFile);
  if (!info.isFile()) {
    throw new MarkdStageError("file_not_found", `Not a file: ${file}`);
  }
  if (info.size > MARKDOWN_MAX_BYTES) {
    throw new MarkdStageError(
      "file_too_large",
      `Markdown files must be ${MARKDOWN_MAX_BYTES} bytes or smaller: ${file}`,
    );
  }
  return { path: canonicalFile, workspaceRoot: canonicalRoot };
}

export async function readDeckSlides(path) {
  const markdown = await readFile(path, "utf8");
  const slides = buildDeckSlides(markdown);
  if (!slides.length) {
    throw new MarkdStageError("empty_markdown", `The Markdown file has no slides: ${path}`);
  }
  return { markdown, slides };
}

function workspaceRelative(root, path) {
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return "";
  return rel.split(sep).join("/");
}

/**
 * Build a deck session for one Markdown file.
 *
 * `assetUrlPrefix` lets the presentation server serve theme assets below its
 * unguessable per-process URL token.
 */
export async function createDeckSession({
  file,
  workspaceRoot,
  theme,
  themeFile,
  assetUrlPrefix = "/theme-assets/",
  log,
} = {}) {
  // An explicit --workspace wins; otherwise confine the deck to its Git
  // repository root (or the folder holding the Markdown file).
  const deckDirectory = file ? resolve(file, "..") : process.cwd();
  const root = workspaceRoot
    ? resolve(workspaceRoot)
    : resolveWorkspaceRoot(deckDirectory, deckDirectory);
  const resolved = await resolveDeckFile(file, root);
  const session = {
    file: resolved.path,
    workspaceRoot: resolved.workspaceRoot,
    sourceName: workspaceRelative(resolved.workspaceRoot, resolved.path),
    url: "",
    version: 0,
    deckVersion: 0,
    sourceMarkdown: "",
    markdown: "",
    slides: [],
    index: 0,
    mode: "deck",
    theme: DEFAULT_THEME,
    themeLocked: false,
    customThemeFile: "",
    customThemeCss: "",
    customThemeDir: "",
    customThemeMeta: null,
    customThemeAssets: new Set(),
    exportJobs: new Map(),
    exporting: false,
    clients: new Set(),
    requestedTheme: theme,
    requestedThemeFile: themeFile,
    assetUrlPrefix,
    log,
  };

  session.load = async ({ preserveIndex = false } = {}) => {
    const { markdown, slides } = await readDeckSlides(session.file);
    const selection = resolveDeckTheme({
      slides,
      explicitTheme: session.requestedTheme,
      explicitThemeFile: session.requestedThemeFile,
    });
    const custom =
      selection.theme === "custom"
        ? await loadCustomTheme(
            session.workspaceRoot,
            session.sourceName,
            selection.themeFile,
            { assetUrlPrefix: session.assetUrlPrefix },
          )
        : { file: "", css: "", dir: "", metadata: null, assets: [] };
    session.theme = selection.theme;
    session.themeLocked = selection.themeLocked;
    session.customThemeFile = custom.file;
    session.customThemeCss = custom.css;
    session.customThemeDir = custom.dir;
    session.customThemeMeta = custom.metadata;
    session.customThemeAssets = new Set(custom.assets);
    session.sourceMarkdown = markdown;
    session.slides = ensureBackCover(slides.slice());
    session.index = clampIndex(preserveIndex ? session.index : 0, session.slides.length);
    session.markdown = session.slides[session.index] ?? "";
    session.deckVersion += 1;
    session.version += 1;
    return session.slides.length;
  };

  session.navigate = (target) => {
    const next = clampIndex(target, session.slides.length);
    if (next === session.index) return false;
    session.index = next;
    session.markdown = session.slides[session.index] ?? "";
    session.version += 1;
    return true;
  };

  await session.load();
  return session;
}
