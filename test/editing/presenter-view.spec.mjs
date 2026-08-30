import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const SLIDES = [
  "---\nlayout: title\n---\n\n# First slide",
  "## Second slide",
  "## Third slide",
];

test("presenter view provides presentation controls and returns to the slide", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    await page.getByRole("button", { name: "発表者ビュー" }).click();
    await expect(page.locator("#presenterView")).toBeVisible();
    await expect(page.locator("#presenterCurrent")).toHaveAttribute(
      "src",
      "./?preview=1&offset=0&navigate=1",
    );
    await expect(page.locator("#presenterNext")).toHaveAttribute("src", "./?preview=1&offset=1");

    await page.locator("#presenterNextButton").click();
    await expect.poll(() => harness.index).toBe(1);
    await expect(page.locator("#presenterCounter")).toHaveText("2 / 3");
    await expect(
      page.frameLocator("#presenterNext").getByRole("heading", { name: "Third slide" }),
    ).toBeVisible();

    await page.locator("#presenterListButton").click();
    await page.getByRole("button", { name: "3 Third slide" }).click();
    await expect.poll(() => harness.index).toBe(2);

    await page.locator("#presenterToggleButton").click();
    await expect.poll(() => harness.presenterRunning).toBe(true);
    await expect(page.locator("#presenterToggleButton")).toHaveText("プレゼンを終了");
    await page.locator("#presenterToggleButton").click();
    await expect.poll(() => harness.presenterRunning).toBe(false);
    await expect(page.locator("#presenterToggleButton")).toHaveText("プレゼンを開始");

    await page.getByRole("button", { name: "スライド表示に戻る" }).click();
    await expect(page.locator("#presenterView")).toBeHidden();
    await expect(page.locator("#stage")).toBeVisible();
  } finally {
    await harness.close();
  }
});
