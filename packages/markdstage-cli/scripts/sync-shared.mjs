// Copy the canonical MarkdStage runtime, renderer, vendor assets, schemas, and
// guide sources from the Canvas Extension into the npm package.
//
// The Extension folder is the single source of truth and must stay free of npm
// metadata (it ships as a ZIP), so the CLI package mirrors it at pack time and
// before running tests. Canvas-only files are skipped.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const EXTENSION_ROOT = join(REPO_ROOT, ".github", "extensions", "markdstage");
const TARGET = join(PACKAGE_ROOT, "shared");

// Canvas-only sources (they import the Copilot SDK) and test-only material.
const SKIP = new Set([
  "extension.mjs",
  "architecture-canvas.mjs",
  "copilot-extension.json",
  "test",
  "windows",
]);

const ENTRIES = [
  "README.md",
  "THIRD-PARTY-NOTICES.md",
  "architecture-editor",
  "deck-state.mjs",
  "markdown-deck.mjs",
  "markdstage-guide.mjs",
  "presenter-window.mjs",
  "docs",
  "renderer",
  "runtime",
  "schema",
  "scripts",
  "vendor",
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

export async function syncShared({ quiet = false } = {}) {
  if (!(await exists(EXTENSION_ROOT))) {
    throw new Error(
      `The MarkdStage Extension folder was not found at ${EXTENSION_ROOT}. ` +
        "Run this script from a checkout of the markdstage repository.",
    );
  }
  await rm(TARGET, { recursive: true, force: true });
  await mkdir(TARGET, { recursive: true });
  for (const entry of ENTRIES) {
    if (SKIP.has(entry)) continue;
    const source = join(EXTENSION_ROOT, entry);
    if (!(await exists(source))) continue;
    await cp(source, join(TARGET, entry), { recursive: true });
  }
  if (!quiet) {
    process.stdout.write(`markdstage: synced shared runtime into ${TARGET}\n`);
  }
  return TARGET;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncShared({ quiet: process.argv.includes("--quiet") });
}
