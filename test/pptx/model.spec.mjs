import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";

const SLIDES = [
  `---
layout: title
theme: light
title: Hybrid export
kicker: MarkdStage
---
# Hybrid export

Editable title copy.`,
  `---
theme: microsoft
title: Native content
---
## Native content

Paragraph with **bold**, *emphasis*, and [a link](https://example.com/docs).

<!--
Explain **why** this content stays editable.

- Open [the docs](https://example.com/docs).

Fran&ccedil;ais &eacute;lan &copy; 2026.

\`\`\`html
&lt;div&gt; &amp; &#35;
\`\`\`
-->

<p style="transform: rotate(2deg)">Rotated fallback</p>

<p>Nested <span style="display: inline-block; transform: rotate(-2deg)">effect fallback</span></p>

- First
  - Nested
- Last

| Name | Value |
| --- | ---: |
| Alpha | 42 |

![Raster sample](/assets/readme/simple-slide.png)

![Unsupported vector](/assets/sample.svg)

\`\`\`js
const answer = 42;

if (answer) {
  console.log("value", answer);
}
\`\`\`

<div class="raw-card">Raw HTML fallback</div>

<table><tr><td style="box-shadow: 0 0 4px red">Shadowed cell fallback</td></tr></table>

<table><tr><td colspan="2">Merged cell fallback</td></tr><tr><td>A</td><td>B</td></tr></table>`,
  `---
layout: center
theme: dark
title: Diagrams
---
## Diagrams

\`\`\`mermaid
flowchart LR
  A[Browser] --> B[API]
\`\`\`

\`\`\`architecture
{
  "version": 1,
  "canvas": { "width": 800, "height": 360 },
  "title": "Editable architecture",
  "elements": [
    {
      "type": "group",
      "id": "services",
      "x": 20,
      "y": 20,
      "width": 500,
      "height": 320,
      "title": "Services",
      "children": [
        { "type": "node", "id": "api", "x": 50, "y": 100, "width": 170, "height": 100, "text": "API", "icon": "api" },
        { "type": "node", "id": "worker", "x": 280, "y": 100, "width": 170, "height": 100, "text": "Worker" }
      ]
    },
    { "type": "node", "id": "store", "x": 610, "y": 120, "width": 160, "height": 100, "text": "Store" },
    { "type": "connector", "from": "api", "to": "worker", "label": "calls" },
    { "type": "connector", "from": "worker", "to": "store", "routing": "orthogonal", "label": "writes" }
  ]
}
\`\`\``,
  `---
layout: section
title: Section
---
# Section`,
  `---
layout: backcover
title: Finish
logo: MarkdStage
copyright: Example
---
# Finish`,
];

async function openPptx(page, harness) {
  await page.goto(
    `${harness.url}/?pptx=1&token=${encodeURIComponent(harness.printToken)}`,
    { waitUntil: "load" },
  );
  await page.waitForFunction(
    () =>
      document.documentElement.getAttribute("data-pptx-ready") === "true" ||
      document.documentElement.getAttribute("data-pptx-error") === "true",
    undefined,
    { timeout: 120_000 },
  );
  expect(
    await page.evaluate(() => document.documentElement.getAttribute("data-pptx-error")),
  ).not.toBe("true");
  return page.evaluate(() => window.__presentationPptxModel);
}

test("collects a serializable hybrid model for every layout and theme", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES, theme: "dark" });
  try {
    const model = await openPptx(page, harness);

    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    expect({ version: model.version, width: model.width, height: model.height }).toEqual({
      version: 1,
      width: 1280,
      height: 720,
    });
    expect(model.slides).toHaveLength(SLIDES.length);
    expect(model.slides.map((slide) => slide.index)).toEqual([0, 1, 2, 3, 4]);
    expect(model.slides.map((slide) => slide.layout)).toEqual([
      "title",
      "default",
      "center",
      "section",
      "backcover",
    ]);
    expect(model.slides.map((slide) => slide.layoutId)).toEqual([
      "light:title",
      "microsoft:default",
      "dark:center",
      "dark:section",
      "dark:backcover",
    ]);
    expect(model.masters).toEqual([
      {
        id: "light",
        theme: "light",
        layoutIds: [
          "light:title",
          "light:default",
          "light:center",
          "light:section",
          "light:backcover",
        ],
      },
      {
        id: "microsoft",
        theme: "microsoft",
        layoutIds: [
          "microsoft:title",
          "microsoft:default",
          "microsoft:center",
          "microsoft:section",
          "microsoft:backcover",
        ],
      },
      {
        id: "dark",
        theme: "dark",
        layoutIds: [
          "dark:title",
          "dark:default",
          "dark:center",
          "dark:section",
          "dark:backcover",
        ],
      },
    ]);
    expect(model.layouts).toHaveLength(15);
    for (const master of model.masters) {
      expect(
        model.layouts
          .filter((layout) => layout.theme === master.theme)
          .map((layout) => layout.name),
      ).toEqual(["title", "default", "center", "section", "backcover"]);
    }
    expect(model.slides.map((slide) => slide.theme)).toEqual([
      "light",
      "microsoft",
      "dark",
      "dark",
      "dark",
    ]);
    expect(model.slides.map((slide) => slide.title)).toEqual([
      "Hybrid export",
      "Native content",
      "Diagrams",
      "Section",
      "Finish",
    ]);
    expect(model.slides[1].notes).toBe(
      [
        "Explain why this content stays editable.",
        "",
        "• Open the docs (https://example.com/docs).",
        "",
        "Français élan © 2026.",
        "",
        "&lt;div&gt; &amp; &#35;",
      ].join("\n"),
    );
    const kicker = model.slides[0].elements.find(
      (element) =>
        element.type === "text" &&
        element.paragraphs.some((paragraph) =>
          paragraph.runs.some((run) => run.text.includes("MarkdStage")),
        ),
    );
    const kickerBounds = await page.evaluate(() => {
      const deck = document.querySelector("#stage > .deck");
      const element = deck.querySelector(".kicker");
      const deckRect = deck.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const textRect = range.getBoundingClientRect();
      return {
        elementX: elementRect.left - deckRect.left,
        textX: textRect.left - deckRect.left,
      };
    });
    expect(kicker.x).toBeCloseTo(kickerBounds.textX, 1);
    expect(kicker.x).toBeGreaterThan(kickerBounds.elementX);
    expect(kicker.textWrap).toBe("none");
    expect(model.slides[0].fallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "decoration",
          reason: "kicker-mark-rendered-as-artwork",
          captureId: expect.stringMatching(/^pptx-fallback-/),
          zOrder: expect.any(Number),
        }),
      ]),
    );
    for (const slide of model.slides) {
      expect(slide.width).toBe(1280);
      expect(slide.height).toBe(720);
      for (const element of slide.elements) {
        expect(element.x).toBeGreaterThanOrEqual(0);
        expect(element.y).toBeGreaterThanOrEqual(0);
        expect(element.width).toBeGreaterThanOrEqual(0);
        expect(element.height).toBeGreaterThanOrEqual(0);
      }
    }
    expect(harness.printReports).toHaveLength(1);
    expect(harness.printReports[0]).toMatchObject({ status: "ready", error: "" });
  } finally {
    await harness.close();
  }
});

test("preserves decorated text insets and one-line footer wrapping", async ({ page }) => {
  const harness = await startHarness({
    slides: [
      `---
theme: microsoft
deck: KAZUKI OTA
page: 3
total: 8
---
## Spacing

> 技術を「知っている」から、**現場で使える**へ`,
    ],
  });
  try {
    const model = await openPptx(page, harness);
    const textOf = (element) =>
      element.paragraphs.flatMap((paragraph) => paragraph.runs).map((run) => run.text).join("");
    const textElements = model.slides[0].elements.filter((element) => element.type === "text");
    const blockquote = textElements.find((element) => textOf(element).includes("現場で使える"));
    const footer = textElements.find((element) => textOf(element) === "KAZUKI OTA");
    const pageNumber = textElements.find((element) => textOf(element) === "3 / 8");
    const metrics = await page.evaluate(() => {
      const deck = document.querySelector("#stage > .deck");
      const deckRect = deck.getBoundingClientRect();
      const measure = (element) => {
        const style = getComputedStyle(element);
        const inset = (padding, border) =>
          Number.parseFloat(style[padding]) + Number.parseFloat(style[border]);
        const rect = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          x: rect.left - deckRect.left,
          width: rect.width,
          textWidth: range.getBoundingClientRect().width,
          fontSize: Number.parseFloat(style.fontSize),
          insets: {
            left: inset("paddingLeft", "borderLeftWidth"),
            top: inset("paddingTop", "borderTopWidth"),
            right: inset("paddingRight", "borderRightWidth"),
            bottom: inset("paddingBottom", "borderBottomWidth"),
          },
        };
      };
      return {
        blockquote: measure(deck.querySelector("blockquote")),
        footer: measure(deck.querySelector("footer > span:first-child")),
        pageNumber: measure(deck.querySelector("footer > .page")),
      };
    });

    expect(blockquote).toBeTruthy();
    expect(footer).toBeTruthy();
    expect(pageNumber).toBeTruthy();
    expect(blockquote.x).toBeCloseTo(metrics.blockquote.x, 1);
    expect(blockquote.textInsets.left).toBeCloseTo(metrics.blockquote.insets.left, 1);
    expect(blockquote.textInsets.right).toBe(0);
    expect(pageNumber.x).toBeCloseTo(metrics.pageNumber.x, 1);
    expect(pageNumber.textInsets.left).toBeCloseTo(metrics.pageNumber.insets.left, 1);
    expect(pageNumber.textInsets.right).toBe(0);
    expect(
      pageNumber.width - pageNumber.textInsets.left - pageNumber.textInsets.right,
    ).toBeGreaterThanOrEqual(
      metrics.pageNumber.textWidth + metrics.pageNumber.fontSize * 0.5 - 0.1,
    );
    expect(footer.width).toBeGreaterThan(metrics.footer.width);
    expect(blockquote.textWrap).toBe("none");
    expect(footer.textWrap).toBe("none");
    expect(pageNumber.textWrap).toBe("none");
    expect(model.slides[0].fallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "decoration",
          reason: "native-text-decoration-rendered-as-artwork",
          x: blockquote.x,
        }),
        expect.objectContaining({
          type: "decoration",
          reason: "footer-decoration-rendered-as-artwork",
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      ]),
    );
  } finally {
    await harness.close();
  }
});

test("applies custom theme variables and metadata assets", async ({ page }) => {
  const harness = await startHarness({
    slides: [
      `---
layout: title
title: Custom theme
---
# Custom theme

Branded export`,
      `---
layout: backcover
title: Override back cover
logo: Slide logo
copyright: Slide copyright
---
# Override back cover`,
      `---
layout: backcover
title: Theme back cover
---
# Theme back cover`,
    ],
    theme: "custom",
    customThemeCss:
      "--bg:#102030;--fg:#fefefe;--body:#e0e4e8;--accent:#ff6600;--accent-strong:#ff8800;--accent-soft:rgba(255,102,0,.18);--accent-line:rgba(255,102,0,.4);--surface:#203040;--code:#182838;--code-fg:#fefefe;--border:#405060;--topbar:#ff6600;--cover-bg:#102030;--cover-topbar:#ff6600;--print-cover-bg:#102030;--backcover-bg:#102030;",
    customThemeMeta: {
      version: 1,
      cover: {
        logo: {
          image: "/assets/readme/simple-slide.png",
          alt: "Custom logo",
        },
      },
      backcover: {
        logo: {
          image: "/assets/readme/simple-slide.png",
          alt: "Custom back cover logo",
        },
        copyright: "Theme copyright",
      },
    },
  });
  try {
    const model = await openPptx(page, harness);
    const slide = model.slides[0];
    const runs = slide.elements
      .filter((element) => element.type === "text")
      .flatMap((element) => element.paragraphs.flatMap((paragraph) => paragraph.runs));
    const title = slide.elements.find(
      (element) =>
        element.type === "text" &&
        element.paragraphs.some((paragraph) =>
          paragraph.runs.some((run) => run.text.includes("Custom theme")),
        ),
    );

    expect(slide.theme).toBe("custom");
    expect(runs.some((run) => run.color === "#FEFEFE")).toBe(true);
    expect(title.textWrap).toBe("none");
    expect(slide.elements.some((element) => element.type === "image")).toBe(false);
    const titleLayout = model.layouts.find((layout) => layout.id === "custom:title");
    expect(titleLayout.elements).toHaveLength(1);
    expect(titleLayout.elements[0]).toMatchObject({
      type: "image",
      alt: "Custom logo",
    });
    const layoutLogo = await page.evaluate(() => {
      const layout = [...document.querySelectorAll(".pptx-layout-template")].find(
        (candidate) => candidate.dataset.pptxLayoutId === "custom:title",
      );
      const logo = layout?.querySelector(".theme-cover-logo");
      return logo
        ? {
            src: logo.getAttribute("src"),
            alt: logo.getAttribute("alt"),
            native: logo.getAttribute("data-pptx-native"),
          }
        : null;
    });
    expect(layoutLogo?.src).toMatch(/simple-slide\.png$/);
    expect(layoutLogo?.alt).toBe("Custom logo");
    expect(layoutLogo?.native).toBe("image");
    const backcovers = model.slides.slice(1);
    const textOf = (element) =>
      element.paragraphs.flatMap((paragraph) => paragraph.runs).map((run) => run.text).join("");
    expect(
      backcovers[0].elements
        .filter((element) => element.type === "text")
        .map(textOf),
    ).toEqual(expect.arrayContaining(["Slide logo", "Override back cover", "Slide copyright"]));
    expect(backcovers[0].elements.some((element) => element.type === "image")).toBe(false);
    expect(
      backcovers[1].elements
        .filter((element) => element.type === "text")
        .map(textOf),
    ).toEqual(expect.arrayContaining(["Theme back cover", "Theme copyright"]));
    expect(
      backcovers[1].elements.find((element) => element.type === "image")?.alt,
    ).toBe("Custom back cover logo");
    const backcoverLayoutBranding = await page.evaluate(() => {
      const layout = [...document.querySelectorAll(".pptx-layout-template")].find(
        (candidate) => candidate.dataset.pptxLayoutId === "custom:backcover",
      );
      return layout?.querySelectorAll(
        ".theme-backcover-logo, .theme-backcover-copyright",
      ).length;
    });
    expect(backcoverLayoutBranding).toBe(0);
    const separatedArtwork = await page.evaluate(() => {
      document.body.classList.remove("pptx-layout-artwork-mode");
      document.body.classList.add("pptx-slide-artwork-mode");
      const actual = document.querySelector("#stage > .deck:not(.pptx-layout-template)");
      const layout = [...document.querySelectorAll(".pptx-layout-template")].find(
        (candidate) => candidate.dataset.pptxLayoutId === "custom:title",
      );
      return {
        actualBackground: getComputedStyle(actual).backgroundColor,
        actualTopbar: getComputedStyle(actual, "::before").display,
        actualLogo: getComputedStyle(actual.querySelector(".theme-cover-logo")).visibility,
        layoutBackground: getComputedStyle(layout).backgroundColor,
        layoutLogo: getComputedStyle(layout.querySelector(".theme-cover-logo")).visibility,
      };
    });
    expect(separatedArtwork).toEqual({
      actualBackground: "rgba(0, 0, 0, 0)",
      actualTopbar: "none",
      actualLogo: "hidden",
      layoutBackground: "rgb(16, 32, 48)",
      layoutLogo: "visible",
    });
  } finally {
    await harness.close();
  }
});

test("collects native text, nested lists, links, tables, and raster images", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    const model = await openPptx(page, harness);
    const slide = model.slides[1];
    const text = slide.elements.filter((element) => element.type === "text");
    const allRuns = text.flatMap((element) =>
      element.paragraphs.flatMap((paragraph) => paragraph.runs),
    );
    const lists = text
      .flatMap((element) => element.paragraphs)
      .filter((paragraph) => paragraph.bullet);
    const listText = text.filter((element) =>
      element.paragraphs.some((paragraph) => paragraph.bullet),
    );
    const table = slide.elements.find((element) => element.type === "table");
    const images = slide.elements.filter((element) => element.type === "image");
    const image = images.find((element) => element.src.endsWith("simple-slide.png"));
    const svg = images.find((element) => element.src.endsWith("sample.svg"));
    const textOf = (element) =>
      element.paragraphs.flatMap((paragraph) => paragraph.runs).map((run) => run.text).join("");
    const code = slide.elements.find(
      (element) =>
        element.type === "shape" &&
        Array.isArray(element.paragraphs) &&
        textOf(element).includes('console.log("value", answer);'),
    );
    const codeAccent = slide.elements.find(
      (element) =>
        element.type === "shape" &&
        code &&
        element.path === `${code.path}.accent`,
    );

    expect(allRuns.some((run) => run.text.includes("bold") && run.bold)).toBe(true);
    expect(allRuns.some((run) => run.text.includes("emphasis") && run.bold)).toBe(true);
    expect(allRuns.find((run) => run.text.includes("a link"))?.href).toBe(
      "https://example.com/docs",
    );
    expect(allRuns.some((run) => run.text.includes("Rotated fallback"))).toBe(false);
    expect(allRuns.some((run) => run.text.includes("effect fallback"))).toBe(false);
    expect(allRuns.some((run) => run.text.includes("Explain why"))).toBe(false);
    expect(listText).toHaveLength(1);
    expect(
      listText[0].paragraphs.map((paragraph) =>
        paragraph.runs.map((run) => run.text).join("").trim(),
      ),
    ).toEqual(["First", "Nested", "Last"]);
    expect(lists.map((paragraph) => paragraph.level)).toContain(1);
    expect(lists.every((paragraph) => paragraph.bullet.character === "•")).toBe(true);
    expect(lists.every((paragraph) => paragraph.bullet.color === "#0078D4")).toBe(true);
    expect(listText[0].paragraphs[1].leftMargin).toBeGreaterThan(
      listText[0].paragraphs[0].leftMargin || 0,
    );
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells).toHaveLength(2);
    expect(table.rows[1].cells[1].paragraphs[0].runs[0].text.trim()).toBe("42");
    expect(image.src).toMatch(/simple-slide\.png$/);
    expect(image.shape).toBe("roundedRect");
    expect(svg.src).toMatch(/sample\.svg$/);
    const imageEffect = slide.fallbacks.find(
      (fallback) =>
        fallback.type === "effect" &&
        fallback.path === image.path &&
        fallback.reason.includes("box-shadow"),
    );
    expect(imageEffect.width).toBeGreaterThan(image.width);
    expect(imageEffect.y).toBeLessThan(image.y);
    expect(slide.elements.filter((element) => element.type === "table")).toHaveLength(1);
    expect(code).toMatchObject({
      shape: "roundedRect",
      textWrap: "none",
      verticalAlignment: "top",
    });
    expect(code.fill).toBeTruthy();
    expect(code.stroke).toBeTruthy();
    expect(code.textInsets.left).toBeGreaterThan(code.textInsets.right);
    expect(code.paragraphs.map((paragraph) => textOf({ paragraphs: [paragraph] }))).toEqual([
      "const answer = 42;",
      "",
      "if (answer) {",
      '  console.log("value", answer);',
      "}",
    ]);
    expect(code.paragraphs.every((paragraph) => paragraph.lineSpacing > 0)).toBe(true);
    expect(
      code.paragraphs.every(
        (paragraph) => paragraph.spaceBefore === 0 && paragraph.spaceAfter === 0,
      ),
    ).toBe(true);
    const codeRuns = code.paragraphs.flatMap((paragraph) => paragraph.runs);
    expect(codeRuns.every((run) => run.fontFace === "Cascadia Code")).toBe(true);
    expect(new Set(codeRuns.map((run) => run.color)).size).toBeGreaterThan(1);
    expect(codeAccent).toMatchObject({
      shape: "roundedRect",
      width: 4,
      fill: expect.any(String),
    });
    expect(slide.fallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "effect",
          reason: "native-code-approximates: box-shadow",
        }),
        expect.objectContaining({ type: "html", reason: "arbitrary-html-rendered-as-artwork" }),
        expect.objectContaining({
          type: "effect",
          reason: expect.stringContaining("element-rendered-as-artwork: transform"),
        }),
        expect.objectContaining({
          type: "effect",
          reason: expect.stringContaining("element-rendered-as-artwork: box-shadow"),
        }),
        expect.objectContaining({
          type: "table",
          reason: "merged-table-rendered-as-artwork",
        }),
      ]),
    );
    expect(slide.fallbacks.some((fallback) => fallback.type === "code")).toBe(false);
    expect(
      slide.fallbacks.some(
        (fallback) =>
          fallback.type === "image" && fallback.reason === "unsupported-image-format",
      ),
    ).toBe(false);
    const rotatedVisibility = await page.evaluate(() => {
      const paragraphs = [...document.querySelectorAll("#stage > .deck")[1].querySelectorAll("p")];
      const rotated = paragraphs.find((element) => element.textContent.includes("Rotated fallback"));
      const nested = paragraphs.find((element) => element.textContent.includes("effect fallback"));
      const code = document.querySelectorAll("#stage > .deck")[1].querySelector("pre:not(.mermaid)");
      return {
        native: rotated?.hasAttribute("data-pptx-native") || false,
        color: rotated ? getComputedStyle(rotated).color : "",
        nestedNative: nested?.hasAttribute("data-pptx-native") || false,
        nestedColor: nested ? getComputedStyle(nested).color : "",
        codeNative: code?.getAttribute("data-pptx-native") || "",
        codeVisibility: code ? getComputedStyle(code).visibility : "",
        decorationCount: document
          .querySelectorAll("#stage > .deck")[1]
          .querySelectorAll(".pptx-effect-fallback").length,
      };
    });
    expect(rotatedVisibility.native).toBe(false);
    expect(rotatedVisibility.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(rotatedVisibility.nestedNative).toBe(false);
    expect(rotatedVisibility.nestedColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(rotatedVisibility.codeNative).toBe("code");
    expect(rotatedVisibility.codeVisibility).toBe("hidden");
    expect(rotatedVisibility.decorationCount).toBe(2);
  } finally {
    await harness.close();
  }
});

test("groups separate unordered and ordered lists into editable text boxes", async ({ page }) => {
  const harness = await startHarness({
    slides: [
      `---
theme: microsoft
title: Lists
---
## Lists

- First
  - Nested
- Last

3. Third
4. Fourth`,
    ],
  });
  try {
    const model = await openPptx(page, harness);
    const listText = model.slides[0].elements.filter(
      (element) =>
        element.type === "text" &&
        element.paragraphs.length > 0 &&
        element.paragraphs.every((paragraph) => paragraph.bullet),
    );
    const textOf = (paragraph) =>
      paragraph.runs.map((run) => run.text).join("").trim();

    expect(listText).toHaveLength(2);
    expect(listText[0].paragraphs.map(textOf)).toEqual(["First", "Nested", "Last"]);
    expect(listText[0].paragraphs.map((paragraph) => paragraph.level)).toEqual([0, 1, 0]);
    expect(listText[1].paragraphs.map(textOf)).toEqual(["Third", "Fourth"]);
    expect(
      listText[1].paragraphs.map((paragraph) => paragraph.bullet.character),
    ).toEqual(["3.", "4."]);
    expect(
      listText.flatMap((element) =>
        element.paragraphs.map((paragraph) => paragraph.bullet.color),
      ),
    ).toEqual(["#0078D4", "#0078D4", "#0078D4", "#0078D4", "#0078D4"]);
  } finally {
    await harness.close();
  }
});

test("exports Architecture objects from the DSL and keeps fallback artwork visible", async ({
  page,
}) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    const model = await openPptx(page, harness);
    const slide = model.slides[2];
    const architecture = slide.elements.filter((element) => element.architecture);
    const connectors = architecture.filter((element) => element.type === "connector");

    expect(
      architecture.some(
        (element) =>
          element.type === "shape" &&
          element.architecture.kind === "group" &&
          element.fill !== null &&
          element.stroke !== null &&
          element.text?.paragraphs?.[0]?.runs?.[0]?.text === "Services",
      ),
    ).toBe(true);
    const apiShapeIndex = architecture.findIndex(
      (element) =>
        element.type === "shape" &&
        element.architecture.kind === "node" &&
        element.architecture.id === "api",
    );
    const apiIconIndex = architecture.findIndex(
      (element) =>
        element.type === "image" &&
        element.architecture.kind === "icon-picture" &&
        element.architecture.id === "api",
    );
    const firstFrontLabelIndex = architecture.findIndex(
      (element) =>
        element.type === "shape" && element.architecture.kind === "connector-label",
    );
    expect(apiShapeIndex).toBeLessThan(apiIconIndex);
    expect(apiIconIndex).toBe(apiShapeIndex + 1);
    expect(firstFrontLabelIndex).toBeGreaterThan(
      Math.max(
        ...architecture
          .map((element, index) => ({ element, index }))
          .filter(({ element }) => element.architecture.kind !== "connector-label")
          .map(({ index }) => index),
      ),
    );
    expect(
      architecture.some(
        (element) =>
          element.type === "shape" &&
          element.architecture.kind === "node" &&
          element.fill !== null &&
          element.stroke !== null &&
          element.text?.paragraphs?.[0]?.runs?.[0]?.text === "API",
      ),
    ).toBe(true);
    expect(
      architecture.some(
        (element) =>
          element.type === "shape" &&
          element.architecture.kind === "connector-label" &&
          element.text?.paragraphs?.[0]?.runs?.[0]?.text === "calls",
      ),
    ).toBe(true);
    expect(
      architecture.some(
        (element) =>
          element.type === "image" &&
          element.architecture.kind === "icon-picture" &&
          element.src.startsWith("data:image/png") &&
          element.width < 100 &&
          element.height < 100,
      ),
    ).toBe(true);
    expect(connectors).toHaveLength(2);
    expect(connectors.every((connector) => connector.points.length >= 2)).toBe(true);
    expect(
      connectors.every((connector) =>
        connector.points.every(
          (point) => point.x >= 0 && point.x <= 1280 && point.y >= 0 && point.y <= 720,
        ),
      ),
    ).toBe(true);
    expect(slide.fallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mermaid",
          reason: "mermaid-rendered-as-artwork",
        }),
        expect.objectContaining({
          type: "architecture-icon",
          reason: "icon-rendered-as-foreground-picture",
        }),
      ]),
    );
    expect(slide.fallbacks.filter((fallback) => fallback.type === "mermaid")).toHaveLength(1);
    expect(
      slide.fallbacks.find((fallback) => fallback.type === "mermaid")?.captureId,
    ).toMatch(/^pptx-fallback-/);
    expect(
      slide.fallbacks.some(
        (fallback) => fallback.type === "html" && fallback.path.includes("pre.mermaid"),
      ),
    ).toBe(false);
    expect(slide.fallbacks.some((fallback) => fallback.type === "architecture-shape")).toBe(false);

    const visibility = await page.evaluate(() => {
      const nativeHeading = document.querySelectorAll("#stage > .deck")[1].querySelector("h2");
      const diagramDeck = document.querySelectorAll("#stage > .deck")[2];
      const nativeArchitecture = diagramDeck.querySelector(
        '[data-architecture-type="node"] > rect',
      );
      const icon = diagramDeck.querySelector("[data-architecture-icon]");
      return {
        bodyClass: document.body.classList.contains("pptx-artwork-mode"),
        bodyAttribute: document.body.getAttribute("data-pptx-artwork"),
        headingColor: getComputedStyle(nativeHeading).color,
        architectureFill: getComputedStyle(nativeArchitecture).fill,
        iconOpacity: getComputedStyle(icon).opacity,
        mermaidVisible:
          diagramDeck.querySelectorAll("pre.mermaid svg").length > 0 &&
          getComputedStyle(diagramDeck.querySelector("pre.mermaid")).visibility !== "hidden",
        codeVisible:
          getComputedStyle(
            document.querySelectorAll("#stage > .deck")[1].querySelector("pre"),
          ).visibility !== "hidden",
        unsupportedImageNative:
          document
            .querySelectorAll("#stage > .deck")[1]
            .querySelector('img[src$="sample.svg"]')
            ?.hasAttribute("data-pptx-native") || false,
      };
    });
    expect(visibility).toMatchObject({
      bodyClass: true,
      bodyAttribute: "ready",
      headingColor: "rgba(0, 0, 0, 0)",
      architectureFill: "rgba(0, 0, 0, 0)",
      iconOpacity: "0",
      mermaidVisible: true,
      codeVisible: false,
      unsupportedImageNative: true,
    });
  } finally {
    await harness.close();
  }
});

test("marks fully off-slide fallbacks as non-artwork instead of aborting export", async ({
  page,
}) => {
  const harness = await startHarness({
    slides: [
      `## Off-slide fallback

<div style="position:absolute;left:1400px;top:100px;width:100px;height:100px">Hidden</div>`,
    ],
  });
  try {
    const model = await openPptx(page, harness);
    const fallback = model.slides[0].fallbacks.find((candidate) => candidate.type === "html");
    expect(fallback).toMatchObject({
      x: 1280,
      width: 0,
      artwork: false,
    });
    expect(fallback.captureId).toBeUndefined();
  } finally {
    await harness.close();
  }
});

test("collapses nested captures and preserves z-index and descendant effect bounds", async ({
  page,
}) => {
  const harness = await startHarness({
    slides: [
      `## Nested fallback

<div style="position:relative;width:100px;height:80px;border:2px solid red;padding:8px"><p style="transform:rotate(1deg)">Nested effect</p><hr><span style="position:absolute;left:180px;top:20px;width:20px;white-space:nowrap;text-shadow:40px 0 4px red">Overflowing sibling text</span></div>`,
      `## Stacking order

<div style="position:absolute;z-index:10;left:100px;top:160px;width:240px;height:80px">Fallback above</div>

<p style="position:relative;z-index:1">Native below</p>`,
      `## Descendant shadow

<p style="width:200px">Start <span style="text-shadow:100px 0 0 red">shadow</span></p>`,
      `## Generic box shadow

<p style="width:200px;box-shadow:40px 0 10px red">Editable shadow text</p>`,
      `## Unsupported fit shadow

<img src="/assets/readme/simple-slide.png" style="width:300px;height:100px;object-fit:cover" alt="Cover fallback">`,
      `## Raw block effect

<div style="width:220px;height:60px;transform:rotate(1deg)">Transformed block</div>

<p>Editable sibling</p>`,
    ],
  });
  try {
    const model = await openPptx(page, harness);
    const nested = model.slides[0].fallbacks.filter((fallback) => fallback.artwork !== false);
    expect(nested).toHaveLength(1);
    const nestedRegion = nested[0];
    expect(nestedRegion.path).toMatch(/div\.body > div/);
    expect(nestedRegion.width).toBeGreaterThan(200);
    expect(nested.some((fallback) => fallback.path.endsWith("> hr"))).toBe(false);
    const nestedTextRight = await page.evaluate(() => {
      const deck = document.querySelectorAll("#stage > .deck")[0];
      const deckRect = deck.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(deck.querySelector("span"));
      return range.getBoundingClientRect().right - deckRect.left;
    });
    expect(nestedRegion.x + nestedRegion.width).toBeGreaterThanOrEqual(
      nestedTextRight + 40 - 0.1,
    );

    const stackingSlide = model.slides[1];
    const fallback = stackingSlide.fallbacks.find((candidate) => candidate.type === "html");
    const nativeText = stackingSlide.elements.find(
      (element) =>
        element.type === "text" &&
        element.paragraphs.some((paragraph) =>
          paragraph.runs.some((run) => run.text.includes("Native below")),
        ),
    );
    expect(fallback.zOrder).toBeGreaterThan(nativeText.zOrder);

    const shadowFallback = model.slides[2].fallbacks.find(
      (candidate) =>
        candidate.type === "effect" && candidate.reason.includes("text-shadow"),
    );
    const shadowRight = await page.evaluate(() => {
      const deck = document.querySelectorAll("#stage > .deck")[2];
      const deckRect = deck.getBoundingClientRect();
      const spanRect = deck.querySelector("span").getBoundingClientRect();
      return spanRect.right - deckRect.left + 100;
    });
    expect(shadowFallback.x + shadowFallback.width).toBeGreaterThanOrEqual(shadowRight);

    const boxShadowSlide = model.slides[3];
    const boxShadowFallback = boxShadowSlide.fallbacks.find(
      (candidate) => candidate.reason === "native-element-approximates: box-shadow",
    );
    const boxShadowWidth = await page.evaluate(
      () => document.querySelectorAll("#stage > .deck")[3].querySelector("p").getBoundingClientRect().width,
    );
    const boxShadowVisibility = await page.evaluate(() => {
      const deck = document.querySelectorAll("#stage > .deck")[3];
      return {
        original: getComputedStyle(deck.querySelector("p")).boxShadow,
        clone: getComputedStyle(deck.querySelector(".pptx-effect-fallback")).boxShadow,
      };
    });
    expect(boxShadowFallback).toBeTruthy();
    expect(boxShadowFallback.width).toBeGreaterThan(boxShadowWidth);
    expect(boxShadowVisibility.original).toBe("none");
    expect(boxShadowVisibility.clone).not.toBe("none");

    const imageFallback = model.slides[4].fallbacks.find(
      (candidate) => candidate.reason === "unsupported-image-fit",
    );
    expect(imageFallback.width).toBeGreaterThan(300);
    expect(imageFallback.height).toBeGreaterThan(100);

    const blockSlide = model.slides[5];
    const blockFallback = blockSlide.fallbacks.find((candidate) => candidate.type === "effect");
    expect(blockFallback.path).toMatch(/div\.body > div/);
    expect(blockFallback.width).toBeLessThan(500);
    expect(
      blockSlide.elements.some(
        (element) =>
          element.type === "text" &&
          element.paragraphs.some((paragraph) =>
            paragraph.runs.some((run) => run.text.includes("Editable sibling")),
          ),
      ),
    ).toBe(true);
  } finally {
    await harness.close();
  }
});

test("preserves zero opacity in Architecture icon picture layers", async ({ page }) => {
  const harness = await startHarness({
    slides: [
      `---
title: Hidden icon
---
## Hidden icon

\`\`\`architecture
{
  "version": 1,
  "canvas": { "width": 600, "height": 300 },
  "elements": [
    {
      "type": "node",
      "id": "hidden",
      "x": 150,
      "y": 80,
      "width": 300,
      "height": 140,
      "text": "Hidden",
      "icon": "api",
      "style": { "opacity": 0 }
    }
  ]
}
\`\`\``,
    ],
  });
  try {
    const model = await openPptx(page, harness);
    const icon = model.slides[0].elements.find(
      (element) =>
        element.type === "image" && element.architecture?.kind === "icon-picture",
    );
    expect(icon).toBeTruthy();
    const maxAlpha = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let maximum = 0;
      for (let index = 3; index < data.length; index += 4) {
        maximum = Math.max(maximum, data[index]);
      }
      return maximum;
    }, icon.src);
    expect(maxAlpha).toBe(0);
  } finally {
    await harness.close();
  }
});

test("PowerPoint bootstrap failures are observable", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    await page.goto(`${harness.url}/?pptx=1`, { waitUntil: "load" });
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-pptx-error") === "true",
    );
    expect(await page.evaluate(() => window.__presentationPptxModel)).toBeUndefined();
  } finally {
    await harness.close();
  }
});
