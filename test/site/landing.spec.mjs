import AxeBuilder from "@axe-core/playwright";

import {
  expect, expectNoHorizontalOverflow, expectVisibleImagesLoaded, localeUrl, test,
} from "./fixtures.mjs";
import { normalizeNewlines } from "./helpers.mjs";

const viewports = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "mobile", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 844 },
];

for (const basePath of ["/", "/markdstage/"]) {
  for (const lang of ["ja", "en"]) {
    for (const viewport of viewports) {
      test(`${lang} ${viewport.name}: layout, images, language, and anchors at ${basePath}`, async ({ page, site }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(localeUrl(site, basePath, lang));
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(page).toHaveTitle(site[lang].title);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator(".languages [aria-current='page']")).toHaveAttribute("lang", lang);
        await expectNoHorizontalOverflow(page);
        await expectVisibleImagesLoaded(page);

        await page.locator("[data-example='architecture']").click();
        await expectVisibleImagesLoaded(page);
        await expectNoHorizontalOverflow(page);
        await page.locator("#example-architecture summary").click();
        await page.locator(".canvas-install summary").focus();
        await page.keyboard.press("Enter");
        await expectNoHorizontalOverflow(page);

        const startLink = page.locator(".hero-actions .button");
        await startLink.focus();
        await expect(startLink).toBeFocused();
        // Native focus can start smooth scrolling; settle the source before starting the anchor scroll.
        await startLink.scrollIntoViewIfNeeded();
        await expect(startLink).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(`${localeUrl(site, basePath, lang)}#get-started`);
        await expect(page.locator("#start-title")).toBeInViewport();
        if (viewport.name === "desktop") {
          await page.locator(".main-nav a[href='#examples']").click();
          await expect(page).toHaveURL(`${localeUrl(site, basePath, lang)}#examples`);
          await expect(page.locator("#examples-title")).toBeInViewport();
        }
        const alternate = lang === "ja" ? "en" : "ja";
        await page.locator(`.languages a[lang='${alternate}']`).focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(localeUrl(site, basePath, alternate));
        await expect(page.locator("html")).toHaveAttribute("lang", alternate);
        await expect(page).toHaveTitle(site[alternate].title);
        await expect(page.locator(".languages [aria-current='page']")).toHaveAttribute("lang", alternate);
        await expect(page.locator(".hero-slide img")).toHaveJSProperty("complete", true);
        await expectNoHorizontalOverflow(page);
      });
    }

    test(`${lang}: gallery keyboard selection, disclosures, and original source downloads at ${basePath}`, async ({ page, site }) => {
      await page.goto(localeUrl(site, basePath, lang));
      await expect(page.getByRole("group", { name: site[lang].galleryLabel })).toBeVisible();
      await expect(page.locator("[data-example='markdown']")).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#example-markdown")).toBeVisible();
      await expect(page.locator("#example-architecture")).toBeHidden();

      for (const id of ["architecture", "markdown"]) {
        const other = id === "architecture" ? "markdown" : "architecture";
        const button = page.locator(`[data-example='${id}']`);
        await button.focus();
        await page.keyboard.press("Enter");
        await expect(button).toBeFocused();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect(button).toHaveAttribute("aria-controls", `example-${id}`);
        await expect(page.locator(`[data-example='${other}']`)).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator(`#example-${id}`)).toBeVisible();
        await expect(page.locator(`#example-${other}`)).toBeHidden();
        await expect(page.locator("[data-example][aria-pressed='true']")).toHaveCount(1);

        const example = page.locator(`#example-${id}`);
        await example.locator("summary").focus();
        await page.keyboard.press("Enter");
        await expect(example.locator("details")).toHaveAttribute("open", "");
        expect(await example.locator("pre code").textContent()).toBe(normalizeNewlines(site.sources[id]));
        await page.keyboard.press("Tab");
        await expect(example.locator("pre")).toBeFocused();
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          example.locator("a[download]").click(),
        ]);
        expect(download.suggestedFilename()).toBe(`${id}.md`);
        expect(await download.failure()).toBeNull();
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString("utf8")).toBe(site.sources[id]);
      }
    });
  }
}

test.describe("progressive enhancement without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const basePath of ["/", "/markdstage/"]) {
    for (const lang of ["ja", "en"]) {
      test(`${lang}: content, both examples, and native controls survive at ${basePath}`, async ({ page, site }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(localeUrl(site, basePath, lang));
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.locator(".workflow-steps li")).toHaveCount(3);
        await expect(page.locator("#get-started")).toBeVisible();
        await expect(page.locator(".gallery-controls")).toBeHidden();
        for (const button of await page.locator("[data-copy]").all()) {
          await expect(button).toHaveAttribute("hidden", "");
          await expect(button).toBeHidden();
        }
        for (const id of ["markdown", "architecture"]) {
          const example = page.locator(`#example-${id}`);
          await expect(example).toBeVisible();
          await example.locator("summary").focus();
          await page.keyboard.press("Enter");
          await expect(example.locator("pre")).toBeVisible();
          expect(await example.locator("pre code").textContent()).toBe(normalizeNewlines(site.sources[id]));
        }
        await page.locator(".canvas-install summary").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#canvas-prompt")).toBeVisible();
        await expect(page.locator("[data-copy='canvas-prompt']")).toBeHidden();
        await expect(page.locator("#cli-command")).toHaveText(site.product.cliCommand);
        await expectVisibleImagesLoaded(page);
        await expectNoHorizontalOverflow(page);
        await page.locator(".hero-actions .button").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#start-title")).toBeInViewport();
        const alternate = lang === "ja" ? "en" : "ja";
        await page.locator(`.languages a[lang='${alternate}']`).focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("lang", alternate);
        await expect(page.locator(".example:visible")).toHaveCount(2);
      });
    }
  }
});

for (const lang of ["ja", "en"]) {
  for (const outcome of ["success", "rejected", "unavailable"]) {
    test(`${lang}: CLI and Copilot clipboard ${outcome} is reported honestly`, async ({ page, site }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((state) => {
        window.clipboardWrites = [];
        window.legacyCopyAttempts = [];
        document.execCommand = (...args) => {
          window.legacyCopyAttempts.push(args);
          return true;
        };
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: state === "unavailable" ? undefined : {
            writeText(text) {
              window.clipboardWrites.push(text);
              return new Promise((resolve, reject) => {
                window.completeClipboard = () => state === "success"
                  ? resolve() : reject(new DOMException("Clipboard denied", "NotAllowedError"));
              });
            },
          },
        });
      }, outcome);
      await page.goto(localeUrl(site, "/markdstage/", lang));
      await page.locator(".canvas-install summary").click();
      const status = page.getByRole("status", { includeHidden: true });
      await expect(status).toHaveAttribute("aria-live", "polite");
      await expect(status).toHaveText("");
      const expectedSources = [
        ["cli-command", site.product.cliCommand],
        ["canvas-prompt", `${site[lang].canvasPrompt}\n\n${site.product.repository}/tree/${site.product.releaseTag}/.github/extensions/markdstage`],
      ];
      for (const [index, [id, source]] of expectedSources.entries()) {
        const button = page.locator(`[data-copy='${id}']`);
        await expect(button).toBeVisible();
        expect(await page.locator(`#${id}`).textContent()).toBe(source);
        await button.focus();
        await page.keyboard.press("Enter");
        if (outcome !== "unavailable") {
          await expect(button).toBeDisabled();
          expect(await page.evaluate(() => window.clipboardWrites)).toEqual(expectedSources.slice(0, index + 1).map(([, text]) => text));
          await page.evaluate(() => window.completeClipboard());
        }
        await expect(button).toBeEnabled();
        const message = outcome === "success" ? site[lang].copied
          : outcome === "rejected" ? site[lang].copyFailed : site[lang].copyUnavailable;
        await expect(status).toHaveText(message);
        await expect(page.locator(`#${id}`)).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
      expect(await page.evaluate(() => window.legacyCopyAttempts)).toEqual([]);
      if (outcome === "unavailable") expect(await page.evaluate(() => window.clipboardWrites)).toEqual([]);
    });
  }

  test(`${lang}: reduced motion disables reveal, transitions, and smooth scrolling`, async ({ page, site }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(localeUrl(site, "/markdstage/", lang));
    await expect(page.locator(".hero-slide")).toHaveCSS("animation-name", "stage-arrival");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
    await expect(page.locator(".hero-slide")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-actions .button")).toHaveCSS("transition-duration", "0s");
    await page.locator(".hero-actions .button").click();
    await expect(page.locator("#start-title")).toBeInViewport();
    await page.locator("[data-example='architecture']").click();
    await expect(page.locator("#example-architecture")).toBeVisible();
  });
}

async function audit(page, selectors = []) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  for (const selector of selectors) builder = builder.include(selector);
  const result = await builder.analyze();
  expect(result.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
  }))).toEqual([]);
}

async function expectVisibleFocus(locator) {
  await expect(locator).toBeFocused();
  await expect(locator).toHaveCSS("outline-style", "solid");
  expect(await locator.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
}

for (const lang of ["ja", "en"]) {
  for (const viewport of viewports.slice(0, 2)) {
    test(`${lang} ${viewport.name}: WCAG AA with focused gallery, source, and onboarding`, async ({ page, site }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(localeUrl(site, "/markdstage/", lang));
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await expect(page.locator(".skip-link")).toBeInViewport();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(`${localeUrl(site, "/markdstage/", lang)}#main`);
      await audit(page);

      const selector = page.locator("[data-example='architecture']");
      await selector.focus();
      await page.keyboard.press("Enter");
      await expectVisibleFocus(selector);
      await audit(page, ["#examples"]);

      const summary = page.locator("#example-architecture summary");
      await summary.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expectVisibleFocus(page.locator("#example-architecture pre"));
      await audit(page, ["#examples"]);

      await page.locator(".canvas-install summary").focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expectVisibleFocus(page.locator(".prompt-box pre"));
      await audit(page, ["#get-started"]);
      await page.keyboard.press("Tab");
      await expectVisibleFocus(page.locator("[data-copy='canvas-prompt']"));
      await audit(page, ["#get-started"]);
    });
  }
}
