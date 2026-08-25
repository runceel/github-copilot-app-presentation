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
const SECTION_DECK = splitFixtureDeck(
  readFileSync(join(REPO_ROOT, "test", "fixtures", "layout-visual.md"), "utf8"),
);
const STANDARD_TITLE_DECK = splitFixtureDeck(
  readFileSync(join(REPO_ROOT, "test", "fixtures", "standard-title.md"), "utf8"),
);
// 背表紙の手前に mermaid + architecture 混在スライドを差し込んだデッキ。
const MIXED_DECK = [...ARCHITECTURE_DECK.slice(0, -1), MIXED_SLIDE, ...ARCHITECTURE_DECK.slice(-1)];

// 回帰ガード（#11）: mermaid は描画時に <div class="mermaidTooltip"> を body 直下へ
// 追加する。かつてこの要素が print CSS で消されず、ページ境界（7.5in = 720px）を
// 6px はみ出して空白ページを 1 枚増やしていた。slides.css の
// `body.print-mode .mermaidTooltip{display:none!important;}` で修正済み。
// この規則が失われると下のページ数アサートが落ちる。

const PDF_OPTIONS = { printBackground: true, preferCSSPageSize: true };

/** 印刷モードの DOM から、スライドごとの意味構造を取り出す。 */
function readPrintStructure(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#stage > .deck")].map((deck) => ({
      className: deck.className,
      backgroundImage: getComputedStyle(deck).backgroundImage,
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
    expect(pageCount, "mermaid を含んでも 1 スライド = 1 ページ").toBe(MIXED_DECK.length);
    assertSixteenByNine(mediaBoxes);
  } finally {
    await harness.close();
  }
});

test("セクション区切りも背景付きの 16:9 ページとして出力される", async ({ page }) => {
  const harness = await startHarness({ slides: SECTION_DECK, theme: "microsoft" });
  try {
    const { structure, pdf } = await renderPrintDeck(page, harness);

    expect(structure).toHaveLength(SECTION_DECK.length);
    for (const slide of structure) {
      expect(slide.className.split(/\s+/)).toContain("section-slide");
      expect(slide.backgroundImage).not.toBe("none");
    }

    const { pageCount, mediaBoxes } = inspectPdf(pdf);
    expect(pageCount, "セクション区切りも 1 スライド = 1 ページ").toBe(SECTION_DECK.length);
    assertSixteenByNine(mediaBoxes);
  } finally {
    await harness.close();
  }
});

test("通常スライドのタイトルは印刷でも上部に固定される", async ({ page }) => {
  const harness = await startHarness({ slides: STANDARD_TITLE_DECK, theme: "microsoft" });
  try {
    const { pdf } = await renderPrintDeck(page, harness);
    await page.emulateMedia({ media: "print" });
    const layouts = await page.locator("#stage > .deck").evaluateAll((decks) =>
      decks.map((deck) => {
        const title = deck.querySelector(":scope > header > .slide-title");
        const body = deck.querySelector(":scope > .body");
        const deckBox = deck.getBoundingClientRect();
        const titleBox = title?.getBoundingClientRect();
        const bodyBox = body.getBoundingClientRect();
        return {
          hasFixedTitle: deck.classList.contains("has-slide-title"),
          titleTag: title?.tagName ?? "",
          titleTop: titleBox ? titleBox.top - deckBox.top : null,
          titleBottom: titleBox ? titleBox.bottom - deckBox.top : null,
          bodyTop: bodyBox.top - deckBox.top,
          bodyHeadingCount: body.querySelectorAll(":scope > h1, :scope > h2").length,
        };
      }),
    );

    expect(layouts.slice(0, 3).map((layout) => layout.hasFixedTitle)).toEqual([true, true, true]);
    expect(layouts.slice(0, 3).map((layout) => layout.titleTag)).toEqual(["H2", "H2", "H1"]);
    expect(layouts.slice(0, 3).map((layout) => layout.bodyHeadingCount)).toEqual([0, 0, 0]);
    expect(Math.abs(layouts[1].titleTop - layouts[0].titleTop)).toBeLessThan(0.5);
    for (const layout of layouts.slice(0, 3)) {
      expect(layout.titleBottom).toBeLessThanOrEqual(layout.bodyTop);
    }
    expect(layouts[3].hasFixedTitle).toBe(false);
    expect(layouts[3].bodyHeadingCount).toBe(1);

    const { pageCount, mediaBoxes } = inspectPdf(pdf);
    expect(pageCount).toBe(STANDARD_TITLE_DECK.length);
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

// 回帰ガード（#12）: initPrint はトークン欠落だけを try の **外側** で throw する。
// 呼び出し側で受けないと未処理の Promise 拒否になるだけで data-print-error が立たず、
// ブラウザーは exit 0 で白紙 1 ページの PDF を吐いて正常終了する。上のテスト
// （トークン不一致）は initPrint 内部の catch を通るので、この経路は素通りする。
test("トークンの無い印刷も失敗として観測できる", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  try {
    await page.goto(`${harness.url}/?print=1`, { waitUntil: "load" });
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-print-error") === "true",
      undefined,
      { timeout: 30_000 },
    );

    // veil が残ったままだと PDF が真っ白になるので、外れていることも見る。
    expect(
      await page.evaluate(() => document.body.classList.contains("mermaid-loading")),
      "失敗時に mermaid-loading の覆いを残さない",
    ).toBe(false);
    expect(harness.printReports, "トークンが無いので成功報告は届かない").toHaveLength(0);
    expect(consoleErrors.join("\n"), "理由が console に残る").toMatch(/token/i);
  } finally {
    await harness.close();
  }
});

/** EventSource の生成数と ./state のポーリング数を数える計測器を仕掛ける。 */
async function instrumentLiveUpdates(page) {
  await page.addInitScript(() => {
    window.__eventSourceCount = 0;
    const OriginalEventSource = window.EventSource;
    window.EventSource = class extends OriginalEventSource {
      constructor(...args) {
        window.__eventSourceCount += 1;
        super(...args);
      }
    };
  });
  const statePolls = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/state")) statePolls.push(request.url());
  });
  return {
    statePolls,
    eventSourceCount: () => page.evaluate(() => window.__eventSourceCount),
  };
}

// ポーリング間隔（renderer.js の setInterval）の 2 周ぶん。
const QUIESCENCE_WAIT_MS = 4_500;

// 回帰ガード（#12）: `--print-to-pdf` は「ページが静止すること」を完了条件にする。
// init() の印刷分岐が早期 return しなくなると、閉じない SSE と 2 秒間隔のポーリングが
// 動き続け、ブラウザーは **永久に終了しない**（実測: 120 秒でも終わらない）。
// Node 側の 60 秒タイムアウトで殺されるまで PDF は 1 バイトも出ない。
test("印刷モードは SSE も定期ポーリングも起動しない", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  try {
    const live = await instrumentLiveUpdates(page);
    await page.goto(`${harness.url}/?print=1&token=${encodeURIComponent(harness.printToken)}`, {
      waitUntil: "load",
    });
    await waitForPrintReady(page);
    await page.waitForTimeout(QUIESCENCE_WAIT_MS);

    expect(await live.eventSourceCount(), "印刷モードは SSE を張らない").toBe(0);
    expect(live.statePolls, "印刷モードは /state をポーリングしない").toHaveLength(0);
  } finally {
    await harness.close();
  }
});

// 上のテストが「計測器が動いていないだけ」で緑にならないことの裏取り。
// 通常表示では SSE もポーリングも必ず動くので、同じ計測器が非ゼロを返す。
test("通常表示は SSE と定期ポーリングを起動する", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  try {
    const live = await instrumentLiveUpdates(page);
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await page.waitForTimeout(QUIESCENCE_WAIT_MS);

    expect(await live.eventSourceCount(), "通常表示は SSE を張る").toBeGreaterThan(0);
    expect(
      live.statePolls.length,
      "通常表示は /state を繰り返し取得する",
    ).toBeGreaterThan(1);
  } finally {
    await harness.close();
  }
});
