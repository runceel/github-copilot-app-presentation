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

// アイコンのカタログは別デッキにしてある。既存デッキへ差し込むと footer の
// `page / total` が変わり、無関係なベースラインまで一斉に更新することになるため。
const ICON_FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-icons.md");
const ICON_SLIDES = splitFixtureDeck(readFileSync(ICON_FIXTURE, "utf8"));
const ICON_SLIDE_NAMES = ["01-icon-catalog"];

test("フィクスチャのスライド数がスナップショット名と一致する", () => {
  expect(SLIDES).toHaveLength(SLIDE_NAMES.length);
  expect(ICON_SLIDES).toHaveLength(ICON_SLIDE_NAMES.length);
});

/** 1 デッキ分のテーマ x スライドのスクリーンショット比較を登録する。 */
function registerDeck(slides, names, prefix = "", screenshotOptions = undefined) {
  for (const theme of THEMES) {
    test.describe(`theme: ${theme}${prefix ? ` (${prefix})` : ""}`, () => {
      names.forEach((name, index) => {
        test(name, async ({ page }) => {
          const harness = await startHarness({ slides, theme, index });
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

            await expect(page).toHaveScreenshot(`${theme}-${name}.png`, screenshotOptions);

            expect(consoleErrors, "renderer がコンソールエラーを出していない").toEqual([]);
          } finally {
            await harness.close();
          }
        });
      });
    });
  }
}

// 既存デッキは既定の閾値（maxDiffPixelRatio: 0.002 = 1280x720 で約 1843px）のまま。
//
// 本来はアイコンデッキと同じ絶対値比較に揃えたいが、現時点では**適用できない**。
// 実測すると 02-layout-groups と 03-shapes-routing が 4 テーマとも落ちる。
//   - win32: 16 / 16 / 19 / 19 / 18 / 17 / 18 / 19 px
//   - linux(docker): 18 / 18 / 20 / 20 / 19 / 19 / 20 / 20 px
//
// これはプラットフォーム間の揺れではない。根拠は次のとおり。
//   - 同一環境で 2 回実行しても px 数は 1 の位まで完全に一致する（揺れは 0px）
//   - win32 と linux の両方で、同じ 2 スライド x 4 テーマだけが落ちる
//   - 差分は x:1160-1185, y:666-675 の 1 箇所に限局する（footer の `page / total`）
//   - 5908897（このブランチの起点）でも同じ 8 件が同じ px で落ちる
//
// 原因はベースラインの陳腐化。Phase 3 がフィクスチャの `total: 4` を `5` にしたため
// footer が "2 / 4" -> "2 / 5"、"3 / 4" -> "3 / 5" と変わったが、差分が 1843px の
// 閾値に遠く届かないためベースラインが更新されないまま緑になっていた
// （04-dense-routing は Phase 3 が新規生成したので正しい "4 / 5"、01-cover と
// 05-backcover には footer がないため影響を受けない）。
//
// つまり win32 8 枚 + linux 8 枚 = 16 枚が古い footer のまま残っている。
// 厳格化はこれらを再生成してからでないと導入できないので、ここでは据え置く。
registerDeck(SLIDES, SLIDE_NAMES);
// アイコンのカタログだけは既定より厳しく比較する。
//
// 既定の maxDiffPixelRatio: 0.002 は 1280x720 で約 1843px を許容するため、
// アイコン 1 個を丸ごと別の絵に描き替えても差分が閾値に届かず、
// 「何も検証していないのに緑になるテスト」になってしまう（実測値）。
//   - 同一プラットフォームでの再実行の差分: 0px
//   - shield のチェックマークを少しずらす: 11px
//   - shield を丸ごと四角に描き替える: 123px
// ベースラインはプラットフォーム別に保存していて同一環境では決定論的なので、
// 揺れ 1-2px 分の余裕だけ残した絶対値で比較する。
registerDeck(ICON_SLIDES, ICON_SLIDE_NAMES, "icons", {
  maxDiffPixels: 4,
  maxDiffPixelRatio: 0,
});
