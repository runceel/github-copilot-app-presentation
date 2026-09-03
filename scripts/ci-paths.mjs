import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const CI_AREAS = Object.freeze(["docs", "test", "cli", "desktop"]);

function emptySelection() {
  return Object.fromEntries(CI_AREAS.map((area) => [area, false]));
}

function selectAll(selection) {
  for (const area of CI_AREAS) selection[area] = true;
}

function normalizePath(path) {
  return path.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function isPublishedDocumentation(path) {
  return (
    path === "README.md" ||
    path === "README.ja.md" ||
    path === "DESIGN.md" ||
    path === "PRODUCT.md" ||
    path === "LICENSE" ||
    path.startsWith("docs/user-guide/") ||
    path === "packages/markdstage-cli/README.md" ||
    path === "apps/MarkdStage.Desktop/README.md" ||
    path === ".github/RELEASING.md" ||
    path.startsWith(".github/release-notes/") ||
    path === ".github/extensions/markdstage/README.md" ||
    path === ".github/extensions/markdstage/THIRD-PARTY-NOTICES.md" ||
    path === ".github/extensions/markdstage/schema/README.md" ||
    path.startsWith(".github/extensions/markdstage/docs/")
  );
}

function isFullSuiteInfrastructure(path) {
  return (
    path === "package.json" ||
    path === "package-lock.json" ||
    path.startsWith(".github/workflows/") ||
    path.startsWith("scripts/") ||
    path.startsWith("test/ci/")
  );
}

function classifyExtensionPath(path, selection) {
  const root = ".github/extensions/markdstage/";
  if (!path.startsWith(root)) return false;

  const relative = path.slice(root.length);
  selection.test = true;

  if (
    relative === "README.md" ||
    relative === "THIRD-PARTY-NOTICES.md" ||
    relative === "deck-state.mjs" ||
    relative === "markdown-deck.mjs" ||
    relative === "markdstage-guide.mjs" ||
    relative === "presenter-window.mjs" ||
    relative.startsWith("architecture-editor/") ||
    relative.startsWith("docs/") ||
    relative.startsWith("renderer/") ||
    relative.startsWith("runtime/") ||
    relative.startsWith("schema/") ||
    relative.startsWith("scripts/") ||
    relative.startsWith("vendor/")
  ) {
    selection.cli = true;
  }

  if (
    relative === "THIRD-PARTY-NOTICES.md" ||
    relative.startsWith("renderer/") ||
    relative.startsWith("vendor/") ||
    relative.startsWith("windows/")
  ) {
    selection.desktop = true;
  }

  return true;
}

export function classifyCiPaths(paths, { forceAll = false } = {}) {
  const selection = emptySelection();
  const normalizedPaths = [...new Set(paths.map(normalizePath).filter(Boolean))];

  if (forceAll || normalizedPaths.length === 0) {
    selectAll(selection);
    return selection;
  }

  for (const path of normalizedPaths) {
    let recognized = false;

    if (isPublishedDocumentation(path)) {
      selection.docs = true;
      recognized = true;
    }

    if (isFullSuiteInfrastructure(path)) {
      selectAll(selection);
      continue;
    }

    if (path.startsWith("packages/markdstage-cli/")) {
      if (path !== "packages/markdstage-cli/README.md") selection.cli = true;
      continue;
    }

    if (
      path.startsWith(".agents/skills/markdstage/") ||
      path.startsWith(".claude/skills/markdstage/") ||
      path.startsWith(".github/skills/markdstage/")
    ) {
      selection.cli = true;
      continue;
    }

    if (path.startsWith("apps/MarkdStage.Desktop/")) {
      if (path !== "apps/MarkdStage.Desktop/README.md") selection.desktop = true;
      continue;
    }

    if (classifyExtensionPath(path, selection)) continue;

    if (path === "test/fixtures/markdown-deck-corpus.json") {
      selection.test = true;
      selection.desktop = true;
      continue;
    }

    if (path.startsWith("test/") || path === "playwright.config.mjs") {
      selection.test = true;
      continue;
    }

    if (path === "slides.md") {
      selection.test = true;
      selection.cli = true;
      continue;
    }

    if (!recognized) selectAll(selection);
  }

  return selection;
}

export function githubOutput(selection) {
  return CI_AREAS.map((area) => `${area}=${selection[area]}`).join("\n") + "\n";
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function main() {
  const forceAll = process.argv.includes("--all");
  const changedPaths = forceAll ? [] : (await readStdin()).split(/\r?\n/);
  const selection = classifyCiPaths(changedPaths, { forceAll });
  const output = githubOutput(selection);

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output, "utf8");
  }
  process.stdout.write(JSON.stringify(selection));
  process.stdout.write("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
