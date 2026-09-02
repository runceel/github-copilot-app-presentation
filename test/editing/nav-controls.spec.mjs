import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { openMoreControls } from "../utils/nav.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const SLIDES = ["# First", "## Second"];

test("keeps frequent navigation visible and groups the remaining controls", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    const directButtons = page.locator("#nav > .nav-main > button, #nav > .nav-tools > button");
    await expect(directButtons).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Previous slide" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next slide" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Slide list" })).toBeVisible();

    const more = page.getByRole("button", { name: "More controls", exact: true });
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#navMorePanel")).toBeHidden();

    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("group", { name: "More slide controls" })).toBeVisible();
    await expect(page.getByText("Present", { exact: true })).toBeVisible();
    await expect(page.getByText("View & edit", { exact: true })).toBeVisible();
    await expect(page.getByText("File", { exact: true })).toBeVisible();
    await expect(page.locator("#navPresent")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator("#navMorePanel")).toBeHidden();
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "false");

    await more.click();
    await page.mouse.click(8, 8);
    await expect(page.locator("#navMorePanel")).toBeHidden();
  } finally {
    await harness.close();
  }
});

test("surfaces nested active state on the More controls button", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    await openMoreControls(page);
    await page.locator("#navFixedPreview").click();
    await expect(page.locator("#navMorePanel")).toBeHidden();
    await expect(page.locator("#navMore")).toHaveAttribute("data-state", "active");
    await expect(page.locator("#navMore")).toHaveAccessibleName(
      "More controls (an option is active)",
    );

    await openMoreControls(page);
    await page.locator("#navFixedPreview").click();
    await expect(page.locator("#navMore")).not.toHaveAttribute("data-state", "active");
  } finally {
    await harness.close();
  }
});

test("keeps Open Markdown as the only direct action for an empty deck", async ({ page }) => {
  const harness = await startHarness({ slides: [] });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    await expect(page.locator("#nav")).toHaveClass(/nav-empty/);
    await expect(page.locator(".nav-main")).toBeHidden();
    await expect(page.locator("#navMore")).toBeHidden();
    await expect(page.locator("#navMorePanel")).toBeVisible();
    await expect(page.locator("#navImport")).toBeVisible();
    await expect(page.locator("#navMorePanel .nav-more-item:visible")).toHaveCount(1);
  } finally {
    await harness.close();
  }
});
