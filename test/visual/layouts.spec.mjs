import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { DETERMINISTIC_CSS, waitForSlideReady } from "../utils/ready.mjs";

const THEMES = ["dark", "light", "microsoft"];
const FIXTURE = join(REPO_ROOT, "test", "fixtures", "layout-visual.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));
const SLIDE_NAMES = ["01-section-h1", "02-section-h2-with-metadata"];

test("セクション区切りフィクスチャとスナップショット名が一致する", () => {
  expect(SLIDES).toHaveLength(SLIDE_NAMES.length);
});

for (const theme of THEMES) {
  test.describe(`section layout: ${theme}`, () => {
    SLIDE_NAMES.forEach((name, index) => {
      test(name, async ({ page }) => {
        const harness = await startHarness({ slides: SLIDES, theme, index });
        const consoleErrors = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        try {
          await page.goto(`${harness.url}/`, { waitUntil: "load" });
          await waitForSlideReady(page);
          await page.addStyleTag({ content: DETERMINISTIC_CSS });

          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(page.locator("#stage > .deck.section-slide")).toHaveCount(1);
          await expect(page.locator(".section-slide h1")).toHaveCount(index === 0 ? 1 : 0);
          await expect(page.locator(".section-slide h2")).toHaveCount(index === 1 ? 1 : 0);
          await expect(page.locator(".section-slide .kicker")).toHaveCount(index === 1 ? 1 : 0);
          await expect(page.locator(".section-slide > footer")).toHaveCount(index === 1 ? 1 : 0);
          await expect(
            page.locator(
              ".section-slide img, .section-slide .theme-cover-logo, .section-slide .theme-backcover-logo",
            ),
          ).toHaveCount(0);

          const layout = await page.locator(".section-slide").evaluate((deck) => {
            const style = getComputedStyle(deck);
            return {
              justifyContent: style.justifyContent,
              textAlign: style.textAlign,
              backgroundImage: style.backgroundImage,
            };
          });
          expect(layout.justifyContent).toBe("center");
          expect(layout.textAlign).toBe("left");
          expect(layout.backgroundImage).not.toBe("none");

          await expect(page).toHaveScreenshot(`${theme}-${name}.png`);
          expect(consoleErrors, "renderer がコンソールエラーを出していない").toEqual([]);
        } finally {
          await harness.close();
        }
      });
    });
  });
}
