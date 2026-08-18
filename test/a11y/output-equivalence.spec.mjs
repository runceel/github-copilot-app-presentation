// 出力の等価性: canvas（通常表示）・presenter・印刷（PDF 経路）で
// **同じ図が同じ意味で出る**ことを固定する。
//
// 3 経路は同じ renderer を通るが、通る分岐は別々である。
//   通常表示 : init() が fetchState / connectEvents を回す
//   presenter: body.presenter-mode が付く
//   印刷     : initPrint() が全スライドを一度に描く（早期 return するので上の分岐を通らない）
// さらに印刷だけ slides.css の `body.print-mode` 側の規則を浴びる。
// 分岐が別なら壊れ方も別なので、経路ごとに出力が食い違っていないかを見る必要がある。
//
// 座標や実寸は経路ごとに違って当然（印刷は用紙サイズへ収める）ので比較対象にしない。
// 比べるのは「意味」— 要素の同一性・種別・ロール・アクセシブル名・宣言順。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForPrintReady, waitForSlideReady } from "../utils/ready.mjs";
import { accessibilityTree, findDiagram, flatten, readDiagramSemantics } from "./ax.mjs";

const EDITING_DECK = splitFixtureDeck(
  readFileSync(join(REPO_ROOT, "test", "fixtures", "architecture-editing.md"), "utf8"),
);
const MIXED_SLIDE = readFileSync(
  join(REPO_ROOT, "test", "fixtures", "print-mixed.md"),
  "utf8",
).trim();

const DIAGRAM_TITLE = "Editing fixture";
const MIXED_TITLE = "Print regression diagram";
const SVG = "svg.architecture-svg";

// slides.css: `body.print-mode .architecture-svg{max-height:5.25in;}`
// 1in = 96 CSS px。この上限を超えて描かれていたら print CSS が効いていない。
const PRINT_MAX_HEIGHT_PX = 5.25 * 96;

/** 通常表示 / presenter で開く。 */
async function openLive(page, { present = false, slides = EDITING_DECK } = {}) {
  const harness = await startHarness({ slides });
  await page.goto(`${harness.url}/${present ? "?present=1" : ""}`, { waitUntil: "load" });
  await waitForSlideReady(page);
  return harness;
}

/** 印刷モード（PDF が焼かれるのと同じ DOM）で開く。 */
async function openPrint(page, { slides = EDITING_DECK } = {}) {
  const harness = await startHarness({ slides });
  await page.goto(`${harness.url}/?print=1&token=${harness.printToken}`, { waitUntil: "load" });
  await waitForPrintReady(page);
  return harness;
}

/** 図の実描画サイズ。`meet` により縦横比は保たれるので、実際に描かれた矩形を計算する。 */
function measureDiagram(page, title) {
  return page.evaluate((wantedTitle) => {
    const svg = [...document.querySelectorAll("svg.architecture-svg")].find(
      (candidate) => candidate.querySelector(":scope > title")?.textContent === wantedTitle,
    );
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const [, , viewWidth, viewHeight] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    // preserveAspectRatio="xMidYMid meet" は要素の箱の中に図を収めて余白を作る。
    // したがって「箱の縦横比」は図の縦横比と一致しない。見るべきは収まった後の矩形。
    const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight);
    return {
      box: { width: Math.round(rect.width), height: Math.round(rect.height) },
      drawn: { width: Math.round(viewWidth * scale), height: Math.round(viewHeight * scale) },
    };
  }, title);
}

test.describe("canvas / presenter / 印刷の等価性", () => {
  test("presenter は通常表示と同じ意味構造を出す", async ({ page }) => {
    const live = await openLive(page);
    let liveSemantics;
    try {
      liveSemantics = await readDiagramSemantics(page, DIAGRAM_TITLE);
      expect(liveSemantics).not.toBeNull();
    } finally {
      await live.close();
    }

    const presenter = await openLive(page, { present: true });
    try {
      await expect(page.locator("body.presenter-mode")).toHaveCount(1);
      expect(await readDiagramSemantics(page, DIAGRAM_TITLE)).toEqual(liveSemantics);
    } finally {
      await presenter.close();
    }
  });

  test("印刷は通常表示と同じ意味構造を出す", async ({ page }) => {
    const live = await openLive(page);
    let liveSemantics;
    try {
      liveSemantics = await readDiagramSemantics(page, DIAGRAM_TITLE);
    } finally {
      await live.close();
    }

    const print = await openPrint(page);
    try {
      await expect(page.locator("body.print-mode")).toHaveCount(1);
      // 印刷では全スライドが同時に DOM にある。それでも 1 枚の図の意味は変わらない。
      expect(await readDiagramSemantics(page, DIAGRAM_TITLE)).toEqual(liveSemantics);
    } finally {
      await print.close();
    }
  });

  test("印刷でも可視テキストは支援技術から隠れたままになる", async ({ page }) => {
    const print = await openPrint(page);
    try {
      // PDF/UA を満たすわけではないが、印刷用 DOM だけ a11y 属性が抜け落ちる
      // （= 経路ごとに別処理が入り込む）ことを防ぐ。
      const texts = await page.$$eval(`${SVG} text`, (nodes) =>
        nodes.map((node) => node.getAttribute("aria-hidden")),
      );
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((hidden) => hidden !== "true")).toEqual([]);
    } finally {
      await print.close();
    }
  });

  test("印刷の図は画面と同じ寸法で描かれる（WYSIWYG）", async ({ page }) => {
    const live = await openLive(page);
    let liveMeasure;
    try {
      liveMeasure = await measureDiagram(page, DIAGRAM_TITLE);
      expect(liveMeasure).not.toBeNull();
      expect(liveMeasure.drawn.height).toBeGreaterThan(0);
      expect(liveMeasure.drawn.width).toBeGreaterThan(0);
    } finally {
      await live.close();
    }

    const print = await openPrint(page);
    try {
      const printMeasure = await measureDiagram(page, DIAGRAM_TITLE);
      expect(printMeasure).not.toBeNull();

      // ビューポート（1280x720）と @page（13.333333in x 7.5in = 1280x720px）が
      // 同じ 16:9 なので、図は画面と PDF でまったく同じ大きさに描かれる。これが
      // 「画面で確認した通りの PDF が出る」ことの実体。print CSS を触って図が
      // 縮んだり伸びたりすると、ここが真っ先に落ちる。
      expect(printMeasure.drawn).toEqual(liveMeasure.drawn);

      // 図が箱からはみ出さない（はみ出すと PDF で切れる）。
      expect(printMeasure.drawn.width).toBeLessThanOrEqual(printMeasure.box.width);
      expect(printMeasure.drawn.height).toBeLessThanOrEqual(printMeasure.box.height);
      // print CSS の高さ上限が効いていること。
      expect(printMeasure.box.height).toBeLessThanOrEqual(PRINT_MAX_HEIGHT_PX + 1);
    } finally {
      await print.close();
    }
  });
});

test.describe("Mermaid との共存", () => {
  const MIXED_DECK = [MIXED_SLIDE];

  test("同じスライドに mermaid があっても図の意味構造は変わらない", async ({ page }) => {
    const live = await openLive(page, { slides: MIXED_DECK });
    let liveSemantics;
    try {
      // mermaid が描けていることを先に確かめる（描けていなければ共存の検証にならない）。
      await expect(page.locator("pre.mermaid svg, .mermaid svg")).toHaveCount(1);
      liveSemantics = await readDiagramSemantics(page, MIXED_TITLE);
      expect(liveSemantics).not.toBeNull();
      expect(liveSemantics.elements.length).toBeGreaterThan(0);
    } finally {
      await live.close();
    }

    const print = await openPrint(page, { slides: MIXED_DECK });
    try {
      await expect(page.locator("pre.mermaid svg, .mermaid svg")).toHaveCount(1);
      expect(await readDiagramSemantics(page, MIXED_TITLE)).toEqual(liveSemantics);
    } finally {
      await print.close();
    }
  });

  test("mermaid が同居しても図の読み上げは 1 回ずつのままになる", async ({ page }) => {
    const live = await openLive(page, { slides: MIXED_DECK });
    try {
      // mermaid はラベルを <text> ではなく <foreignObject> の HTML で描く。
      // つまり architecture 側で <text> に aria-hidden を付けても mermaid には触れない。
      // ここが 0 になったら mermaid の描画方式が変わったということなので、
      // 「mermaid には手を出していない」という前提を見直すこと。
      const mermaidLabels = await page.$$eval(
        ".mermaid svg foreignObject, pre.mermaid svg foreignObject",
        (nodes) => nodes.length,
      );
      expect(mermaidLabels).toBeGreaterThan(0);
      expect(await page.$$eval(".mermaid svg text, pre.mermaid svg text", (n) => n.length)).toBe(0);

      // architecture の属性が mermaid 側へ漏れていない。
      const leaked = await page.$$eval(
        ".mermaid svg [data-architecture-order], pre.mermaid svg [data-architecture-order]",
        (nodes) => nodes.length,
      );
      expect(leaked).toBe(0);

      // 両方の図がアクセシビリティツリーに載り、architecture 側は重複しない。
      const tree = await accessibilityTree(page);
      const diagram = findDiagram(tree, MIXED_TITLE);
      expect(diagram, "architecture の図が AT から見えていない").not.toBeNull();
      expect(flatten(diagram.children).filter((node) => node.role === "StaticText")).toEqual([]);

      // mermaid のラベルは AT に残っている（共存であって片方潰しではない）。
      const spoken = flatten(tree)
        .map((node) => node.name)
        .join("\n");
      expect(spoken).toContain("Client");
      expect(spoken).toContain("Gateway");
    } finally {
      await live.close();
    }
  });
});
