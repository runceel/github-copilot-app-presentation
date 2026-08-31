// Extension: MarkdStage
// MarkdStage extension for displaying Markdown slides in a native canvas.
//
// The agent loads the whole deck up front by calling the `load_deck` action
// with an array of small markdown fragments (optional front matter + body), then
// flips pages by calling `goto_slide` with an index — no per-page markdown
// regeneration, so navigation is fast. (`show_slide` remains for ad-hoc single
// slide updates.) Each open canvas instance gets its own loopback HTTP server
// that serves a tiny iframe shell (renderer/) plus the vendored markdown/diagram
// libraries (vendor/), exposes the current slide at /state, pushes "changed"
// nudges over SSE (/events), and serves deck-local or workspace-root images at
// /assets/*. All slide
// rendering happens client-side in renderer/renderer.js. On Windows, this file
// also owns one optional native Surface Pen tail-button listener.

import { createServer } from "node:http";
import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  basename,
  join,
  normalize,
  sep,
  dirname,
  resolve,
  extname,
  relative,
  isAbsolute,
} from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { createArchitectureEditorManager } from "./architecture-canvas.mjs";
import { reconstructAsset } from "./scripts/vendor-assets.mjs";
import {
  importedArchitectureBlockIndex,
  replaceArchitectureBlock,
  replaceImportedArchitectureBlock,
} from "./scripts/markdown-blocks.mjs";
import {
  isMarkdownPath,
  listMarkdownFiles,
  MARKDOWN_MAX_BYTES,
} from "./scripts/markdown-files.mjs";
import { serializeMarkdownSave } from "./scripts/markdown-save-coordinator.mjs";
import { atomicReplaceMarkdown } from "./scripts/atomic-markdown-replace.mjs";
import { createMarkdownWatcher } from "./scripts/markdown-watcher.mjs";
import { resolveAssetFile } from "./scripts/asset-paths.mjs";
import { resolveThemeFile } from "./scripts/theme-paths.mjs";
import { resolveWorkspaceRoot } from "./scripts/workspace-root.mjs";
import { buildDeckSlides } from "./markdown-deck.mjs";
import {
  architectureValidationErrors,
  createMarkdStageHooks,
  deckValidationFeedback,
  readGuide,
} from "./markdstage-guide.mjs";
import { buildPresenterBrowserArgs } from "./presenter-window.mjs";
import {
  DEFAULT_THEME,
  mapThemeMetadataAssets,
  normalizeTheme,
  parseThemeMetadata,
  parseThemeVariables,
  resolveFrontMatterTheme,
  serializeThemeVariables,
  THEME_ASSET_MAX_BYTES,
  themeMetadataAssetPaths,
} from "./renderer/theme.mjs";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const PEN_LISTENER_SCRIPT = join(EXT_DIR, "windows", "pen-button-listener.ps1");
// Rehydrate state lives outside the committed extension source so reloads can
// restore the last slide without polluting (or depending on writability of)
// the extension folder.
const DATA_DIR = join(tmpdir(), "markdstage-canvas");
const DEFAULT_PDF_NAME = "markdstage.pdf";
const DEFAULT_CAPTURE_DIR = "markdstage-previews";
const MAX_CAPTURE_SLIDES = 10;
const PDF_RENDER_TIMEOUT_MS = 60_000;
const VENDOR_DIR = join(EXT_DIR, "vendor");
const VENDOR_MANIFEST = join(VENDOR_DIR, "vendor-assets.lock.json");
const THEME_METADATA_NAME = "theme.json";
const THEME_METADATA_MAX_BYTES = 64 * 1024;
const SOURCE_MODE_SNAPSHOT = "snapshot";
const SOURCE_MODE_LIVE = "live";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
};

function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] || "application/octet-stream";
}

function pdfNameForSource(sourceName) {
  const sourceBase = basename(typeof sourceName === "string" ? sourceName.trim() : "");
  const withoutExtension = sourceBase.replace(/\.(?:md|markdown)$/i, "");
  const safeBase = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  return `${safeBase || basename(DEFAULT_PDF_NAME, ".pdf")}.pdf`;
}

function normalizeSourceMode(value) {
  return value === SOURCE_MODE_LIVE ? SOURCE_MODE_LIVE : SOURCE_MODE_SNAPSHOT;
}

// key uniquely identifies one running panel for one session, avoiding
// collisions when the same instanceId ("MarkdStage") is reused elsewhere.
function keyOf(ctx) {
  return `${ctx.sessionId || "?"}::${ctx.instanceId}`;
}

function dataFileFor(key) {
  return join(DATA_DIR, key.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".json");
}

// instances: key -> { server, url, version, markdown, slides, index, clients:Set, dataFile }
const instances = new Map();
let activeInstanceKey = null;
let penListenerProcess = null;
let penListenerSupported = null;
let penListenerStopping = false;
// Serializes Surface Pen navigation so a burst of presses is applied in order.
let penActionQueue = Promise.resolve();

// Clamp an arbitrary index into [0, total-1] (or 0 when the deck is empty), so
// "next past the end" / "prev before the start" simply stay on the edge slide.
function clampIndex(value, total) {
  let i = Number(value);
  if (!Number.isFinite(i)) return 0;
  i = Math.trunc(i);
  if (total <= 0) return 0;
  if (i < 0) return 0;
  if (i >= total) return total - 1;
  return i;
}

// End every deck with a back cover (Closing logo slide), regardless of theme.
// Add it during deck registration so a missing AI-generated slide cannot break the deck.
const DEFAULT_BACKCOVER = ["---", "layout: backcover", "---", ""].join("\n");

// Lightweight parser for front-matter `layout:`. It recognizes only the same
// leading `---` through `---` form as the renderer's splitFrontMatter.
function readLayout(markdown) {
  if (typeof markdown !== "string") return "";
  const text = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^[\n \t\uFEFF]+/, "");
  if (!text.startsWith("---\n")) return "";
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") break;
    const idx = lines[i].indexOf(":");
    if (idx <= 0) continue;
    if (lines[i].slice(0, idx).trim().toLowerCase() !== "layout") continue;
    return lines[i]
      .slice(idx + 1)
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .toLowerCase();
  }
  return "";
}

// Append the back cover unless the deck already ends with one, so re-running
// load_deck (e.g. to switch themes) never stacks up duplicates.
function ensureBackCover(slides) {
  if (!slides.length) return slides;
  if (readLayout(slides[slides.length - 1]) === "backcover") return slides;
  return [...slides, DEFAULT_BACKCOVER];
}

function findExecutableOnPath(names) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  for (const name of names) {
    try {
      const output = execFileSync(locator, [name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      const candidate = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && existsSync(line));
      if (candidate) return candidate;
    } catch (_) {
      // Try the next browser name.
    }
  }
  return null;
}

function findChromiumBrowser() {
  const candidates = [];
  if (process.platform === "win32") {
    for (const base of [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ]) {
      if (!base) continue;
      candidates.push(
        join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
        join(base, "Google", "Chrome", "Application", "chrome.exe"),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }

  const direct = candidates.find((candidate) => existsSync(candidate));
  if (direct) return direct;
  return findExecutableOnPath([
    "msedge",
    "microsoft-edge",
    "microsoft-edge-stable",
    "google-chrome",
    "google-chrome-stable",
    "chrome",
    "chromium",
    "chromium-browser",
  ]);
}

function resolveWorkspaceOutputPath(
  inst,
  requestedPath,
  { defaultName, extension, label },
) {
  const workspaceRoot = resolve(inst.workspaceRoot);
  const requested =
    typeof requestedPath === "string" && requestedPath.trim()
      ? requestedPath.trim()
      : defaultName;
  if (requested.includes("\0")) {
    throw new CanvasError(
      "invalid_output_path",
      `${label} output path contains an invalid character.`,
    );
  }

  const outputPath = resolve(workspaceRoot, requested);
  const workspaceRelative = relative(workspaceRoot, outputPath);
  if (
    workspaceRelative === "" ||
    workspaceRelative === ".." ||
    workspaceRelative.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelative)
  ) {
    throw new CanvasError(
      "invalid_output_path",
      `${label} output path must be a file inside the current workspace.`,
    );
  }
  if (extname(outputPath).toLowerCase() !== extension) {
    throw new CanvasError(
      "invalid_output_path",
      `${label} output path must end with ${extension}.`,
    );
  }
  return outputPath;
}

function resolvePdfOutputPath(inst, requestedPath) {
  return resolveWorkspaceOutputPath(inst, requestedPath, {
    defaultName: DEFAULT_PDF_NAME,
    extension: ".pdf",
    label: "PDF",
  });
}

function captureDirectoryName(sourceName) {
  const sourceBase = basename(typeof sourceName === "string" ? sourceName.trim() : "");
  const withoutExtension = sourceBase.replace(/\.(?:md|markdown)$/i, "");
  const safeBase = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  return safeBase ? `${safeBase}-previews` : DEFAULT_CAPTURE_DIR;
}

function resolveCaptureOutputDirectory(inst, requestedPath) {
  const workspaceRoot = resolve(inst.workspaceRoot);
  const requested =
    typeof requestedPath === "string" && requestedPath.trim()
      ? requestedPath.trim()
      : captureDirectoryName(inst.sourceName);
  if (requested.includes("\0")) {
    throw new CanvasError(
      "invalid_output_path",
      "PNG output directory contains an invalid character.",
    );
  }
  const outputDirectory = resolve(workspaceRoot, requested);
  const workspaceRelative = relative(workspaceRoot, outputDirectory);
  if (
    workspaceRelative === ".." ||
    workspaceRelative.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelative)
  ) {
    throw new CanvasError(
      "invalid_output_path",
      "PNG output directory must be inside the current workspace.",
    );
  }
  return outputDirectory;
}

function getExportSlides(inst) {
  if (inst.slides.length) {
    const slides = [...inst.slides];
    if (inst.mode === "adhoc" && typeof inst.markdown === "string") {
      slides[clampIndex(inst.index, slides.length)] = inst.markdown;
    }
    return slides;
  }
  if (inst.mode === "adhoc" && typeof inst.markdown === "string") {
    return [inst.markdown];
  }
  return [];
}

function isPathInside(root, candidate) {
  const rootRelative = relative(root, candidate);
  return (
    rootRelative === "" ||
    (!rootRelative.startsWith(`..${sep}`) &&
      rootRelative !== ".." &&
      !isAbsolute(rootRelative))
  );
}

async function prepareWorkspaceDirectory(inst, outputParent, label) {
  const workspaceRoot = resolve(inst.workspaceRoot);
  const canonicalWorkspaceRoot = await realpath(workspaceRoot);
  const relativeParent = relative(workspaceRoot, outputParent);
  let current = workspaceRoot;

  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const canonicalCurrent = await realpath(current);
    if (!isPathInside(canonicalWorkspaceRoot, canonicalCurrent)) {
      throw new CanvasError(
        "invalid_output_path",
        `${label} output path must not traverse a link outside the current workspace.`,
      );
    }
    const info = await stat(current);
    if (!info.isDirectory()) {
      throw new CanvasError(
        "invalid_output_path",
        `${label} output parent must be a directory inside the current workspace.`,
      );
    }
  }

  return outputParent;
}

async function preparePdfOutputDirectory(inst, outputPath) {
  return prepareWorkspaceDirectory(inst, dirname(outputPath), "PDF");
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolvePromise) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolvePromise(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

function runTerminationCommand(executable, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const killer = spawn(executable, args, {
      windowsHide: true,
      stdio: "ignore",
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise();
    };
    const timer = setTimeout(() => {
      try {
        killer.kill();
      } catch (_) {
        // The termination helper may already have exited.
      }
      finish();
    }, timeoutMs);
    killer.once("error", finish);
    killer.once("exit", finish);
  });
}

async function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    const taskkill = join(systemRoot, "System32", "taskkill.exe");
    if (existsSync(taskkill)) {
      await runTerminationCommand(taskkill, ["/PID", String(child.pid), "/T", "/F"], 5_000);
    } else {
      try {
        child.kill();
      } catch (_) {
        // Fall through to the bounded exit wait.
      }
    }
    await waitForChildExit(child, 5_000);
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (_) {
    try {
      child.kill("SIGTERM");
    } catch (_) {
      // Fall through to the bounded exit wait.
    }
  }
  if (await waitForChildExit(child, 3_000)) return;

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (_) {
    try {
      child.kill("SIGKILL");
    } catch (_) {
      // The process may already have exited.
    }
  }
  await waitForChildExit(child, 2_000);
}

function isProcessRunning(child) {
  return !!child && child.exitCode === null && child.signalCode === null && !child.killed;
}

function isPresenterProfilePath(profileDir) {
  if (typeof profileDir !== "string" || !profileDir) return false;
  const candidate = resolve(profileDir);
  return (
    isPathInside(resolve(tmpdir()), candidate) &&
    basename(candidate).startsWith("markdstage-presenter-window-")
  );
}

async function removePresenterProfile(profileDir) {
  if (!profileDir) return;
  if (!isPresenterProfilePath(profileDir)) {
    throw new Error("Refusing to remove an invalid presenter profile path.");
  }
  await rm(profileDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}

async function cleanupPresenterProfile(inst, profileDir) {
  try {
    await removePresenterProfile(profileDir);
    if (inst.presenterProfileDir === profileDir) inst.presenterProfileDir = "";
    return true;
  } catch (error) {
    log(`MarkdStage: presenter profile cleanup failed: ${error?.message || error}`, "warning");
    return false;
  }
}

function waitForPresenterStartup(child, graceMs = 500) {
  return new Promise((resolvePromise, rejectPromise) => {
    let timer = null;
    let settled = false;
    const cleanup = () => {
      child.off("spawn", onSpawn);
      child.off("error", onError);
      child.off("close", onClose);
      if (timer) clearTimeout(timer);
    };
    const settle = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const onSpawn = () => {
      timer = setTimeout(() => settle(), graceMs);
    };
    const onError = (error) => settle(error);
    const onClose = (code, signal) => {
      settle(
        new Error(
          `Presenter browser exited during startup (${
            signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`
          }).`,
        ),
      );
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("close", onClose);
  });
}

async function stopPresenter(inst) {
  const pendingLaunch = inst.presenterLaunchPromise;
  if (pendingLaunch) {
    await pendingLaunch.catch(() => {});
  }

  const child = inst.presenterProcess;
  const profileDir = inst.presenterProfileDir;
  inst.presenterProcess = null;

  if (isProcessRunning(child)) {
    await terminateProcessTree(child);
  }
  if (profileDir) {
    await cleanupPresenterProfile(inst, profileDir);
  }
  await schedulePersist(inst);
  return !!child || !!profileDir;
}

async function launchPresenter(inst) {
  if (!getExportSlides(inst).length) {
    throw new CanvasError(
      "no_deck",
      "No slides are loaded. Load a deck before opening the presenter.",
    );
  }
  if (isProcessRunning(inst.presenterProcess)) {
    return {
      ok: true,
      started: false,
      alreadyRunning: true,
      pid: inst.presenterProcess.pid,
    };
  }
  if (inst.presenterLaunchPromise) return inst.presenterLaunchPromise;

  const launch = async () => {
    if (inst.presenterProcess || inst.presenterProfileDir) {
      await stopPresenter(inst);
    }

    const browser = findChromiumBrowser();
    if (!browser) {
      throw new CanvasError(
        "presenter_browser_not_found",
        "External presentation requires Microsoft Edge, Google Chrome, or Chromium.",
      );
    }

    const profileDir = await mkdtemp(join(tmpdir(), "markdstage-presenter-window-"));
    const presenterUrl = new URL(inst.url);
    presenterUrl.searchParams.set("present", "1");
    const child = spawn(
      browser,
      buildPresenterBrowserArgs({
        profileDir,
        presenterUrl: presenterUrl.href,
      }),
      {
        windowsHide: false,
        stdio: "ignore",
      },
    );

    inst.presenterProcess = child;
    inst.presenterProfileDir = profileDir;
    child.once("error", (error) => {
      log(`MarkdStage: external presenter failed: ${error?.message || error}`, "warning");
    });
    child.once("close", (code, signal) => {
      if (inst.presenterProcess === child) inst.presenterProcess = null;
      void cleanupPresenterProfile(inst, profileDir)
        .finally(() => schedulePersist(inst));
      if (code !== 0 && code !== null) {
        log(
          `MarkdStage: external presenter stopped (${
            signal ? `signal ${signal}` : `exit ${code}`
          })`,
          "warning",
        );
      }
    });

    try {
      await waitForPresenterStartup(child);
    } catch (error) {
      if (inst.presenterProcess === child) inst.presenterProcess = null;
      if (isProcessRunning(child)) await terminateProcessTree(child);
      await cleanupPresenterProfile(inst, profileDir);
      throw new CanvasError(
        "presenter_launch_failed",
        error?.message || "External presentation failed to start.",
      );
    }

    log(`MarkdStage: external presenter opened with ${basename(browser)}`);
    await schedulePersist(inst);
    return {
      ok: true,
      started: true,
      alreadyRunning: false,
      browser: basename(browser),
      pid: child.pid,
    };
  };

  inst.presenterLaunchPromise = launch();
  try {
    return await inst.presenterLaunchPromise;
  } finally {
    inst.presenterLaunchPromise = null;
  }
}

/**
 * Run a headless browser once with `--print-to-pdf`.
 *
 * ⚠️ **`pageUrl` must include `?print=1&token=...` (#12).**
 *
 * `--print-to-pdf` completes only when the page becomes idle. In renderer `init()`,
 * only print mode returns early. Normal and presenter views keep an unclosed SSE
 * (`new EventSource("./events")`) and a two-second `setInterval` running.
 * Passing a URL without `?print=1` therefore means **the browser never exits**.
 *
 * Observed results, using Chrome arguments byte-for-byte identical to this function:
 *
 * | URL                        | Result                                  |
 * | -------------------------- | --------------------------------------- |
 * | `/?print=1&token=<valid>`  | exit 0 @ 2.4s (valid PDF)               |
 * | `/?print=1&token=` (empty) | exit 0 @ 1.9s (blank; renderer reports failure) |
 * | `/` (normal view)          | **HANG** (still running after 120 seconds) |
 * | `/?present=1`              | **HANG**                                |
 * | `/nope-404` (no renderer)  | exit 0 @ 3.0s                           |
 *
 * ⚠️ **`--virtual-time-budget` is effectively ignored by `--headless=new`.**
 * The `--virtual-time-budget=12000` argument below does not stop this hang.
 * Adding `--timeout=8000` is also ineffective, as verified empirically.
 * The argument is harmless and remains in place, but **do not treat it as a
 * wall-clock timeout**. Only Node's `PDF_RENDER_TIMEOUT_MS` and
 * `terminateProcessTree` enforce a limit, and failure may take up to 60 seconds.
 */
async function runHeadlessBrowser(browser, args, failureLabel) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(browser, args, {
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let diagnostics = "";
    let settled = false;
    let timedOut = false;
    const appendDiagnostics = (chunk) => {
      diagnostics = `${diagnostics}${chunk.toString()}`.slice(-12_000);
    };
    child.stdout.on("data", appendDiagnostics);
    child.stderr.on("data", appendDiagnostics);

    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const timer = setTimeout(async () => {
      if (settled) return;
      timedOut = true;
      await terminateProcessTree(child);
      settle(new Error(`${failureLabel} timed out after ${PDF_RENDER_TIMEOUT_MS / 1000}s.`));
    }, PDF_RENDER_TIMEOUT_MS);

    child.once("error", (error) => {
      if (!timedOut) settle(error);
    });
    child.once("exit", (code, signal) => {
      if (timedOut) return;
      if (code === 0) {
        settle();
        return;
      }
      const detail = diagnostics.trim();
      settle(
        new Error(
          `${failureLabel} failed (${signal ? `signal ${signal}` : `exit ${code}`})${
            detail ? `: ${detail}` : "."
          }`,
        ),
      );
    });
  });
}

async function runPdfBrowser(browser, pageUrl, outputPath, profileDir) {
  // Enforce the contract at runtime. Otherwise it silently waits 60 seconds
  // before timing out, obscuring the cause; fail immediately with an explanation.
  if (new URL(pageUrl).searchParams.get("print") !== "1") {
    throw new Error(
      `Refusing to run --print-to-pdf against a non-print URL (${pageUrl}): only ?print=1 stops the renderer's SSE and polling loops, so any other page hangs the browser forever.`,
    );
  }
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--force-color-profile=srgb",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    "--run-all-compositor-stages-before-draw",
    // Ineffective (#12): --headless=new ignores it. See the JSDoc above.
    // The actual safeguards are PDF_RENDER_TIMEOUT_MS + terminateProcessTree.
    "--virtual-time-budget=12000",
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${outputPath}`,
    pageUrl,
  ];
  if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0) {
    args.unshift("--no-sandbox");
  }
  await runHeadlessBrowser(browser, args, "Browser PDF rendering");
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForDevToolsPort(profileDir, child, diagnostics) {
  const portFile = join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const [portLine] = (await readFile(portFile, "utf8")).split(/\r?\n/);
      const port = Number.parseInt(portLine, 10);
      if (Number.isInteger(port) && port > 0) return port;
    } catch (_) {
      // Chromium creates the file after its remote debugging endpoint is ready.
    }
    if (!isProcessRunning(child)) {
      throw new Error(
        `Headless browser exited before DevTools became ready${
          diagnostics.value.trim() ? `: ${diagnostics.value.trim()}` : "."
        }`,
      );
    }
    await delay(25);
  }
  throw new Error("Headless browser DevTools endpoint did not become ready within 10 seconds.");
}

async function findPageTarget(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        cache: "no-store",
      });
      if (response.ok) {
        const targets = await response.json();
        const page = Array.isArray(targets)
          ? targets.find(
              (target) =>
                target?.type === "page" && typeof target.webSocketDebuggerUrl === "string",
            )
          : null;
        if (page) return page;
      }
    } catch (_) {
      // Retry while Chromium publishes its first page target.
    }
    await delay(25);
  }
  throw new Error("Headless browser did not expose a page target within 10 seconds.");
}

async function connectCdp(webSocketUrl) {
  if (typeof WebSocket !== "function") {
    throw new Error("This runtime does not provide WebSocket support required for PNG capture.");
  }
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  const opened = new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener(
      "error",
      () => rejectPromise(new Error("Could not connect to the Chromium DevTools endpoint.")),
      { once: true },
    );
  });
  socket.addEventListener("message", (event) => {
    let text;
    if (typeof event.data === "string") text = event.data;
    else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString("utf8");
    else text = String(event.data);
    let message;
    try {
      message = JSON.parse(text);
    } catch (_) {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message || "Chromium DevTools command failed."));
    } else {
      request.resolve(message.result || {});
    }
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      request.reject(new Error("Chromium DevTools connection closed unexpectedly."));
    }
    pending.clear();
  });
  await opened;

  return {
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolvePromise, rejectPromise) => {
        pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      try {
        socket.close();
      } catch (_) {
        // Process cleanup below is authoritative.
      }
    },
  };
}

async function waitForOutputJob(job, child, diagnostics) {
  const deadline = Date.now() + PDF_RENDER_TIMEOUT_MS;
  while (job.status === "pending" && Date.now() < deadline) {
    if (!isProcessRunning(child)) {
      throw new Error(
        `Headless browser exited before rendering completed${
          diagnostics.value.trim() ? `: ${diagnostics.value.trim()}` : "."
        }`,
      );
    }
    await delay(25);
  }
  if (job.status === "pending") {
    throw new Error(
      `Browser rendering timed out after ${PDF_RENDER_TIMEOUT_MS / 1000}s${
        diagnostics.value.trim() ? `: ${diagnostics.value.trim()}` : "."
      }`,
    );
  }
  if (job.status !== "ready") {
    throw new Error(job.error || "The renderer reported a failure.");
  }
}

async function runCdpOutputBrowser(browser, pageUrl, profileDir, job, capturePng) {
  const diagnostics = { value: "" };
  await rm(join(profileDir, "DevToolsActivePort"), { force: true }).catch(() => {});
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--force-color-profile=srgb",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--no-first-run",
    "--run-all-compositor-stages-before-draw",
    "--remote-debugging-port=0",
    "--window-size=1280,720",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ];
  if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() === 0) {
    args.unshift("--no-sandbox");
  }
  const child = spawn(browser, args, {
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const appendDiagnostics = (chunk) => {
    diagnostics.value = `${diagnostics.value}${chunk.toString()}`.slice(-12_000);
  };
  child.stdout.on("data", appendDiagnostics);
  child.stderr.on("data", appendDiagnostics);

  let cdp = null;
  try {
    const port = await waitForDevToolsPort(profileDir, child, diagnostics);
    const target = await findPageTarget(port);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const navigation = await cdp.send("Page.navigate", { url: pageUrl });
    if (navigation.errorText) {
      throw new Error(`Chromium could not open the renderer: ${navigation.errorText}`);
    }
    await waitForOutputJob(job, child, diagnostics);
    if (!capturePng) return null;
    await cdp.send("Runtime.evaluate", {
      expression:
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    if (typeof screenshot.data !== "string" || screenshot.data.length === 0) {
      throw new Error("Chromium DevTools did not return PNG data.");
    }
    return Buffer.from(screenshot.data, "base64");
  } finally {
    cdp?.close();
    if (isProcessRunning(child)) await terminateProcessTree(child);
  }
}

async function verifyPdf(outputPath) {
  const info = await stat(outputPath);
  if (!info.isFile() || info.size < 5) {
    throw new Error("The browser did not create a valid PDF file.");
  }
  const handle = await open(outputPath, "r");
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || header.toString("ascii") !== "%PDF-") {
      throw new Error("The generated file does not have a PDF header.");
    }
  } finally {
    await handle.close();
  }
  return info.size;
}

async function verifyPng(outputPath) {
  const info = await stat(outputPath);
  if (!info.isFile() || info.size < 24) {
    throw new Error("The browser did not create a valid PNG file.");
  }
  const handle = await open(outputPath, "r");
  try {
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytesRead !== header.length || !header.subarray(0, 8).equals(signature)) {
      throw new Error("The generated file does not have a PNG header.");
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (width !== 1280 || height !== 720) {
      throw new Error(`The generated PNG is ${width}x${height}; expected 1280x720.`);
    }
    return { bytes: info.size, width, height };
  } finally {
    await handle.close();
  }
}

function createOutputSnapshot(inst, requestedTheme) {
  const theme = requestedTheme === undefined ? inst.theme : normalizeTheme(requestedTheme);
  return {
    slides: ensureBackCover(getExportSlides(inst)),
    theme,
    themeLocked: inst.themeLocked,
    customThemeCss: inst.customThemeCss,
    customThemeMeta: inst.customThemeMeta,
  };
}

function createOutputJob(snapshot, kind) {
  return {
    slides: snapshot.slides,
    theme: snapshot.theme,
    themeLocked: snapshot.themeLocked,
    customThemeCss: snapshot.customThemeCss,
    customThemeMeta: snapshot.customThemeMeta,
    kind,
    status: "pending",
    error: "",
    layout: null,
  };
}

async function runLayoutInspectionJob(inst, snapshot, browser) {
  const token = randomUUID();
  const profileDir = await mkdtemp(join(tmpdir(), "markdstage-inspect-"));
  const job = createOutputJob(snapshot, "inspect");
  inst.exportJobs.set(token, job);
  try {
    const pageUrl = `${inst.url}?print=1&token=${encodeURIComponent(token)}`;
    await runCdpOutputBrowser(browser, pageUrl, profileDir, job, false);
    if (!job.layout || !Array.isArray(job.layout.slides)) {
      throw new Error("The layout renderer did not return diagnostics.");
    }
    return job.layout;
  } finally {
    inst.exportJobs.delete(token);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

function selectLayoutResults(layout, requestedIndex, includeFits) {
  const selected =
    requestedIndex === undefined
      ? layout.slides
      : layout.slides.filter((slide) => slide.index === requestedIndex);
  const issueCount = selected.filter((slide) => slide.pdfClipped).length;
  return {
    ok: true,
    scope: requestedIndex === undefined ? "deck" : "slide",
    ...(requestedIndex === undefined
      ? {}
      : { index: requestedIndex, page: requestedIndex + 1 }),
    width: layout.width,
    height: layout.height,
    total: layout.total,
    inspected: selected.length,
    issueCount,
    hasIssues: issueCount > 0,
    slides: includeFits ? selected : selected.filter((slide) => slide.pdfClipped),
  };
}

async function inspectLayout(inst, requestedIndex, includeFits = false) {
  if (inst.exporting) {
    throw new CanvasError(
      "output_in_progress",
      "Another PDF, layout inspection, or PNG output job is already running for this canvas.",
    );
  }
  const snapshot = createOutputSnapshot(inst);
  if (!snapshot.slides.length) {
    throw new CanvasError("no_deck", "No slides are loaded. Load a deck before inspecting layout.");
  }
  if (
    requestedIndex !== undefined &&
    (!Number.isInteger(requestedIndex) ||
      requestedIndex < 0 ||
      requestedIndex >= snapshot.slides.length)
  ) {
    throw new CanvasError(
      "slide_out_of_range",
      `Slide index must be between 0 and ${snapshot.slides.length - 1}.`,
    );
  }
  const browser = findChromiumBrowser();
  if (!browser) {
    throw new CanvasError(
      "layout_browser_not_found",
      "Layout inspection requires Microsoft Edge, Google Chrome, or Chromium.",
    );
  }

  inst.exporting = true;
  try {
    const layout = await runLayoutInspectionJob(inst, snapshot, browser);
    return selectLayoutResults(layout, requestedIndex, Boolean(includeFits));
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    throw new CanvasError(
      "layout_inspection_failed",
      error?.message || "Layout inspection failed.",
    );
  } finally {
    inst.exporting = false;
  }
}

function normalizeCaptureIndexes(requestedIndexes, total) {
  if (!Array.isArray(requestedIndexes) || requestedIndexes.length === 0) {
    throw new CanvasError(
      "invalid_input",
      "indexes must be a non-empty array when provided.",
    );
  }
  const indexes = [...new Set(requestedIndexes)];
  if (
    indexes.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= total,
    )
  ) {
    throw new CanvasError(
      "slide_out_of_range",
      `Every slide index must be an integer between 0 and ${total - 1}.`,
    );
  }
  if (indexes.length > MAX_CAPTURE_SLIDES) {
    throw new CanvasError(
      "too_many_slides",
      `At most ${MAX_CAPTURE_SLIDES} slides can be captured at once.`,
    );
  }
  return indexes.sort((a, b) => a - b);
}

async function captureSlides(
  inst,
  requestedIndexes,
  requestedDirectory,
  requestedTheme,
) {
  if (inst.exporting) {
    throw new CanvasError(
      "output_in_progress",
      "Another PDF, layout inspection, or PNG output job is already running for this canvas.",
    );
  }
  const snapshot = createOutputSnapshot(inst, requestedTheme);
  if (!snapshot.slides.length) {
    throw new CanvasError("no_deck", "No slides are loaded. Load a deck before capturing PNGs.");
  }
  const browser = findChromiumBrowser();
  if (!browser) {
    throw new CanvasError(
      "png_browser_not_found",
      "PNG capture requires Microsoft Edge, Google Chrome, or Chromium.",
    );
  }
  inst.exporting = true;
  const pendingFiles = [];
  try {
    let inspection = null;
    let indexes;
    if (requestedIndexes === undefined) {
      const layout = await runLayoutInspectionJob(inst, snapshot, browser);
      inspection = selectLayoutResults(layout, undefined, false);
      indexes = layout.slides
        .filter((slide) => slide.pdfClipped)
        .map((slide) => slide.index)
        .slice(0, MAX_CAPTURE_SLIDES);
      if (indexes.length === 0) {
        return {
          ok: true,
          total: snapshot.slides.length,
          captured: 0,
          issueCount: 0,
          message: "The PDF layout fits; no PNG capture is needed.",
          files: [],
        };
      }
    } else {
      indexes = normalizeCaptureIndexes(requestedIndexes, snapshot.slides.length);
    }

    const outputDirectory = resolveCaptureOutputDirectory(inst, requestedDirectory);
    await prepareWorkspaceDirectory(inst, outputDirectory, "PNG");
    const pageDigits = Math.max(3, String(snapshot.slides.length).length);
    const files = [];

    for (const index of indexes) {
      const token = randomUUID();
      const pageNumber = String(index + 1).padStart(pageDigits, "0");
      const outputPath = join(outputDirectory, `slide-${pageNumber}.png`);
      const temporaryPath = join(outputDirectory, `.slide-${pageNumber}.${token}.tmp.png`);
      const job = createOutputJob(snapshot, "capture");
      const pageProfileDir = await mkdtemp(join(tmpdir(), "markdstage-capture-"));
      inst.exportJobs.set(token, job);
      let staged = false;
      try {
        const pageUrl = `${inst.url}?capture=1&token=${encodeURIComponent(
          token,
        )}&index=${index}`;
        const png = await runCdpOutputBrowser(browser, pageUrl, pageProfileDir, job, true);
        if (!job.layout || !Array.isArray(job.layout.slides)) {
          throw new Error("The PNG renderer did not return layout diagnostics.");
        }
        await writeFile(temporaryPath, png);
        const image = await verifyPng(temporaryPath);
        const diagnostic = job.layout.slides[0];
        pendingFiles.push({ temporaryPath, outputPath });
        staged = true;
        files.push({
          index,
          page: index + 1,
          path: outputPath,
          ...image,
          layout: diagnostic,
        });
      } finally {
        inst.exportJobs.delete(token);
        if (!staged) await rm(temporaryPath, { force: true }).catch(() => {});
        await rm(pageProfileDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    for (const file of pendingFiles) {
      await rm(file.outputPath, { force: true }).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
      await rename(file.temporaryPath, file.outputPath);
      file.temporaryPath = "";
    }

    return {
      ok: true,
      directory: outputDirectory,
      total: snapshot.slides.length,
      captured: files.length,
      issueCount:
        inspection?.issueCount ?? files.filter((file) => file.layout?.pdfClipped).length,
      theme: snapshot.theme,
      files,
    };
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    throw new CanvasError("png_capture_failed", error?.message || "PNG capture failed.");
  } finally {
    inst.exporting = false;
    for (const file of pendingFiles) {
      if (file.temporaryPath) {
        await rm(file.temporaryPath, { force: true }).catch(() => {});
      }
    }
  }
}

async function exportPdf(inst, requestedPath, requestedTheme) {
  if (inst.exporting) {
    throw new CanvasError(
      "export_in_progress",
      "Another PDF, layout inspection, or PNG output job is already running for this canvas.",
    );
  }
  inst.exporting = true;
  let token = "";
  let profileDir = "";
  let temporaryOutputPath = "";

  try {
    const snapshot = createOutputSnapshot(inst, requestedTheme);
    if (!snapshot.slides.length) {
      throw new CanvasError("no_deck", "No slides are loaded. Load a deck before exporting PDF.");
    }

    const browser = findChromiumBrowser();
    if (!browser) {
      throw new CanvasError(
        "pdf_browser_not_found",
        "PDF export requires Microsoft Edge, Google Chrome, or Chromium.",
      );
    }

    const outputPath = resolvePdfOutputPath(inst, requestedPath);
    const outputParent = await preparePdfOutputDirectory(inst, outputPath);
    token = randomUUID();
    profileDir = await mkdtemp(join(tmpdir(), "markdstage-pdf-"));
    const outputBase = basename(outputPath, extname(outputPath)) || "markdstage";
    temporaryOutputPath = join(outputParent, `.${outputBase}.${token}.tmp.pdf`);
    inst.exportJobs.set(token, createOutputJob(snapshot, "pdf"));

    const pageUrl = `${inst.url}?print=1&token=${encodeURIComponent(token)}`;
    await runPdfBrowser(browser, pageUrl, temporaryOutputPath, profileDir);
    const exportJob = inst.exportJobs.get(token);
    if (exportJob?.status !== "ready") {
      throw new Error(
        exportJob?.error || "The print renderer did not finish before the browser exited.",
      );
    }
    const bytes = await verifyPdf(temporaryOutputPath);
    await rename(temporaryOutputPath, outputPath);
    temporaryOutputPath = "";
    log(`MarkdStage: exported ${snapshot.slides.length} slides to ${outputPath}`);
    return {
      ok: true,
      path: outputPath,
      total: snapshot.slides.length,
      theme: snapshot.theme,
      bytes,
    };
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    throw new CanvasError("pdf_export_failed", error?.message || "PDF export failed.");
  } finally {
    if (token) {
      inst.exportJobs.delete(token);
    }
    if (temporaryOutputPath) {
      await rm(temporaryOutputPath, { force: true }).catch(() => {});
    }
    inst.exporting = false;
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

let logger = null;
function log(message, level = "info") {
  try {
    logger?.(message, { level });
  } catch (_) {
    /* never let logging throw */
  }
}

function activateInstance(inst) {
  activeInstanceKey = inst?.key || null;
}

function getActiveInstance() {
  if (activeInstanceKey) {
    const active = instances.get(activeInstanceKey);
    if (active) return active;
  }
  const fallback = [...instances.values()].at(-1) || null;
  activeInstanceKey = fallback?.key || null;
  return fallback;
}

function queuePenAction(label, run) {
  penActionQueue = penActionQueue
    .then(async () => {
      const inst = getActiveInstance();
      if (!inst) return;
      await run(inst);
    })
    .catch((e) => {
      log(`MarkdStage: Surface Pen ${label} failed: ${e?.message || e}`, "warning");
    });
}

function queuePenNavigation(delta) {
  queuePenAction("navigation", async (inst) => {
    if (!inst.slides.length) return;
    await applyNavigation(inst, inst.index + delta);
  });
}

function handlePenListenerMessage(child, line) {
  if (penListenerProcess !== child || !line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (_) {
    log(`MarkdStage: ignored invalid Surface Pen listener output: ${line}`, "warning");
    return;
  }

  if (message.type === "navigate") {
    if (message.action === "next") {
      queuePenNavigation(1);
    } else if (message.action === "previous") {
      queuePenNavigation(-1);
    } else {
      log(
        `MarkdStage: ignored unknown Surface Pen action: ${message.action}`,
        "warning",
      );
    }
    return;
  }

  if (message.type === "status" && typeof message.supported === "boolean") {
    if (penListenerSupported !== message.supported) {
      penListenerSupported = message.supported;
      log(
        message.supported
          ? "MarkdStage: Surface Pen tail-button controls are ready"
          : "MarkdStage: Surface Pen tail-button listener is unavailable; canvas controls remain enabled",
      );
    }
    return;
  }

  if (message.type === "error") {
    log(
      `MarkdStage: Surface Pen listener error: ${message.message || "unknown error"}`,
      "warning",
    );
  }
}

function startPenListener() {
  if (process.platform !== "win32" || penListenerProcess || instances.size === 0) return;

  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const powershell = join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  if (!existsSync(powershell) || !existsSync(PEN_LISTENER_SCRIPT)) {
    log(
      "MarkdStage: Surface Pen listener could not start because Windows PowerShell or its helper script is missing",
      "warning",
    );
    return;
  }

  penListenerStopping = false;
  const child = spawn(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      PEN_LISTENER_SCRIPT,
      "-ParentProcessId",
      String(process.pid),
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  penListenerProcess = child;
  penListenerSupported = null;

  const stdout = createInterface({ input: child.stdout });
  stdout.on("line", (line) => handlePenListenerMessage(child, line));

  const stderr = createInterface({ input: child.stderr });
  stderr.on("line", (line) => {
    if (penListenerProcess === child && line.trim()) {
      log(`MarkdStage: Surface Pen listener: ${line}`, "warning");
    }
  });

  child.once("error", (e) => {
    if (penListenerProcess === child) {
      log(`MarkdStage: Surface Pen listener failed to start: ${e?.message || e}`, "warning");
    }
  });
  child.once("close", (code, signal) => {
    if (penListenerProcess !== child) return;
    penListenerProcess = null;
    penListenerSupported = null;
    if (!penListenerStopping && instances.size > 0) {
      const reason = signal || (code ?? "unknown");
      log(
        `MarkdStage: Surface Pen listener stopped unexpectedly (${reason})`,
        "warning",
      );
    }
  });
}

function stopPenListener() {
  penListenerStopping = true;
  const child = penListenerProcess;
  penListenerProcess = null;
  penListenerSupported = null;
  if (child && child.exitCode === null && !child.killed) {
    try {
      child.kill();
    } catch (e) {
      log(`MarkdStage: Surface Pen listener cleanup failed: ${e?.message || e}`, "warning");
    }
  }
}

// Markdown import safeguards for the canvas 📂 button live in
// scripts/markdown-files.mjs so the test harness can use the same implementation.

// Join `rel` onto `rootDir` and guarantee the result stays under rootDir
// (defends /assets and static routes against path traversal).
function safeJoin(rootDir, rel) {
  const cleaned = rel.replace(/^[/\\]+/, "");
  const abs = normalize(join(rootDir, cleaned));
  const root = resolve(rootDir);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

async function sendFile(res, absPath, { cache } = {}) {
  try {
    const buf = await readFile(absPath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(absPath));
    res.setHeader(
      "Cache-Control",
      cache ? "public, max-age=31536000, immutable" : "no-store",
    );
    res.end(buf);
  } catch (_) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  }
}

async function sendChunkedVendorAsset(res, assetName) {
  try {
    const buffer = await reconstructAsset(VENDOR_DIR, assetName, VENDOR_MANIFEST);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeFor(assetName));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(buffer);
  } catch (error) {
    log(`MarkdStage: vendor asset integrity failure for ${assetName}: ${error.message}`, "error");
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Vendor asset integrity failure");
  }
}

function handleSse(req, res, inst) {
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
      /* dropped client cleaned up on close */
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
    inst.clients.delete(res);
  });
}

function broadcast(inst) {
  const msg = `data: ${inst.version}\n\n`;
  for (const res of [...inst.clients]) {
    try {
      res.write(msg);
    } catch (_) {
      inst.clients.delete(res);
    }
  }
}

async function persistNow(inst) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
      inst.dataFile,
      JSON.stringify({
        version: inst.version,
        deckVersion: inst.deckVersion,
        markdown: inst.markdown,
        slides: inst.slides,
        index: inst.index,
        theme: inst.theme,
        themeLocked: inst.themeLocked,
        customThemeFile: inst.customThemeFile,
        customThemeCss: inst.customThemeCss,
        customThemeDir: inst.customThemeDir,
        customThemeMeta: inst.customThemeMeta,
        customThemeAssets: [...inst.customThemeAssets],
        sourceName: inst.sourceName,
        sourceWriteback: inst.sourceWriteback,
        sourceWritebackPath: inst.sourceWritebackPath,
        sourceWritebackSnapshot: inst.sourceWritebackSnapshot,
        sourceMode: inst.sourceMode,
        mode: inst.mode,
        presenterProfileDir: inst.presenterProfileDir,
      }),
      "utf8",
    );
  } catch (e) {
    log(`MarkdStage: persist failed: ${e?.message || e}`, "warning");
  }
}

// Coalesced, serialized persistence. Rapid navigation can fire many state
// changes; rather than awaiting each write (and risking an older write landing
// after a newer one), we mark the instance dirty and run a single writer loop
// that always flushes the *latest* snapshot. Routine callers can fire-and-forget;
// lifecycle cleanup may await the returned promise before shutting down.
function schedulePersist(inst) {
  inst._persistDirty = true;
  if (inst._persisting) return inst._persistPromise;
  inst._persisting = true;
  inst._persistPromise = (async () => {
    try {
      while (inst._persistDirty) {
        inst._persistDirty = false;
        await persistNow(inst);
      }
    } finally {
      inst._persisting = false;
      inst._persistPromise = null;
    }
  })();
  return inst._persistPromise;
}

// Push the slide at inst.index (from the loaded deck) to the canvas: update the
// current markdown, mark the deck as the active source, bump the monotonic
// version, nudge connected clients, and persist so a reload can restore the
// whole deck and position.
async function applyDeckSlide(inst) {
  inst.markdown = inst.slides.length ? inst.slides[inst.index] : "";
  inst.mode = "deck";
  inst.version += 1;
  broadcast(inst);
  schedulePersist(inst);
}

// Replace the whole deck (slides + start position + theme) and show the target
// slide. Shared by the `load_deck` action and the `open` handler so both paths
// populate instance state identically. Callers must validate `slides` (a
// non-empty array of strings) before calling.
async function loadCustomTheme(inst, sourceName, themeFile) {
  if (!themeFile) {
    throw new CanvasError("invalid_theme_file", "custom theme requires themeFile or front matter theme-file.");
  }
  let path;
  try {
    path = await resolveThemeFile(inst.workspaceRoot, sourceName, themeFile);
  } catch (error) {
    throw new CanvasError("invalid_theme_file", error.message);
  }
  if (!path) {
    throw new CanvasError("theme_file_not_found", `Could not read custom theme file: ${themeFile}`);
  }
  let realThemeFile;
  let realWorkspaceRoot;
  try {
    [realThemeFile, realWorkspaceRoot] = await Promise.all([
      realpath(path),
      realpath(inst.workspaceRoot),
    ]);
  } catch (_) {
    throw new CanvasError("theme_file_not_found", `Could not read custom theme file: ${themeFile}`);
  }
  if (!isPathInside(realWorkspaceRoot, realThemeFile)) {
    throw new CanvasError("invalid_theme_file", "Custom theme files must stay inside the workspace.");
  }
  let css;
  try {
    css = await readFile(realThemeFile, "utf8");
  } catch (error) {
    throw new CanvasError("theme_file_not_found", `Could not read custom theme file: ${themeFile}`);
  }
  if (Buffer.byteLength(css, "utf8") > 64 * 1024) {
    throw new CanvasError("invalid_theme_file", "Custom theme CSS must be 64 KiB or smaller.");
  }
  try {
    const themeDir = dirname(path);
    const realThemeDir = await realpath(themeDir);
    if (!isPathInside(realWorkspaceRoot, realThemeDir)) {
      throw new Error("Custom theme metadata must stay inside the workspace.");
    }
    const metadataPath = join(themeDir, THEME_METADATA_NAME);
    let metadata = null;
    if (existsSync(metadataPath)) {
      const realMetadataPath = await realpath(metadataPath);
      if (!isPathInside(realThemeDir, realMetadataPath)) {
        throw new Error("Custom theme metadata must stay inside the theme folder.");
      }
      const metadataText = await readFile(realMetadataPath, "utf8");
      if (Buffer.byteLength(metadataText, "utf8") > THEME_METADATA_MAX_BYTES) {
        throw new Error("Custom theme metadata must be 64 KiB or smaller.");
      }
      metadata = parseThemeMetadata(metadataText);
      for (const assetPath of themeMetadataAssetPaths(metadata)) {
        const candidate = safeJoin(themeDir, assetPath);
        if (!candidate) throw new Error(`Invalid custom theme asset path: ${assetPath}`);
        let realAsset;
        try {
          realAsset = await realpath(candidate);
        } catch (_) {
          throw new Error(`Custom theme asset was not found: ${assetPath}`);
        }
        if (!isPathInside(realThemeDir, realAsset)) {
          throw new Error(`Custom theme asset must stay inside the theme folder: ${assetPath}`);
        }
        const info = await stat(realAsset);
        if (!info.isFile()) throw new Error(`Custom theme asset is not a file: ${assetPath}`);
        if (info.size > THEME_ASSET_MAX_BYTES) {
          throw new Error(`Custom theme asset must be 2 MiB or smaller: ${assetPath}`);
        }
      }
    }
    const assets = metadata ? themeMetadataAssetPaths(metadata) : [];
    return {
      file: relative(inst.workspaceRoot, path),
      css: serializeThemeVariables(parseThemeVariables(css)),
      dir: relative(inst.workspaceRoot, themeDir),
      metadata: metadata
        ? mapThemeMetadataAssets(metadata, (assetPath) => `/theme-assets/${assetPath}`)
        : null,
      assets,
    };
  } catch (error) {
    throw new CanvasError("invalid_theme_file", error.message);
  }
}

function resolveDeckTheme({ slides, explicitTheme, explicitThemeFile }) {
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

async function applyDeckNow(
  inst,
  {
    slides,
    index,
    theme,
    themeFile,
    sourceName,
    sourceWriteback = false,
    sourceWritebackPath = "",
    sourceWritebackSnapshot = "",
    sourceMode = SOURCE_MODE_SNAPSHOT,
    preserveSourceWatcher = false,
    preserveCurrentIndex = false,
  },
) {
  let nextSourceName = inst.sourceName;
  if (typeof sourceName === "string" && sourceName.trim()) {
    const requested = sourceName.trim();
    const candidate = resolve(inst.workspaceRoot, requested);
    if (!isPathInside(resolve(inst.workspaceRoot), candidate)) {
      throw new CanvasError("invalid_source_name", "sourceName must stay inside the workspace.");
    }
    nextSourceName = relative(inst.workspaceRoot, candidate);
  }
  const selection = resolveDeckTheme({
    slides,
    explicitTheme: theme,
    explicitThemeFile: themeFile,
  });
  const custom = selection.theme === "custom"
    ? await loadCustomTheme(inst, nextSourceName, selection.themeFile)
    : { file: "", css: "", dir: "", metadata: null, assets: [] };
  if (!preserveSourceWatcher) stopSourceWatcher(inst);
  inst.sourceName = nextSourceName;
  inst.theme = selection.theme;
  inst.themeLocked = selection.themeLocked;
  inst.customThemeFile = custom.file;
  inst.customThemeCss = custom.css;
  inst.customThemeDir = custom.dir;
  inst.customThemeMeta = custom.metadata;
  inst.customThemeAssets = new Set(custom.assets);
  inst.sourceWriteback = Boolean(
    sourceWriteback &&
      inst.sourceName &&
      sourceWritebackPath &&
      typeof sourceWritebackSnapshot === "string",
  );
  inst.sourceWritebackPath = inst.sourceWriteback ? sourceWritebackPath : "";
  inst.sourceWritebackSnapshot = inst.sourceWriteback ? sourceWritebackSnapshot : "";
  inst.sourceMode = inst.sourceWriteback
    ? normalizeSourceMode(sourceMode)
    : SOURCE_MODE_SNAPSHOT;
  if (!preserveSourceWatcher) {
    inst.sourceWatchStatus = "inactive";
    inst.sourceWatchError = "";
  }
  inst.slides = ensureBackCover(slides.slice());
  inst.index = clampIndex(preserveCurrentIndex ? inst.index : index ?? 0, inst.slides.length);
  inst.deckVersion += 1;
  await applyDeckSlide(inst);
}

async function applyDeck(inst, options) {
  return serializeArchitectureEdit(inst, async () => {
    await applyDeckNow(inst, options);
    if (inst.sourceMode === SOURCE_MODE_LIVE) {
      const token = startSourceWatcher(inst);
      if (token !== null) await refreshImportedSourceNow(inst, token);
    }
  });
}

// Move to targetIndex within the loaded deck. Returns whether the visible slide
// actually changed: navigating "past" an edge while already on a deck slide is
// a no-op (no version bump / re-render / disk write), but re-selecting the same
// index while in ad-hoc mode does re-render (it resumes the deck).
async function applyNavigation(inst, targetIndex) {
  const next = clampIndex(targetIndex, inst.slides.length);
  if (next === inst.index && inst.mode === "deck") return false;
  inst.index = next;
  await applyDeckSlide(inst);
  return true;
}

// A slide may contain multiple Architecture DSL diagrams, and each diagram is JSON,
// so the /navigate 4 KB limit is insufficient. Use a separate per-diagram limit.
const MAX_EDIT_BODY = 256 * 1024;

function serializeArchitectureEdit(inst, operation) {
  const previous = inst._architectureEditQueue ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  inst._architectureEditQueue = current;
  return current.finally(() => {
    if (inst._architectureEditQueue === current) inst._architectureEditQueue = null;
  });
}

async function resolveImportedSourceTarget(canonicalRoot, candidate) {
  const canonicalSource = await realpath(candidate);
  if (
    !isPathInside(canonicalRoot, canonicalSource) ||
    resolve(canonicalSource) !== resolve(candidate)
  ) {
    const error = new Error("source_file_unavailable");
    error.code = "SOURCE_FILE_UNAVAILABLE";
    throw error;
  }
  const info = await stat(canonicalSource);
  if (!info.isFile()) {
    const error = new Error("source_file_not_found");
    error.code = "SOURCE_FILE_NOT_FOUND";
    throw error;
  }
  if (info.size > MARKDOWN_MAX_BYTES) {
    const error = new Error("source_file_too_large");
    error.code = "SOURCE_FILE_TOO_LARGE";
    throw error;
  }
  return { path: canonicalSource, mode: info.mode };
}

function importedSourceError(error) {
  if (error?.code === "SOURCE_FILE_TOO_LARGE") {
    return { status: 413, body: { ok: false, error: "source_file_too_large" } };
  }
  if (error?.code === "SOURCE_FILE_UNAVAILABLE") {
    return { status: 409, body: { ok: false, error: "source_file_unavailable" } };
  }
  return { status: 404, body: { ok: false, error: "source_file_not_found" } };
}

function sourceWatchError(error) {
  if (error?.code === "SOURCE_FILE_TOO_LARGE") return "source_file_too_large";
  if (error?.code === "SOURCE_FILE_UNAVAILABLE") return "source_file_unavailable";
  if (error?.code === "EMPTY_MARKDOWN") return "empty_markdown";
  if (error?.code === "WATCH_FAILED") return "watch_failed";
  if (error?.code === "ENOENT") return "source_file_not_found";
  return "source_reload_failed";
}

function setSourceWatchState(inst, status, error = "") {
  const changed =
    inst.sourceWatchStatus !== status ||
    inst.sourceWatchError !== error;
  inst.sourceWatchStatus = status;
  inst.sourceWatchError = error;
  if (changed) broadcast(inst);
}

function stopSourceWatcher(inst) {
  inst.sourceWatcherToken += 1;
  if (!inst.sourceWatcher) return;
  try {
    inst.sourceWatcher.close();
  } catch (_) {
    /* already closed */
  }
  inst.sourceWatcher = null;
}

async function readImportedSource(inst) {
  const canonicalRoot = await realpath(resolve(inst.workspaceRoot));
  const candidate = inst.sourceWritebackPath
    ? safeJoin(canonicalRoot, inst.sourceWritebackPath)
    : null;
  if (!candidate || !isPathInside(canonicalRoot, candidate) || !isMarkdownPath(candidate)) {
    const error = new Error("source_file_unavailable");
    error.code = "SOURCE_FILE_UNAVAILABLE";
    throw error;
  }
  const target = await resolveImportedSourceTarget(canonicalRoot, candidate);
  const markdown = await readFile(target.path, "utf8");
  const slides = buildDeckSlides(markdown);
  if (!slides.length) {
    const error = new Error("empty_markdown");
    error.code = "EMPTY_MARKDOWN";
    throw error;
  }
  return { markdown, slides };
}

async function refreshImportedSourceNow(inst, token) {
  if (
    token !== inst.sourceWatcherToken ||
    inst.sourceMode !== SOURCE_MODE_LIVE ||
    !inst.sourceWriteback
  ) {
    return false;
  }
  try {
    const { markdown, slides } = await readImportedSource(inst);
    if (
      token !== inst.sourceWatcherToken ||
      inst.sourceMode !== SOURCE_MODE_LIVE ||
      !inst.sourceWriteback
    ) {
      return false;
    }
    if (markdown !== inst.sourceWritebackSnapshot) {
      await applyDeckNow(inst, {
        slides,
        index: inst.index,
        sourceName: inst.sourceName,
        sourceWriteback: true,
        sourceWritebackPath: inst.sourceWritebackPath,
        sourceWritebackSnapshot: markdown,
        sourceMode: SOURCE_MODE_LIVE,
        preserveSourceWatcher: true,
        preserveCurrentIndex: true,
      });
    }
    if (
      token !== inst.sourceWatcherToken ||
      inst.sourceMode !== SOURCE_MODE_LIVE ||
      !inst.sourceWatcher
    ) {
      return false;
    }
    setSourceWatchState(inst, "watching");
    return true;
  } catch (error) {
    if (token === inst.sourceWatcherToken && inst.sourceMode === SOURCE_MODE_LIVE) {
      setSourceWatchState(inst, "error", sourceWatchError(error));
    }
    return false;
  }
}

function startSourceWatcher(inst) {
  stopSourceWatcher(inst);
  if (!inst.sourceWriteback || inst.sourceMode !== SOURCE_MODE_LIVE) return null;
  const sourcePath = safeJoin(resolve(inst.workspaceRoot), inst.sourceWritebackPath);
  if (!sourcePath) {
    setSourceWatchState(inst, "error", "source_file_unavailable");
    return null;
  }
  const token = inst.sourceWatcherToken;
  try {
    inst.sourceWatcher = createMarkdownWatcher({
      path: sourcePath,
      onChange: () =>
        serializeArchitectureEdit(inst, () => refreshImportedSourceNow(inst, token)),
      onError: () => {
        if (token !== inst.sourceWatcherToken || inst.sourceMode !== SOURCE_MODE_LIVE) return;
        stopSourceWatcher(inst);
        setSourceWatchState(inst, "error", "watch_failed");
      },
    });
    setSourceWatchState(inst, "watching");
    return token;
  } catch (error) {
    const wrapped = new Error(error?.message || "watch_failed");
    wrapped.code = "WATCH_FAILED";
    setSourceWatchState(inst, "error", sourceWatchError(wrapped));
    return null;
  }
}

async function setSourceMode(inst, mode, { reload = true } = {}) {
  const next = normalizeSourceMode(mode);
  return serializeArchitectureEdit(inst, async () => {
    if (!inst.sourceWriteback) {
      return { ok: false, error: "source_not_available" };
    }
    if (next === SOURCE_MODE_SNAPSHOT) {
      stopSourceWatcher(inst);
      inst.sourceMode = SOURCE_MODE_SNAPSHOT;
      setSourceWatchState(inst, "inactive");
      schedulePersist(inst);
      return { ok: true, changed: true };
    }

    inst.sourceMode = SOURCE_MODE_LIVE;
    schedulePersist(inst);
    const token = startSourceWatcher(inst);
    if (reload && token !== null) await refreshImportedSourceNow(inst, token);
    return {
      ok: true,
      changed: true,
      status: inst.sourceWatchStatus,
      error: inst.sourceWatchError,
    };
  });
}

async function applyArchitectureEdit(inst, { index, block, source, deckVersion }) {
  return serializeArchitectureEdit(inst, async () => {
    if (deckVersion !== inst.deckVersion) {
      return { status: 409, body: { ok: false, error: "deck_changed" } };
    }
    const next = replaceArchitectureBlock(inst.slides[index], block, source);
    if (next === null) return { status: 404, body: { ok: false, error: "block_not_found" } };

    if (inst.sourceWriteback) {
      let canonicalRoot;
      try {
        canonicalRoot = await realpath(resolve(inst.workspaceRoot));
      } catch (_) {
        return { status: 409, body: { ok: false, error: "source_file_unavailable" } };
      }
      const candidate = inst.sourceWritebackPath
        ? safeJoin(canonicalRoot, inst.sourceWritebackPath)
        : null;
      if (!candidate || !isPathInside(canonicalRoot, candidate) || !isMarkdownPath(candidate)) {
        return { status: 409, body: { ok: false, error: "source_file_unavailable" } };
      }

      const fileResult = await serializeMarkdownSave(candidate, async () => {
        let target;
        let sourceMarkdown;
        try {
          target = await resolveImportedSourceTarget(canonicalRoot, candidate);
          sourceMarkdown = await readFile(target.path, "utf8");
        } catch (error) {
          return { ok: false, response: importedSourceError(error) };
        }

        const fileEdit = replaceImportedArchitectureBlock(
          sourceMarkdown,
          inst.slides,
          index,
          block,
          source,
          inst.sourceWritebackSnapshot,
        );
        if (!fileEdit.ok) {
          return {
            ok: false,
            response: {
              status: fileEdit.reason === "block_not_found" ? 404 : 409,
              body: { ok: false, error: fileEdit.reason },
            },
          };
        }

        try {
          await atomicReplaceMarkdown({
            path: target.path,
            markdown: fileEdit.markdown,
            expectedMarkdown: sourceMarkdown,
            mode: target.mode,
            revalidate: async () => {
              try {
                const verified = await resolveImportedSourceTarget(canonicalRoot, candidate);
                if (resolve(verified.path) === resolve(target.path)) return;
              } catch (_) {
                // Report all target replacement/removal cases as a write conflict.
              }
              const error = new Error("source_changed");
              error.code = "SOURCE_CHANGED";
              throw error;
            },
          });
          return { ok: true, markdown: fileEdit.markdown };
        } catch (error) {
          return {
            ok: false,
            response:
              error?.code === "SOURCE_CHANGED" ||
              error?.code === "SOURCE_FILE_UNAVAILABLE"
                ? { status: 409, body: { ok: false, error: "source_changed" } }
                : { status: 500, body: { ok: false, error: "source_write_failed" } },
          };
        }
      });
      if (!fileResult.ok) return fileResult.response;
      inst.sourceWritebackSnapshot = fileResult.markdown;
    }

    activateInstance(inst);
    inst.slides[index] = next;
    inst.deckVersion += 1;
    await applyDeckSlide(inst);
    return {
      status: 200,
      body: {
        ok: true,
        version: inst.version,
        deckVersion: inst.deckVersion,
        index,
        block,
        markdown: inst.markdown,
        fileSaved: inst.sourceWriteback,
      },
    };
  });
}

async function synchronizeImportedPresentations({ workspaceRoot, sourcePath, markdown }) {
  const canonicalWorkspace = resolve(workspaceRoot);
  const canonicalSource = resolve(canonicalWorkspace, sourcePath);
  try {
    if ((await readFile(canonicalSource, "utf8")) !== markdown) return;
  } catch (_) {
    return;
  }
  const updates = [];
  for (const inst of instances.values()) {
    if (!inst.sourceWriteback || !inst.sourceWritebackPath) continue;
    if (resolve(inst.workspaceRoot) !== canonicalWorkspace) continue;
    if (resolve(inst.workspaceRoot, inst.sourceWritebackPath) !== canonicalSource) continue;
    updates.push(
      serializeArchitectureEdit(inst, async () => {
        const slides = buildDeckSlides(markdown);
        if (!slides.length) return;
        if (inst.sourceMode === SOURCE_MODE_LIVE) {
          const token = inst.sourceWatcherToken;
          try {
            await applyDeckNow(inst, {
              slides,
              index: inst.index,
              sourceName: inst.sourceName,
              sourceWriteback: true,
              sourceWritebackPath: inst.sourceWritebackPath,
              sourceWritebackSnapshot: markdown,
              sourceMode: SOURCE_MODE_LIVE,
              preserveSourceWatcher: true,
              preserveCurrentIndex: true,
            });
            if (token === inst.sourceWatcherToken && inst.sourceWatcher) {
              setSourceWatchState(inst, "watching");
            }
          } catch (error) {
            if (token === inst.sourceWatcherToken) {
              setSourceWatchState(inst, "error", sourceWatchError(error));
            }
          }
          return;
        }
        inst.sourceWritebackSnapshot = markdown;
        inst.slides = ensureBackCover(slides);
        inst.index = clampIndex(inst.index, inst.slides.length);
        inst.deckVersion += 1;
        await applyDeckSlide(inst);
      }),
    );
  }
  await Promise.all(updates);
}

// Read and JSON-parse a small request body, defending the loopback server
// against oversized or malformed payloads.
function readJsonBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        // Stop accumulating but don't destroy the socket, so the handler can
        // still send a clean 413 response.
        settle(reject, new Error("payload_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        settle(resolve, {});
        return;
      }
      try {
        settle(resolve, JSON.parse(raw));
      } catch (_) {
        settle(reject, new Error("invalid_json"));
      }
    });
    req.on("error", (e) => settle(reject, e));
  });
}

async function startServer(inst) {
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    let requestUrl;
    let pathname = "/";
    try {
      requestUrl = new URL(req.url, "http://127.0.0.1");
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch (_) {
      res.statusCode = 400;
      res.end("Bad request");
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      await sendFile(res, join(EXT_DIR, "renderer", "index.html"), { cache: false });
      return;
    }
    if (pathname === "/state") {
      const offset = Math.max(
        -1,
        Math.min(1, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0),
      );
      const targetIndex = clampIndex(inst.index + offset, inst.slides.length);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          version: inst.version,
          deckVersion: inst.deckVersion,
          markdown: offset && inst.slides.length ? inst.slides[targetIndex] : inst.markdown,
          index: offset ? targetIndex : inst.index,
          total: inst.slides.length,
          theme: inst.theme,
          themeLocked: inst.themeLocked,
          customThemeFile: inst.customThemeFile,
          customThemeCss: inst.customThemeCss,
          customThemeMeta: inst.customThemeMeta,
          mode: inst.mode,
          sourceBacked: inst.sourceWriteback,
          sourceMode: inst.sourceMode,
          sourceWatchStatus: inst.sourceWatchStatus,
          sourceWatchError: inst.sourceWatchError,
          presenterRunning: isProcessRunning(inst.presenterProcess),
          architectureEdit: Boolean(inst.architectureEdit),
          architectureDetailedEdit: architectureEditorManager.canOpenFromPresentation(inst),
        }),
      );
      return;
    }
    // The full deck is served separately so the polling /state stays small; the
    // client refetches /deck only when deckVersion changes (rebuilding the
    // slide-list overview). slides carry the markdown the client derives titles
    // from.
    if (pathname === "/deck") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ deckVersion: inst.deckVersion, slides: inst.slides }));
      return;
    }
    if (pathname === "/present") {
      if (req.method !== "POST" && req.method !== "DELETE") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST, DELETE");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(inst.url).origin) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
        return;
      }
      try {
        activateInstance(inst);
        const result =
          req.method === "DELETE"
            ? { ok: true, stopped: await stopPresenter(inst) }
            : await launchPresenter(inst);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode = error?.code === "no_deck" ? 409 : 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            ok: false,
            error: error?.code || "presenter_launch_failed",
            message: error?.message || "External presentation failed to start.",
          }),
        );
      }
      return;
    }
    if (pathname === "/export") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(inst.url).origin) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
        return;
      }
      try {
        activateInstance(inst);
        const result = await exportPdf(inst, pdfNameForSource(inst.sourceName), inst.theme);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(result));
      } catch (error) {
        res.statusCode =
          error?.code === "no_deck" || error?.code === "export_in_progress" ? 409 : 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            ok: false,
            error: error?.code || "pdf_export_failed",
            message: error?.message || "PDF export failed.",
          }),
        );
      }
      return;
    }
    if (pathname === "/export-data") {
      const token = requestUrl.searchParams.get("token") || "";
      const snapshot = inst.exportJobs.get(token);
      if (!snapshot) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Export snapshot not found");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          slides: snapshot.slides,
          theme: snapshot.theme,
          themeLocked: snapshot.themeLocked,
          customThemeCss: snapshot.customThemeCss,
          customThemeMeta: snapshot.customThemeMeta,
        }),
      );
      return;
    }
    if (pathname === "/export-status") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end("Method not allowed");
        return;
      }
      const token = requestUrl.searchParams.get("token") || "";
      const snapshot = inst.exportJobs.get(token);
      if (!snapshot) {
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
      snapshot.status = body.status;
      snapshot.error = typeof body.error === "string" ? body.error.slice(0, 2_000) : "";
      snapshot.layout =
        body.layout && typeof body.layout === "object" && Array.isArray(body.layout.slides)
          ? body.layout
          : null;
      res.statusCode = 204;
      res.end();
      return;
    }
    // In-canvas navigation: the renderer POSTs an absolute { index } or a
    // relative { delta }; the server stays authoritative so every connected
    // client converges via the SSE nudge.
    if (pathname === "/navigate") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        const tooLarge = e?.message === "payload_too_large";
        res.statusCode = tooLarge ? 413 : 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        // The request body may not be fully consumed (e.g. too large); close the
        // connection so we don't leave a partially-read keep-alive socket.
        res.setHeader("Connection", "close");
        res.end(JSON.stringify({ ok: false, error: e?.message || "bad_request" }));
        return;
      }
      const hasIndex = typeof body.index === "number" && Number.isFinite(body.index);
      const hasDelta = typeof body.delta === "number" && Number.isFinite(body.delta);
      if (hasIndex === hasDelta) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({ ok: false, error: "exactly one of index or delta is required" }),
        );
        return;
      }
      if (!inst.slides.length) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "no_deck" }));
        return;
      }
      activateInstance(inst);
      const target = hasIndex ? body.index : inst.index + body.delta;
      const changed = await applyNavigation(inst, target);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          changed,
          version: inst.version,
          index: inst.index,
          total: inst.slides.length,
          mode: inst.mode,
        }),
      );
      return;
    }
    // Toggle editing mode through this route so server state remains authoritative.
    // The renderer also calls it when opened with `?architectureEdit=1`. Otherwise
    // the client could enable editing while the server remained disabled, causing
    // /state polling to turn editing off and /edit to reject with 409.
    if (pathname === "/edit-mode") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(inst.url).origin) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Connection", "close");
        res.end(JSON.stringify({ ok: false, error: e?.message || "bad_request" }));
        return;
      }
      if (typeof body.enabled !== "boolean") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "enabled (boolean) is required" }));
        return;
      }
      activateInstance(inst);
      const changed = inst.architectureEdit !== body.enabled;
      inst.architectureEdit = body.enabled;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({ ok: true, changed, architectureEdit: inst.architectureEdit }),
      );
      return;
    }
    if (pathname === "/architecture-editor/open") {
     if (req.method !== "POST") {
       res.statusCode = 405;
       res.setHeader("Allow", "POST");
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
       return;
     }
     const origin = req.headers.origin;
     if (origin && origin !== new URL(inst.url).origin) {
       res.statusCode = 403;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
       return;
     }
     let body;
     try {
       body = await readJsonBody(req);
     } catch (error) {
       res.statusCode = error?.message === "payload_too_large" ? 413 : 400;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.end(JSON.stringify({ ok: false, error: error?.message || "bad_request" }));
       return;
     }
     const slideIndex = Number.isInteger(body.index) ? body.index : inst.index;
     const blockIndex = Number.isInteger(body.block) ? body.block : 0;
     if (
       slideIndex < 0 ||
       slideIndex >= inst.slides.length ||
       blockIndex < 0 ||
       importedArchitectureBlockIndex(inst.slides, slideIndex, blockIndex) === null
     ) {
       res.statusCode = 404;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.end(JSON.stringify({ ok: false, error: "block_not_found" }));
       return;
     }
     if (!architectureEditorManager.canOpenFromPresentation(inst)) {
       res.statusCode = 409;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.end(JSON.stringify({ ok: false, error: "source_not_available" }));
       return;
     }
     try {
       const opened = await architectureEditorManager.openFromPresentation(
         inst,
         slideIndex,
         blockIndex,
       );
       res.statusCode = 200;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.setHeader("Cache-Control", "no-store");
       res.end(
         JSON.stringify({
           ok: true,
           instanceId: opened.instanceId,
           canvasId: opened.canvasId,
         }),
       );
     } catch (error) {
       res.statusCode = error?.code === "source_not_available" ? 409 : 500;
       res.setHeader("Content-Type", "application/json; charset=utf-8");
       res.end(
         JSON.stringify({
           ok: false,
           error: error?.code || "editor_open_failed",
           message: error?.message || "Architecture Editor could not be opened.",
         }),
       );
     }
     return;
    }
    // Write an edited Architecture diagram back to the source slide. Accept the
    // complete DSL, not a diff, and replace the nth ```architecture fence in the
    // target slide. Reject requests outside editing mode so presenter or print
    // access cannot modify a slide accidentally.
    if (pathname === "/edit") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(inst.url).origin) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
        return;
      }
      let body;
      try {
        body = await readJsonBody(req, MAX_EDIT_BODY);
      } catch (e) {
        const tooLarge = e?.message === "payload_too_large";
        res.statusCode = tooLarge ? 413 : 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Connection", "close");
        res.end(JSON.stringify({ ok: false, error: e?.message || "bad_request" }));
        return;
      }
      if (!inst.architectureEdit) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "edit_mode_disabled" }));
        return;
      }
      if (typeof body.source !== "string" || !body.source.trim()) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "source (string) is required" }));
        return;
      }
      if (!inst.slides.length) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "no_deck" }));
        return;
      }
      const index = Number.isInteger(body.index) ? body.index : inst.index;
      const block = Number.isInteger(body.block) ? body.block : 0;
      const deckVersion = Number.isInteger(body.deckVersion)
        ? body.deckVersion
        : inst.deckVersion;
      if (index < 0 || index >= inst.slides.length) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "index_out_of_range" }));
        return;
      }
      const result = await applyArchitectureEdit(inst, {
        index,
        block,
        source: body.source,
        deckVersion,
      });
      res.statusCode = result.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(result.body));
      return;
    }
    // List workspace Markdown for the canvas 📂 button.
    if (pathname === "/markdown-files") {
      if (req.method !== "GET") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const { files, truncated } = await listMarkdownFiles(inst.workspaceRoot);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ ok: true, files, truncated, current: inst.sourceName || "" }));
      return;
    }
    // Load Markdown selected in the canvas, split it in the extension, and display it.
    // This lets users present their own files directly without involving the agent.
    if (pathname === "/import") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(inst.url).origin) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Connection", "close");
        res.end(JSON.stringify({ ok: false, error: e?.message || "bad_request" }));
        return;
      }
      const rel = typeof body.path === "string" ? body.path.trim() : "";
      if (
        body.sourceMode !== undefined &&
        body.sourceMode !== SOURCE_MODE_SNAPSHOT &&
        body.sourceMode !== SOURCE_MODE_LIVE
      ) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "invalid_source_mode" }));
        return;
      }
      if (!rel) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "path (string) is required" }));
        return;
      }
      const root = resolve(inst.workspaceRoot);
      const abs = isAbsolute(rel) ? null : safeJoin(root, rel);
      if (!abs || !isPathInside(root, abs)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "path_outside_workspace" }));
        return;
      }
      if (!isMarkdownPath(abs)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "not_markdown" }));
        return;
      }
      let text;
      let sourceWritebackPath;
      try {
        const [canonicalRoot, canonicalSource] = await Promise.all([
          realpath(root),
          realpath(abs),
        ]);
        if (!isPathInside(canonicalRoot, canonicalSource)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: "path_outside_workspace" }));
          return;
        }
        const info = await stat(canonicalSource);
        if (!info.isFile()) throw new Error("not_a_file");
        if (info.size > MARKDOWN_MAX_BYTES) {
          res.statusCode = 413;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: false, error: "file_too_large" }));
          return;
        }
        text = await readFile(canonicalSource, "utf8");
        sourceWritebackPath = relative(canonicalRoot, canonicalSource);
      } catch (_) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "file_not_found" }));
        return;
      }
      const slides = buildDeckSlides(text);
      if (!slides.length) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "empty_markdown" }));
        return;
      }
      const sourceName = relative(root, abs).split(sep).join("/");
      activateInstance(inst);
      try {
        await applyDeck(inst, {
          slides,
          index: 0,
          sourceName,
          sourceWriteback: true,
          sourceWritebackPath,
          sourceWritebackSnapshot: text,
          sourceMode: normalizeSourceMode(body.sourceMode),
        });
      } catch (e) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: e?.message || "import_failed" }));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          ok: true,
          version: inst.version,
          index: inst.index,
          total: inst.slides.length,
          theme: inst.theme,
          sourceName: inst.sourceName,
          sourceMode: inst.sourceMode,
          sourceWatchStatus: inst.sourceWatchStatus,
        }),
      );
      return;
    }
    if (pathname === "/source-mode") {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
        return;
      }
      const origin = req.headers.origin;
      if (origin && origin !== new URL(inst.url).origin) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "origin_not_allowed" }));
        return;
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        res.statusCode = error?.message === "payload_too_large" ? 413 : 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: error?.message || "bad_request" }));
        return;
      }
      if (body.mode !== SOURCE_MODE_SNAPSHOT && body.mode !== SOURCE_MODE_LIVE) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "invalid_source_mode" }));
        return;
      }
      activateInstance(inst);
      const previous = inst.sourceMode;
      const result = await setSourceMode(inst, body.mode);
      res.statusCode = result.ok ? 200 : 409;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(
        JSON.stringify({
          ...result,
          changed: result.ok ? previous !== inst.sourceMode : false,
          sourceMode: inst.sourceMode,
          sourceWatchStatus: inst.sourceWatchStatus,
          sourceWatchError: inst.sourceWatchError,
        }),
      );
      return;
    }
    if (pathname === "/events") {
      handleSse(req, res, inst);
      return;
    }
    if (pathname === "/vendor/mermaid.min.js") {
      await sendChunkedVendorAsset(res, "mermaid.min.js");
      return;
    }
    if (pathname.startsWith("/renderer/") || pathname.startsWith("/vendor/")) {
      const abs = safeJoin(EXT_DIR, pathname);
      if (!abs) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      await sendFile(res, abs, { cache: pathname.startsWith("/vendor/") });
      return;
    }
    if (pathname.startsWith("/theme-assets/")) {
      const assetPath = pathname.slice("/theme-assets/".length);
      if (
        !inst.customThemeDir ||
        !inst.customThemeAssets.has(assetPath)
      ) {
        res.statusCode = 404;
        res.end("Theme asset not found");
        return;
      }
      const themeRoot = resolve(inst.workspaceRoot, inst.customThemeDir);
      const candidate = safeJoin(themeRoot, assetPath);
      if (!candidate) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      try {
        const [realThemeRoot, realAsset] = await Promise.all([
          realpath(themeRoot),
          realpath(candidate),
        ]);
        const realWorkspaceRoot = await realpath(inst.workspaceRoot);
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
    if (pathname.startsWith("/assets/")) {
      try {
        const abs = await resolveAssetFile(
          inst.workspaceRoot,
          inst.sourceName,
          pathname.slice("/assets/".length),
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

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/` };
}

async function ensureInstance(ctx) {
  const key = keyOf(ctx);
  let inst = instances.get(key);
  if (!inst) {
    const workspaceRoot = resolveWorkspaceRoot(
      ctx.session?.workingDirectory,
      resolve(EXT_DIR, "..", "..", ".."),
    );
    inst = {
      key,
      extensionId: ctx.extensionId,
      server: null,
      url: null,
      version: 0,
      deckVersion: 0,
      markdown: "",
      slides: [],
      index: 0,
      mode: "deck",
      sourceName: "",
      sourceWriteback: false,
      sourceWritebackPath: "",
      sourceWritebackSnapshot: "",
      sourceMode: SOURCE_MODE_SNAPSHOT,
      sourceWatchStatus: "inactive",
      sourceWatchError: "",
      sourceWatcher: null,
      sourceWatcherToken: 0,
      clients: new Set(),
      workspaceRoot,
      dataFile: dataFileFor(key),
      theme: DEFAULT_THEME,
      themeLocked: false,
      customThemeFile: "",
      customThemeCss: "",
      customThemeDir: "",
      customThemeMeta: null,
      customThemeAssets: new Set(),
      exportJobs: new Map(),
      exporting: false,
      presenterProcess: null,
      presenterProfileDir: "",
      presenterLaunchPromise: null,
      // Architecture diagram editing mode. Intentionally not persisted; otherwise
      // a reload could start a presentation with the editing UI still attached.
      architectureEdit: false,
    };
    // Rehydrate the last deck (e.g. after extensions_reload) if present.
    try {
      const saved = JSON.parse(await readFile(inst.dataFile, "utf8"));
      if (typeof saved.markdown === "string") inst.markdown = saved.markdown;
      if (typeof saved.version === "number") inst.version = saved.version;
      if (typeof saved.deckVersion === "number") inst.deckVersion = saved.deckVersion;
      if (Array.isArray(saved.slides) && saved.slides.every((s) => typeof s === "string")) {
        inst.slides = saved.slides;
      }
      if (typeof saved.index === "number") inst.index = clampIndex(saved.index, inst.slides.length);
      if (typeof saved.theme === "string") inst.theme = normalizeTheme(saved.theme);
      if (typeof saved.themeLocked === "boolean") inst.themeLocked = saved.themeLocked;
      if (typeof saved.customThemeFile === "string") inst.customThemeFile = saved.customThemeFile;
      if (typeof saved.customThemeCss === "string") inst.customThemeCss = saved.customThemeCss;
      if (typeof saved.customThemeDir === "string") inst.customThemeDir = saved.customThemeDir;
      if (saved.customThemeMeta && typeof saved.customThemeMeta === "object") {
        inst.customThemeMeta = saved.customThemeMeta;
      }
      if (Array.isArray(saved.customThemeAssets)) {
        inst.customThemeAssets = new Set(
          saved.customThemeAssets.filter((asset) => typeof asset === "string"),
        );
      }
      if (typeof saved.sourceName === "string") inst.sourceName = saved.sourceName;
      if (typeof saved.sourceWriteback === "boolean") {
        const validPath =
          typeof saved.sourceWritebackPath === "string" && saved.sourceWritebackPath.length > 0;
        const validSnapshot = typeof saved.sourceWritebackSnapshot === "string";
        inst.sourceWriteback =
          saved.sourceWriteback && Boolean(inst.sourceName) && validPath && validSnapshot;
        inst.sourceWritebackPath = inst.sourceWriteback ? saved.sourceWritebackPath : "";
        inst.sourceWritebackSnapshot = inst.sourceWriteback
          ? saved.sourceWritebackSnapshot
          : "";
      }
      if (inst.sourceWriteback) inst.sourceMode = normalizeSourceMode(saved.sourceMode);
      if (saved.mode === "adhoc" || saved.mode === "deck") inst.mode = saved.mode;
      if (isPresenterProfilePath(saved.presenterProfileDir)) {
        inst.presenterProfileDir = saved.presenterProfileDir;
      }
    } catch (_) {
      /* no saved state — start blank */
    }
    if (inst.presenterProfileDir) {
      try {
        await removePresenterProfile(inst.presenterProfileDir);
        inst.presenterProfileDir = "";
        await persistNow(inst);
      } catch (error) {
        log(
          `MarkdStage: stale presenter profile cleanup failed: ${error?.message || error}`,
          "warning",
        );
      }
    }
    instances.set(key, inst);
  }
  if (!inst.server) {
    const { server, url } = await startServer(inst);
    inst.server = server;
    inst.url = url;
  }
  if (
    inst.sourceWriteback &&
    inst.sourceMode === SOURCE_MODE_LIVE &&
    !inst.sourceWatcher
  ) {
    await setSourceMode(inst, SOURCE_MODE_LIVE);
  }
  activateInstance(inst);
  startPenListener();
  return inst;
}

const architectureEditorManager = createArchitectureEditorManager({
  extensionDirectory: EXT_DIR,
  onMarkdownSaved: synchronizeImportedPresentations,
  logger: (message, level) => log(message, level),
});

const session = await joinSession({
  tools: [
    {
      name: "markdstage_guide",
      description:
        "Call before creating slides with the MarkdStage canvas. Returns the slide-fragment format, front matter, themes, custom themes, and Architecture DSL schemas.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: [
              "overview",
              "slide-format",
              "themes",
              "custom-themes",
              "custom-ehemes",
              "theme-schema",
              "architecture-dsl",
              "architecture-schema",
            ],
            description: "Topic to retrieve. Defaults to overview.",
          },
        },
        additionalProperties: false,
      },
      handler: async ({ topic } = {}) => readGuide(topic ?? "overview"),
    },
  ],
  hooks: createMarkdStageHooks(),
  canvases: [
    createCanvas({
      id: "MarkdStage",
      displayName: "MarkdStage",
      description:
        "Markdown, ready for the stage. A MarkdStage canvas that displays themed Markdown slides. Pass slides/index/theme to open the deck immediately. Use the 16:9 control for PDF-equivalent preview, inspect_layout for compact clipping diagnostics, capture_slides for selected 1280x720 PNGs, open_presenter for an external presentation window, and export_pdf for final PDF output. Navigate within the canvas with ◀ ▶, arrow keys, the slide list, or a Surface Pen on supported Windows systems.",
      inputSchema: {
        type: "object",
        properties: {
          slides: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Array of Markdown fragments, one per slide. Passing it to open registers the deck and immediately displays the first slide without a placeholder. Each item may start with deck/kicker/page/total/title/layout/theme front matter. layout accepts title / section / backcover / center. When omitted, headings and body content align to the top; center vertically centers the heading and body as a unit. Order items by display sequence.",
          },
          index: {
            type: "integer",
            minimum: 0,
            description: "Zero-based index of the first slide to display. Defaults to 0.",
          },
          theme: {
            type: "string",
            enum: ["dark", "light", "microsoft", "custom"],
            description:
              "Color theme for the complete deck: dark / light / microsoft / custom. When omitted, use front matter, then dark if unspecified. An explicit value overrides front matter.",
          },
          themeFile: {
            type: "string",
            description:
              "Theme file defining only CSS custom properties. Resolve the same relative path first beside the source Markdown, then from the workspace root. A theme.json in the same directory is loaded automatically.",
          },
          sourceName: {
            type: "string",
            description:
              "Workspace-relative path of the source Markdown. Used as the base for adjacent assets/ and Markdown-relative theme-file resolution. The canvas PDF button saves using this file name with a .pdf extension.",
          },
        },
        additionalProperties: false,
      },
      actions: [
        {
          name: "load_deck",
          description:
            "Register a complete presentation at once. Pass one Markdown fragment per slide in slides to retain and display the deck. Resolve theme/themeFile in the order explicit value > front matter > dark. A custom theme also loads an optional theme.json beside its CSS file.",
          inputSchema: {
            type: "object",
            properties: {
              slides: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                description:
                  "Array of Markdown fragments, one per slide. Each item may start with deck/kicker/page/total/title/layout/theme/theme-file front matter. layout accepts title / section / backcover / center. When omitted, headings and body content align to the top; center vertically centers the heading and body as a unit. Order items by display sequence.",
              },
              index: {
                type: "number",
                description: "Zero-based index of the first slide to display. Defaults to 0.",
              },
              theme: {
                type: "string",
                enum: ["dark", "light", "microsoft", "custom"],
                description:
                  "Color theme for the complete deck: dark / light / microsoft / custom. When omitted, use front matter, then dark if unspecified. An explicit value overrides front matter.",
              },
              themeFile: {
                type: "string",
                description:
                  "Theme file defining only CSS custom properties. Resolve the same relative path first beside the source Markdown, then from the workspace root. A theme.json in the same directory is loaded automatically.",
              },
              sourceName: {
                type: "string",
                description:
                  "Workspace-relative path of the source Markdown. Used as the base for adjacent assets/ and Markdown-relative theme-file resolution. The canvas PDF button saves using this file name with a .pdf extension.",
              },
            },
            required: ["slides"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const slides = ctx.input?.slides;
            if (
              !Array.isArray(slides) ||
              slides.length === 0 ||
              !slides.every((s) => typeof s === "string")
            ) {
              throw new CanvasError(
                "invalid_input",
                "slides (non-empty array of strings) is required",
              );
            }
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open; open it before calling load_deck",
              );
            }
            activateInstance(inst);
            await applyDeck(inst, {
              slides,
              index: ctx.input?.index,
              theme: ctx.input?.theme,
              themeFile: ctx.input?.themeFile,
              sourceName: ctx.input?.sourceName,
            });
            const validationFeedback = deckValidationFeedback(slides);
            return {
              ok: true,
              version: inst.version,
              index: inst.index,
              total: inst.slides.length,
              theme: inst.theme,
              ...(validationFeedback ? { validationFeedback } : {}),
            };
          },
        },
        {
          name: "goto_slide",
          description:
            "Switch the displayed slide in a deck registered by load_deck using a zero-based index. Normal navigation occurs within the canvas, so use this only to jump to a specific page from chat. Out-of-range values are clamped to the first or last slide. The returned changed value indicates whether the display actually changed.",
          inputSchema: {
            type: "object",
            properties: {
              index: {
                type: "number",
                description: "Zero-based index of the slide to display.",
              },
            },
            required: ["index"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open",
              );
            }
            if (!inst.slides.length) {
              throw new CanvasError(
                "no_deck",
                "no deck loaded; call load_deck first",
              );
            }
            if (typeof ctx.input?.index !== "number") {
              throw new CanvasError("invalid_input", "index (number) is required");
            }
            activateInstance(inst);
            const changed = await applyNavigation(inst, ctx.input.index);
            return {
              ok: true,
              changed,
              version: inst.version,
              index: inst.index,
              total: inst.slides.length,
            };
          },
        },
        {
          name: "show_slide",
          description:
            "Update only the current slide. Pass a small one-slide Markdown fragment (optional front matter plus body) to update the canvas immediately. Use for a one-off display without a registered deck or a temporary replacement.",
          inputSchema: {
            type: "object",
            properties: {
              markdown: {
                type: "string",
                description:
                  "Markdown for one slide. It may start with deck/kicker/page/total/title/layout/theme front matter enclosed by `---`; an omitted theme inherits the current deck theme. layout accepts title / section / backcover / center. When omitted, headings and body content align to the top; center vertically centers the heading and body as a unit.",
              },
            },
            required: ["markdown"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const markdown = ctx.input?.markdown;
            if (typeof markdown !== "string") {
              throw new CanvasError("invalid_input", "markdown (string) is required");
            }
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open; open it before calling show_slide",
              );
            }
            activateInstance(inst);
            await serializeArchitectureEdit(inst, async () => {
              inst.markdown = markdown;
              inst.mode = "adhoc";
              stopSourceWatcher(inst);
              inst.sourceWriteback = false;
              inst.sourceWritebackPath = "";
              inst.sourceWritebackSnapshot = "";
              inst.sourceMode = SOURCE_MODE_SNAPSHOT;
              inst.sourceWatchStatus = "inactive";
              inst.sourceWatchError = "";
              inst.version += 1;
              broadcast(inst);
              schedulePersist(inst);
            });
            return { ok: true, version: inst.version };
          },
        },
        {
          name: "get_architecture_errors",
          description:
            "Get syntax errors for the Architecture DSL currently targeted for display. Omit index to validate the complete deck, or provide a zero-based index to validate only that slide. Includes temporary replacements made by show_slide.",
          inputSchema: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                minimum: 0,
                description:
                  "Zero-based index of the slide to validate. Omit to validate the complete deck.",
              },
            },
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open",
              );
            }
            const slides = getExportSlides(inst);
            if (!slides.length) {
              throw new CanvasError(
                "no_deck",
                "no slide content is loaded; open or load a deck first",
              );
            }
            const input = ctx.input ?? {};
            const hasIndex = Object.prototype.hasOwnProperty.call(input, "index");
            const index = input.index;
            if (hasIndex && (!Number.isInteger(index) || index < 0)) {
              throw new CanvasError(
                "invalid_input",
                "index must be a non-negative integer",
              );
            }
            if (hasIndex && index >= slides.length) {
              throw new CanvasError(
                "slide_out_of_range",
                `slide index ${index} is outside the loaded range 0-${slides.length - 1}`,
              );
            }
            activateInstance(inst);
            const errors = architectureValidationErrors(
              slides,
              hasIndex ? { index } : {},
            );
            return {
              ok: true,
              scope: hasIndex ? "slide" : "deck",
              ...(hasIndex ? { index, page: index + 1 } : {}),
              total: slides.length,
              errorCount: errors.length,
              errors,
            };
          },
        },
        {
          name: "open_presenter",
          description:
            "Open the displayed deck in a synchronized, movable, resizable 1280x720 external presentation window. Launch Microsoft Edge, Google Chrome, or Chromium in app mode with a dedicated profile, sharing the canvas page position, keyboard controls, and Surface Pen controls. Enter full screen with standard browser or OS controls (F11 on Windows). If already running, do not open another window. A Surface Pen does not launch it.",
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open; open it before opening the presenter",
              );
            }
            activateInstance(inst);
            return launchPresenter(inst);
          },
        },
        {
          name: "close_presenter",
          description:
            "Close the external presentation window opened by open_presenter and delete its dedicated browser profile.",
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open",
              );
            }
            const stopped = await stopPresenter(inst);
            return { ok: true, stopped };
          },
        },
        {
          name: "inspect_layout",
          description:
            "Inspect the displayed deck with the same fixed 1280x720 layout used for PDF output. Prefer this lightweight JSON diagnostic before requesting PNGs. By default, inspect the complete deck and return only pages that would be clipped; pass index for one zero-based page or includeFits=true to include pages that fit.",
          inputSchema: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                minimum: 0,
                description:
                  "Zero-based slide index to inspect. Omit to inspect the complete PDF deck, including the automatic back cover.",
              },
              includeFits: {
                type: "boolean",
                description:
                  "Include slides that fit as well as problematic slides. Defaults to false to keep the response small.",
              },
            },
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open; open it before inspecting layout",
              );
            }
            const input = ctx.input ?? {};
            if (
              input.index !== undefined &&
              (!Number.isInteger(input.index) || input.index < 0)
            ) {
              throw new CanvasError(
                "invalid_input",
                "index must be a non-negative integer when provided",
              );
            }
            if (
              input.includeFits !== undefined &&
              typeof input.includeFits !== "boolean"
            ) {
              throw new CanvasError("invalid_input", "includeFits must be a boolean");
            }
            activateInstance(inst);
            return inspectLayout(inst, input.index, input.includeFits);
          },
        },
        {
          name: "capture_slides",
          description:
            "Render selected slides as PDF-equivalent 1280x720 PNG files. Pass zero-based indexes to capture specific pages. Omit indexes to run inspect_layout first and capture only pages that would be clipped. Returns workspace file paths and compact layout diagnostics, never inline image bytes.",
          inputSchema: {
            type: "object",
            properties: {
              indexes: {
                type: "array",
                items: { type: "integer", minimum: 0 },
                minItems: 1,
                maxItems: MAX_CAPTURE_SLIDES,
                description:
                  "Zero-based slide indexes to capture. Omit to capture only pages reported as clipped by PDF layout inspection.",
              },
              outputDirectory: {
                type: "string",
                description:
                  "Output directory relative to the workspace. Defaults to <source-name>-previews or markdstage-previews.",
              },
              theme: {
                type: "string",
                enum: ["dark", "light", "microsoft", "custom"],
                description:
                  "Theme applied to PNG output. Defaults to the displayed deck theme and does not change the canvas.",
              },
            },
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open; open it before capturing PNGs",
              );
            }
            const input = ctx.input ?? {};
            if (input.indexes !== undefined && !Array.isArray(input.indexes)) {
              throw new CanvasError("invalid_input", "indexes must be an array");
            }
            if (
              input.outputDirectory !== undefined &&
              typeof input.outputDirectory !== "string"
            ) {
              throw new CanvasError(
                "invalid_input",
                "outputDirectory must be a string when provided",
              );
            }
            activateInstance(inst);
            return captureSlides(
              inst,
              input.indexes,
              input.outputDirectory,
              input.theme,
            );
          },
        },
        {
          name: "export_pdf",
          description:
            "AI action that exports the displayed deck to a 16:9 PDF. Output one slide per page with the current backgrounds, images, syntax highlighting, and Mermaid content. If show_slide temporarily replaced the current page, include that replacement in the PDF. Adds no UI.",
          inputSchema: {
            type: "object",
            properties: {
              outputPath: {
                type: "string",
                description:
                  "PDF path relative to the workspace. Defaults to markdstage.pdf. Paths outside the workspace and non-.pdf paths are rejected.",
              },
              theme: {
                type: "string",
                enum: ["dark", "light", "microsoft", "custom"],
                description:
                  "Theme applied to the PDF. Defaults to the displayed deck theme. Specifying it does not change the canvas theme.",
              },
            },
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open; open it before exporting PDF",
              );
            }
            activateInstance(inst);
            return exportPdf(inst, ctx.input?.outputPath, ctx.input?.theme);
          },
        },
        {
          name: "edit_architecture",
          description:
            "Toggle Architecture diagram editing mode. When enabled, diagrams can be moved in the canvas by dragging or using arrow keys. Decks imported through the canvas 📂 control also write changes back to the source Markdown ```architecture block; other decks save to canvas deck state. The editing UI does not appear in presenter view or PDF output. Always restore enabled=false before presenting.",
          inputSchema: {
            type: "object",
            properties: {
              enabled: {
                type: "boolean",
                description: "Set true to enable editing mode or false to return to normal view.",
              },
            },
            required: ["enabled"],
            additionalProperties: false,
          },
          handler: async (ctx) => {
            const enabled = ctx.input?.enabled;
            if (typeof enabled !== "boolean") {
              throw new CanvasError("invalid_input", "enabled (boolean) is required");
            }
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open",
              );
            }
            activateInstance(inst);
            const changed = inst.architectureEdit !== enabled;
            inst.architectureEdit = enabled;
            // /state polling propagates editing mode to the renderer. Do not
            // increment version because slide content did not change; this avoids
            // unnecessary rerenders in other clients.
            return { ok: true, changed, architectureEdit: inst.architectureEdit };
          },
        },
        {
          name: "reset",
          description: "Clear the slides and return to the waiting placeholder.",
          handler: async (ctx) => {
            const inst = instances.get(keyOf(ctx));
            if (!inst) {
              throw new CanvasError(
                "canvas_not_open",
                "MarkdStage canvas is not open",
              );
            }
            activateInstance(inst);
            await serializeArchitectureEdit(inst, async () => {
              await stopPresenter(inst);
              inst.markdown = "";
              inst.slides = [];
              inst.index = 0;
              inst.theme = DEFAULT_THEME;
              inst.themeLocked = false;
              inst.customThemeFile = "";
              inst.customThemeCss = "";
              inst.customThemeDir = "";
              inst.customThemeMeta = null;
              inst.customThemeAssets = new Set();
              inst.sourceName = "";
              inst.sourceWriteback = false;
              inst.sourceWritebackPath = "";
              inst.sourceWritebackSnapshot = "";
              stopSourceWatcher(inst);
              inst.sourceMode = SOURCE_MODE_SNAPSHOT;
              inst.sourceWatchStatus = "inactive";
              inst.sourceWatchError = "";
              inst.mode = "deck";
              inst.architectureEdit = false;
              inst.deckVersion += 1;
              inst.version += 1;
              broadcast(inst);
              schedulePersist(inst);
            });
            return { ok: true, version: inst.version };
          },
        },
      ],
      open: async (ctx) => {
        const inst = await ensureInstance(ctx);
        // Apply any deck passed to open *before* returning the url. The renderer
        // only starts after open resolves, so its first /state fetch already
        // sees the first slide and the "waiting" placeholder never flashes.
        const input = ctx.input;
        if (input && typeof input === "object" && "slides" in input) {
          const slides = input.slides;
          if (
            !Array.isArray(slides) ||
            slides.length === 0 ||
            !slides.every((s) => typeof s === "string")
          ) {
            throw new CanvasError(
              "invalid_input",
              "slides must be a non-empty array of strings when provided to open",
            );
          }
          // Idempotency guard: re-opening (focusing) a canvas that already holds
          // the same deck must not reset the user's current slide back to 0.
          // Only (re)load when there is no deck yet or the deck actually changed.
          const sameDeck =
            inst.slides.length === slides.length &&
            inst.slides.every((s, i) => s === slides[i]);
          const hasThemeInput =
            Object.prototype.hasOwnProperty.call(input, "theme") ||
            Object.prototype.hasOwnProperty.call(input, "themeFile");
          const hasSourceInput =
            typeof input.sourceName === "string" && input.sourceName.trim().length > 0;
          if (inst.slides.length === 0 || !sameDeck || hasThemeInput || hasSourceInput) {
            await applyDeck(inst, {
              slides,
              index: input.index,
              theme: input.theme,
              themeFile: input.themeFile,
              sourceName: input.sourceName,
            });
          }
        }
        const validationFeedback = Array.isArray(input?.slides)
          ? deckValidationFeedback(input.slides)
          : undefined;
        if (validationFeedback) {
          log(`MarkdStage: ${validationFeedback}`, "warning");
        }
        return {
          title: "MarkdStage",
          url: inst.url,
          ...(validationFeedback ? { validationFeedback } : {}),
        };
      },
      onClose: async (ctx) => {
        const key = keyOf(ctx);
        const inst = instances.get(key);
        if (!inst) return;
        await stopPresenter(inst);
        stopSourceWatcher(inst);
        for (const res of [...inst.clients]) {
          try {
            res.end();
          } catch (_) {
            /* ignore */
          }
        }
        inst.clients.clear();
        inst.exportJobs.clear();
        instances.delete(key);
        if (activeInstanceKey === key) {
          activateInstance([...instances.values()].at(-1) || null);
        }
        if (instances.size === 0) stopPenListener();
        if (inst.server) {
          const server = inst.server;
          inst.server = null;
          inst.url = null;
          await new Promise((r) => server.close(() => r()));
        }
      },
    }),
    architectureEditorManager.canvas,
  ],
});

architectureEditorManager.attachSession(session);
logger = (message, opts) => session.log(message, opts);
process.once("exit", stopPenListener);
