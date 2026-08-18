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
      // 比較は**割合ではなく絶対値**で、しかも許容 0px で行う。
      //
      // 以前ここは `maxDiffPixelRatio: 0.002` で「アンチエイリアスの 1px 単位の
      // ばらつきだけを吸収する狭い許容量」とコメントされていたが、これは誤りだった。
      // 0.002 は 1280x720 で **約 1843px** を許容する。1px どころか 1843px である。
      // この誤解のせいで、実際に 2 件の変更が検証をすり抜けた。
      //
      // 1. Phase 3 がスライドを 1 枚追加して `total: 4` を `5` にしたとき、
      //    02-layout-groups と 03-shapes-routing の footer は "2 / 4" -> "2 / 5" と
      //    **正当に変わった**のに、差分が数字 1 文字分の **19px** しかないため比較を
      //    通過し、ベースラインが Phase 1 世代のまま 2 フェーズにわたって残った。
      //    その間「ベースラインに変更がない = 描画が変わっていない」という
      //    読み方が成立していなかった。
      // 2. アイコンのカタログでは、アイコン 1 個を丸ごと別の絵に描き替えても
      //    **123px** しか動かず、閾値に遠く届かなかった。
      //
      // 実測した差分の大きさ（1280x720、win32 / linux docker）。
      //   - 同一プラットフォームでの再実行: **0px**
      //     （px 数が 1 の位まで一致する。つまり描画は決定的で、揺れは存在しない）
      //   - footer のページ番号が 1 文字変わる: 16-21px
      //   - 矢印マーカーの refX を 9 -> 8.5（約 0.7px）ずらす: 1-21px
      //   - アイコンのチェックマークを少しずらす: 11px
      //   - アイコンを丸ごと別の図形に描き替える: 123px
      // 上記はすべて 1843px より小さい。つまり旧設定ではどれも検出できなかった。
      //
      // 【重要】`maxDiffPixels` と `maxDiffPixelRatio` を併記すると、Playwright は
      // **厳しいほうを採用する**（実測: `{ maxDiffPixels: 4, maxDiffPixelRatio: 0 }`
      // の状態で 1px の差分がテストを失敗させた）。したがって 0 を書いた時点で
      // `maxDiffPixels` の値は一切効かない。「4px までは許容される」と読めてしまう
      // 死んだ指定を残さないために、ここでは `maxDiffPixelRatio: 0` だけを書く。
      //
      // 許容 0px で問題ないことの根拠: ベースラインはプラットフォームごとに分けて
      // 保存しており、linux ベースラインは CI と同じ Playwright 公式 Docker イメージで
      // 生成している。GitHub のランナー（ローカル Docker とは別ハードウェア）でも
      // 実効 0px で通過することを確認済み。
      //
      // ここを割合に戻すと、上記のような「見た目は変わっているのに緑」を再び見逃す。
      maxDiffPixelRatio: 0,
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
