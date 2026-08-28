// Markdown インポート（canvas の 📂 ボタン）のブラウザ回帰。
//
// 検証したいのは 4 点。
//   1. ボタンから一覧が開き、workspace の Markdown が並ぶ
//   2. 選ぶと拡張機能側で分割され、デッキが差し替わる（agent を経由しない）
//   3. 絞り込みと Esc が効く
//   4. presenter では導線が出ない（プレゼン中に誤爆しない）
//
// 分割そのものの正しさは markdown-deck の単体テストが担当するので、ここでは
// 「UI から末端まで繋がっていること」だけを見る。

import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";
import { findArchitectureBlocks } from "../../.github/extensions/presentation/scripts/markdown-blocks.mjs";

const FIXTURES = join(REPO_ROOT, "test", "fixtures");
const SLIDES = splitFixtureDeck(readFileSync(join(FIXTURES, "standard-title.md"), "utf8"));
const EDITABLE_SOURCE = readFileSync(join(FIXTURES, "architecture-editing.md"), "utf8");

/** インポート可能なハーネスを起動して描画完了まで待つ。 */
async function openCanvas(page, query = "") {
  const harness = await startHarness({ slides: SLIDES, markdownRoot: FIXTURES });
  await page.goto(`${harness.url}/${query}`, { waitUntil: "load" });
  await waitForSlideReady(page);
  return harness;
}

test.describe("Markdown インポート", () => {
  test("ボタンから一覧を開き、選んだ Markdown がデッキになる", async ({ page }) => {
    const harness = await openCanvas(page);
    try {
      await page.locator("#navImport").click();
      await expect(page.locator("#importPicker")).toBeVisible();
      await expect(page.locator("#importModeSnapshot")).toBeChecked();

      const item = page.locator("#importList .overview-link", {
        hasText: "import-source.md",
      });
      await expect(item).toHaveCount(1);
      await item.click();

      await expect(page.locator("#importPicker")).toBeHidden();
      await expect.poll(() => harness.sourceName).toBe("import-source.md");
      expect(harness.sourceMode).toBe("snapshot");
      // 表紙 + 通常 3 枚。背表紙の自動追加はハーネスでは行わない。
      expect(harness.total).toBe(4);

      await waitForSlideReady(page);
      await expect(page.locator(".deck")).toContainText("インポートのテスト");
    } finally {
      await harness.close();
    }
  });

  test("絞り込みで一覧が減り、Esc で閉じる", async ({ page }) => {
    const harness = await openCanvas(page);
    try {
      await page.locator("#navImport").click();
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

  test("Markdown 隣接 assets を優先し、workspace assets へフォールバックする", async ({
    page,
  }) => {
    const harness = await openCanvas(page);
    try {
      await page.locator("#navImport").click();
      await page
        .locator("#importList .overview-link", { hasText: "asset-scope/deck.md" })
        .click();
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

  test("presenter では読み込みボタンが表示されない", async ({ page }) => {
    const harness = await openCanvas(page, "?present=1");
    try {
      await expect(page.locator("#navImport")).toBeHidden();
    } finally {
      await harness.close();
    }
  });

  test("live を選んで保存を追従し、途中で固定表示へ切り替えられる", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-live-"));
    const sourcePath = join(root, "live.md");
    const initial = "# First\n\n---\n\n## Current\n\nBefore\n";
    await writeFile(sourcePath, initial, "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await expect(page.locator("#navSourceMode")).toBeHidden();
      await page.locator("#navImport").click();
      await page.locator('input[name="importMode"][value="live"]').check();
      await page.locator("#importList .overview-link", { hasText: "live.md" }).click();
      await expect.poll(() => harness.sourceMode).toBe("live");
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

      await page.locator("#navSourceMode").click();
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

  test("固定表示から live へ切り替えた時点で最新版を読み込む", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-switch-"));
    const sourcePath = join(root, "switch.md");
    await writeFile(sourcePath, "# Snapshot\n", "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await page.locator("#navImport").click();
      await page.locator("#importList .overview-link", { hasText: "switch.md" }).click();
      await expect(page.locator(".deck")).toContainText("Snapshot");
      await writeFile(sourcePath, "# Latest\n", "utf8");
      await page.waitForTimeout(300);
      await expect(page.locator(".deck")).toContainText("Snapshot");

      await page.locator("#navSourceMode").click();
      await expect.poll(() => harness.sourceMode).toBe("live");
      await expect(page.locator(".deck")).toContainText("Latest");
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("空の architecture フェンスを空の図として認識する", async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-empty-architecture-"));
    await writeFile(join(root, "empty.md"), "# Empty\n\n```architecture\n```\n", "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await page.locator("#navImport").click();
      await page.locator("#importList .overview-link", { hasText: "empty.md" }).click();
      await waitForSlideReady(page);
      await expect(page.locator(".architecture-diagram")).toHaveCount(1);
      await expect(page.locator(".architecture-error")).toHaveCount(0);

      await page.locator("#navEdit").click();
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("インポートした図の編集は元ファイルへ保存され、編集モード再開後も残る", async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-edit-"));
    const sourcePath = join(root, "editable.md");
    await writeFile(sourcePath, EDITABLE_SOURCE, "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await page.locator("#navImport").click();
      await page.locator("#importList .overview-link", { hasText: "editable.md" }).click();
      await waitForSlideReady(page);

      await page.locator("#navEdit").click();
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      await page.locator('[data-architecture-id="client"]').focus();
      await page.keyboard.press("ArrowDown");
      await page.locator('[data-architecture-id="client"]').focus();
      await page.keyboard.press("ArrowDown");
      const saveState = page.locator('[data-architecture-save-state="saved"]');
      await expect(saveState).toBeVisible();
      await expect(saveState).toContainText("元 Markdown に保存しました");

      const saved = await readFile(sourcePath, "utf8");
      const savedDsl = JSON.parse(findArchitectureBlocks(saved)[0].body);
      expect(savedDsl.elements.find((element) => element.id === "client").y).toBe(400);

      await page.locator("#navEdit").click();
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(0);
      await page.locator("#navEdit").click();
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      const reopenedY = await page
        .locator('[data-architecture-id="client"]')
        .evaluate((element) => Math.round(element.getBBox().y));
      expect(reopenedY).toBe(400);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  test("インポート元が外部変更されたら保存を拒否してファイルを上書きしない", async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "presentation-import-conflict-"));
    const sourcePath = join(root, "editable.md");
    await writeFile(sourcePath, EDITABLE_SOURCE, "utf8");
    const harness = await startHarness({ slides: SLIDES, markdownRoot: root });
    try {
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await page.locator("#navImport").click();
      await page.locator("#importList .overview-link", { hasText: "editable.md" }).click();
      await waitForSlideReady(page);
      await page.locator("#navEdit").click();
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);

      const external = EDITABLE_SOURCE.replace('"y": 380', '"y": 777');
      await writeFile(sourcePath, external, "utf8");
      await page.locator('[data-architecture-id="client"]').focus();
      await page.keyboard.press("ArrowDown");

      const failure = page.locator('[data-architecture-save-state="failed"]');
      await expect(failure).toBeVisible();
      await expect(failure).toContainText("外部で変更されています");
      const unchanged = await readFile(sourcePath, "utf8");
      expect(JSON.parse(findArchitectureBlocks(unchanged)[0].body).elements[0].y).toBe(777);
    } finally {
      await harness.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
