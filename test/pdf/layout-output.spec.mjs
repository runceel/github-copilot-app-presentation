import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForPrintReady } from "../utils/ready.mjs";

const SHORT_SLIDE = [
  "---",
  "title: Fits",
  "---",
  "## Fits",
  "",
  "- Short content",
].join("\n");

const TALL_SLIDE = [
  "---",
  "title: Too tall",
  "---",
  "## Too tall",
  "",
  ...Array.from({ length: 28 }, (_, index) => `- Overflow item ${index + 1}`),
].join("\n");

const WIDE_SLIDE = [
  "---",
  "title: Too wide",
  "---",
  "## Too wide",
  "",
  "```text",
  "x".repeat(320),
  "```",
].join("\n");

for (const mode of ["print", "capture", "pptx"]) {
  test(`${mode} output excludes export notifications and live announcements`, async ({ page }) => {
    const harness = await startHarness({ slides: [SHORT_SLIDE] });
    try {
      await page.goto(`${harness.url}/?${mode}=1&token=${harness.printToken}&index=0`, {
        waitUntil: "load",
      });
      await expect(page.locator("html")).toHaveAttribute(`data-${mode}-ready`, "true");
      await page.evaluate(() => document.fonts.ready);
      const before = await page.screenshot({ animations: "disabled" });
      await page.evaluate(() => {
        document.getElementById("exportNotification").hidden = false;
        document.getElementById("exportNotificationMessage").textContent = "PDF saved: slides.pdf.";
        document.getElementById("exportNotificationClose").hidden = false;
        document.getElementById("exportStatus").textContent = "Saved to: D:\\Exports\\slides.pdf";
        document.getElementById("exportErrorStatus").textContent = "Previous export error";
      });
      for (const id of ["exportNotification", "exportStatus", "exportErrorStatus"]) {
        await expect(page.locator(`#${id}`)).toHaveCSS("display", "none");
      }
      const after = await page.screenshot({ animations: "disabled" });
      expect(after.equals(before)).toBe(true);
    } finally {
      await harness.close();
    }
  });
}

test("print readiness reports bounded PDF layout diagnostics", async ({ page }) => {
  const slides = [SHORT_SLIDE, TALL_SLIDE, WIDE_SLIDE];
  const harness = await startHarness({ slides });
  try {
    await page.goto(`${harness.url}/?print=1&token=${harness.printToken}`, {
      waitUntil: "load",
    });
    await waitForPrintReady(page);

    expect(harness.printReports).toHaveLength(1);
    const report = harness.printReports[0];
    expect(report.status).toBe("ready");
    expect(report.layout.width).toBe(1280);
    expect(report.layout.height).toBe(720);
    expect(report.layout.total).toBe(slides.length);
    expect(report.layout.slides).toHaveLength(slides.length);

    const [fits, tall, wide] = report.layout.slides;
    expect(fits.status).toBe("fits");
    expect(fits.pdfClipped).toBe(false);
    expect(tall.status).toBe("pdf-clipped");
    expect(tall.verticalOverflowPx).toBeGreaterThan(2);
    expect(tall.elements.length).toBeLessThanOrEqual(5);
    expect(wide.status).toBe("pdf-clipped");
    expect(wide.horizontalOverflowPx).toBeGreaterThan(2);
    expect(wide.scrollContainers.length).toBeGreaterThan(0);
    expect(report.layout.issueCount).toBe(2);
  } finally {
    await harness.close();
  }
});

test("capture mode matches print geometry and produces a 1280x720 image", async ({
  browser,
}) => {
  const harness = await startHarness({ slides: [SHORT_SLIDE] });
  const printPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const capturePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await printPage.goto(`${harness.url}/?print=1&token=${harness.printToken}`, {
      waitUntil: "load",
    });
    await waitForPrintReady(printPage);

    await capturePage.goto(
      `${harness.url}/?capture=1&token=${harness.printToken}&index=0`,
      { waitUntil: "load" },
    );
    await expect(capturePage.locator("html")).toHaveAttribute("data-capture-ready", "true");
    await expect(capturePage.locator("body")).toHaveClass(/capture-mode/);
    await expect(capturePage.locator("body")).toHaveClass(/fixed-output-mode/);

    const measure = (page) =>
      page.locator("#stage > .deck").evaluate((deck) => {
        const body = deck.querySelector(":scope > .body");
        const heading = deck.querySelector(".slide-title");
        const deckStyle = getComputedStyle(deck);
        const bodyStyle = getComputedStyle(body);
        return {
          deckWidth: deckStyle.width,
          deckHeight: deckStyle.height,
          paddingTop: deckStyle.paddingTop,
          paddingLeft: deckStyle.paddingLeft,
          bodyFontSize: bodyStyle.fontSize,
          bodyHeight: bodyStyle.height,
          headingFontSize: heading ? getComputedStyle(heading).fontSize : "",
        };
      });
    expect(await measure(capturePage)).toEqual(await measure(printPage));

    const png = await capturePage.screenshot();
    expect(png.readUInt32BE(16)).toBe(1280);
    expect(png.readUInt32BE(20)).toBe(720);

    expect(harness.printReports).toHaveLength(2);
    const captureReport = harness.printReports[1];
    expect(captureReport.status).toBe("ready");
    expect(captureReport.layout.slides[0].index).toBe(0);
    expect(captureReport.layout.slides[0].status).toBe("fits");
  } finally {
    await printPage.close();
    await capturePage.close();
    await harness.close();
  }
});
