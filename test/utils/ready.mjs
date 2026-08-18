// renderer の描画完了を決定論的に待つためのヘルパー。
//
// 描画完了は renderer が出す ready シグナルで判定する（固定 sleep は使わない）。
//   通常モード: <body> から `mermaid-loading` クラスが外れる
//   印刷モード: <html data-print-ready="true"> かつ window.__presentationPrintReady === true
//               失敗時は <html data-print-error="true">

/** スクリーンショットを安定させるための CSS（アニメーション停止・操作 UI の非表示）。 */
export const DETERMINISTIC_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  /* 操作 UI はスライドの描画結果ではないので比較対象から外す。 */
  #nav, #overview { display: none !important; }
`;

/** レイアウト（rAF ベースの自動サイズ調整）とフォント読み込みが落ち着くまで待つ。 */
async function settleLayout(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    // renderer は requestAnimationFrame 2 回でレイアウトを確定させるので、
    // それより 1 段多く回して確実に落ち着かせる。
    await frame();
    await frame();
    await frame();
  });
}

/** 通常モード: 1 枚のスライドの描画完了を待つ。 */
export async function waitForSlideReady(page, { timeout = 60_000 } = {}) {
  await page.waitForSelector("#stage .deck", { state: "attached", timeout });
  await page.waitForFunction(
    () => !document.body.classList.contains("mermaid-loading"),
    undefined,
    { timeout },
  );
  await settleLayout(page);
}

/**
 * 印刷モード: 全スライドの描画完了を待つ。
 * 失敗シグナルも監視し、失敗していれば理由付きで throw する
 * （見ないと「空の PDF が出た」ことを成功と誤判定する）。
 */
export async function waitForPrintReady(page, { timeout = 120_000 } = {}) {
  await page.waitForFunction(
    () => {
      const root = document.documentElement;
      return (
        root.getAttribute("data-print-ready") === "true" ||
        root.getAttribute("data-print-error") === "true"
      );
    },
    undefined,
    { timeout },
  );

  const failed = await page.evaluate(
    () => document.documentElement.getAttribute("data-print-error") === "true",
  );
  if (failed) {
    throw new Error("Print rendering failed: <html data-print-error=\"true\"> was set.");
  }

  const ready = await page.evaluate(() => window.__presentationPrintReady === true);
  if (!ready) {
    throw new Error("Print rendering did not set window.__presentationPrintReady.");
  }
  await settleLayout(page);
}
