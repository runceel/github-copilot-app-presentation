import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { DETERMINISTIC_CSS, waitForSlideReady } from "../utils/ready.mjs";

const THEMES = ["dark", "light", "microsoft"];
const FIXTURE = join(REPO_ROOT, "test", "fixtures", "layout-visual.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));
const SLIDE_NAMES = ["01-section-h1", "02-section-h2-with-metadata"];
const STANDARD_FIXTURE = join(REPO_ROOT, "test", "fixtures", "standard-title.md");
const STANDARD_SLIDES = splitFixtureDeck(readFileSync(STANDARD_FIXTURE, "utf8"));

const SPECIAL_LAYOUTS = [
  {
    className: "title-slide",
    heading: "h1",
    markdown: ["---", "layout: title", "---", "# 表紙"].join("\n"),
  },
  {
    className: "section-slide",
    heading: "h2",
    markdown: ["---", "layout: section", "---", "## セクション区切り"].join("\n"),
  },
  {
    className: "backcover-slide",
    heading: "h1",
    markdown: ["---", "layout: backcover", "---", "# 背表紙"].join("\n"),
  },
];

const CENTER_SLIDE = [
  "---",
  "layout: center",
  "deck: Center layout",
  "kicker: Center",
  "page: 1",
  "total: 1",
  "---",
  "",
  "## 上下中央のタイトル",
  "",
  "- 短い本文",
].join("\n");

test("セクション区切りフィクスチャとスナップショット名が一致する", () => {
  expect(SLIDES).toHaveLength(SLIDE_NAMES.length);
  expect(STANDARD_SLIDES).toHaveLength(4);
});

for (const theme of THEMES) {
  test.describe(`section layout: ${theme}`, () => {
    SLIDE_NAMES.forEach((name, index) => {
      test(name, async ({ page }) => {
        const harness = await startHarness({ slides: SLIDES, theme, index });
        const consoleErrors = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        try {
          await page.goto(`${harness.url}/`, { waitUntil: "load" });
          await waitForSlideReady(page);
          await page.addStyleTag({ content: DETERMINISTIC_CSS });

          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(page.locator("#stage > .deck.section-slide")).toHaveCount(1);
          await expect(page.locator(".section-slide > .body > h1")).toHaveCount(index === 0 ? 1 : 0);
          await expect(page.locator(".section-slide > .body > h2")).toHaveCount(index === 1 ? 1 : 0);
          await expect(page.locator(".section-slide > header > .slide-title")).toHaveCount(0);
          await expect(page.locator(".section-slide .kicker")).toHaveCount(index === 1 ? 1 : 0);
          await expect(page.locator(".section-slide > footer")).toHaveCount(index === 1 ? 1 : 0);
          await expect(
            page.locator(
              ".section-slide img, .section-slide .theme-cover-logo, .section-slide .theme-backcover-logo",
            ),
          ).toHaveCount(0);

          const layout = await page.locator(".section-slide").evaluate((deck) => {
            const style = getComputedStyle(deck);
            return {
              justifyContent: style.justifyContent,
              textAlign: style.textAlign,
              backgroundImage: style.backgroundImage,
            };
          });
          expect(layout.justifyContent).toBe("center");
          expect(layout.textAlign).toBe("left");
          expect(layout.backgroundImage).not.toBe("none");

          await expect(page).toHaveScreenshot(`${theme}-${name}.png`);
          expect(consoleErrors, "renderer がコンソールエラーを出していない").toEqual([]);
        } finally {
          await harness.close();
        }
      });
    });
  });
}

test("通常スライドのタイトルは本文量にかかわらず上部の同じ位置に固定される", async ({ page }) => {
  const harness = await startHarness({ slides: STANDARD_SLIDES, theme: "dark" });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);

    const readLayout = () =>
      page.locator("#stage > .deck").evaluate((deck) => {
        const title = deck.querySelector(":scope > header > .slide-title");
        const body = deck.querySelector(":scope > .body");
        const deckBox = deck.getBoundingClientRect();
        const titleBox = title.getBoundingClientRect();
        const bodyBox = body.getBoundingClientRect();
        return {
          titleTop: titleBox.top - deckBox.top,
          titleBottom: titleBox.bottom - deckBox.top,
          bodyTop: bodyBox.top - deckBox.top,
        };
      });

    await expect(page.locator(".deck.has-slide-title > header > h2.slide-title")).toHaveCount(1);
    await expect(page.locator(".deck.has-slide-title > .body > h2")).toHaveCount(0);
    const shortBody = await readLayout();
    expect(shortBody.titleBottom).toBeLessThanOrEqual(shortBody.bodyTop);

    await page.locator("#navNext").click();
    await expect(page.locator(".body")).toContainText("6 つ目の要点");
    await waitForSlideReady(page);
    const denseBody = await readLayout();

    expect(Math.abs(denseBody.titleTop - shortBody.titleTop)).toBeLessThan(0.5);
    expect(denseBody.titleBottom).toBeLessThanOrEqual(denseBody.bodyTop);
  } finally {
    await harness.close();
  }
});

test("通常スライドでは先頭の H1/H2 だけをタイトル領域へ移す", async ({ page }) => {
  const harness = await startHarness({ slides: STANDARD_SLIDES, theme: "light", index: 2 });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);

    await expect(page.locator(".deck.has-slide-title > header > h1.slide-title")).toHaveCount(1);
    await expect(page.locator(".deck > .body > h1")).toHaveCount(0);

    await page.locator("#navNext").click();
    await expect(page.locator(".body")).toContainText("本文中の見出し");
    await waitForSlideReady(page);

    await expect(page.locator(".deck.has-slide-title")).toHaveCount(0);
    await expect(page.locator(".deck > .body > h2")).toHaveCount(1);
  } finally {
    await harness.close();
  }
});

test("通常スライドの本文はタイトル直下から上寄せで始まる", async ({ page }) => {
  const harness = await startHarness({ slides: STANDARD_SLIDES, theme: "dark" });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);

    const metrics = await page.locator("#stage > .deck").evaluate((deck) => {
      const body = deck.querySelector(":scope > .body");
      const first = body.firstElementChild;
      return {
        justifyContent: getComputedStyle(body).justifyContent,
        gapAboveContent: first.getBoundingClientRect().top - body.getBoundingClientRect().top,
      };
    });

    expect(metrics.justifyContent).toBe("flex-start");
    // 短い本文でも先頭要素が本文領域の上端に接している（中央へ落ちない）。
    expect(metrics.gapAboveContent).toBeLessThan(1);
  } finally {
    await harness.close();
  }
});

test("layout: center は見出しと本文をまとめて上下中央に置く", async ({ page }) => {
  const harness = await startHarness({ slides: [CENTER_SLIDE], theme: "dark" });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);

    await expect(page.locator("#stage > .deck.center-slide.has-slide-title")).toHaveCount(1);
    await expect(page.locator(".center-slide > header > h2.slide-title")).toHaveCount(1);

    const metrics = await page.locator("#stage > .deck").evaluate((deck) => {
      const header = deck.querySelector(":scope > header");
      const body = deck.querySelector(":scope > .body");
      const footer = deck.querySelector(":scope > footer");
      const deckBox = deck.getBoundingClientRect();
      return {
        spaceAbove: header.getBoundingClientRect().top - deckBox.top,
        spaceBelow: deckBox.bottom - body.getBoundingClientRect().bottom,
        footerPosition: getComputedStyle(footer).position,
        footerGap: deckBox.bottom - footer.getBoundingClientRect().bottom,
        padding: parseFloat(getComputedStyle(deck).paddingBottom),
      };
    });

    // 見出し＋本文のかたまりが上下中央に置かれる（上下の余白がほぼ等しい）。
    expect(Math.abs(metrics.spaceAbove - metrics.spaceBelow)).toBeLessThan(1);
    expect(metrics.spaceAbove).toBeGreaterThan(metrics.padding);
    // フッターは中央寄せの基準をずらさないよう下端に固定する。
    expect(metrics.footerPosition).toBe("absolute");
    expect(Math.abs(metrics.footerGap - metrics.padding)).toBeLessThan(1);
  } finally {
    await harness.close();
  }
});

for (const { className, heading, markdown } of SPECIAL_LAYOUTS) {
  test(`${className} の見出し配置は変更しない`, async ({ page }) => {
    const harness = await startHarness({ slides: [markdown] });
    try {
      await page.goto(`${harness.url}/`, { waitUntil: "load" });
      await waitForSlideReady(page);

      await expect(page.locator(`#stage > .deck.${className}`)).toHaveCount(1);
      await expect(page.locator(`.${className} > .body > ${heading}`)).toHaveCount(1);
      await expect(page.locator(`.${className}.has-slide-title`)).toHaveCount(0);
    } finally {
      await harness.close();
    }
  });
}
