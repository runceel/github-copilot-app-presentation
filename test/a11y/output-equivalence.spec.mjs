// Output equivalence: ensure that canvas (normal view), presenter, and print (PDF path)
// produce **the same diagram with the same semantics**.
//
// All three paths use the same renderer but different branches:
//   normal view: init() runs fetchState / connectEvents
//   presenter:   body.presenter-mode is added
//   print:       initPrint() renders every slide at once (an early return bypasses the branches above)
// Print alone also receives `body.print-mode` rules from slides.css. Separate branches fail in
// separate ways, so output must be compared across paths.
//
// Coordinates and physical sizes naturally differ by path (print fits the paper) and are excluded.
// Compare semantics: element identity, type, role, accessible name, and declaration order.

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
// 1in = 96 CSS px. Rendering above this limit means print CSS is not applied.
const PRINT_MAX_HEIGHT_PX = 5.25 * 96;

/** Open normal view or presenter. */
async function openLive(page, { present = false, slides = EDITING_DECK } = {}) {
  const harness = await startHarness({ slides });
  await page.goto(`${harness.url}/${present ? "?present=1" : ""}`, { waitUntil: "load" });
  await waitForSlideReady(page);
  return harness;
}

/**
 * Open print mode, which uses the same DOM as PDF generation.
 *
 * **Emulate print media.** Playwright defaults to screen, so otherwise none of slides.css
 * `@media print { ... }` applies. The `body.print-mode` class still makes the result look plausible,
 * but it differs from an actual PDF (measured diagram-box heights differ by over 20%: 403px vs
 * 504px). Without emulation, not one print CSS rule is tested.
 */
async function openPrint(page, { slides = EDITING_DECK } = {}) {
  await page.emulateMedia({ media: "print" });
  const harness = await startHarness({ slides });
  await page.goto(`${harness.url}/?print=1&token=${harness.printToken}`, { waitUntil: "load" });
  await waitForPrintReady(page);
  return harness;
}

/** Actual diagram size. Because `meet` preserves aspect ratio, calculate the rendered rectangle. */
function measureDiagram(page, title) {
  return page.evaluate((wantedTitle) => {
    const svg = [...document.querySelectorAll("svg.architecture-svg")].find(
      (candidate) => candidate.querySelector(":scope > title")?.textContent === wantedTitle,
    );
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const [, , viewWidth, viewHeight] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    // preserveAspectRatio="xMidYMid meet" fits the diagram inside its box and adds whitespace.
    // Therefore the box aspect ratio differs from the diagram; inspect the fitted rectangle.
    const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight);
    return {
      box: { width: Math.round(rect.width), height: Math.round(rect.height) },
      drawn: { width: Math.round(viewWidth * scale), height: Math.round(viewHeight * scale) },
    };
  }, title);
}

test.describe("canvas / presenter / print equivalence", () => {
  test("presenter produces the same semantic structure as normal view", async ({ page }) => {
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

  test("print produces the same semantic structure as normal view", async ({ page }) => {
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
      // Print puts every slide in the DOM at once, but an individual diagram's semantics stay intact.
      expect(await readDiagramSemantics(page, DIAGRAM_TITLE)).toEqual(liveSemantics);
    } finally {
      await print.close();
    }
  });

  test("visible text remains hidden from assistive technology in print", async ({ page }) => {
    const print = await openPrint(page);
    try {
      // This does not guarantee PDF/UA, but prevents a11y attributes from disappearing only in the
      // print DOM, which would indicate path-specific processing.
      const texts = await page.$$eval(`${SVG} text`, (nodes) =>
        nodes.map((node) => node.getAttribute("aria-hidden")),
      );
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((hidden) => hidden !== "true")).toEqual([]);
    } finally {
      await print.close();
    }
  });

  test("the diagram remains undistorted and fits the page height in print", async ({ page }) => {
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

      // The diagram **shape** must match on screen and paper. Physical size may change to fit the
      // page, but a different aspect ratio would distort the diagram.
      const liveRatio = liveMeasure.drawn.width / liveMeasure.drawn.height;
      const printRatio = printMeasure.drawn.width / printMeasure.drawn.height;
      expect(printRatio).toBeCloseTo(liveRatio, 2);

      // The diagram must not overflow its box, which would clip it in the PDF.
      expect(printMeasure.drawn.width).toBeLessThanOrEqual(printMeasure.box.width);
      expect(printMeasure.drawn.height).toBeLessThanOrEqual(printMeasure.box.height);

      // Verify the print CSS height limit. Restricting the diagram to 5.25in of a 7.5in page leaves
      // room for the heading and body. Relaxing this can push the diagram onto the next page.
      expect(printMeasure.box.height).toBeLessThanOrEqual(PRINT_MAX_HEIGHT_PX + 1);
      // Also verify that this limit actually determines the size rather than screen's 56vh.
      // The <= assertion alone could pass even if print CSS were entirely inactive.
      expect(printMeasure.box.height).toBeGreaterThan(liveMeasure.box.height);
    } finally {
      await print.close();
    }
  });

  // Output-equivalence risk areas identified at kickoff. These are needed on screen but not on
  // paper, and leak into the PDF if print CSS stops applying. Mermaid's tooltip was observed adding
  // a blank final page.
  test("screen-only UI does not leak into the PDF in print", async ({ page }) => {
    const print = await openPrint(page, { slides: [MIXED_SLIDE] });
    try {
      const state = await page.evaluate(() => {
        const shown = (selector) =>
          [...document.querySelectorAll(selector)].filter(
            (node) => getComputedStyle(node).display !== "none",
          ).length;
        return {
          // Mermaid adds a tooltip div directly under <body> on every render.
          tooltips: document.querySelectorAll(".mermaidTooltip").length,
          shownTooltips: shown(".mermaidTooltip"),
          navs: document.querySelectorAll(".nav").length,
          shownNavs: shown(".nav"),
          shownOverviews: shown(".overview"),
        };
      });

      // First verify the targets exist in the DOM. Treating absent elements as hidden would make the
      // test pass even after removing the rule.
      expect(state.tooltips).toBeGreaterThan(0);
      expect(state.navs).toBeGreaterThan(0);

      expect(state.shownTooltips).toBe(0);
      expect(state.shownNavs).toBe(0);
      expect(state.shownOverviews).toBe(0);
    } finally {
      await print.close();
    }
  });

  test("the diagram editing toolbar is hidden in print", async ({ page }) => {
    const print = await openPrint(page);
    try {
      // The editing toolbar only exists with `?architectureEdit=1` and is absent from the print DOM.
      // Counting absent elements does not test the rule, so insert an element with the same class
      // beside the diagram to verify the print stylesheet itself.
      const display = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.className = "architecture-editor-toolbar";
        probe.textContent = "probe";
        document.querySelector("svg.architecture-svg").parentElement.appendChild(probe);
        const value = getComputedStyle(probe).display;
        probe.remove();
        return value;
      });
      expect(display).toBe("none");
    } finally {
      await print.close();
    }
  });
});

test.describe("coexistence with Mermaid", () => {
  const MIXED_DECK = [MIXED_SLIDE];

  test("Mermaid on the same slide does not change diagram semantics", async ({ page }) => {
    const live = await openLive(page, { slides: MIXED_DECK });
    let liveSemantics;
    try {
      // First verify Mermaid rendered; otherwise this does not test coexistence.
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

  test("diagram content remains announced once when Mermaid coexists", async ({ page }) => {
    const live = await openLive(page, { slides: MIXED_DECK });
    try {
      // Mermaid renders labels as HTML in <foreignObject>, not <text>. Therefore aria-hidden on
      // Architecture <text> does not affect Mermaid. If this becomes zero, Mermaid's rendering
      // method changed and the assumption that Architecture handling does not touch it must be
      // revisited.
      const mermaidLabels = await page.$$eval(
        ".mermaid svg foreignObject, pre.mermaid svg foreignObject",
        (nodes) => nodes.length,
      );
      expect(mermaidLabels).toBeGreaterThan(0);
      expect(await page.$$eval(".mermaid svg text, pre.mermaid svg text", (n) => n.length)).toBe(0);

      // Architecture attributes do not leak into Mermaid.
      const leaked = await page.$$eval(
        ".mermaid svg [data-architecture-order], pre.mermaid svg [data-architecture-order]",
        (nodes) => nodes.length,
      );
      expect(leaked).toBe(0);

      // Both diagrams appear in the accessibility tree without Architecture duplication.
      const tree = await accessibilityTree(page);
      const diagram = findDiagram(tree, MIXED_TITLE);
      expect(diagram, "the Architecture diagram is not visible to AT").not.toBeNull();
      expect(flatten(diagram.children).filter((node) => node.role === "StaticText")).toEqual([]);

      // Mermaid labels remain exposed to AT; coexistence does not suppress one diagram.
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
