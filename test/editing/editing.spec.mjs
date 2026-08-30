// Browser regression tests for the architecture diagram editing workflow.
//
// Verify four points:
//   1. Dragging moves a node and **reroutes connectors**
//      (the old proof of concept applied only a transform and left lines behind)
//   2. The full workflow works with the keyboard (select, move, release layout, undo/redo)
//   3. /edit writes results back to the deck's Markdown fragment and they survive rerendering
//   4. Editing UI is **absent from the DOM** in presenter and print modes
//
// Do not compare screenshots here; this suite verifies behavior and visual tests cover appearance.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForPrintReady, waitForSlideReady } from "../utils/ready.mjs";

const FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-editing.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));

const EDITOR = ".architecture-editor-toolbar";
const NODE = (id) => `[data-architecture-id="${id}"]`;

const MIXED_CASE_ARCHITECTURE_SLIDE = [
  "---",
  "layout: title",
  "---",
  "```Architecture",
  JSON.stringify({
    version: 1,
    elements: [
      {
        type: "node",
        id: "mixed-case",
        x: 80,
        y: 80,
        width: 240,
        height: 120,
        text: "Mixed case",
      },
    ],
  }),
  "```",
].join("\n");

/** Start the harness in edit mode and wait for rendering to finish. */
async function openEditor(page, options = {}) {
  const harness = await startHarness({ slides: SLIDES, architectureEdit: true, ...options });
  await page.goto(`${harness.url}/`, { waitUntil: "load" });
  await waitForSlideReady(page);
  await expect(page.locator(EDITOR)).toHaveCount(1);
  return harness;
}

/** Connector paths in the diagram, used to detect rerouting. */
function connectorPaths(page) {
  return page.$$eval("[data-architecture-connector] path", (nodes) =>
    nodes.map((node) => node.getAttribute("d")),
  );
}

/** Current node position read from rendered output. */
function nodeBox(page, id) {
  return page.$eval(`[data-architecture-id="${id}"]`, (node) => {
    const rect = node.getBBox();
    return { x: Math.round(rect.x), y: Math.round(rect.y) };
  });
}

test("Architecture fence names are editable regardless of case", async ({ page }) => {
  const harness = await startHarness({
    slides: [MIXED_CASE_ARCHITECTURE_SLIDE],
    architectureEdit: true,
  });
  try {
    await page.goto(`${harness.url}/`, { waitUntil: "load" });
    await waitForSlideReady(page);
    await expect(page.locator(EDITOR)).toHaveCount(1);
    await expect(page.locator(NODE("mixed-case"))).toHaveCount(1);
  } finally {
    await harness.close();
  }
});

test.describe("edit mode", () => {
  test("dragging moves a node and reroutes connectors", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      const before = await connectorPaths(page);
      expect(before.length).toBeGreaterThan(0);
      const beforeBox = await nodeBox(page, "client");

      const target = page.locator(NODE("client"));
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 120, { steps: 8 });
      await page.mouse.up();

      // Editing rerenders the entire diagram, so wait for the position to settle.
      await expect.poll(async () => (await nodeBox(page, "client")).y).not.toBe(beforeBox.y);

      const after = await connectorPaths(page);
      expect(after.length).toBe(before.length);
      // A changed path proves that the line was rerouted rather than left behind.
      expect(after).not.toEqual(before);

      // Writeback also arrived.
      expect(harness.editReports.length).toBeGreaterThan(0);
      expect(harness.slides[0]).not.toBe(SLIDES[0]);
    } finally {
      await harness.close();
    }
  });

  test("dragging a layout-managed node does not move it and announces the reason", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      const beforeSource = harness.slides[0];
      const beforeBox = await nodeBox(page, "api");

      const target = page.locator(NODE("api"));
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();

      expect(await nodeBox(page, "api")).toEqual(beforeBox);
      // The DSL remains byte-for-byte unchanged.
      expect(harness.slides[0]).toBe(beforeSource);
      expect(harness.editReports).toHaveLength(0);

      // Explain why it cannot move and which group must be released.
      const status = page.locator("[data-architecture-edit-status]");
      await expect(status).toHaveAttribute("aria-live", "polite");
      await expect(status).toContainText("zone");
    } finally {
      await harness.close();
    }
  });

  test("the keyboard alone supports selection, movement, layout release, and undo", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      const start = await nodeBox(page, "client");

      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => (await nodeBox(page, "client")).x).toBeGreaterThan(start.x);
      const coarse = await nodeBox(page, "client");

      // Shift performs a fine adjustment smaller than coarse movement.
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect.poll(async () => (await nodeBox(page, "client")).x).toBeGreaterThan(coarse.x);
      const fine = await nodeBox(page, "client");
      expect(fine.x - coarse.x).toBeLessThan(coarse.x - start.x);

      // Select a layout-managed node and press L to release it for movement.
      await page.locator(NODE("api")).focus();
      const apiBefore = await nodeBox(page, "api");
      await page.keyboard.press("l");
      await expect.poll(() => harness.slides[0].includes('"layout"')).toBe(false);
      // Releasing does not change appearance.
      expect(await nodeBox(page, "api")).toEqual(apiBefore);

      await page.locator(NODE("api")).focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(async () => (await nodeBox(page, "api")).y).toBeGreaterThan(apiBefore.y);

      // Ctrl+Z undoes, and Ctrl+Shift+Z redoes.
      await page.keyboard.press("Control+z");
      await expect.poll(async () => (await nodeBox(page, "api")).y).toBe(apiBefore.y);
      await page.keyboard.press("Control+Shift+z");
      await expect.poll(async () => (await nodeBox(page, "api")).y).toBeGreaterThan(apiBefore.y);
    } finally {
      await harness.close();
    }
  });

  test("edits write back to the deck Markdown fragment and survive reload", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");
      await expect.poll(() => harness.editReports.length).toBeGreaterThan(0);

      const saved = harness.slides[0];
      expect(saved).toContain("```architecture");
      // Surrounding prose and front matter remain intact.
      expect(saved).toContain("## Editing workflow regression fixture");
      expect(saved).toContain("deck: Architecture DSL");

      const moved = await nodeBox(page, "client");
      await page.reload({ waitUntil: "load" });
      await waitForSlideReady(page);
      expect(await nodeBox(page, "client")).toEqual(moved);
    } finally {
      await harness.close();
    }
  });

  test("edit mode produces no console errors", async ({ page }) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Control+z");
      await expect(page.locator(".architecture-error")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});

test.describe("editing UI does not leak into presentation or print output", () => {
  // Even when the server is in edit mode, presenter and print modes must not show editing UI.
  // Otherwise the toolbar would appear during the presentation.

  test("editing UI is absent from the DOM in presenter mode", async ({ page }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: true });
    try {
      await page.goto(`${harness.url}/?present=1`, { waitUntil: "load" });
      await waitForSlideReady(page);

      await expect(page.locator(EDITOR)).toHaveCount(0);
      await expect(page.locator("[data-architecture-movable]")).toHaveCount(0);
      await expect(page.locator("[data-architecture-edit-status]")).toHaveCount(0);

      // The diagram itself exists, so zero editing elements is not caused by rendering nothing.
      await expect(page.locator(NODE("client"))).toHaveCount(1);

      // Attempting keyboard movement does not change the DSL.
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(200);
      expect(harness.editReports).toHaveLength(0);
      expect(harness.slides[0]).toBe(SLIDES[0]);
    } finally {
      await harness.close();
    }
  });

  test("editing UI is absent from the DOM in print mode", async ({ page }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: true });
    try {
      await page.goto(`${harness.url}/?print=1&token=${harness.printToken}`, {
        waitUntil: "load",
      });
      await waitForPrintReady(page);

      await expect(page.locator(EDITOR)).toHaveCount(0);
      await expect(page.locator("[data-architecture-movable]")).toHaveCount(0);
      await expect(page.locator(NODE("client"))).toHaveCount(1);
      expect(harness.editReports).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  test("a server with edit mode disabled shows no editing UI", async ({ page }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: false });
    try {
      await page.goto(`${harness.url}/`, { waitUntil: "load" });
      await waitForSlideReady(page);
      await expect(page.locator(EDITOR)).toHaveCount(0);
      await expect(page.locator(NODE("client"))).toHaveCount(1);
    } finally {
      await harness.close();
    }
  });

  test("the server rejects /edit when edit mode is disabled", async ({ request }) => {
    const harness = await startHarness({ slides: SLIDES, architectureEdit: false });
    try {
      const response = await request.post(`${harness.url}/edit`, {
        data: { index: 0, block: 0, source: '{"version":1,"elements":[]}' },
      });
      expect(response.status()).toBe(409);
      expect((await response.json()).error).toBe("edit_mode_disabled");
      expect(harness.slides[0]).toBe(SLIDES[0]);
    } finally {
      await harness.close();
    }
  });
});

test.describe("user-facing path into edit mode", () => {
  // If this path fails, Phase 5 is implemented but inaccessible. Verify the full path from opening
  // the URL through moving the diagram to actually changing the deck's Markdown fragment, rather
  // than testing setArchitectureEditMode in isolation.

  test("?architectureEdit=1 enters edit mode and completes writeback", async ({ page }) => {
    // Start with edit mode disabled on the server so the client cannot be true on its own.
    const harness = await startHarness({ slides: SLIDES, architectureEdit: false });
    try {
      expect(harness.architectureEdit).toBe(false);

      await page.goto(`${harness.url}/?architectureEdit=1`, { waitUntil: "load" });
      await waitForSlideReady(page);

      // The URL parameter reached server state, which is the single source of truth.
      await expect.poll(() => harness.architectureEdit).toBe(true);
      await expect(page.locator(EDITOR)).toHaveCount(1);

      // Edit mode remains enabled across the two-second /state poll.
      await page.waitForTimeout(2600);
      await expect(page.locator(EDITOR)).toHaveCount(1);

      // Move a node and verify the deck's Markdown fragment changes.
      const before = harness.slideAt(0);
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");

      await expect(page.locator("[data-architecture-save-state]")).toHaveAttribute(
        "data-architecture-save-state",
        "saved",
      );
      expect(harness.slideAt(0)).not.toBe(before);
      expect(harness.slideAt(0)).toContain("```architecture");
    } finally {
      await harness.close();
    }
  });
});

test.describe("save failures are visible to users", () => {
  // Prevent a state where eleven client-side rejection types are announced but server-side
  // rejection that actually loses data is silent. Because the diagram moves on screen, users
  // cannot detect an unsaved change unless the failure is displayed.

  const SAVE_STATE = "[data-architecture-save-state]";
  /** Match only /edit reliably, without the gaps of a glob. */
  const isEditRequest = (url) => new URL(url).pathname === "/edit";

  test("a server 409 rejection appears in the UI", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      // Reproduce the moment after edit mode is disabled but before the client learns through /state.
      let intercepted = 0;
      await page.route(isEditRequest, (route) => {
        intercepted += 1;
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: "edit_mode_disabled" }),
        });
      });

      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");

      const indicator = page.locator(SAVE_STATE);
      await expect(indicator).toHaveAttribute("data-architecture-save-state", "failed");
      await expect(indicator).toBeVisible();
      await expect(indicator).toContainText("Could not save");
      // Distinguish what happened.
      await expect(indicator).toContainText("Editing mode is disabled");
      expect(intercepted).toBeGreaterThan(0);
      // Nothing actually reached the server; this is not merely a displayed failure.
      expect(harness.editReports).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  test("a network failure also appears in the UI", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      await page.route(isEditRequest, (route) => route.abort());

      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");

      const indicator = page.locator(SAVE_STATE);
      await expect(indicator).toHaveAttribute("data-architecture-save-state", "failed");
      await expect(indicator).toBeVisible();
      await expect(indicator).toContainText("Could not save");
      expect(harness.editReports).toHaveLength(0);
    } finally {
      await harness.close();
    }
  });

  test("a successful save appears successful", async ({ page }) => {
    const harness = await openEditor(page);
    try {
      await page.locator(NODE("client")).focus();
      await page.keyboard.press("ArrowDown");

      const indicator = page.locator(SAVE_STATE);
      await expect(indicator).toHaveAttribute("data-architecture-save-state", "saved");
      await expect(indicator).toContainText("Saved");
      expect(harness.editReports.length).toBeGreaterThan(0);
    } finally {
      await harness.close();
    }
  });
});
