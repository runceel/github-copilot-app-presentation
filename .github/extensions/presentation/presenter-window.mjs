export const PRESENTER_WINDOW_WIDTH = 1280;
export const PRESENTER_WINDOW_HEIGHT = 720;

export function buildPresenterBrowserArgs({ profileDir, presenterUrl }) {
  return [
    "--disable-background-mode",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-session-crashed-bubble",
    "--no-default-browser-check",
    "--no-first-run",
    `--window-size=${PRESENTER_WINDOW_WIDTH},${PRESENTER_WINDOW_HEIGHT}`,
    `--user-data-dir=${profileDir}`,
    `--app=${presenterUrl}`,
  ];
}
