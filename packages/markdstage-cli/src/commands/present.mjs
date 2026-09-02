// markdstage present — serve the deck on loopback and open it in a browser.

import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  const setWatchState = (status, error = "") => {
    const changed = session.watchStatus !== status || session.watchError !== error;
    session.watchStatus = status;
    session.watchError = error;
    if (changed) server.broadcast();
  };
  const watcher = createMarkdownWatcher({
    path: session.file,
    onChange: async () => {
      try {
        if ((await readFile(session.file, "utf8")) === session.sourceMarkdown) {
          setWatchState("watching");
          return;
        }
        // Keep the current slide, and keep the last valid deck when the file is
        // saved in a broken intermediate state.
        await session.load({ preserveIndex: true });
        setWatchState("watching");
        server.broadcast();
        onStatus(`reloaded ${session.sourceName} (${session.slides.length} slides)`);
      } catch (error) {
        setWatchState("error", error?.code || "source_reload_failed");
        onStatus(`reload failed, keeping the last valid deck: ${error?.message || error}`, true);
      }
    },
    onError: (error) => {
      setWatchState("error", "watch_failed");
      onStatus(`watch error: ${error?.message || error}`, true);
    },
  });
  setWatchState("watching");
  return watcher;
}

export async function presentCommand(options, io) {
  let audienceProcess = null;
  let audienceProfileDir = "";
  let audienceUrl = "";

  const closeAudience = async () => {
    const process = audienceProcess;
    audienceProcess = null;
    if (isProcessRunning(process)) await terminateProcessTree(process);
    if (audienceProfileDir) {
      await rm(audienceProfileDir, { recursive: true, force: true }).catch(() => {});
      audienceProfileDir = "";
    }
    return { stopped: Boolean(process) };
  };

  const audience = options.presenterView
    ? {
        isRunning: () => isProcessRunning(audienceProcess),
        open: async () => {
          if (isProcessRunning(audienceProcess)) return { alreadyRunning: true };
          await closeAudience();
          const browser = findChromiumBrowser();
          if (!browser) {
            throw new MarkdStageError(
              "presenter_browser_not_found",
              "Opening the audience view requires Microsoft Edge, Google Chrome, or Chromium.",
            );
          }
          audienceProfileDir = await mkdtemp(join(tmpdir(), "markdstage-audience-window-"));
          audienceProcess = spawn(
            browser,
            buildPresenterBrowserArgs({
              profileDir: audienceProfileDir,
              presenterUrl: audienceUrl,
            }),
            { windowsHide: false, stdio: "ignore" },
          );
          await new Promise((ready, reject) => {
            audienceProcess.once("spawn", ready);
            audienceProcess.once("error", reject);
          });
          return { alreadyRunning: false };
        },
        close: closeAudience,
      }
    : null;

  try {
    return await withDeckServer({ ...options, presenter: audience }, async (session, server) => {
      if (audience) {
        const url = new URL(server.url);
        url.searchParams.set("present", "1");
        audienceUrl = url.href;
      }
      const watcher = options.watch
        ? await createWatcher(session, server, {
            onStatus: (message, isError) => io.status(message, isError),
          })
        : null;

      let browserProcess = null;
      let profileDir = "";
      const browserUrl = new URL(server.url);
      if (options.presenterView) browserUrl.searchParams.set("presenter", "1");
      try {
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
            buildPresenterBrowserArgs({ profileDir, presenterUrl: browserUrl.href }),
            { windowsHide: false, stdio: "ignore" },
          );
          await new Promise((ready, reject) => {
            browserProcess.once("spawn", ready);
            browserProcess.once("error", reject);
          });
        }

        io.print(`MarkdStage is presenting ${session.sourceName || session.file}`);
        io.print(`  slides:    ${session.slides.length}`);
        io.print(`  theme:     ${session.theme}`);
        io.print(`  workspace: ${resolve(session.workspaceRoot)}`);
        io.print(`  url:       ${browserUrl.href}`);
        if (options.watch) {
          io.print("  watching:  on (live reload and Architecture editing are enabled)");
        }
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

        return {
          ok: true,
          url: browserUrl.href,
          total: session.slides.length,
          theme: session.theme,
        };
      } finally {
        watcher?.close();
        await closeAudience();
        if (isProcessRunning(browserProcess)) await terminateProcessTree(browserProcess);
        if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  } finally {
    await closeAudience();
  }
}
