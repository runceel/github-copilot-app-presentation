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
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const FIXTURES = join(REPO_ROOT, "test", "fixtures");
const SLIDES = splitFixtureDeck(readFileSync(join(FIXTURES, "standard-title.md"), "utf8"));

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

      const item = page.locator("#importList .overview-link", {
        hasText: "import-source.md",
      });
      await expect(item).toHaveCount(1);
      await item.click();

      await expect(page.locator("#importPicker")).toBeHidden();
      await expect.poll(() => harness.sourceName).toBe("import-source.md");
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

  test("presenter では読み込みボタンが表示されない", async ({ page }) => {
    const harness = await openCanvas(page, "?present=1");
    try {
      await expect(page.locator("#navImport")).toBeHidden();
    } finally {
      await harness.close();
    }
  });
});
