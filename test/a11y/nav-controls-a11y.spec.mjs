import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { clickMoreControl } from "../utils/nav.mjs";
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

test("the multiple-Architecture picker has no WCAG A/AA violations", async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), "markdstage-a11y-architecture-picker-"));
  const diagram = (title, id) => JSON.stringify({
    version: 1,
    title,
    canvas: { width: 800, height: 450 },
    elements: [
      { type: "node", id, x: 80, y: 80, width: 260, height: 140, text: title },
    ],
  }, null, 2);
  await writeFile(
    join(root, "multiple.md"),
    `# Multiple\n\n\`\`\`architecture\n${diagram("Frontend", "web")}\n\`\`\`\n\n\`\`\`architecture\n${diagram("Data", "db")}\n\`\`\`\n`,
    "utf8",
  );
  const harness = await startHarness({ slides: ["# Start"], markdownRoot: root });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await waitForSlideReady(page);
    await clickMoreControl(page, "#navImport");
    await page.locator("#importList .overview-link", { hasText: "multiple.md" }).click();
    await waitForSlideReady(page);
    await clickMoreControl(page, "#navEdit");
    await expect(page.locator("#architecturePicker")).toBeVisible();

    const result = await new AxeBuilder({ page })
      .include("#architecturePicker")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  } finally {
    await harness.close();
    await rm(root, { recursive: true, force: true });
  }
});
