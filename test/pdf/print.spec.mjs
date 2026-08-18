// PDF 回帰: `?print=1` の印刷モードを headless Chromium で PDF 化して検証する。
//
// **生バイナリのスナップショット比較はしない**（環境差で必ず壊れるため）。見るのは
//   1. ページ数がスライド数と一致するか
//   2. ページサイズが 16:9（slides.css の @page = 13.333333in x 7.5in）か
//   3. 描画された SVG の意味構造がモデルと一致するか
//
// また印刷の **失敗シグナル**（data-print-error）も必ず見る。これを見ないと
// 「空の PDF が出た」ことを成功と誤判定する。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForPrintReady } from "../utils/ready.mjs";
import {
  EXPECTED_PAGE_HEIGHT_PT,
  EXPECTED_PAGE_WIDTH_PT,
  inspectPdf,
  isSixteenByNinePage,
} from "../utils/pdf.mjs";
import { expectedDiagramShapes, hasMermaidBlock } from "../utils/architecture.mjs";

const ARCHITECTURE_DECK = splitFixtureDeck(
  readFileSync(join(REPO_ROOT, "test", "fixtures", "architecture-visual.md"), "utf8"),
);
const MIXED_SLIDE = readFileSync(
  join(REPO_ROOT, "test", "fixtures", "print-mixed.md"),
  "utf8",
).trim();
// 背表紙の手前に mermaid + architecture 混在スライドを差し込んだデッキ。
const MIXED_DECK = [...ARCHITECTURE_DECK.slice(0, -1), MIXED_SLIDE, ...ARCHITECTURE_DECK.slice(-1)];

// 既知の不具合（Phase 1 では描画側を変更しないため、現状の挙動をそのまま固定する）:
// mermaid は描画時に <div class="mermaidTooltip"> を body 直下へ追加する。この要素は
// print CSS で消されず、ページ境界（7.5in = 720px）を 6px はみ出すため、mermaid を
// 含むデッキの PDF は末尾に空白ページが 1 枚増える。
// 描画側が修正されたらこのテストが落ちるので、そのときに 0 へ戻すこと。
const KNOWN_MERMAID_TOOLTIP_EXTRA_PAGES = 1;

const PDF_OPTIONS = { printBackground: true, preferCSSPageSize: true };

/** 印刷モードの DOM から、スライドごとの意味構造を取り出す。 */
function readPrintStructure(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#stage > .deck")].map((deck) => ({
      diagrams: [...deck.querySelectorAll("svg.architecture-svg")].map((svg) => ({
        viewBox: svg.getAttribute("viewBox"),
        groups: svg.querySelectorAll('[data-architecture-type="group"]').length,
        nodes: svg.querySelectorAll('[data-architecture-type="node"]').length,
        connectors: svg.querySelectorAll("[data-architecture-connector]").length,
      })),
      mermaidSvgs: deck.querySelectorAll("pre.mermaid svg, .mermaid svg").length,
      errors: deck.querySelectorAll(".architecture-error").length,
    })),
  );
}

/** 印刷モードを開いて ready まで待ち、意味構造と PDF を返す。 */
async function renderPrintDeck(page, harness) {
  await page.goto(`${harness.url}/?print=1&token=${encodeURIComponent(harness.printToken)}`, {
    waitUntil: "load",
  });
  // 成功・失敗の両シグナルを監視する（失敗なら理由付きで throw される）。
  await waitForPrintReady(page);

  // renderer が実際に成功を報告したか、ハーネス側の記録で裏を取る。
  expect(harness.printReports).toHaveLength(1);
  expect(harness.printReports[0].status).toBe("ready");
  expect(harness.printReports[0].error).toBe("");

  return {
    structure: await readPrintStructure(page),
    pdf: await page.pdf(PDF_OPTIONS),
  };
}

/** スライド Markdown から期待される意味構造と、実際の DOM を突き合わせる。 */
function assertStructureMatchesModel(structure, slides) {
  expect(structure).toHaveLength(slides.length);
  slides.forEach((markdown, index) => {
    const slide = structure[index];
    expect(slide.errors, `スライド ${index + 1}: architecture のパースエラーがない`).toBe(0);
    expect(slide.diagrams, `スライド ${index + 1}: 図の数と構造がモデルと一致する`).toEqual(
      expectedDiagramShapes(markdown),
    );
    if (hasMermaidBlock(markdown)) {
      expect(
        slide.mermaidSvgs,
        `スライド ${index + 1}: mermaid が SVG になっている`,
      ).toBeGreaterThan(0);
    }
  });
}

/** 全ページが 16:9 であることを確認する。 */
function assertSixteenByNine(mediaBoxes) {
  expect(mediaBoxes.length, "MediaBox を読み取れている").toBeGreaterThan(0);
  for (const box of mediaBoxes) {
    expect(
      isSixteenByNinePage(box),
      `ページサイズが 16:9 (${EXPECTED_PAGE_WIDTH_PT}pt x ${EXPECTED_PAGE_HEIGHT_PT}pt) である: ${JSON.stringify(box)}`,
    ).toBe(true);
  }
}

for (const theme of ["dark", "light"]) {
  test(`architecture のみのデッキは 1 スライド = 1 ページ (theme: ${theme})`, async ({ page }) => {
    const harness = await startHarness({ slides: ARCHITECTURE_DECK, theme });
    try {
      const { structure, pdf } = await renderPrintDeck(page, harness);

      assertStructureMatchesModel(structure, ARCHITECTURE_DECK);
      // フィクスチャが痩せて検証が空回りするのを防ぐ。
      expect(structure.filter((slide) => slide.diagrams.length > 0).length).toBeGreaterThan(0);

      const { pageCount, mediaBoxes } = inspectPdf(pdf);
      expect(pageCount, "PDF のページ数がスライド数と一致する").toBe(ARCHITECTURE_DECK.length);
      assertSixteenByNine(mediaBoxes);
    } finally {
      await harness.close();
    }
  });
}

test("mermaid を含むデッキも 16:9 で出力される", async ({ page }) => {
  const harness = await startHarness({ slides: MIXED_DECK, theme: "dark" });
  try {
    const { structure, pdf } = await renderPrintDeck(page, harness);

    assertStructureMatchesModel(structure, MIXED_DECK);
    expect(
      structure.filter((slide) => slide.mermaidSvgs > 0).length,
      "mermaid が実際に描画されている",
    ).toBeGreaterThan(0);

    const { pageCount, mediaBoxes } = inspectPdf(pdf);
    expect(pageCount, "mermaid 由来の余分なページを含めたページ数").toBe(
      MIXED_DECK.length + KNOWN_MERMAID_TOOLTIP_EXTRA_PAGES,
    );
    assertSixteenByNine(mediaBoxes);
  } finally {
    await harness.close();
  }
});

test("印刷の失敗シグナルを検知できる", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  try {
    // トークンが違うと ./export-data が 404 になり、renderer が失敗経路に入る。
    await page.goto(`${harness.url}/?print=1&token=wrong-token`, { waitUntil: "load" });
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-print-error") === "true",
      undefined,
      { timeout: 30_000 },
    );

    expect(await page.evaluate(() => window.__presentationPrintReady)).toBeUndefined();
    // 失敗を「成功」と取り違えないこと自体を検証する。
    await expect(waitForPrintReady(page, { timeout: 5_000 })).rejects.toThrow(/data-print-error/);
    expect(harness.printReports, "トークン不一致なので成功報告は届かない").toHaveLength(0);
  } finally {
    await harness.close();
  }
});
