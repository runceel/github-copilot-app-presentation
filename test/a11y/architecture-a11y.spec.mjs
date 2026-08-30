// Architecture diagram accessibility regression tests.
//
// Verify four properties:
//   1. Assistive technology does not receive the same content **twice** (visible <text> plus name).
//   2. Every diagram element has a **nonempty accessible name**.
//   3. The diagram is **keyboard reachable** (one tab stop for the full diagram in normal view).
//   4. Declaration order is exposed in the DOM and differs from paint (z) order.
//
// Results are based on Chromium's accessibility tree (CDP) and axe-core, not DOM attributes.
// See the beginning of test/a11y/ax.mjs for the rationale.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { REPO_ROOT, startHarness } from "../harness/server.mjs";
import { splitFixtureDeck } from "../harness/deck.mjs";
import { waitForSlideReady } from "../utils/ready.mjs";
import { accessibilityTree, findDiagram, flatten, readDiagramSemantics, domOrder } from "./ax.mjs";

const FIXTURE = join(REPO_ROOT, "test", "fixtures", "architecture-editing.md");
const SLIDES = splitFixtureDeck(readFileSync(FIXTURE, "utf8"));
const DIAGRAM_TITLE = "Editing fixture";
const SVG = "svg.architecture-svg";

async function openDeck(page, options = {}) {
  const harness = await startHarness({ slides: SLIDES, ...options });
  const query = options.architectureEdit ? "/?architectureEdit=1" : "/";
  await page.goto(`${harness.url}${query}`, { waitUntil: "load" });
  await waitForSlideReady(page);
  await expect(page.locator(SVG)).toHaveCount(1);
  return harness;
}

test.describe("content the diagram exposes to assistive technology", () => {
  test("axe-core reports no violations in the diagram in normal view", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      // Apply **all rules, including best practices**, within the diagram. This is Phase 6 scope.
      const result = await new AxeBuilder({ page }).include(".architecture-diagram").analyze();
      expect(
        result.violations.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("axe-core reports no violations in the diagram in edit mode", async ({ page }) => {
    const harness = await openDeck(page, { architectureEdit: true });
    try {
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      const result = await new AxeBuilder({ page }).include(".architecture-diagram").analyze();
      expect(
        result.violations.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("axe-core reports no WCAG A/AA violations across the full page", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      // Limit full-page checks to WCAG A/AA. Including best practices reports shell issues
      // (landmark-one-main / page-has-heading-one / region) in the overall slide HTML, not the
      // Architecture DSL. Fixing those could affect every slide, so they are outside Phase 6 scope.
      // Only best-practice rules are excluded; **WCAG conformance itself is not relaxed**.
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("the same string is not announced twice", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const diagram = findDiagram(await accessibilityTree(page), DIAGRAM_TITLE);
      expect(diagram, "the diagram is absent from the accessibility tree").not.toBeNull();

      // Only the elements themselves may remain in the diagram. If visible <text> remains as
      // StaticText, it is announced once there and again as the role="img" / role="group" name.
      // Before the fix, **every** node, group, and connector was announced twice.
      const inside = flatten(diagram.children);
      expect(inside.filter((node) => node.role === "StaticText")).toEqual([]);

      // Direct diagram children exactly match the number of declared elements.
      const semantics = await readDiagramSemantics(page, DIAGRAM_TITLE);
      expect(diagram.children).toHaveLength(semantics.elements.length);
    } finally {
      await harness.close();
    }
  });

  test("all visible text is hidden from assistive technology", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      // Cover node bodies, group titles, and connector labels. Visible text may be truncated when it
      // does not fit, so aria-label remains the authoritative value.
      const texts = await page.$$eval(`${SVG} text`, (nodes) =>
        nodes.map((node) => ({
          text: node.textContent,
          hidden: node.getAttribute("aria-hidden"),
        })),
      );
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((entry) => entry.hidden !== "true")).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  test("every element has a nonempty accessible name", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const diagram = findDiagram(await accessibilityTree(page), DIAGRAM_TITLE);
      const nameless = diagram.children.filter((node) => node.name.trim() === "");
      expect(nameless).toEqual([]);

      // Connector names identify endpoints by **visible text**. If this regresses to IDs (client /
      // api / worker), the announcement no longer matches what someone viewing the diagram reads.
      const names = diagram.children.map((node) => node.name);
      expect(names).toContain("Client to API: request");
      expect(names).toContain("API to Worker: enqueue");
    } finally {
      await harness.close();
    }
  });
});

test.describe("keyboard reachability", () => {
  test("the whole diagram is exactly one tab stop in normal view", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const stops = await page.$$eval(`${SVG}, ${SVG} [tabindex]`, (nodes) =>
        nodes
          .filter((node) => node.getAttribute("tabindex") === "0")
          .map((node) => node.getAttribute("data-architecture-id") ?? node.tagName.toLowerCase()),
      );
      expect(stops).toEqual(["svg"]);

      // Verify actual focus; the presence of an attribute alone does not guarantee reachability.
      await page.locator(SVG).focus();
      const focused = await page.evaluate(() =>
        document.activeElement?.classList?.contains("architecture-svg"),
      );
      expect(focused).toBe(true);
    } finally {
      await harness.close();
    }
  });

  test("elements become tab stops in edit mode without duplicating the diagram root", async ({ page }) => {
    const harness = await openDeck(page, { architectureEdit: true });
    try {
      await expect(page.locator(".architecture-editor-toolbar")).toHaveCount(1);
      // A tabindex on the root adds an empty stop between "diagram" and the first element.
      expect(await page.getAttribute(SVG, "tabindex")).toBeNull();

      const stops = await page.$$eval(`${SVG} [tabindex="0"]`, (nodes) =>
        nodes.map((node) => node.getAttribute("data-architecture-id")),
      );
      expect(stops.sort()).toEqual(["api", "client", "worker", "zone"]);
    } finally {
      await harness.close();
    }
  });

  test("the two edit UI live regions retain separate purposes", async ({ page }) => {
      const harness = await openDeck(page, { architectureEdit: true });
      try {
        const toolbar = page.locator(".architecture-editor-toolbar");
        await expect(toolbar).toHaveCount(1);
        await expect(toolbar).toHaveAttribute("role", "toolbar");

        // Operation and save results must use **separate live regions**.
        //
        // Combining them is tempting because one operation emits "moved" and "saving → saved" nearly
        // simultaneously, which some AT may announce twice. They must remain separate because their
        // lifetimes differ. The next operation may replace its result, but a **save failure means an
        // edit was actually lost** and must persist until the next successful save. A single region
        // would let the next "moved" message erase the save-failure announcement.
        //
        // If these merge, the three test:editing cases asserting visible save failures should fail,
        // but they inspect DOM state and miss a regression limited to aria attributes. This check
        // fills that gap.
        const regions = await toolbar.evaluate((node) =>
          Array.from(node.querySelectorAll('[role="status"]')).map((region) => ({
            purpose: region.hasAttribute("data-architecture-edit-status")
              ? "edit"
              : region.hasAttribute("data-architecture-save-state")
                ? "save"
                : "unknown",
            live: region.getAttribute("aria-live"),
          })),
        );
        expect(regions.map((region) => region.purpose).sort()).toEqual(["edit", "save"]);
        // Both are polite; assertive would interrupt announcements on every slide operation.
        expect(regions.map((region) => region.live)).toEqual(["polite", "polite"]);
      } finally {
        await harness.close();
      }
  });
});

test.describe("announcement and declaration order", () => {
  test("declaration order is exposed in the DOM and distinct from paint order", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const semantics = await readDiagramSemantics(page, DIAGRAM_TITLE);
      const declaration = semantics.elements.map((element) => element.id);
      const painted = await domOrder(page, DIAGRAM_TITLE);

      // data-architecture-order must be a **gapless** sequence from 0 through n-1. Gaps or duplicates
      // make it unusable as declaration order.
      expect(semantics.elements.map((element) => element.order)).toEqual(
        semantics.elements.map((_, index) => index),
      );
      expect(declaration.sort()).toEqual([...painted].sort());

      // Default z values (group -50 / connector -10 / node 0) make paint and declaration order
      // differ in this fixture. This is intentional and supports README's policy that z is visual,
      // not a determinant of announcement order. If they begin to match, the policy or default z
      // changed and README must also be updated.
      expect(painted).not.toEqual(semantics.elements.map((element) => element.id));
      expect(painted).toEqual([
        "zone",
        "client-api",
        "api-worker",
        "client",
        "api",
        "worker",
      ]);
    } finally {
      await harness.close();
    }
  });

  test("announcement order matches DOM order, fixing the sequence exposed to AT", async ({ page }) => {
    const harness = await openDeck(page);
    try {
      const diagram = findDiagram(await accessibilityTree(page), DIAGRAM_TITLE);
      const spoken = diagram.children.map((node) => node.name);
      expect(spoken).toEqual([
        "Service zone",
        "Client to API: request",
        "API to Worker: enqueue",
        "browser icon, Client",
        "api icon, API",
        "server icon, Worker",
      ]);
    } finally {
      await harness.close();
    }
  });
});
