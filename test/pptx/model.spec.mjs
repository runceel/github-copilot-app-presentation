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
console.log("fallback");
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
      "standard",
      "center",
      "section",
      "backcover",
    ]);
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

test("applies custom theme variables and metadata assets", async ({ page }) => {
  const harness = await startHarness({
    slides: [
      `---
layout: title
title: Custom theme
---
# Custom theme

Branded export`,
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
    },
  });
  try {
    const model = await openPptx(page, harness);
    const slide = model.slides[0];
    const runs = slide.elements
      .filter((element) => element.type === "text")
      .flatMap((element) => element.paragraphs.flatMap((paragraph) => paragraph.runs));
    const logo = slide.elements.find((element) => element.type === "image");

    expect(slide.theme).toBe("custom");
    expect(runs.some((run) => run.color === "#FEFEFE")).toBe(true);
    expect(logo.src).toMatch(/simple-slide\.png$/);
    expect(logo.alt).toBe("Custom logo");
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
    const table = slide.elements.find((element) => element.type === "table");
    const image = slide.elements.find((element) => element.type === "image");

    expect(allRuns.some((run) => run.text.includes("bold") && run.bold)).toBe(true);
    expect(allRuns.some((run) => run.text.includes("emphasis") && run.bold)).toBe(true);
    expect(allRuns.find((run) => run.text.includes("a link"))?.href).toBe(
      "https://example.com/docs",
    );
    expect(allRuns.some((run) => run.text.includes("Rotated fallback"))).toBe(false);
    expect(allRuns.some((run) => run.text.includes("effect fallback"))).toBe(false);
    expect(lists.map((paragraph) => paragraph.level)).toContain(1);
    expect(lists.every((paragraph) => paragraph.bullet.character === "•")).toBe(true);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells).toHaveLength(2);
    expect(table.rows[1].cells[1].paragraphs[0].runs[0].text.trim()).toBe("42");
    expect(image.src).toMatch(/simple-slide\.png$/);
    expect(slide.elements.filter((element) => element.type === "table")).toHaveLength(1);
    expect(slide.fallbacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image", reason: "unsupported-image-format" }),
        expect.objectContaining({ type: "code", reason: "code-block-rendered-as-artwork" }),
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
    const rotatedVisibility = await page.evaluate(() => {
      const paragraphs = [...document.querySelectorAll("#stage > .deck")[1].querySelectorAll("p")];
      const rotated = paragraphs.find((element) => element.textContent.includes("Rotated fallback"));
      const nested = paragraphs.find((element) => element.textContent.includes("effect fallback"));
      return {
        native: rotated?.hasAttribute("data-pptx-native") || false,
        color: rotated ? getComputedStyle(rotated).color : "",
        nestedNative: nested?.hasAttribute("data-pptx-native") || false,
        nestedColor: nested ? getComputedStyle(nested).color : "",
        decorationCount: document
          .querySelectorAll("#stage > .deck")[1]
          .querySelectorAll(".pptx-effect-fallback").length,
      };
    });
    expect(rotatedVisibility.native).toBe(false);
    expect(rotatedVisibility.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(rotatedVisibility.nestedNative).toBe(false);
    expect(rotatedVisibility.nestedColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(rotatedVisibility.decorationCount).toBe(1);
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
      codeVisible: true,
      unsupportedImageNative: false,
    });
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
