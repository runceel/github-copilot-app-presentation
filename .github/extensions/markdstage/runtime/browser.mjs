// Chromium discovery, process lifetime, and CDP helpers shared by the Canvas
// Extension and the MarkdStage CLI.
//
// MarkdStage never downloads a browser: it drives an installed Microsoft Edge,
// Google Chrome, or Chromium. Keep this module free of runtime npm dependencies
// because the Extension is distributed as a folder ZIP.

import { existsSync } from "node:fs";
import { readFile, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

export const PDF_RENDER_TIMEOUT_MS = 60_000;

export function findExecutableOnPath(names) {
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

export function findChromiumBrowser() {
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

export function waitForChildExit(child, timeoutMs) {
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

export async function terminateProcessTree(child) {
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

export function isProcessRunning(child) {
  return !!child && child.exitCode === null && child.signalCode === null && !child.killed;
}

export function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
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
export async function runHeadlessBrowser(browser, args, failureLabel) {
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

function withSandboxFallback(args) {
  if (
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() === 0
  ) {
    return ["--no-sandbox", ...args];
  }
  return args;
}

export async function runPdfBrowser(browser, pageUrl, outputPath, profileDir) {
  // Enforce the contract at runtime. Otherwise it silently waits 60 seconds
  // before timing out, obscuring the cause; fail immediately with an explanation.
  if (new URL(pageUrl).searchParams.get("print") !== "1") {
    throw new Error(
      `Refusing to run --print-to-pdf against a non-print URL (${pageUrl}): only ?print=1 stops the renderer's SSE and polling loops, so any other page hangs the browser forever.`,
    );
  }
  const args = withSandboxFallback([
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
  ]);
  await runHeadlessBrowser(browser, args, "Browser PDF rendering");
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

export async function connectCdp(webSocketUrl) {
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

export async function runCdpOutputBrowser(browser, pageUrl, profileDir, job, capturePng) {
  const diagnostics = { value: "" };
  await rm(join(profileDir, "DevToolsActivePort"), { force: true }).catch(() => {});
  const args = withSandboxFallback([
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
  ]);
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

export async function verifyPdf(outputPath) {
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

export async function verifyPng(outputPath) {
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
