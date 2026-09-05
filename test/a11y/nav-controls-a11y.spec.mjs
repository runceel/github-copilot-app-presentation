import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { clickMoreControl } from "../utils/nav.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

for (const theme of ["dark", "light", "microsoft"]) {
  test(`export notifications are accessible without stealing focus (${theme})`, async ({ page }) => {
    const harness = await startHarness({ slides: ["# Export feedback", "## Next"], theme });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      let exportRoute;
      await page.route("**/export", (route) => { exportRoute = route; });
      await clickMoreControl(page, "#navExport");
      await page.locator("#navMore").focus();
      const notification = page.getByRole("region", { name: "Export notification" });
      await expect(notification).toHaveAttribute("data-state", "pending");
      const auditNotification = async () => {
        const result = await new AxeBuilder({ page })
          .include("#exportNotification")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
      };
      await auditNotification();
      await expect.poll(() => exportRoute).toBeTruthy();
      await exportRoute.fulfill({ json: { ok: true, path: "D:\\Exports\\slides.pdf" } });
      await expect(notification).toHaveAttribute("data-state", "success");
      await expect(page.locator("#navMore")).toBeFocused();
      await expect(page.locator("#exportStatus")).toHaveAttribute("role", "status");
      await page.locator("#exportNotificationPath").focus();
      await auditNotification();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Dismiss export notification" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(notification).toBeHidden();
      await expect(page.locator("#navMore")).toBeFocused();

      await page.route("**/export", (route) =>
        route.fulfill({ status: 500, json: { ok: false, message: "Disk is full." } }),
      );
      await clickMoreControl(page, "#navExport");
      await expect(notification).toHaveAttribute("data-state", "error");
      await expect(page.locator("#exportErrorStatus")).toHaveAttribute("role", "alert");
      await expect(page.locator("#exportErrorStatus")).toContainText("Disk is full.");
      await auditNotification();
    } finally {
      await harness.close();
    }
  });
}

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
