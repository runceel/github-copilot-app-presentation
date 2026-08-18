// Playwright 設定（テスト基盤。拡張機能の配布物には含めません）。
//
// ビジュアル回帰のスナップショットは **プラットフォームごと**に分けて保存します。
// フォントラスタライズが OS で異なるため、Windows で撮ったベースラインを Linux の CI
// と共有することはできません。CI は `ubuntu-24.04` に固定し、同じ Playwright バージョンの
// 公式 Docker イメージで生成した linux ベースラインを使います（README 参照）。

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  // ビジュアル比較は同一プラットフォーム内では決定論的だが、CI では並列実行の揺れを
  // 避けるためワーカーを 1 本にする。
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  // 例: test/visual/__screenshots__/visual/linux/architecture-dark.png
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{platform}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // アンチエイリアスの 1px 単位のばらつきだけを吸収する狭い許容量。
      maxDiffPixelRatio: 0.002,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    // スライドと同じ 16:9。deviceScaleFactor を固定しないと DPI 差で画像が変わる。
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // slides.css の `.deck{animation:fade}` は prefers-reduced-motion で無効化される。
    reducedMotion: "reduce",
    trace: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "visual",
      testDir: "test/visual",
      testMatch: /.*\.spec\.mjs/,
    },
    {
      name: "pdf",
      testDir: "test/pdf",
      testMatch: /.*\.spec\.mjs/,
    },
  ],
});
