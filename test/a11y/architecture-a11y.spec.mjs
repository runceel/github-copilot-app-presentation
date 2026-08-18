// Architecture 図のアクセシビリティ回帰。
//
// 検証したいのは 4 点。
//   1. 支援技術に同じ内容が **二重に**届かない（可視 <text> とアクセシブル名の重複）
//   2. 図のすべての要素に**空でないアクセシブル名**がある
//   3. キーボードで図に**到達できる**（通常表示は図全体で 1 タブストップ）
//   4. 宣言順が DOM に公開され、描画順（z 順）と区別できる
//
// 判定の根拠は Chromium のアクセシビリティツリー（CDP）と axe-core であって、
// DOM 属性ではない。理由は test/a11y/ax.mjs の先頭に書いた。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";
import { accessibilityTree, findDiagram, flatten, readDiagramSemantics, domOrder } from "./ax.mjs";

const FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-editing.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));
const DIAGRAM_TITLE = "Editing fixture";
const SVG = "svg.architecture-svg";

async function openDeck(page, options = {}) {
  const harness = await startHarness({ slides: SLIDES, ...options });
  const query = options.architectureEdit ? "/?architectureEdit=1" : "/";
  await page.goto(`${harness.url}${query}`, { waitUntil: "load" });
  await waitForSlideReady(page);
  await expect(page.locator(SVG)).toHaveCount(1);
  return harness;
}

test.describe("図が支援技術へ渡す内容", () => {
  test("axe-core が図の中に違反を報告しない（通常表示）", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      // 図に限定して **best-practice まで含む全ルール**を当てる。ここは Phase 6 の担当範囲。
      const result = await new AxeBuilder({ page }).include(".architecture-diagram").analyze();
      expect(
        result.violations.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("axe-core が図の中に違反を報告しない（編集モード）", async ({ page }) => {
    const harness = await openDeck(page, { architectureEdit: true });
    try {
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      const result = await new AxeBuilder({ page }).include(".architecture-diagram").analyze();
      expect(
        result.violations.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("axe-core がページ全体に WCAG A/AA の違反を報告しない", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      // ページ全体は WCAG A/AA に限定する。best-practice まで広げると
      // デッキ外殻（landmark-one-main / page-has-heading-one / region）が出るが、
      // これは Architecture DSL ではなくスライド全体の HTML 構造の話で、
      // 直すと全スライドの見た目に影響しうるため Phase 6 の範囲外と判断した。
      // 範囲外にしたのは best-practice だけで、**WCAG 適合そのものは緩めていない**。
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("同じ文字列が二重に読み上げられない", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const diagram = findDiagram(await accessibilityTree(page), DIAGRAM_TITLE);
      expect(diagram, "図がアクセシビリティツリーに出ていない").not.toBeNull();

      // 図の中に残ってよいのは「要素そのもの」だけ。可視 <text> が StaticText として
      // 残っていると、role="img" / role="group" のアクセシブル名と合わせて 2 回読まれる。
      // （修正前の実測では node / group / connector の **全要素**で二重になっていた）
      const inside = flatten(diagram.children);
      expect(inside.filter((node) => node.role === "StaticText")).toEqual([]);

      // 図の直下は「宣言された要素の数」とちょうど一致する。
      const semantics = await readDiagramSemantics(page, DIAGRAM_TITLE);
      expect(diagram.children).toHaveLength(semantics.elements.length);
    } finally {
      await harness.close();
    }
  });

  test("可視テキストはすべて支援技術から隠れている", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      // node 本文・group タイトル・connector ラベルの 3 系統すべてが対象。
      // 幅に収まらないと表示側は省略されるので、正はあくまで aria-label 側にある。
      const texts = await page.$$eval(`${SVG} text`, (nodes) =>
        nodes.map((node) => ({
          text: node.textContent,
          hidden: node.getAttribute("aria-hidden"),
        })),
      );
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((entry) => entry.hidden !== "true")).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("すべての要素に空でないアクセシブル名がある", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const diagram = findDiagram(await accessibilityTree(page), DIAGRAM_TITLE);
      const nameless = diagram.children.filter((node) => node.name.trim() === "");
      expect(nameless).toEqual([]);

      // connector の名前は端点を **画面に見えている文字列** で呼ぶ。
      // ここが ID（client / api / worker）に戻ったら、図を見ている人が読んでいる
      // ラベルと読み上げが食い違うということ。
      const names = diagram.children.map((node) => node.name);
      expect(names).toContain("Client to API: request");
      expect(names).toContain("API to Worker: enqueue");
    } finally {
      await harness.close();
    }
  });
});

test.describe("キーボードでの到達", () => {
  test("通常表示では図全体がちょうど 1 つのタブストップになる", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const stops = await page.$$eval(`${SVG}, ${SVG} [tabindex]`, (nodes) =>
        nodes
          .filter((node) => node.getAttribute("tabindex") === "0")
          .map((node) => node.getAttribute("data-architecture-id") ?? node.tagName.toLowerCase()),
      );
      expect(stops).toEqual(["svg"]);

      // 実際にフォーカスが載ることまで確認する（属性があるだけでは到達を保証しない）。
      await page.locator(SVG).focus();
      const focused = await page.evaluate(() =>
        document.activeElement?.classList?.contains("architecture-svg"),
      );
      expect(focused).toBe(true);
    } finally {
      await harness.close();
    }
  });

  test("編集モードでは要素がタブストップになり、図のルートは重複しない", async ({ page }) => {
    const harness = await openDeck(page, { architectureEdit: true });
    try {
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      // ルートに tabindex が残っていると「図」→「最初の要素」と空振りのストップが増える。
      expect(await page.getAttribute(SVG, "tabindex")).toBeNull();

      const stops = await page.$$eval(`${SVG} [tabindex="0"]`, (nodes) =>
        nodes.map((node) => node.getAttribute("data-architecture-id")),
      );
      expect(stops.sort()).toEqual(["api", "client", "worker", "zone"]);
    } finally {
      await harness.close();
    }
  });

  test("編集 UI の 2 つの live region が別々の役割を保っている", async ({ page }) => {
      const harness = await openDeck(page, { architectureEdit: true });
      try {
        const toolbar = page.locator(".architecture-editor-toolbar");
        await expect(toolbar).toHaveCount(1);
        await expect(toolbar).toHaveAttribute("role", "toolbar");

        // 操作結果と保存結果は **別々の live region** でなければならない。
        //
        // 統合したくなる理由はある: 1 回の操作で「moved」と「saving → saved」が
        // ほぼ同時に流れるため、支援技術によっては二重に読み上げられる。
        // それでも統合してはいけないのは、両者の寿命が違うから。操作結果は次の操作で
        // 上書きしてよいが、**保存失敗は「編集が実際に失われた」という意味**なので、
        // 次の保存が成功するまで消してはならない。1 つにまとめると、次の操作の
        // 「moved」が保存失敗の告知を消してしまう。
        //
        // ここが 1 つになったら、まず test:editing の「保存の失敗が利用者に見える」
        // 3 本が落ちるはずだが、そちらは DOM の状態を見ているので aria 属性だけを
        // 落とした場合は素通りする。この検証はその隙間を埋めるためにある。
        const regions = await toolbar.evaluate((node) =>
          Array.from(node.querySelectorAll('[role="status"]')).map((region) => ({
            purpose: region.hasAttribute("data-architecture-edit-status")
              ? "edit"
              : region.hasAttribute("data-architecture-save-state")
                ? "save"
                : "unknown",
            live: region.getAttribute("aria-live"),
          })),
        );
        expect(regions.map((region) => region.purpose).sort()).toEqual(["edit", "save"]);
        // どちらも polite（assertive にするとスライド操作のたびに読み上げを割り込む）。
        expect(regions.map((region) => region.live)).toEqual(["polite", "polite"]);
      } finally {
        await harness.close();
      }
  });
});

test.describe("読み上げ順と宣言順", () => {
  test("宣言順が DOM に公開され、描画順と区別できる", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const semantics = await readDiagramSemantics(page, DIAGRAM_TITLE);
      const declaration = semantics.elements.map((element) => element.id);
      const painted = await domOrder(page, DIAGRAM_TITLE);

      // data-architecture-order は 0..n-1 の**抜けのない**通し番号でなければならない。
      // 抜けや重複があると「宣言順」として使えない。
      expect(semantics.elements.map((element) => element.order)).toEqual(
        semantics.elements.map((_, index) => index),
      );
      expect(declaration.sort()).toEqual([...painted].sort());

      // このフィクスチャでは既定の z（group -50 / connector -10 / node 0）により
      // 描画順と宣言順がずれる。ずれること自体が仕様であり、README に書いた
      // 「z は視覚のためのもので、読み上げ順の決定要因にしない」という方針の根拠。
      // ここが一致し始めたら方針か既定 z が変わっているので、README も直すこと。
      expect(painted).not.toEqual(semantics.elements.map((element) => element.id));
      expect(painted).toEqual([
        "zone",
        "client-api",
        "api-worker",
        "client",
        "api",
        "worker",
      ]);
    } finally {
      await harness.close();
    }
  });

  test("読み上げ順は DOM 順と一致する（AT から見た順序の固定）", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const diagram = findDiagram(await accessibilityTree(page), DIAGRAM_TITLE);
      const spoken = diagram.children.map((node) => node.name);
      expect(spoken).toEqual([
        "Service zone",
        "Client to API: request",
        "API to Worker: enqueue",
        "browser icon, Client",
        "api icon, API",
        "server icon, Worker",
      ]);
    } finally {
      await harness.close();
    }
  });
});
