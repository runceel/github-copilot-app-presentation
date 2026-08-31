// The live 16:9 preview warning and the headless output diagnostic (`inspect_layout`,
// `capture_slides`, PDF) must never disagree: both consume `collectSlideLayout()` and must
// report the same clipping status and overflow metrics in the same coordinate system.
import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForPrintReady, waitForSlideReady } from "../utils/ready.mjs";

const TITLE_SLIDE = [
  "---",
  "deck: Layout parity",
  "layout: title",
  "---",
  "# MarkdStage",
  "## Layout parity",
  "",
  "Canvas startup and slide rendering.",
].join("\n");

// Markdown, a table, and a Mermaid diagram on one slide: the combination that produced a
// live clipping warning while the headless inspection still reported "fits".
const MERMAID_SLIDE = [
  "---",
  "deck: Layout parity",
  "kicker: Rendering",
  "---",
  "## Markdown and Mermaid",
  "",
  "- **Bold**, `inline code`, and tables render",
  "- Keyboard and canvas controls remain available",
  "",
  "| Check | Result |",
  "| --- | --- |",
  "| Markdown | Rendering |",
  "| Navigation | Enabled |",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Markdown] --> B[Canvas]",
  "  B --> C[Presentation]",
  "```",
].join("\n");

const TALL_SLIDE = [
  "---",
  "deck: Layout parity",
  "---",
  "## Too tall",
  "",
  ...Array.from({ length: 28 }, (_, index) => `- Overflow item ${index + 1}`),
].join("\n");

const WIDE_SLIDE = [
  "---",
  "deck: Layout parity",
  "---",
  "## Too wide",
  "",
  "```text",
  "x".repeat(320),
  "```",
].join("\n");

const SLIDES = [TITLE_SLIDE, MERMAID_SLIDE, TALL_SLIDE, WIDE_SLIDE];

async function settleFrames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Read the live preview state and the overflow numbers shown in the warning. */
async function readLiveDiagnostic(page) {
  const state = await page.evaluate(() => {
    const warning = document.getElementById("layoutWarning");
    return {
      clipped: !warning.hidden,
      text: warning.textContent || "",
      button: document.getElementById("navFixedPreview").dataset.state,
      overflow: document.body.classList.contains("fixed-preview-overflow"),
    };
  });
  const vertical = /vertical ([\d.]+)px/.exec(state.text);
  const horizontal = /horizontal ([\d.]+)px/.exec(state.text);
  return {
    ...state,
    verticalOverflowPx: vertical ? Number(vertical[1]) : 0,
    horizontalOverflowPx: horizontal ? Number(horizontal[1]) : 0,
  };
}

test("live 16:9 preview and headless layout inspection report the same clipping", async ({
  browser,
}) => {
  const harness = await startHarness({ slides: SLIDES });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const printPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    // The headless output pass is what `inspect_layout` and `capture_slides` consume.
    await printPage.goto(`${harness.url}/?print=1&token=${harness.printToken}`, {
      waitUntil: "load",
    });
    await waitForPrintReady(printPage);
    const printLayout = harness.printReports[0].layout;
    expect(printLayout.slides).toHaveLength(SLIDES.length);
    // The deck deliberately mixes fitting and clipped slides so that agreement is
    // meaningful in both directions.
    expect(printLayout.slides.map((slide) => slide.pdfClipped)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    // `capture_slides` without explicit indexes captures exactly the clipped pages.
    expect(
      printLayout.slides.filter((slide) => slide.pdfClipped).map((slide) => slide.index),
    ).toEqual([2, 3]);

    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);
    await page.locator("#navFixedPreview").click();
    await settleFrames(page);

    for (let index = 0; index < SLIDES.length; index += 1) {
      if (index > 0) {
        await page.locator("#navNext").click();
        await expect.poll(() => harness.index).toBe(index);
        await waitForSlideReady(page);
        await settleFrames(page);
      }
      const expected = printLayout.slides[index];
      const live = await readLiveDiagnostic(page);
      expect(live.clipped, `page ${index + 1} clipping status`).toBe(expected.pdfClipped);
      expect(live.overflow).toBe(expected.pdfClipped);
      expect(live.button).toBe(expected.pdfClipped ? "error" : "active");
      // Both paths round to 0.1px; allow half a pixel so that unavoidable floating-point
      // noise from the preview scale normalization cannot make the test flaky.
      expect(live.verticalOverflowPx, `page ${index + 1} vertical overflow`).toBeCloseTo(
        expected.verticalOverflowPx,
        0,
      );
      expect(live.horizontalOverflowPx, `page ${index + 1} horizontal overflow`).toBeCloseTo(
        expected.horizontalOverflowPx,
        0,
      );
    }
  } finally {
    await page.close();
    await printPage.close();
    await harness.close();
  }
});
