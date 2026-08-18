// ビジュアル回帰: 4 テーマ x 代表的な architecture 図のスクリーンショット比較。
//
// 決定論性のために次を守る。
//   - 固定 sleep は使わず renderer の ready シグナル（mermaid-loading の除去）で待つ
//   - viewport / deviceScaleFactor を固定（playwright.config.mjs）
//   - reducedMotion: 'reduce' + CSS でアニメーションと操作 UI を無効化
//   - テーマとスライドの組み合わせごとにハーネスを起動し、状態を持ち越さない
//
// ベースラインは OS ごとにフォントのラスタライズが異なるため、
// playwright.config.mjs の snapshotPathTemplate でプラットフォーム別に保存する。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { DETERMINISTIC_CSS, waitForSlideReady } from "../utils/ready.mjs";

const THEMES = ["dark", "light", "microsoft", "ms-modern"];

const FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-visual.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));

// スナップショット名。フィクスチャのスライド構成と 1:1 で対応させる。
const SLIDE_NAMES = [
  "01-cover",
  "02-layout-groups",
  "03-shapes-routing",
  "04-dense-routing",
  "05-backcover",
];

test("フィクスチャのスライド数がスナップショット名と一致する", () => {
  expect(SLIDES).toHaveLength(SLIDE_NAMES.length);
});

for (const theme of THEMES) {
  test.describe(`theme: ${theme}`, () => {
    SLIDE_NAMES.forEach((name, index) => {
      test(name, async ({ page }) => {
        const harness = await startHarness({ slides: SLIDES, theme, index });
        try {
          const consoleErrors = [];
          page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text());
          });

          await page.goto(`${harness.url}/`, { waitUntil: "load" });
          await waitForSlideReady(page);
          await page.addStyleTag({ content: DETERMINISTIC_CSS });

          // 意図したテーマ・スライドが出ていることを先に確認する
          // （取り違えたまま「一致した」と判定しないため）。
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(page.locator("#stage .deck")).toHaveCount(1);
          expect(await page.locator(".architecture-error").count()).toBe(0);

          await expect(page).toHaveScreenshot(`${theme}-${name}.png`);

          expect(consoleErrors, "renderer がコンソールエラーを出していない").toEqual([]);
        } finally {
          await harness.close();
        }
      });
    });
  });
}
