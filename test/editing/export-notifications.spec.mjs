import { expect, test as base } from "@playwright/test";

import { startHarness } from "../harness/server.mjs";
import { clickMoreControl, openMoreControls } from "../utils/nav.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";

const FORMATS = [
  { format: "pdf", label: "PDF", endpoint: "**/export", button: "#navExport", title: "Save as PDF" },
  { format: "pptx", label: "PowerPoint", endpoint: "**/export-pptx", button: "#navExportPptx", title: "Save as editable PowerPoint" },
];

const test = base.extend({
  harness: async ({ page }, use) => {
    const harness = await startHarness({ slides: ["# Export notifications", "## Next slide"] });
    try {
      await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
      await page.goto(harness.url, { waitUntil: "load" });
      await waitForSlideReady(page);
      await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
      await use(harness);
    } finally {
      await harness.close();
    }
  },
});

async function succeed(page, { format, endpoint, button } = FORMATS[0], path = `D:\\Exports\\slides.${format}`) {
  await page.route(endpoint, (route) => route.fulfill({ json: { ok: true, path } }));
  await clickMoreControl(page, button);
  await expect(page.locator("#exportNotification")).toHaveAttribute("data-state", "success");
}

async function expectExportButtonsIdle(page) {
  for (const { button, title } of FORMATS) {
    await expect(page.locator(button)).toBeEnabled();
    await expect(page.locator(button)).not.toHaveAttribute("data-state", /active|error/);
    await expect(page.locator(button)).toHaveAttribute("title", title);
  }
}

for (const spec of FORMATS) {
  test(`${spec.label} reports progress until the save response, then the saved path`, async ({ page, harness }) => {
    let exportRoute;
    let requests = 0;
    await page.route(spec.endpoint, (route) => {
      requests += 1;
      exportRoute = route;
    });
    await clickMoreControl(page, spec.button);
    const notification = page.getByRole("region", { name: "Export notification" });
    await expect(notification).toBeVisible();
    await expect(notification).toHaveAttribute("data-state", "pending");
    await expect(notification).toContainText(`Saving ${spec.label}...`);
    await expect(page.locator("#exportStatus")).toHaveText(`Saving ${spec.label}...`);
    await expect(page.locator("#exportNotificationClose")).toBeHidden();
    await expect(page.locator("#navMorePanel")).toBeHidden();
    await expect(page.locator("#navExport")).toBeDisabled();
    await expect(page.locator("#navExportPptx")).toBeDisabled();
    await expect(page.locator(spec.button)).toHaveAttribute("title", `Saving ${spec.label}.`);
    await page.clock.runFor(12000);
    await expect(notification).toHaveAttribute("data-state", "pending");

    await openMoreControls(page);
    await page.locator("#navExport, #navExportPptx").evaluateAll((buttons) => {
      for (const button of buttons) button.click();
    });
    expect(requests).toBe(1);
    await page.keyboard.press("Escape");
    await page.locator("#navNext").click();
    await expect.poll(() => harness.index).toBe(1);
    await expect(notification).toBeVisible();
    await page.locator("#navMore").focus();

    const path = `D:\\Exports\\saved.${spec.format}`;
    await expect.poll(() => exportRoute).toBeTruthy();
    await exportRoute.fulfill({ json: { ok: true, path, fallbackCount: 2 } });
    await expect(notification).toHaveAttribute("data-state", "success");
    await expect(notification).toContainText(`${spec.label} saved: saved.${spec.format}.`);
    await expect(page.locator("#exportNotificationPath")).toHaveText(`Saved to: ${path}`);
    await expect(page.locator("#exportStatus")).toContainText(path);
    await expect(page.locator("#exportErrorStatus")).toBeEmpty();
    await expect(page.locator("#navMore")).toBeFocused();
    await expectExportButtonsIdle(page);
    await expect(page.locator("#navMore")).toHaveAccessibleName("More controls");
    if (spec.format === "pptx") {
      await expect(notification).toContainText("2 fallback item(s) preserved.");
    } else {
      await expect(notification).not.toContainText("fallback");
    }
    await page.clock.runFor(7999);
    await expect(notification).toBeVisible();
    await page.clock.runFor(1);
    await expect(notification).toBeHidden();
  });

  for (const failure of [
    { name: "HTTP error", response: { status: 500, json: { ok: false, message: "Disk is full." } }, text: "Disk is full." },
    { name: "busy response", response: { status: 409, json: { ok: false, message: "Another output job is running." } }, text: "Another output job is running." },
    { name: "unsuccessful JSON", response: { json: { ok: false, message: "Save failed." } }, text: "Save failed." },
    { name: "missing path", response: { json: { ok: true } }, text: "invalid save location" },
    { name: "invalid JSON", response: { contentType: "application/json", body: "{" } },
    { name: "null JSON", response: { json: null } },
    { name: "network error", abort: true },
  ]) {
    test(`${spec.label} keeps ${failure.name} visible and permits retry`, async ({ page, harness }) => {
      await page.route(spec.endpoint, (route) =>
        failure.abort ? route.abort("failed") : route.fulfill(failure.response),
      );
      await clickMoreControl(page, spec.button);
      const notification = page.locator("#exportNotification");
      await expect(notification).toHaveAttribute("data-state", "error");
      await expect(notification).toContainText(`Could not save ${spec.label}.`);
      if (failure.text) await expect(notification).toContainText(failure.text);
      await expect(page.locator("#exportErrorStatus")).toContainText(`Could not save ${spec.label}.`);
      await expect(page.locator("#exportStatus")).toBeEmpty();
      await expect(page.locator("#exportNotificationPath")).toBeHidden();
      await expectExportButtonsIdle(page);
      await expect(page.locator("#navMore")).toHaveAccessibleName("More controls");
      await page.clock.runFor(30000);
      await expect(notification).toBeVisible();

      await succeed(page, spec);
      await expect(page.locator("#exportErrorStatus")).toBeEmpty();
      await expectExportButtonsIdle(page);
      await expect(page.locator("#navMore")).toHaveAccessibleName("More controls");
      expect(harness.index).toBe(0);
    });
  }

  test(`${spec.label} completion preserves active toggles without highlighting export buttons`, async ({ page, harness }) => {
    await clickMoreControl(page, "#navFixedPreview");
    await succeed(page, spec);
    await expectExportButtonsIdle(page);
    await expect(page.locator("#navFixedPreview")).toHaveAttribute("data-state", "active");
    await expect(page.locator("#navMore")).toHaveAccessibleName("More controls (an option is active)");

    await page.route(spec.endpoint, (route) =>
      route.fulfill({ status: 500, json: { ok: false, message: "Disk is full." } }),
    );
    await clickMoreControl(page, spec.button);
    await expect(page.locator("#exportNotification")).toHaveAttribute("data-state", "error");
    await expectExportButtonsIdle(page);
    await expect(page.locator("#navFixedPreview")).toHaveAttribute("data-state", "active");
    await expect(page.locator("#navMore")).toHaveAccessibleName("More controls (an option is active)");

    await clickMoreControl(page, "#navFixedPreview");
    await expect(page.locator("#navMore")).toHaveAccessibleName("More controls");
    await expect(page.locator("#exportNotification")).toHaveAttribute("data-state", "error");
    expect(harness.index).toBe(0);
  });
}

test("hover and keyboard focus independently pause the remaining success timeout", async ({ page, harness }) => {
  await succeed(page);
  const notification = page.locator("#exportNotification");
  const path = page.locator("#exportNotificationPath");
  await page.clock.runFor(3000);
  await notification.hover();
  await page.clock.runFor(10000);
  await expect(notification).toBeVisible();
  await path.focus();
  await page.mouse.move(800, 500);
  await page.clock.runFor(10000);
  await expect(notification).toBeVisible();
  await notification.hover();
  await page.locator("#navMore").focus();
  await page.clock.runFor(10000);
  await expect(notification).toBeVisible();
  await page.mouse.move(800, 500);
  await page.clock.runFor(4999);
  await expect(notification).toBeVisible();
  await page.clock.runFor(1);
  await expect(notification).toBeHidden();
  expect(harness.index).toBe(0);
});

test("manual dismissal returns keyboard focus without navigating the deck", async ({ page, harness }) => {
  await succeed(page);
  const close = page.getByRole("button", { name: "Dismiss export notification" });
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#exportNotification")).toBeHidden();
  await expect(page.locator("#navMore")).toBeFocused();
  await expect(page.locator("#exportStatus")).toBeEmpty();
  expect(harness.index).toBe(0);

  await page.route("**/export", (route) =>
    route.fulfill({ status: 500, json: { ok: false, message: "Cannot write file." } }),
  );
  await clickMoreControl(page, "#navExport");
  await expect(page.locator("#exportNotification")).toHaveAttribute("data-state", "error");
  await close.click();
  await expect(page.locator("#exportNotification")).toBeHidden();
  await expect(page.locator("#exportErrorStatus")).toBeEmpty();
  expect(harness.index).toBe(0);
});

test("a new export replaces the previous timeout and success location", async ({ page, harness }) => {
  await succeed(page);
  await page.clock.runFor(4000);
  let exportRoute;
  await page.route("**/export-pptx", (route) => { exportRoute = route; });
  await clickMoreControl(page, "#navExportPptx");
  const notification = page.locator("#exportNotification");
  await expect(notification).toHaveAttribute("data-state", "pending");
  await expect(page.locator("#exportNotificationPath")).toBeHidden();
  await page.clock.runFor(12000);
  await expect(notification).toBeVisible();
  await expect.poll(() => exportRoute).toBeTruthy();
  await exportRoute.fulfill({ json: { ok: true, path: "D:\\Exports\\second.pptx" } });
  await expect(notification).toHaveAttribute("data-state", "success");
  await page.clock.runFor(7999);
  await expect(notification).toBeVisible();
  await page.clock.runFor(1);
  await expect(notification).toBeHidden();
  expect(harness.index).toBe(0);
});

test("long paths remain selectable, bounded, and literal on narrow screens", async ({ page, harness }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const path = `D:\\${"long-folder\\".repeat(40)}<b>slides</b>.pdf`;
  await succeed(page, FORMATS[0], path);
  const notification = page.locator("#exportNotification");
  await expect(page.locator("#exportNotificationPath")).toHaveText(`Saved to: ${path}`);
  await expect(notification.locator("b")).toHaveCount(0);
  const bounds = await notification.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(640);
  expect(await page.locator(".export-notification-content").evaluate((element) =>
    element.scrollWidth <= element.clientWidth,
  )).toBe(true);
  await page.locator("#exportNotificationPath").focus();
  await page.clock.runFor(10000);
  await expect(notification).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss export notification" })).toBeVisible();
  await page.locator("#exportNotificationPath").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  expect(await page.evaluate(() => window.getSelection().toString())).toBe(`Saved to: ${path}`);
  expect(harness.index).toBe(0);
});

test("notifications stay in output preview but are excluded from output surfaces", async ({ page, harness }) => {
  await succeed(page);
  const notification = page.locator("#exportNotification");
  await clickMoreControl(page, "#navFixedPreview");
  await expect(notification).toBeVisible();
  for (const mode of ["presenter-mode", "preview-mode", "print-mode", "capture-mode", "pptx-mode"]) {
    await page.evaluate((mode) => document.body.classList.add(mode), mode);
    await expect(notification).toBeHidden();
    await page.evaluate((mode) => document.body.classList.remove(mode), mode);
    await expect(notification).toBeVisible();
  }
  await page.emulateMedia({ media: "print" });
  await expect(notification).toBeHidden();
  await page.emulateMedia({ media: "screen", forcedColors: "active", reducedMotion: "reduce" });
  await expect(notification).toBeVisible();
  expect(harness.index).toBe(0);
});
