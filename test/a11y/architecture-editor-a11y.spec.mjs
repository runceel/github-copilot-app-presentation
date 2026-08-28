import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { startArchitectureEditorHarness } from "../harness/architecture-editor.mjs";

const SOURCE = `${JSON.stringify(
  {
    version: 1,
    canvas: { width: 1200, height: 700 },
    title: "Architecture editor accessibility",
    elements: [
      {
        type: "node",
        id: "client",
        x: 80,
        y: 120,
        width: 240,
        height: 120,
        text: "Client",
      },
      {
        type: "node",
        id: "api",
        x: 560,
        y: 120,
        width: 240,
        height: 120,
        text: "API",
      },
      {
        type: "connector",
        from: "client",
        to: "api",
        routing: "orthogonal",
        arrow: true,
      },
    ],
  },
  null,
  2,
)}\n`;

const GROUP_SOURCE = `${JSON.stringify(
  {
    version: 1,
    canvas: { width: 1200, height: 700 },
    elements: [
      {
        type: "group",
        id: "zone",
        x: 100,
        y: 100,
        width: 800,
        height: 400,
        layout: "row",
        children: [{ type: "node", id: "api", text: "API" }],
      },
    ],
  },
  null,
  2,
)}\n`;
const ASSET_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

test("専用 Architecture Editor に WCAG 違反がない", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({ source: SOURCE });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await expect(page.locator(".tree-item")).toHaveCount(3);

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("右クリックメニューを開いた状態でも WCAG 違反がない", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({ source: SOURCE });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await page.locator('[data-ref="client"].tree-item').click({ button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("レイアウトサブメニューを開いた状態でも WCAG 違反がない", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({ source: GROUP_SOURCE });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await page.getByRole("menuitem", { name: "レイアウト", exact: true }).hover();
    await expect(page.getByRole("menu", { name: "zone のレイアウト" })).toBeVisible();

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("画像 picker は keyboard 選択と focus 復帰を行い WCAG 違反がない", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({
    source: SOURCE,
    assets: { "assets/accessible.svg": ASSET_SVG },
  });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    const trigger = page.getByRole("button", { name: "画像", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "画像を追加" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#assetSearch")).toBeFocused();

    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);

    const option = dialog.getByRole("option", { name: "assets/accessible.svg" });
    await option.focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "選択", exact: true }).press("Enter");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('[data-ref="accessible"].tree-item')).toBeVisible();
  } finally {
    await harness.close();
  }
});
