import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPresenterBrowserArgs,
  PRESENTER_WINDOW_HEIGHT,
  PRESENTER_WINDOW_WIDTH,
} from "../presenter-window.mjs";

test("presenter opens as a movable window instead of fullscreen", () => {
  const args = buildPresenterBrowserArgs({
    profileDir: "C:\\Temp\\presentation-profile",
    presenterUrl: "http://127.0.0.1:1234/?present=1",
  });

  assert.ok(
    args.includes(`--window-size=${PRESENTER_WINDOW_WIDTH},${PRESENTER_WINDOW_HEIGHT}`),
  );
  assert.ok(args.includes("--user-data-dir=C:\\Temp\\presentation-profile"));
  assert.ok(args.includes("--app=http://127.0.0.1:1234/?present=1"));
  assert.ok(!args.includes("--start-fullscreen"));
  assert.ok(!args.includes("--start-maximized"));
});
