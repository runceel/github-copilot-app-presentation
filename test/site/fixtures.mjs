import { join } from "node:path";

import { expect, test as base } from "@playwright/test";

import { buildSite } from "../../scripts/build-site.mjs";
import { startSiteServer } from "../../scripts/serve-site.mjs";
import { createWorkspace, readContent } from "./helpers.mjs";

export { expect };

export const test = base.extend({
  site: [async ({}, use) => {
    const workspace = await createWorkspace();
    const servers = [];
    try {
      const outputDir = join(workspace.directory, "output");
      await buildSite({ outputDir, siteUrl: "https://example.test/markdstage/" });
      const urls = {};
      for (const basePath of ["/", "/markdstage/"]) {
        const server = await startSiteServer({ root: outputDir, basePath, port: 0 });
        servers.push(server);
        urls[basePath] = server.url;
      }
      await use({ urls, ...await readContent() });
    } finally {
      await Promise.all(servers.map((server) => server.close()));
      await workspace.dispose();
    }
  }, { scope: "worker" }],
  pageErrors: [async ({ page }, use, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      const navigationState = JSON.stringify(await page.evaluate(() => ({
        url: location.href,
        scroll: scrollY,
        viewport: { width: innerWidth, height: innerHeight },
        start: document.querySelector("#start-title")?.getBoundingClientRect().toJSON(),
        focused: document.activeElement?.outerHTML.slice(0, 180),
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      })));
      console.error(`${testInfo.title}: ${navigationState}`);
      await testInfo.attach("navigation-state", {
        contentType: "application/json",
        body: navigationState,
      });
    }
    expect(errors, "The landing page must not throw JavaScript errors").toEqual([]);
  }, { auto: true }],
});

export function localeUrl(site, basePath, lang) {
  return new URL(lang === "en" ? "en/" : "./", site.urls[basePath]).href;
}

export async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
}

export async function expectVisibleImagesLoaded(page) {
  const images = page.locator("img:visible");
  expect(await images.count()).toBeGreaterThan(0);
  for (const image of await images.all()) {
    await image.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0),
      { message: `Image must decode: ${await image.getAttribute("src")}` }).toBe(true);
    expect(await image.getAttribute("alt")).not.toBeNull();
  }
}
