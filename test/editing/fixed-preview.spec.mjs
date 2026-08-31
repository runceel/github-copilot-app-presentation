import { expect, test } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const SLIDES = [
  ["---", "title: First", "---", "## First", "", "- Short content"].join("\n"),
  ["---", "title: Second", "---", "## Second", "", "- Another slide"].join("\n"),
];

async function settleFrames(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("16:9 preview uses the fixed PDF surface and keeps navigation active", async ({ page }) => {
  const harness = await startHarness({ slides: SLIDES });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);

    const button = page.locator("#navFixedPreview");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    await settleFrames(page);

    await expect(page.locator("body")).toHaveClass(/fixed-preview-mode/);
    await expect(page.locator("body")).toHaveClass(/fixed-output-mode/);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toHaveAttribute("data-state", "active");

    const fixedSize = await page.locator("#stage > .deck").evaluate((deck) => {
      const style = getComputedStyle(deck);
      const stage = document.getElementById("stage");
      return {
        width: style.width,
        height: style.height,
        transform: getComputedStyle(stage).transform,
      };
    });
    expect(fixedSize.width).toBe("1280px");
    expect(fixedSize.height).toBe("720px");
    expect(fixedSize.transform).not.toBe("none");

    await page.locator("#navNext").click();
    await expect.poll(() => harness.index).toBe(1);
    await expect(page.locator("body")).toHaveClass(/fixed-preview-mode/);

    await button.click();
    await settleFrames(page);
    await expect(page.locator("body")).not.toHaveClass(/fixed-preview-mode/);
    await expect(button).toHaveAttribute("aria-pressed", "false");
  } finally {
    await harness.close();
  }
});

test("16:9 preview ignores one pixel but warns when PDF clipping exceeds the tolerance", async ({
  page,
}) => {
  const harness = await startHarness({ slides: SLIDES.slice(0, 1) });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);
    await page.locator("#navFixedPreview").click();
    await settleFrames(page);

    await page.locator(".body").evaluate((body) => {
      body.replaceChildren();
      const probe = document.createElement("div");
      probe.id = "overflowProbe";
      probe.style.flex = "0 0 auto";
      probe.style.height = `${body.clientHeight + 1}px`;
      body.appendChild(probe);
      window.dispatchEvent(new Event("resize"));
    });
    await settleFrames(page);
    await expect(page.locator("#layoutWarning")).toBeHidden();

    await page.locator("#overflowProbe").evaluate((probe) => {
      const body = probe.parentElement;
      probe.style.height = `${body.clientHeight + 3}px`;
      window.dispatchEvent(new Event("resize"));
    });
    await settleFrames(page);
    await expect(page.locator("#layoutWarning")).toBeVisible();
    await expect(page.locator("#layoutWarning")).toContainText("PDF layout clips page 1");
    await expect(page.locator("#navFixedPreview")).toHaveAttribute("data-state", "error");
  } finally {
    await harness.close();
  }
});
