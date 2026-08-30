import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const SLIDES = [
  "---\nlayout: title\n---\n\n# First slide\n\n<!-- Open with **context**. -->",
  "## Second slide\n\n<!--\nExplain the live demo.\n-->",
  "## Third slide",
];

test("presenter view provides presentation controls and returns to the slide", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    await page.getByRole("button", { name: "Presenter view" }).click();
    await expect(page.locator("#presenterView")).toBeVisible();
    await expect(page.locator("#presenterCurrent")).toHaveAttribute(
      "src",
      "./?preview=1&offset=0&navigate=1",
    );
    await expect(page.locator("#presenterNext")).toHaveAttribute("src", "./?preview=1&offset=1");
    await expect(page.locator("#presenterNotes strong")).toHaveText("context");

    await page.locator("#presenterNextButton").click();
    await expect.poll(() => harness.index).toBe(1);
    await expect(page.locator("#presenterCounter")).toHaveText("2 / 3");
    await expect(page.locator("#presenterNotes")).toHaveText("Explain the live demo.");
    await expect(
      page.frameLocator("#presenterNext").getByRole("heading", { name: "Third slide" }),
    ).toBeVisible();

    await page.locator("#presenterListButton").click();
    await page.getByRole("button", { name: "3 Third slide" }).click();
    await expect.poll(() => harness.index).toBe(2);
    await expect(page.locator("#presenterNotesEmpty")).toBeVisible();

    await page.locator("#presenterToggleButton").click();
    await expect.poll(() => harness.presenterRunning).toBe(true);
    await expect(page.locator("#presenterToggleButton")).toHaveText("End presentation");
    await page.locator("#presenterToggleButton").click();
    await expect.poll(() => harness.presenterRunning).toBe(false);
    await expect(page.locator("#presenterToggleButton")).toHaveText("Start presentation");

    await page.getByRole("button", { name: "Return to slide view" }).click();
    await expect(page.locator("#presenterView")).toBeHidden();
    await expect(page.locator("#stage")).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("speaker notes do not leak into slide overview titles", async ({ page }) => {
  const harness = await startHarness({
    slides: ["<!-- Internal talking point -->\nPublic body line"],
  });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    await page.getByRole("button", { name: "Slide list" }).click();
    await expect(page.getByRole("button", { name: "1 Public body line" })).toBeVisible();
    await expect(page.getByText("Internal talking point")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
