// Browser regression tests for Markdown import through More controls.
//
// Verify four points:
//   1. The button opens a list of workspace Markdown files
//   2. Selecting a file makes the Extension split and replace the deck without involving an agent
//   3. Filtering and Escape work
//   4. Presenter mode hides the entry point to prevent accidental activation during a presentation
//
// markdown-deck unit tests verify splitting itself. This suite verifies only end-to-end UI wiring.

import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { clickMoreControl, openMoreControls } from "../utils/nav.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";
import { findArchitectureBlocks } from "../../.github/extensions/markdstage/scripts/markdown-blocks.mjs";

const FIXTURES = join(REPO_ROOT, "test", "fixtures");
const SLIDES = splitFixtureDeck(readFileSync(join(FIXTURES, "standard-title.md"), "utf8"));
const EDITABLE_SOURCE = readFileSync(join(FIXTURES, "architecture-editing.md"), "utf8");

/** Start an import-capable harness and wait for rendering to finish. */
async function openCanvas(page, query = "") {
  const harness = await startHarness({ slides: SLIDES, markdownRoot: FIXTURES });
  await page.goto(`${harness.url}/${query}`, { waitUntil: "load" });
  await waitForSlideReady(page);
  return harness;
}

test.describe("Markdown import", () => {
  test("opens the list from the button and uses the selected Markdown as the deck", async ({ page }) => {
    const harness = await openCanvas(page);
    try {
      await clickMoreControl(page, "#navImport");
      await expect(page.locator("#importPicker")).toBeVisible();
      await expect(page.locator("#importModeSnapshot")).toBeChecked();

      const item = page.locator("#importList .overview-link", {
        hasText: "import-source.md",
      });
      await expect(item).toHaveCount(1);
      await expect(item.locator(".import-filename")).toHaveText("import-source.md");
      await expect(item.locator(".import-parent")).toHaveCount(0);
      await expect(item).toHaveAttribute("title", "import-source.md");
      await expect(item).toHaveAccessibleName("import-source.md");
      await item.click();

      await expect(page.locator("#importPicker")).toBeHidden();
      await expect.poll(() => harness.sourceName).toBe("import-source.md");
      expect(harness.sourceMode).toBe("snapshot");
      // Title slide plus three regular slides. The harness does not append a back cover.
      expect(harness.total).toBe(4);

      await waitForSlideReady(page);
      await expect(page.locator(".deck")).toContainText("Import test");
    } finally {
      await harness.close();
    }
  });

  test("filters the list and closes it with Escape", async ({ page }) => {
    const harness = await openCanvas(page);
    try {
      await clickMoreControl(page, "#navImport");
      const items = page.locator("#importList .overview-link");
      await expect.poll(() => items.count()).toBeGreaterThan(1);

      await page.locator("#importFilter").fill("import-source");
      await expect(items).toHaveCount(1);

      await page.locator("#importFilter").press("Escape");
      await expect(page.locator("#importPicker")).toBeHidden();
    } finally {
      await harness.close();
    }
  });

  test("prefers assets adjacent to Markdown and falls back to workspace assets", async ({
    page,
  }) => {
    const harness = await openCanvas(page);
    try {
      await clickMoreControl(page, "#navImport");
      const item = page
        .locator("#importList")
        .getByRole("button", { name: "asset-scope/deck.md", exact: true });
      await expect(item.locator(".import-filename")).toHaveText("deck.md");
      await expect(item.locator(".import-parent")).toHaveText("asset-scope");
      await expect(item).toHaveAttribute("title", "asset-scope/deck.md");
      await expect(item).toHaveAccessibleName("asset-scope/deck.md");
      await expect(item).toHaveCSS("flex-direction", "column");
      await expect(item.locator(".import-parent")).toHaveCSS("text-overflow", "ellipsis");
      await item.click();
      await expect.poll(() => harness.sourceName).toBe("asset-scope/deck.md");

      const local = await page.request.get(`${harness.url}/assets/sample.svg`);
      expect(local.ok()).toBe(true);
      expect(await local.text()).toContain('data-source="deck-local"');

      const fallback = await page.request.get(
        `${harness.url}/assets/architecture-image-sample.svg`,
      );
      expect(fallback.ok()).toBe(true);
      expect(await fallback.text()).toContain("<svg");
    } finally {
      await harness.close();
    }
  });

  test("hides the import button in presenter mode", async ({ page }) => {
    const harness = await openCanvas(page, "?present=1");
    try {
      await openMoreControls(page);
      await expect(page.locator("#navImport")).toBeHidden();
    } finally {
      await harness.close();
    }
  });

  test("tracks saves in live mode and can switch to a fixed snapshot", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-live-"));
    const sourcePath = join(root, "live.md");
    const initial = "# First\n\n---\n\n## Current\n\nBefore\n";
    await writeFile(sourcePath, initial, "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await expect(page.locator("#navSourceMode")).toHaveAttribute("hidden", "");
      await clickMoreControl(page, "#navImport");
      await page.locator('input[name="importMode"][value="live"]').check();
      await page.locator("#importList .overview-link", { hasText: "live.md" }).click();
      await expect.poll(() => harness.sourceMode).toBe("live");
      await openMoreControls(page);
      await expect(page.locator("#navSourceMode")).toBeVisible();
      await expect(page.locator("#navSourceMode")).toHaveAttribute("data-state", "active");

      await page.locator("#navNext").click();
      await expect.poll(() => harness.index).toBe(1);
      const updated = initial.replace("Before", "After save");
      await writeFile(sourcePath, updated, "utf8");
      await expect.poll(() => harness.slideAt(1)).toContain("After save");
      await expect.poll(() => harness.index).toBe(1);
      await expect(page.locator(".deck")).toContainText("After save");

      await writeFile(sourcePath, "", "utf8");
      await expect.poll(() => harness.sourceWatchStatus).toBe("error");
      await expect(page.locator(".deck")).toContainText("After save");
      await expect(page.locator("#navSourceMode")).toHaveAttribute("data-state", "error");

      const recovered = updated.replace("After save", "Recovered");
      await writeFile(sourcePath, recovered, "utf8");
      await expect.poll(() => harness.sourceWatchStatus).toBe("watching");
      await expect(page.locator(".deck")).toContainText("Recovered");

      await clickMoreControl(page, "#navSourceMode");
      await expect.poll(() => harness.sourceMode).toBe("snapshot");
      await expect(page.locator("#navSourceMode")).not.toHaveAttribute("data-state", "active");
      await writeFile(sourcePath, recovered.replace("Recovered", "Must stay hidden"), "utf8");
      await page.waitForTimeout(300);
      await expect(page.locator(".deck")).toContainText("Recovered");
      await expect(page.locator(".deck")).not.toContainText("Must stay hidden");
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("loads the latest content when switching from snapshot to live mode", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-switch-"));
    const sourcePath = join(root, "switch.md");
    await writeFile(sourcePath, "# Snapshot\n", "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await clickMoreControl(page, "#navImport");
      await page.locator("#importList .overview-link", { hasText: "switch.md" }).click();
      await expect(page.locator(".deck")).toContainText("Snapshot");
      await writeFile(sourcePath, "# Latest\n", "utf8");
      await page.waitForTimeout(300);
      await expect(page.locator(".deck")).toContainText("Snapshot");

      await clickMoreControl(page, "#navSourceMode");
      await expect.poll(() => harness.sourceMode).toBe("live");
      await expect(page.locator(".deck")).toContainText("Latest");
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("recognizes an empty architecture fence as an empty diagram", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-empty-architecture-"));
    await writeFile(join(root, "empty.md"), "# Empty\n\n```architecture\n```\n", "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await clickMoreControl(page, "#navImport");
      await page.locator("#importList .overview-link", { hasText: "empty.md" }).click();
      await waitForSlideReady(page);
      await expect(page.locator(".architecture-diagram")).toHaveCount(1);
      await expect(page.locator(".architecture-error")).toHaveCount(0);

      await clickMoreControl(page, "#navEdit");
      await expect.poll(() => harness.architectureEditorOpens).toEqual([{ index: 0, block: 0 }]);
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(0);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("opens a diagram picker before the dedicated designer when a slide has multiple diagrams", async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-multiple-architecture-"));
    const diagram = (title, id) => JSON.stringify({
      version: 1,
      title,
      canvas: { width: 800, height: 450 },
      elements: [
        { type: "node", id, text: title, x: 80, y: 80, width: 260, height: 140 },
      ],
    }, null, 2);
    await writeFile(
      join(root, "multiple.md"),
      `# Multiple\n\n\`\`\`architecture\n${diagram("Frontend", "web")}\n\`\`\`\n\n\`\`\`architecture\n${diagram("Data tier", "db")}\n\`\`\`\n\n---\n\n# After\n`,
      "utf8",
    );
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await clickMoreControl(page, "#navImport");
      await page.locator("#importList .overview-link", { hasText: "multiple.md" }).click();
      await waitForSlideReady(page);

      await clickMoreControl(page, "#navEdit");
      const picker = page.locator("#architecturePicker");
      await expect(picker).toBeVisible();
      await expect(picker.getByRole("button", { name: /Frontend/ })).toBeVisible();
      await page.keyboard.press("PageDown");
      expect(harness.index).toBe(0);
      await page.keyboard.press("ArrowDown");
      await expect(picker.getByRole("button", { name: /Data tier/ })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect.poll(() => harness.architectureEditorOpens).toEqual([{ index: 0, block: 1 }]);
      await expect(picker).toBeHidden();
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reports when the current source-backed slide has no Architecture diagram", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-no-architecture-"));
    await writeFile(join(root, "plain.md"), "# Plain slide\n\nNo diagram here.\n", "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await clickMoreControl(page, "#navImport");
      await page.locator("#importList .overview-link", { hasText: "plain.md" }).click();
      await waitForSlideReady(page);

      await clickMoreControl(page, "#navEdit");
      await expect(page.locator("#sourceStatus")).toContainText(
        "current slide has no Architecture diagram",
      );
      expect(harness.architectureEditorOpens).toHaveLength(0);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("the lightweight edit action still saves imported diagram edits to the source file", async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-edit-"));
    const sourcePath = join(root, "editable.md");
    await writeFile(sourcePath, EDITABLE_SOURCE, "utf8");
    const harness = await startHarness({
      slides: SLIDES,
      markdownRoot: root,
      architectureEdit: true,
    });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await clickMoreControl(page, "#navImport");
      await page.locator("#importList .overview-link", { hasText: "editable.md" }).click();
      await waitForSlideReady(page);

      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      await page.locator('[data-architecture-id="client"]').focus();
      await page.keyboard.press("ArrowDown");
      await page.locator('[data-architecture-id="client"]').focus();
      await page.keyboard.press("ArrowDown");
      const saveState = page.locator('[data-architecture-save-state="saved"]');
      await expect(saveState).toBeVisible();
      await expect(saveState).toContainText("Saved to the source Markdown.");

      const saved = await readFile(sourcePath, "utf8");
      const savedDsl = JSON.parse(findArchitectureBlocks(saved)[0].body);
      expect(savedDsl.elements.find((element) => element.id === "client").y).toBe(400);

      const savedY = await page
        .locator('[data-architecture-id="client"]')
        .evaluate((element) => Math.round(element.getBBox().y));
      expect(savedY).toBe(400);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects saves after an external source change without overwriting the file", async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-conflict-"));
    const sourcePath = join(root, "editable.md");
    await writeFile(sourcePath, EDITABLE_SOURCE, "utf8");
    const harness = await startHarness({
      slides: SLIDES,
      markdownRoot: root,
      architectureEdit: true,
    });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await clickMoreControl(page, "#navImport");
      await page.locator("#importList .overview-link", { hasText: "editable.md" }).click();
      await waitForSlideReady(page);
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);

      const external = EDITABLE_SOURCE.replace('"y": 380', '"y": 777');
      await writeFile(sourcePath, external, "utf8");
      await page.locator('[data-architecture-id="client"]').focus();
      await page.keyboard.press("ArrowDown");

      const failure = page.locator('[data-architecture-save-state="failed"]');
      await expect(failure).toBeVisible();
      await expect(failure).toContainText("modified externally");
      const unchanged = await readFile(sourcePath, "utf8");
      expect(JSON.parse(findArchitectureBlocks(unchanged)[0].body).elements[0].y).toBe(777);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
