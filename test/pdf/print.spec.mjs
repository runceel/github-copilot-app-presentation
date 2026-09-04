// PDF regression: generate and verify PDF output from `?print=1` mode in headless Chromium.
//
// **Do not compare raw binary snapshots** because environment differences always break them. Verify:
//   1. Page count matches slide count.
//   2. Page size is 16:9 (slides.css @page = 13.333333in x 7.5in).
//   3. Rendered SVG semantic structure matches the model.
//
// Always check the print **failure signal** (data-print-error), or an empty PDF could be mistaken
// for success.

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
// Deck with a mixed Mermaid + Architecture slide inserted before the back cover.
const MIXED_DECK = [...ARCHITECTURE_DECK.slice(0, -1), MIXED_SLIDE, ...ARCHITECTURE_DECK.slice(-1)];

// Regression guard (#11): Mermaid adds <div class="mermaidTooltip"> directly under body while
// rendering. This element was once left visible by print CSS, extending 6px beyond the page boundary
// (7.5in = 720px) and adding a blank page. The fix is
// `body.print-mode .mermaidTooltip{display:none!important;}` in slides.css.
// Removing that rule fails the page-count assertion below.

const PDF_OPTIONS = { printBackground: true, preferCSSPageSize: true };

/** Extract each slide's semantic structure from the print-mode DOM. */
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

/** Open print mode, wait until ready, and return semantic structure and PDF. */
async function renderPrintDeck(page, harness) {
  await page.goto(`${harness.url}/?print=1&token=${encodeURIComponent(harness.printToken)}`, {
    waitUntil: "load",
  });
  // Monitor both success and failure signals; failure throws with a reason.
  await waitForPrintReady(page);

  // Confirm through the harness record that the renderer actually reported success.
  expect(harness.printReports).toHaveLength(1);
  expect(harness.printReports[0].status).toBe("ready");
  expect(harness.printReports[0].error).toBe("");

  return {
    structure: await readPrintStructure(page),
    pdf: await page.pdf(PDF_OPTIONS),
  };
}

/** Compare semantic structure expected from slide Markdown with the actual DOM. */
function assertStructureMatchesModel(structure, slides) {
  expect(structure).toHaveLength(slides.length);
  slides.forEach((markdown, index) => {
    const slide = structure[index];
    expect(slide.errors, `slide ${index + 1}: no Architecture parse errors`).toBe(0);
    expect(slide.diagrams, `slide ${index + 1}: diagram count and structure match the model`).toEqual(
      expectedDiagramShapes(markdown),
    );
    if (hasMermaidBlock(markdown)) {
      expect(
        slide.mermaidSvgs,
        `slide ${index + 1}: Mermaid rendered as SVG`,
      ).toBeGreaterThan(0);
    }
  });
}

/** Verify that every page is 16:9. */
function assertSixteenByNine(mediaBoxes) {
  expect(mediaBoxes.length, "MediaBox entries are readable").toBeGreaterThan(0);
  for (const box of mediaBoxes) {
    expect(
      isSixteenByNinePage(box),
      `page size is 16:9 (${EXPECTED_PAGE_WIDTH_PT}pt x ${EXPECTED_PAGE_HEIGHT_PT}pt): ${JSON.stringify(box)}`,
    ).toBe(true);
  }
}

for (const theme of ["dark", "light"]) {
  test(`an Architecture-only deck has one page per slide (theme: ${theme})`, async ({ page }) => {
    const harness = await startHarness({ slides: ARCHITECTURE_DECK, theme });
    try {
      const { structure, pdf } = await renderPrintDeck(page, harness);

      assertStructureMatchesModel(structure, ARCHITECTURE_DECK);
      // Prevent fixture reduction from making the verification vacuous.
      expect(structure.filter((slide) => slide.diagrams.length > 0).length).toBeGreaterThan(0);

      const { pageCount, mediaBoxes } = inspectPdf(pdf);
      expect(pageCount, "PDF page count matches slide count").toBe(ARCHITECTURE_DECK.length);
      assertSixteenByNine(mediaBoxes);
    } finally {
      await harness.close();
    }
  });
}

test("a deck containing Mermaid is also output at 16:9", async ({ page }) => {
  const harness = await startHarness({ slides: MIXED_DECK, theme: "dark" });
  try {
    const { structure, pdf } = await renderPrintDeck(page, harness);

    assertStructureMatchesModel(structure, MIXED_DECK);
    expect(
      structure.filter((slide) => slide.mermaidSvgs > 0).length,
      "Mermaid actually rendered",
    ).toBeGreaterThan(0);

    const { pageCount, mediaBoxes } = inspectPdf(pdf);
    expect(pageCount, "a Mermaid deck still has one page per slide").toBe(MIXED_DECK.length);
    assertSixteenByNine(mediaBoxes);
  } finally {
    await harness.close();
  }
});

test("section dividers are output as 16:9 pages with backgrounds", async ({ page }) => {
  const harness = await startHarness({ slides: SECTION_DECK, theme: "microsoft" });
  try {
    const { structure, pdf } = await renderPrintDeck(page, harness);

    expect(structure).toHaveLength(SECTION_DECK.length);
    for (const slide of structure) {
      expect(slide.className.split(/\s+/)).toContain("section-slide");
      expect(slide.backgroundImage).not.toBe("none");
    }

    const { pageCount, mediaBoxes } = inspectPdf(pdf);
    expect(pageCount, "section dividers also have one page per slide").toBe(SECTION_DECK.length);
    assertSixteenByNine(mediaBoxes);
  } finally {
    await harness.close();
  }
});

test("standard slide titles remain fixed at the top in print", async ({ page }) => {
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

test("print failure signals can be detected", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  try {
    // An incorrect token makes ./export-data return 404 and sends the renderer down the failure path.
    await page.goto(`${harness.url}/?print=1&token=wrong-token`, { waitUntil: "load" });
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-print-error") === "true",
      undefined,
      { timeout: 30_000 },
    );

    expect(await page.evaluate(() => window.__presentationPrintReady)).toBeUndefined();
    // Explicitly verify that failure is not mistaken for success.
    await expect(waitForPrintReady(page, { timeout: 5_000 })).rejects.toThrow(/data-print-error/);
    expect(harness.printReports, "a token mismatch must not produce a success report").toHaveLength(0);
  } finally {
    await harness.close();
  }
});

// Regression guard (#12): initPrint throws a missing-token error **outside** its try block. If the
// caller does not catch it, only an unhandled Promise rejection occurs; data-print-error is never
// set, and the browser exits 0 after producing a one-page blank PDF. The test above (token mismatch)
// passes through the catch inside initPrint and does not exercise this path.
test("printing without a token is observable as a failure", async ({ page }) => {
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

    // A remaining veil makes the PDF blank, so verify it is removed.
    expect(
      await page.evaluate(() => document.body.classList.contains("mermaid-loading")),
      "do not retain the mermaid-loading veil after failure",
    ).toBe(false);
    expect(harness.printReports, "a missing token must not produce a success report").toHaveLength(0);
    expect(consoleErrors.join("\n"), "the reason remains in the console").toMatch(/token/i);
  } finally {
    await harness.close();
  }
});

/** Instrument counts for EventSource construction and ./state polling. */
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

// Two polling intervals (renderer.js setInterval).
const QUIESCENCE_WAIT_MS = 4_500;

// Output mode is an immutable render job. It must not start the live deck's SSE or polling loops.
test("print mode starts neither SSE nor periodic polling", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  try {
    const live = await instrumentLiveUpdates(page);
    await page.goto(`${harness.url}/?print=1&token=${encodeURIComponent(harness.printToken)}`, {
      waitUntil: "load",
    });
    await waitForPrintReady(page);
    await page.waitForTimeout(QUIESCENCE_WAIT_MS);

    expect(await live.eventSourceCount(), "print mode does not open SSE").toBe(0);
    expect(live.statePolls, "print mode does not poll /state").toHaveLength(0);
  } finally {
    await harness.close();
  }
});

// Confirm that the test above does not pass merely because instrumentation is inactive. Normal view
// always runs SSE and polling, so the same instrumentation must return nonzero values.
test("normal view starts SSE and periodic polling", async ({ page }) => {
  const harness = await startHarness({ slides: ARCHITECTURE_DECK });
  try {
    const live = await instrumentLiveUpdates(page);
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await page.waitForTimeout(QUIESCENCE_WAIT_MS);

    expect(await live.eventSourceCount(), "normal view opens SSE").toBeGreaterThan(0);
    expect(
      live.statePolls.length,
      "normal view repeatedly fetches /state",
    ).toBeGreaterThan(1);
  } finally {
    await harness.close();
  }
});
