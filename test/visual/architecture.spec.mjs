// Visual regression: screenshot comparisons for three themes and representative architecture diagrams.
//
// Preserve determinism:
//   - Wait for the renderer's ready signal (removal of mermaid-loading), not a fixed sleep
//   - Pin viewport / deviceScaleFactor (playwright.config.mjs)
//   - Disable animation and control UI with reducedMotion: 'reduce' plus CSS
//   - Start a harness for each theme/slide combination without carrying state forward
//
// Font rasterization differs by OS, so snapshotPathTemplate in playwright.config.mjs stores a
// separate baseline for each platform.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { DETERMINISTIC_CSS, waitForSlideReady } from "../utils/ready.mjs";

const THEMES = ["dark", "light", "microsoft"];

const FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-visual.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));

// Snapshot names map one-to-one to the fixture slides.
const SLIDE_NAMES = [
  "01-cover",
  "02-layout-groups",
  "03-shapes-routing",
  "04-dense-routing",
  "05-backcover",
];

// Keep the icon catalog in a separate deck. Inserting it into the existing deck would change the
// footer `page / total` and force unrelated baseline updates.
const ICON_FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-icons.md");
const ICON_SLIDES = splitFixtureDeck(readFileSync(ICON_FIXTURE, "utf8"));
const ICON_SLIDE_NAMES = ["01-icon-catalog"];
const IMAGE_FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-images.md");
const IMAGE_SLIDES = splitFixtureDeck(readFileSync(IMAGE_FIXTURE, "utf8"));
const IMAGE_SLIDE_NAMES = ["01-image-fit-modes"];

test("fixture slide counts match snapshot names", () => {
  expect(SLIDES).toHaveLength(SLIDE_NAMES.length);
  expect(ICON_SLIDES).toHaveLength(ICON_SLIDE_NAMES.length);
  expect(IMAGE_SLIDES).toHaveLength(IMAGE_SLIDE_NAMES.length);
});

/** Register theme-by-slide screenshot comparisons for one deck. */
function registerDeck(slides, names, prefix = "") {
  for (const theme of THEMES) {
    test.describe(`theme: ${theme}${prefix ? ` (${prefix})` : ""}`, () => {
      names.forEach((name, index) => {
        test(name, async ({ page }) => {
          const harness = await startHarness({ slides, theme, index });
          try {
            const consoleErrors = [];
            page.on("console", (message) => {
              if (message.type() === "error") consoleErrors.push(message.text());
            });

            await page.goto(`${harness.url}/`, { waitUntil: "load" });
            await waitForSlideReady(page);
            await page.addStyleTag({ content: DETERMINISTIC_CSS });

            // First verify the intended theme and slide to avoid declaring a mismatched case equal.
            await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
            await expect(page.locator("#stage .deck")).toHaveCount(1);
            expect(await page.locator(".architecture-error").count()).toBe(0);

            await expect(page).toHaveScreenshot(`${theme}-${name}.png`);

            expect(consoleErrors, "renderer produced no console errors").toEqual([]);
          } finally {
            await harness.close();
          }
        });
      });
    });
  }
}

// Screenshot comparison settings are centralized in playwright.config.mjs
// (maxDiffPixelRatio: 0 means 0px tolerance). Do not override them per deck; otherwise a new deck
// could silently return to permissive defaults. See the playwright.config.mjs comments for the
// measured rationale behind 0px tolerance.
registerDeck(SLIDES, SLIDE_NAMES);
registerDeck(ICON_SLIDES, ICON_SLIDE_NAMES, "icons");
registerDeck(IMAGE_SLIDES, IMAGE_SLIDE_NAMES, "images");
