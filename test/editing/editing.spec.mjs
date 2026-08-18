// Architecture 図の編集ワークフローのブラウザ回帰。
//
// 検証したいのは 4 点。
//   1. ドラッグでノードが動き、**connector が引き直される**
//      （旧 PoC は transform だけを当てていたので線が置き去りになっていた）
//   2. キーボードだけで一通り操作できる（選択・移動・layout 解除・undo/redo）
//   3. 編集結果が /edit で元の Markdown へ書き戻り、再描画後も残る
//   4. presenter / 印刷では編集 UI が **DOM に存在しない**
//
// スクリーンショット比較はしない（ここは振る舞いの検証で、見た目は visual が担当）。

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForPrintReady, waitForSlideReady } from "../utils/ready.mjs";

const FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-editing.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));

const EDITOR = ".architecture-editor-toolbar";
const NODE = (id) => `[data-architecture-id="${id}"]`;

/** 編集モードのハーネスを起動して描画完了まで待つ。 */
async function openEditor(page, options = {}) {
  const harness = await startHarness({ slides: SLIDES, architectureEdit: true, ...options });
  await page.goto(`${harness.url}/`, { waitUntil: "load" });
  await waitForSlideReady(page);
  await expect(page.locator(EDITOR)).toHaveCount(1);
  return harness;
}

/** 図の中の connector の経路（引き直しの有無を見るため）。 */
function connectorPaths(page) {
  return page.$$eval("[data-architecture-connector] path", (nodes) =>
    nodes.map((node) => node.getAttribute("d")),
  );
}

/** ノードの現在位置（描画結果から読む）。 */
function nodeBox(page, id) {
  return page.$eval(`[data-architecture-id="${id}"]`, (node) => {
    const rect = node.getBBox();
    return { x: Math.round(rect.x), y: Math.round(rect.y) };
  });
}

test.describe("編集モード", () => {
  test("ドラッグでノードが動き、connector が引き直される", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      const before = await connectorPaths(page);
      expect(before.length).toBeGreaterThan(0);
      const beforeBox = await nodeBox(page, "client");

      const target = page.locator(NODE("client"));
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120, { steps: 8 });
      await page.mouse.up();

      // 編集は図全体の再描画を伴うので、位置が確定するまで待つ。
      await expect.poll(async () => (await nodeBox(page, "client")).y).not.toBe(beforeBox.y);

      const after = await connectorPaths(page);
      expect(after.length).toBe(before.length);
      // 線が置き去りになっていないこと = 経路が引き直されていること。
      expect(after).not.toEqual(before);

      // 書き戻しも届いている。
      expect(harness.editReports.length).toBeGreaterThan(0);
      expect(harness.slides[0]).not.toBe(SLIDES[0]);
    } finally {
      await harness.close();
    }
  });

  test("layout 管理下のノードはドラッグしても動かず、理由が読み上げられる", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      const beforeSource = harness.slides[0];
      const beforeBox = await nodeBox(page, "api");

      const target = page.locator(NODE("api"));
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();

      expect(await nodeBox(page, "api")).toEqual(beforeBox);
      // DSL は 1 文字も変わらない。
      expect(harness.slides[0]).toBe(beforeSource);
      expect(harness.editReports).toHaveLength(0);

      // 「なぜ動かないか」と「どの group を解除すればよいか」が伝わる。
      const status = page.locator("[data-architecture-edit-status]");
      await expect(status).toHaveAttribute("aria-live", "polite");
      await expect(status).toContainText("zone");
    } finally {
      await harness.close();
    }
  });

  test("キーボードだけで選択・移動・layout 解除・undo ができる", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      const start = await nodeBox(page, "client");

      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => (await nodeBox(page, "client")).x).toBeGreaterThan(start.x);
      const coarse = await nodeBox(page, "client");

      // Shift は微調整（粗い移動より小さく動く）。
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect.poll(async () => (await nodeBox(page, "client")).x).toBeGreaterThan(coarse.x);
      const fine = await nodeBox(page, "client");
      expect(fine.x - coarse.x).toBeLessThan(coarse.x - start.x);

      // layout 管理下のノードを選び、L で解除すると動かせるようになる。
      await page.locator(NODE("api")).focus();
      const apiBefore = await nodeBox(page, "api");
      await page.keyboard.press("l");
      await expect.poll(() => harness.slides[0].includes('"layout"')).toBe(false);
      // 解除は見た目を変えない。
      expect(await nodeBox(page, "api")).toEqual(apiBefore);

      await page.locator(NODE("api")).focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => (await nodeBox(page, "api")).y).toBeGreaterThan(apiBefore.y);

      // Ctrl+Z で戻り、Ctrl+Shift+Z でやり直す。
      await page.keyboard.press("Control+z");
      await expect.poll(async () => (await nodeBox(page, "api")).y).toBe(apiBefore.y);
      await page.keyboard.press("Control+Shift+z");
      await expect.poll(async () => (await nodeBox(page, "api")).y).toBeGreaterThan(apiBefore.y);
    } finally {
      await harness.close();
    }
  });

  test("編集は元の Markdown へ書き戻り、再読み込み後も残る", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => harness.editReports.length).toBeGreaterThan(0);

      const saved = harness.slides[0];
      expect(saved).toContain("```architecture");
      // 図の前後の地の文とフロントマターが失われていない。
      expect(saved).toContain("## 編集ワークフローの回帰用フィクスチャ");
      expect(saved).toContain("deck: Architecture DSL");

      const moved = await nodeBox(page, "client");
      await page.reload({ waitUntil: "load" });
      await waitForSlideReady(page);
      expect(await nodeBox(page, "client")).toEqual(moved);
    } finally {
      await harness.close();
    }
  });

  test("編集モードでもコンソールエラーを出さない", async ({ page }) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Control+z");
      await expect(page.locator(".architecture-error")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

test.describe("編集 UI が発表・印刷へ漏れない", () => {
  // サーバー側が編集モードでも、presenter と印刷では編集 UI が出てはいけない。
  // ここが崩れると発表中の画面にツールバーが写り込む。

  test("presenter モードでは編集 UI が DOM に存在しない", async ({ page }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: true });
    try {
      await page.goto(`${harness.url}/?present=1`, { waitUntil: "load" });
      await waitForSlideReady(page);

      await expect(page.locator(EDITOR)).toHaveCount(0);
      await expect(page.locator("[data-architecture-movable]")).toHaveCount(0);
      await expect(page.locator("[data-architecture-edit-status]")).toHaveCount(0);

      // 図そのものは出ている（「何も描かれていないから 0 件」ではない）。
      await expect(page.locator(NODE("client"))).toHaveCount(1);

      // キーボードで動かそうとしても DSL は変わらない。
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(200);
      expect(harness.editReports).toHaveLength(0);
      expect(harness.slides[0]).toBe(SLIDES[0]);
    } finally {
      await harness.close();
    }
  });

  test("印刷モードでは編集 UI が DOM に存在しない", async ({ page }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: true });
    try {
      await page.goto(`${harness.url}/?print=1&token=${harness.printToken}`, {
        waitUntil: "load",
      });
      await waitForPrintReady(page);

      await expect(page.locator(EDITOR)).toHaveCount(0);
      await expect(page.locator("[data-architecture-movable]")).toHaveCount(0);
      await expect(page.locator(NODE("client"))).toHaveCount(1);
      expect(harness.editReports).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  test("編集モードが無効なサーバーでは編集 UI が出ない", async ({ page }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: false });
    try {
      await page.goto(`${harness.url}/`, { waitUntil: "load" });
      await waitForSlideReady(page);
      await expect(page.locator(EDITOR)).toHaveCount(0);
      await expect(page.locator(NODE("client"))).toHaveCount(1);
    } finally {
      await harness.close();
    }
  });

  test("サーバーは編集モードが無効なら /edit を拒否する", async ({ request }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: false });
    try {
      const response = await request.post(`${harness.url}/edit`, {
        data: { index: 0, block: 0, source: '{"version":1,"elements":[]}' },
      });
      expect(response.status()).toBe(409);
      expect((await response.json()).error).toBe("edit_mode_disabled");
      expect(harness.slides[0]).toBe(SLIDES[0]);
    } finally {
      await harness.close();
    }
  });
});
