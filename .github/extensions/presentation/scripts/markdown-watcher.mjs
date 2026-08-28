import { watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export const MARKDOWN_WATCH_DEBOUNCE_MS = 120;

function sameFilename(left, right) {
  if (process.platform === "win32") {
    return left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US");
  }
  return left === right;
}

export function createMarkdownWatcher({
  path,
  onChange,
  onError,
  debounceMs = MARKDOWN_WATCH_DEBOUNCE_MS,
  watchFactory = watch,
} = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");
  if (typeof onChange !== "function") throw new TypeError("onChange is required");

  const target = resolve(path);
  const targetName = basename(target);
  let timer = null;
  let running = false;
  let queued = false;
  let closed = false;

  const reportError = (error) => {
    if (!closed && typeof onError === "function") onError(error);
  };

  const run = async () => {
    timer = null;
    if (closed) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await onChange();
    } catch (error) {
      reportError(error);
    } finally {
      running = false;
      if (queued && !closed) {
        queued = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, Math.max(0, debounceMs));
  };

  const watcher = watchFactory(dirname(target), { persistent: false }, (_eventType, filename) => {
    const changedName = filename == null ? "" : String(filename);
    if (changedName && !sameFilename(changedName, targetName)) return;
    schedule();
  });
  watcher.on("error", reportError);

  return {
    refresh: schedule,
    close() {
      if (closed) return;
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      watcher.close();
    },
  };
}
