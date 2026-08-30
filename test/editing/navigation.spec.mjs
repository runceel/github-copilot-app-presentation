import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const SLIDES = [
  "---\nlayout: title\n---\n\n# First slide",
  "## Second slide\n\nInteractive content must not advance.",
  "## Third slide",
];

async function openPresenter(page) {
  const harness = await startHarness({ slides: SLIDES });
  await page.goto(`${harness.url}/?present=1`, { waitUntil: "load" });
  await waitForSlideReady(page);
  return harness;
}

test.describe("presenter navigation", () => {
  test("left click and right click on slide whitespace navigate", async ({ page }) => {
    const harness = await openPresenter(page);
    try {
      await page.locator(".deck").click({ position: { x: 12, y: 120 } });
      await expect.poll(() => harness.index).toBe(1);
      await waitForSlideReady(page);

      await page.locator(".deck").click({
        button: "right",
        position: { x: 12, y: 120 },
      });
      await expect.poll(() => harness.index).toBe(0);
    } finally {
      await harness.close();
    }
  });

  test("touch tap on slide whitespace advances", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    const harness = await openPresenter(page);
    try {
      await page.touchscreen.tap(12, 120);
      await expect.poll(() => harness.index).toBe(1);
    } finally {
      await harness.close();
      await context.close();
    }
  });

  test("slide content keeps its own click behavior", async ({ page }) => {
    const harness = await openPresenter(page);
    try {
      await page.locator(".deck").click({ position: { x: 12, y: 120 } });
      await expect.poll(() => harness.index).toBe(1);
      await waitForSlideReady(page);

      await page.locator(".body > p").click();
      await page.waitForTimeout(100);
      expect(harness.index).toBe(1);
    } finally {
      await harness.close();
    }
  });
});
