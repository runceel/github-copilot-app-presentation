// Resolve and load the shared MarkdStage runtime.
//
// Published packages carry the runtime in `shared/` (populated by
// scripts/sync-shared.mjs at pack time). In a repository checkout the CLI falls
// back to the canonical Extension folder so both paths run the very same
// parser, renderer, validation, and output implementations.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_ROOT = join(PACKAGE_ROOT, "shared");
const CHECKOUT_ROOT = resolve(
  PACKAGE_ROOT,
  "..",
  "..",
  ".github",
  "extensions",
  "markdstage",
);

export const SHARED_ROOT = existsSync(join(BUNDLED_ROOT, "markdown-deck.mjs"))
  ? BUNDLED_ROOT
  : CHECKOUT_ROOT;

if (!existsSync(join(SHARED_ROOT, "markdown-deck.mjs"))) {
  throw new Error(
    "The MarkdStage shared runtime is missing. Reinstall the package or run `npm run sync`.",
  );
}

export function sharedPath(...parts) {
  return join(SHARED_ROOT, ...parts);
}

function load(relativePath) {
  return import(pathToFileURL(sharedPath(relativePath)).href);
}

const [
  errors,
  deckSession,
  presentationServer,
  output,
  browser,
  outputPaths,
  guide,
  presenterWindow,
  markdownFiles,
  architectureValidation,
] = await Promise.all([
  load("runtime/errors.mjs"),
  load("runtime/deck-session.mjs"),
  load("runtime/presentation-server.mjs"),
  load("runtime/output.mjs"),
  load("runtime/browser.mjs"),
  load("runtime/output-paths.mjs"),
  load("markdstage-guide.mjs"),
  load("presenter-window.mjs"),
  load("scripts/markdown-files.mjs"),
  load("architecture-validation.mjs"),
]);

export const { MarkdStageError } = errors;
export const { createDeckSession, readDeckSlides, resolveDeckFile, resolveDeckTheme } =
  deckSession;
export const { createUrlToken, startPresentationServer } = presentationServer;
export const {
  captureSlides,
  exportPdf,
  exportPptx,
  inspectLayout,
  MAX_CAPTURE_SLIDES,
} = output;
export const { findChromiumBrowser, terminateProcessTree, isProcessRunning } = browser;
export const { captureDirectoryName, pdfNameForSource, pptxNameForSource } = outputPaths;
export const {
  architectureValidationErrors,
  architectureValidationReport,
  deckValidationFeedback,
  hasFrontMatter,
  readGuide,
} = guide;
export const { validateArchitectureInput, createArchitectureValidationTool } = architectureValidation;
export const { buildPresenterBrowserArgs } = presenterWindow;
export const { isMarkdownPath, MARKDOWN_MAX_BYTES } = markdownFiles;
