import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

test("the compact controls and expanded disclosure have no WCAG A/AA violations", async ({
  page,
}) => {
  const harness = await startHarness({ slides: ["# Accessible controls", "## Next"] });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);

    const more = page.getByRole("button", { name: "More controls", exact: true });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "More slide controls" })).toBeVisible();

    const result = await new AxeBuilder({ page })
      .include("#nav")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
  } finally {
    await harness.close();
  }
});
