// Playwright configuration for test infrastructure; it is not distributed with the Extension.
//
// Visual regression snapshots are stored per platform. Font rasterization differs by OS, so
// Windows baselines cannot be shared with Linux CI. CI is fixed to ubuntu-24.04 and uses Linux
// baselines generated with the matching official Playwright container.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  // Rendering is deterministic on each platform. CI uses one worker to avoid concurrency noise.
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  // Example: test/visual/__screenshots__/visual/linux/architecture-dark.png
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{platform}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // Visual comparisons intentionally allow zero changed pixels.
      //
      // The former `maxDiffPixelRatio: 0.002` allowed about 1,843 changed pixels at 1280x720.
      // That threshold missed real regressions: changing one footer digit moved only 16-21 pixels,
      // shifting an arrow by about 0.7px moved 1-21 pixels, and replacing an icon moved 123 pixels.
      // Repeated renders on the same platform produce a measured difference of 0 pixels.
      //
      // When `maxDiffPixels` and `maxDiffPixelRatio` are both set, Playwright applies the stricter
      // limit. Keeping only a zero ratio avoids a misleading dead allowance.
      //
      // Platform-specific baselines and the pinned Playwright container make zero tolerance stable
      // across local Linux container runs and GitHub-hosted CI hardware.
      maxDiffPixelRatio: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    // Match the 16:9 slide viewport and pin deviceScaleFactor to avoid DPI-dependent output.
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // `slides.css` disables the deck fade animation when reduced motion is requested.
    reducedMotion: "reduce",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "visual",
      testDir: "test/visual",
      testMatch: /.*\.spec\.mjs/,
    },
    {
      name: "pdf",
      testDir: "test/pdf",
      testMatch: /.*\.spec\.mjs/,
    },
    // Behavioral editing tests do not use screenshot baselines.
    {
      name: "editing",
      testDir: "test/editing",
      testMatch: /.*\.spec\.mjs/,
    },
    // Accessibility and semantic equivalence tests use axe-core and the Chromium accessibility tree.
    {
      name: "a11y",
      testDir: "test/a11y",
      testMatch: /.*\.spec\.mjs/,
    },
    // Performance tests measure maximum-size diagrams and scaling behavior in isolation.
    {
      name: "perf",
      testDir: "test/perf",
      testMatch: /.*\.spec\.mjs/,
      workers: 1,
      fullyParallel: false,
    },
  ],
});
