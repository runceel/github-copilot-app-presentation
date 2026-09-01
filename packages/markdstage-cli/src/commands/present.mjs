// markdstage present — serve the deck on loopback and open it in a browser.

import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  MarkdStageError,
  buildPresenterBrowserArgs,
  findChromiumBrowser,
  isProcessRunning,
  sharedPath,
  terminateProcessTree,
} from "../runtime.mjs";
import { withDeckServer } from "../deck.mjs";

async function createWatcher(session, server, { onStatus }) {
  const { createMarkdownWatcher } = await import(
    pathToFileURL(sharedPath("scripts", "markdown-watcher.mjs")).href
  );
  return createMarkdownWatcher({
    path: session.file,
    onChange: async () => {
      try {
        // Keep the current slide, and keep the last valid deck when the file is
        // saved in a broken intermediate state.
        await session.load({ preserveIndex: true });
        server.broadcast();
        onStatus(`reloaded ${session.sourceName} (${session.slides.length} slides)`);
      } catch (error) {
        onStatus(`reload failed, keeping the last valid deck: ${error?.message || error}`, true);
      }
    },
    onError: (error) => onStatus(`watch error: ${error?.message || error}`, true),
  });
}

export async function presentCommand(options, io) {
  return withDeckServer(options, async (session, server) => {
    const watcher = options.watch ? await createWatcher(session, server, {
      onStatus: (message, isError) => io.status(message, isError),
    }) : null;

    let browserProcess = null;
    let profileDir = "";
    if (options.open) {
      const browser = findChromiumBrowser();
      if (!browser) {
        throw new MarkdStageError(
          "presenter_browser_not_found",
          "Presenting requires Microsoft Edge, Google Chrome, or Chromium. Re-run with --no-open to serve the deck only.",
        );
      }
      profileDir = await mkdtemp(join(tmpdir(), "markdstage-presenter-window-"));
      browserProcess = spawn(
        browser,
        buildPresenterBrowserArgs({ profileDir, presenterUrl: server.url }),
        { windowsHide: false, stdio: "ignore" },
      );
      browserProcess.once("error", (error) => {
        io.status(`browser failed to start: ${error?.message || error}`, true);
      });
    }

    io.print(`MarkdStage is presenting ${session.sourceName || session.file}`);
    io.print(`  slides:    ${session.slides.length}`);
    io.print(`  theme:     ${session.theme}`);
    io.print(`  workspace: ${resolve(session.workspaceRoot)}`);
    io.print(`  url:       ${server.url}`);
    if (options.watch) io.print("  watching:  on (the deck reloads when the file is saved)");
    io.print("Press Ctrl+C to stop.");

    await new Promise((done) => {
      const stop = () => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        done();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      if (browserProcess) browserProcess.once("close", stop);
      if (options.until) options.until.then(stop, stop);
    });

    watcher?.close();
    if (isProcessRunning(browserProcess)) await terminateProcessTree(browserProcess);
    if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    return { ok: true, url: server.url, total: session.slides.length, theme: session.theme };
  });
}
