import { expect, test } from "@playwright/test";

import { startArchitectureEditorHarness } from "../harness/architecture-editor.mjs";

const SOURCE = `${JSON.stringify(
  {
    version: 1,
    canvas: { width: 1600, height: 900 },
    title: "Editor",
    elements: [
      {
        type: "node",
        id: "client",
        x: 100,
        y: 180,
        width: 260,
        height: 140,
        text: "Client",
      },
      {
        type: "node",
        id: "api",
        x: 650,
        y: 180,
        width: 260,
        height: 140,
        text: "API",
      },
      {
        type: "connector",
        from: "client",
        to: "api",
        routing: "orthogonal",
        arrow: true,
      },
    ],
  },
  null,
  2,
)}\n`;
const EXISTING_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

async function openEditor(page) {
  const harness = await startArchitectureEditorHarness({
    source: SOURCE,
    assets: { "assets/existing.svg": EXISTING_SVG },
  });
  await page.goto(harness.url, { waitUntil: "load" });
  await expect(page.locator(".tree-item")).toHaveCount(3);
  return harness;
}

async function screenPoint(page, x, y) {
  return page.locator(".architecture-svg").evaluate((svg, point) => {
    const source = svg.createSVGPoint();
    source.x = point.x;
    source.y = point.y;
    const screen = source.matrixTransform(svg.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, { x, y });
}

async function addShape(page, name = "Rounded rectangle") {
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

async function openProperties(page) {
  const panel = page.locator("#inspectorPanel");
  if (!(await panel.isVisible())) {
    await page.getByRole("button", { name: "Properties", exact: true }).click();
  }
}

async function openMore(page) {
  const menu = page.getByRole("menu", { name: "More editing controls" });
  if (!(await menu.isVisible())) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
}

async function clickEditorAction(page, action) {
  const control = page.locator(`[data-action="${action}"]`);
  if (!(await control.isVisible())) await openMore(page);
  await control.click();
}

function boxesIntersect(left, right, gap = 20) {
  return !(
    left.x + left.width + gap <= right.x ||
    right.x + right.width + gap <= left.x ||
    left.y + left.height + gap <= right.y ||
    right.y + right.height + gap <= left.y
  );
}

test("changes remain in the draft until the save button writes them to Markdown", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await expect(page.locator('[data-action="save"]')).toBeDisabled();
    await addShape(page);
    await expect(page.locator(".tree-item")).toHaveCount(4);
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    expect(harness.saves).toHaveLength(0);
    expect(harness.markdown).not.toContain('"id": "node"');

    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(harness.saves).toHaveLength(1);
    expect(harness.markdown).toContain('"id": "node"');
    await expect(page.locator('[data-action="save"]')).toBeDisabled();
  } finally {
    await harness.close();
  }
});

test("connector label overlap can be placed in front of or behind boxes", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-ref="elements[2]"].tree-item').click();
    await openProperties(page);
    const layer = page.locator('select[id^="field-labelLayer"]');
    await expect(layer).toHaveValue("front");
    await expect(
      page.locator(
        '.architecture-svg > [data-architecture-connector-label][data-architecture-label-layer="front"]',
      ),
    ).toHaveCount(0);

    await page.locator('input[id^="field-label"]').fill("HTTPS");
    await page.locator('input[id^="field-label"]').press("Enter");
    await expect(
      page.locator(
        '.architecture-svg > [data-architecture-connector-label][data-architecture-label-layer="front"]',
      ),
    ).toHaveCount(1);

    await layer.selectOption("behind");
    await expect(
      page.locator(
        '[data-architecture-connector] > [data-architecture-connector-label][data-architecture-label-layer="behind"]',
      ),
    ).toHaveCount(1);
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
  } finally {
    await harness.close();
  }
});

test("connector line-style presets preserve the Architecture v1 dash contract", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-ref="elements[2]"].tree-item').click();
    await openProperties(page);
    const lineStyle = page.getByLabel("Line style");
    await expect(lineStyle).toHaveValue("solid");

    await lineStyle.selectOption("dotted");
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements[2].style?.dash,
    ).toBe("1 5");
    await page.getByLabel("Line style").selectOption("custom");
    await expect(page.getByLabel("Dash pattern")).toHaveValue("6 3");
    await page.getByLabel("Line style").selectOption("solid");
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements[2].style?.dash || "",
    ).toBe("");
  } finally {
    await harness.close();
  }
});

test("selection, keyboard movement, resizing, and undo/redo share one draft", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const client = page.locator('[data-editor-ref="client"]');
    await client.focus();
    const before = await client.evaluate((node) => node.getBBox().x);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() =>
        page.locator('[data-editor-ref="client"]').evaluate((node) => node.getBBox().x),
      )
      .toBeGreaterThan(before);

    await page.locator('[data-ref="client"].tree-item').click();
    await openProperties(page);
    await expect(page.locator(".editor-resize-handle")).toHaveCount(4);
    const width = page.locator('input[id^="field-width"]');
    await width.fill("340");
    await width.press("Enter");
    await expect
      .poll(() =>
        page.locator('[data-editor-ref="client"]').evaluate((node) => node.getBBox().width),
      )
      .toBeGreaterThan(260);

    await page.locator('[data-action="undo"]').click();
    await page.locator('[data-action="redo"]').click();
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
  } finally {
    await harness.close();
  }
});

test("the shape palette stays bounded and adds PowerPoint-compatible shapes", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 720 });
  const harness = await openEditor(page);
  try {
    const trigger = page.getByRole("button", { name: "Shape", exact: true });
    await trigger.click();
    const palette = page.getByRole("menu", { name: "Add a shape" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("menuitem")).toHaveCount(7);
    const bounds = await palette.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(560);

    await palette.getByRole("menuitem", { name: "Diamond", exact: true }).click();
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(1);
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements.find((element) => element.id === "node")?.shape,
    ).toBe("diamond");
    await expect(page.locator('[data-editor-ref="node"] > polygon')).toHaveCount(1);
  } finally {
    await harness.close();
  }
});

test("an empty diagram offers a direct first-shape action", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({
    source: `${JSON.stringify({ version: 1, elements: [] }, null, 2)}\n`,
  });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    const empty = page.locator(".editor-empty-state");
    await expect(empty.getByRole("heading", { name: "Build your first diagram" })).toBeVisible();
    await expect(page.locator("#status")).toContainText("Add the first shape");
    await empty.getByRole("button", { name: "Add first shape" }).click();
    await expect(page.locator('[data-ref="node"].tree-item')).toBeVisible();
    await expect(empty).toHaveCount(0);
    await expect(page.locator('[data-editor-ref="node"]')).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("toolbar-added shapes avoid occupied siblings", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await addShape(page);
    await addShape(page, "Hexagon");
    await expect(page.locator(".tree-item")).toHaveCount(5);
    const elements = JSON.parse(harness.draftSource).elements.filter(
      (element) => element.type === "node",
    );
    const added = elements.filter((element) => element.id.startsWith("node"));
    expect(added).toHaveLength(2);
    for (const candidate of added) {
      expect(
        elements.some(
          (element) => element.id !== candidate.id && boxesIntersect(candidate, element),
        ),
      ).toBe(false);
    }
  } finally {
    await harness.close();
  }
});

test("medium and narrow layouts expose Elements and Properties as responsive drawers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const harness = await openEditor(page);
  try {
    const elementsButton = page.getByRole("button", { name: "Elements", exact: true });
    const propertiesButton = page.getByRole("button", { name: "Properties", exact: true });
    await expect(elementsButton).toBeVisible();
    await expect(propertiesButton).toBeVisible();
    await expect(page.locator("#elementPanel")).not.toBeVisible();
    await expect(page.locator("#inspectorPanel")).not.toBeVisible();

    const client = page.locator('[data-editor-ref="client"]');
    const clientBounds = await client.boundingBox();
    await page.mouse.move(
      clientBounds.x + clientBounds.width / 2,
      clientBounds.y + clientBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      clientBounds.x + clientBounds.width / 2 + 40,
      clientBounds.y + clientBounds.height / 2,
    );
    await page.mouse.up();
    await expect(page.locator("#inspectorPanel")).not.toBeVisible();
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements.find((element) => element.id === "client")?.x,
    ).toBeGreaterThan(100);

    await elementsButton.click();
    await expect(elementsButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#elementPanel")).toBeVisible();
    await page.locator('[data-ref="client"].tree-item').click();
    await expect(page.locator("#elementPanel")).toBeVisible();
    await propertiesButton.click();
    await expect(page.locator("#elementPanel")).not.toBeVisible();
    await expect(page.locator("#inspectorPanel")).toBeVisible();
    await expect(propertiesButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("ID", { exact: true })).toBeFocused();
    await expect(page.locator("#panelScrim")).toHaveCount(0);
    const fitted = await page.evaluate(() => {
      const viewport = document.querySelector("#viewport").getBoundingClientRect();
      const diagram = document.querySelector(".architecture-diagram").getBoundingClientRect();
      return {
        left: diagram.left - viewport.left,
        right: viewport.right - diagram.right,
      };
    });
    expect(fitted.left).toBeGreaterThanOrEqual(0);
    expect(fitted.right).toBeGreaterThanOrEqual(0);

    const selectedBounds = await page.locator('[data-editor-ref="client"]').boundingBox();
    await page.mouse.move(
      selectedBounds.x + selectedBounds.width / 2,
      selectedBounds.y + selectedBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      selectedBounds.x + selectedBounds.width / 2 + 30,
      selectedBounds.y + selectedBounds.height / 2,
    );
    await page.mouse.up();
    await expect(page.locator("#inspectorPanel")).toBeVisible();

    await page.setViewportSize({ width: 520, height: 720 });
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Shape", exact: true })).toBeVisible();
    await expect(page.locator("#inspectorPanel")).toBeVisible();
    const headerHeight = await page.locator(".editor-header").evaluate((element) => element.offsetHeight);
    expect(headerHeight).toBeLessThan(120);
    const primaryHeights = await page.locator(".editor-actions > button, .editor-actions > div > button")
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.min(...primaryHeights)).toBeGreaterThanOrEqual(40);
    await openMore(page);
    await expect(page.locator("#inspectorPanel")).not.toBeVisible();
    await expect(page.getByRole("menu", { name: "More editing controls" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Group", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  } finally {
    await harness.close();
  }
});

test("breakpoint changes preserve the focused panel without stale Escape handling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1300, height: 720 });
  const harness = await openEditor(page);
  try {
    await page.locator('[data-ref="client"].tree-item').click();
    await openProperties(page);
    const clientTreeItem = page.locator('[data-ref="client"].tree-item');
    await clientTreeItem.focus();

    await page.setViewportSize({ width: 900, height: 720 });
    await expect(page.locator("#elementPanel")).toBeVisible();
    await expect(page.locator("#inspectorPanel")).not.toBeVisible();
    await expect(clientTreeItem).toBeFocused();

    await page.setViewportSize({ width: 1300, height: 720 });
    await expect(page.locator("#elementPanel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#elementPanel")).toBeVisible();
    await expect(clientTreeItem).toHaveAttribute("aria-selected", "false");
  } finally {
    await harness.close();
  }
});

test("move and resize gestures show live transforms before committing", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const client = page.locator('[data-editor-ref="client"]');
    const clientBounds = await client.boundingBox();
    await page.mouse.move(
      clientBounds.x + clientBounds.width / 2,
      clientBounds.y + clientBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      clientBounds.x + clientBounds.width / 2 + 60,
      clientBounds.y + clientBounds.height / 2 + 30,
    );
    await expect(client).toHaveClass(/editor-drag-target/);
    await expect.poll(() => client.getAttribute("transform")).toContain("translate");
    await page.mouse.up();
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements.find((element) => element.id === "client")?.x,
    ).toBeGreaterThan(100);

    await page.locator('[data-ref="client"].tree-item').click();
    const handle = page.locator('.editor-resize-handle[data-corner="se"]');
    const handleBounds = await handle.boundingBox();
    await page.mouse.move(
      handleBounds.x + handleBounds.width / 2,
      handleBounds.y + handleBounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBounds.x + handleBounds.width / 2 + 70,
      handleBounds.y + handleBounds.height / 2 + 40,
    );
    await expect.poll(() => client.getAttribute("transform")).toContain("matrix");
    await page.mouse.up();
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements.find((element) => element.id === "client")?.width,
    ).toBeGreaterThan(260);
  } finally {
    await harness.close();
  }
});

test("large diagrams scroll and pan to the edges, then fit centered in the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  const harness = await openEditor(page);
  try {
    const viewport = page.locator("#viewport");
    const surface = page.locator("#canvasSurface");
    const diagram = page.locator(".architecture-diagram");
    await expect(page.locator("#status")).toContainText("Select an element to edit it");
    await clickEditorAction(page, "zoom-in");
    await clickEditorAction(page, "zoom-in");
    await clickEditorAction(page, "zoom-in");
    const initial = await viewport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
    }));
    expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
    expect(initial.scrollLeft).toBe(0);
    const leftEdge = await page.evaluate(() => ({
      viewportLeft: document.getElementById("viewport").getBoundingClientRect().left,
      diagramLeft: document.querySelector(".architecture-diagram").getBoundingClientRect().left,
    }));
    expect(leftEdge.diagramLeft).toBeGreaterThanOrEqual(leftEdge.viewportLeft);
    await expect
      .poll(() => surface.evaluate((element) => element.scrollWidth))
      .toBeGreaterThan(initial.clientWidth);

    await viewport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth - element.clientWidth;
    });
    const rightEdge = await page.evaluate(() => {
      const viewportBounds = document.getElementById("viewport").getBoundingClientRect();
      const diagramBounds = document.querySelector(".architecture-diagram").getBoundingClientRect();
      return {
        viewportRight: viewportBounds.right,
        diagramRight: diagramBounds.right,
      };
    });
    expect(rightEdge.diagramRight).toBeLessThanOrEqual(rightEdge.viewportRight);

    await viewport.evaluate((element) => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    });
    const bounds = await viewport.boundingBox();
    await page.mouse.move(bounds.x + 44, bounds.y + 44);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 4, bounds.y + 4);
    await page.mouse.up();
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    await clickEditorAction(page, "zoom-fit");
    const fitted = await viewport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
    }));
    expect(fitted.scrollWidth - fitted.clientWidth).toBeLessThanOrEqual(1);
    expect(fitted.scrollLeft).toBe(0);

    await clickEditorAction(page, "zoom-out");
    const centers = await page.evaluate(() => {
      const viewportBounds = document.getElementById("viewport").getBoundingClientRect();
      const diagramBounds = document.querySelector(".architecture-diagram").getBoundingClientRect();
      return {
        viewport: (viewportBounds.left + viewportBounds.right) / 2,
        diagram: (diagramBounds.left + diagramBounds.right) / 2,
      };
    });
    expect(Math.abs(centers.viewport - centers.diagram)).toBeLessThanOrEqual(1);
    await expect(diagram).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("adding connectors and deleting nodes preserves reference integrity", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await clickEditorAction(page, "add-connector");
    await page.locator('[data-editor-ref="api"]').click();
    await page.locator('[data-editor-ref="client"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(4);

    await page.locator('[data-ref="api"].tree-item').click();
    await clickEditorAction(page, "delete");
    await expect(page.locator('[data-ref="api"].tree-item')).toHaveCount(0);
    await expect(page.locator(".tree-item")).toHaveCount(1);
  } finally {
    await harness.close();
  }
});

test("the asset picker edits standalone images and node icons", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await clickEditorAction(page, "add-image");
    const dialog = page.getByRole("dialog", { name: "Add image" });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.locator(".asset-option img").first().evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    await dialog.getByRole("option", { name: "assets/existing.svg" }).click();
    await dialog.getByRole("button", { name: "Select", exact: true }).click();

    await expect(page.locator('[data-ref="existing"].tree-item')).toBeVisible();
    await expect(page.locator('[data-editor-ref="existing"]')).toHaveAttribute(
      "data-architecture-type",
      "image",
    );
    await openProperties(page);
    await page.getByLabel("Display mode").selectOption("cover");
    await expect
      .poll(
        () =>
          JSON.parse(harness.draftSource).elements.find((element) => element.id === "existing")
            ?.fit,
      )
      .toBe("cover");

    await page.locator('[data-ref="existing"].tree-item').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Start connector here" }).click();
    await page.locator('[data-editor-ref="api"]').click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(2);

    await page.locator('[data-ref="client"].tree-item').click();
    await openProperties(page);
    await page.getByRole("button", { name: "Select image from assets/" }).click();
    await expect(page.getByRole("dialog", { name: "Select node image" })).toBeVisible();
    await page.getByRole("option", { name: "assets/existing.svg" }).click();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await expect
      .poll(
        () =>
          JSON.parse(harness.draftSource).elements.find((element) => element.id === "client")
            ?.icon,
      )
      .toBe("assets/existing.svg");
  } finally {
    await harness.close();
  }
});

test("importing an image from the computer numbers duplicate names and diagram undo keeps the asset", async ({
  page,
}) => {
  const harness = await openEditor(page);
  try {
    await clickEditorAction(page, "add-image");
    await page.locator("#assetFileInput").setInputFiles({
      name: "existing.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(EXISTING_SVG),
    });
    await expect(page.locator("#assetDialogStatus")).toContainText(
      "Imported as assets/existing-2.svg",
    );
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await expect(page.locator('[data-ref="existing-2"].tree-item')).toBeVisible();
    expect(harness.assets.has("assets/existing-2.svg")).toBe(true);

    await page.locator('[data-action="undo"]').click();
    await expect(page.locator('[data-ref="existing-2"].tree-item')).toHaveCount(0);
    expect(harness.assets.has("assets/existing-2.svg")).toBe(true);

    await page.locator(".element-panel").click({
      button: "right",
      position: { x: 40, y: 400 },
    });
    await expect(
      page.getByRole("menuitem", { name: "Add image", exact: true }),
    ).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("external-change conflicts remain visible without overwriting Markdown", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await addShape(page);
    harness.setConflict();
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("changed outside");
    await expect(page.locator("#status")).toHaveAttribute("data-kind", "error");
    expect(harness.saves).toHaveLength(0);
    await expect(page.locator('[data-action="save"]')).toBeEnabled();

    page.once("dialog", (dialog) => dialog.accept());
    await clickEditorAction(page, "reload");
    await expect(page.locator("#status")).toContainText("Reloaded");
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(0);
    await expect(page.locator('[data-action="save"]')).toBeDisabled();

    await addShape(page);
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(harness.saves).toHaveLength(1);
  } finally {
    await harness.close();
  }
});

test("editing can continue with the current revision after reloading an unsaved draft", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await addShape(page);
    await expect(page.locator(".tree-item")).toHaveCount(4);
    await page.reload({ waitUntil: "load" });
    await expect(page.locator(".tree-item")).toHaveCount(4);

    await addShape(page);
    await expect(page.locator(".tree-item")).toHaveCount(5);
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(JSON.parse(harness.saves[0]).elements).toHaveLength(5);
  } finally {
    await harness.close();
  }
});

test("reloading source Markdown does not carry over a draft from the old generation", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await addShape(page);
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(1);

    harness.reloadSource(SOURCE.replace('"text": "Client"', '"text": "Reloaded client"'));
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(0);
    await expect(page.locator('[data-ref="client"].tree-item')).toContainText("Reloaded client");

    await addShape(page);
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(harness.markdown).toContain("Reloaded client");
    expect(harness.markdown).toContain('"id": "node"');
  } finally {
    await harness.close();
  }
});

test("a delayed stale state response does not roll back the generation after reload", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    harness.delayNextState(300);
    await addShape(page);
    harness.reloadSource(SOURCE.replace('"text": "Client"', '"text": "Reloaded client"'));

    await expect(page.locator('[data-ref="client"].tree-item')).toContainText("Reloaded client");
    await page.waitForTimeout(400);
    await expect(page.locator('[data-ref="client"].tree-item')).toContainText("Reloaded client");
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(0);

    await addShape(page);
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(harness.markdown).toContain("Reloaded client");
  } finally {
    await harness.close();
  }
});

test("edits made during save remain dirty instead of being marked saved", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({
    source: SOURCE,
    saveDelay: 300,
  });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await expect(page.locator(".tree-item")).toHaveCount(3);
    await addShape(page);
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saving");

    await addShape(page);
    await expect(page.locator(".tree-item")).toHaveCount(5);
    await expect(page.locator("#status")).toContainText("still unsaved");
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    expect(JSON.parse(harness.saves[0]).elements).toHaveLength(4);

    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(JSON.parse(harness.saves[1]).elements).toHaveLength(5);
  } finally {
    await harness.close();
  }
});

test("save server communication failures appear in the UI", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await addShape(page);
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    await page.route("**/save", (route) => route.abort("connectionfailed"));

    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("Could not connect");
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
  } finally {
    await harness.close();
  }
});

test("context menus on the canvas and element tree expose target-specific edit actions", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    await page.locator('[data-editor-ref="client"]').click({ button: "right" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-label", /client/);
    await menu.getByRole("menuitem", { name: "Start connector here" }).click();
    await expect(page.locator(".connector-source")).toHaveCount(1);
    await page.locator('[data-editor-ref="api"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(4);

    await page.locator('[data-ref="api"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.locator('[data-ref="api-copy"].tree-item')).toHaveCount(1);

    await page.locator('[data-ref="api-copy"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.locator('[data-ref="api-copy"].tree-item')).toHaveCount(0);
  } finally {
    await harness.close();
  }
});

test("adds at a blank-area context-menu position and converts to parent-relative coordinates in groups", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    const groupPoint = await screenPoint(page, 1200, 650);
    await page.mouse.click(groupPoint.x, groupPoint.y, { button: "right" });
    await menu.getByRole("menuitem", { name: "Add group here" }).click();
    await expect(page.locator('[data-ref="group"].tree-item')).toHaveCount(1);
    await expect.poll(() => JSON.parse(harness.draftSource).elements.find(
      (element) => element.id === "group",
    )).toMatchObject({ x: 940, y: 490, width: 520, height: 320 });

    const childPoint = await screenPoint(page, 1100, 600);
    await page.mouse.click(childPoint.x, childPoint.y, { button: "right" });
    await expect(menu.getByRole("menuitem", { name: "Add child node here" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Add child node here" }).click();
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(1);
    await expect.poll(() => {
      const group = JSON.parse(harness.draftSource).elements.find(
        (element) => element.id === "group",
      );
      return group.children.find((element) => element.id === "node");
    }).toMatchObject({ x: 30, y: 40, width: 260, height: 140 });
  } finally {
    await harness.close();
  }
});

test("context menus support ordering, connector duplication, undo, and save", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    await page.locator('[data-ref="client"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Bring forward" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[1].id).toBe("client");
    await page.locator('[data-ref="client"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Send backward" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].id).toBe("client");

    await page.locator(".tree-item").filter({ hasText: "client → api" }).click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "Start connector here" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(2);

    const panel = page.locator(".element-panel");
    await panel.click({ button: "right", position: { x: 40, y: 400 } });
    await menu.getByRole("menuitem", { name: "Undo" }).click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(1);
    await panel.click({ button: "right", position: { x: 40, y: 400 } });
    await menu.getByRole("menuitem", { name: "Redo" }).click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(2);

    await panel.click({ button: "right", position: { x: 40, y: 400 } });
    await menu.getByRole("menuitem", { name: "Save to Markdown" }).click();
    await expect(page.locator("#status")).toContainText("Saved");
    expect(harness.saves).toHaveLength(1);
  } finally {
    await harness.close();
  }
});

test("blank space in the element tree adds near the visible canvas without overlap", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    await page.locator(".element-panel").click({
      button: "right",
      position: { x: 40, y: 400 },
    });
    await expect(menu.getByRole("menuitem", { name: "Add node", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: "Save to Markdown" })).toBeDisabled();

    await menu.getByRole("menuitem", { name: "Add node", exact: true }).click();
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(1);
    await expect.poll(() => JSON.parse(harness.draftSource).elements.find(
      (element) => element.id === "node",
    )).toMatchObject({ width: 260, height: 140 });
    const elements = JSON.parse(harness.draftSource).elements;
    const added = elements.find((element) => element.id === "node");
    expect(added.x).toBeGreaterThan(300);
    expect(added.y).toBeGreaterThan(200);
    expect(elements.slice(0, 2).some((element) => boxesIntersect(added, element))).toBe(false);
  } finally {
    await harness.close();
  }
});

test("layout actions appear only in the group context submenu", async ({ page }) => {
  const source = `${JSON.stringify(
    {
      version: 1,
      canvas: { width: 1200, height: 700 },
      elements: [
        {
          type: "group",
          id: "zone",
          x: 100,
          y: 100,
          width: 800,
          height: 400,
          layout: {
            type: "grid",
            gap: 30,
            rowGap: 24,
            columnGap: 36,
            padding: 40,
            columns: 2,
          },
          children: [
            { type: "node", id: "api", text: "API" },
            { type: "node", id: "db", text: "Database" },
          ],
        },
      ],
    },
    null,
    2,
  )}\n`;
  const harness = await startArchitectureEditorHarness({ source });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    const menu = page.locator("#contextMenu");
    await page.locator('[data-ref="api"].tree-item').click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "Layout", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Release layout" })).toHaveCount(0);
    await expect(page.locator('[data-action="release-layout"]')).toBeDisabled();

    await page.locator('[data-ref="zone"].tree-item').click();
    await openProperties(page);
    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    const layoutTrigger = menu.getByRole("menuitem", { name: "Layout", exact: true });
    await expect(layoutTrigger).toHaveAttribute("aria-haspopup", "menu");
    await layoutTrigger.hover();
    const submenu = page.getByRole("menu", { name: "Layout for zone" });
    await expect(submenu).toBeVisible();
    await expect(submenu.getByRole("menuitemradio", { name: "grid" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByLabel("Columns")).toBeVisible();
    await submenu.getByRole("menuitemradio", { name: "layered" }).click();

    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].layout).toEqual({
      type: "layered",
      gap: 30,
      rowGap: 24,
      columnGap: 36,
      padding: 40,
    });
    await page.getByLabel("Direction").selectOption("right");
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements[0].layout.direction,
    ).toBe("right");
    await expect(page.getByLabel("Columns")).toHaveCount(0);

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Layout", exact: true }).hover();
    await submenu.getByRole("menuitemradio", { name: "column" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].layout).toEqual({
      type: "column",
      gap: 30,
      rowGap: 24,
      columnGap: 36,
      padding: 40,
    });
    await expect(page.getByLabel("Direction")).toHaveCount(0);

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Layout", exact: true }).hover();
    await submenu.getByRole("menuitemradio", { name: "None" }).click();
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements[0].layout,
    ).toBeUndefined();
    const child = JSON.parse(harness.draftSource).elements[0].children[0];
    expect(child.x).toEqual(expect.any(Number));
    expect(child.y).toEqual(expect.any(Number));

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Layout", exact: true }).hover();
    await submenu.getByRole("menuitemradio", { name: "row" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].layout).toEqual({
      type: "row",
    });
    const managedChild = JSON.parse(harness.draftSource).elements[0].children[0];
    expect(managedChild.x).toBeUndefined();
    expect(managedChild.y).toBeUndefined();
    await expect(page.locator('[data-action="release-layout"]')).toBeEnabled();
  } finally {
    await harness.close();
  }
});

test("group layout submenu supports left/right arrows and Escape returns focus to the target", async ({ page }) => {
  const source = `${JSON.stringify(
    {
      version: 1,
      canvas: { width: 1200, height: 700 },
      elements: [
        {
          type: "group",
          id: "zone",
          x: 100,
          y: 100,
          width: 800,
          height: 400,
          layout: "row",
          children: [{ type: "node", id: "api", text: "API" }],
        },
      ],
    },
    null,
    2,
  )}\n`;
  const harness = await startArchitectureEditorHarness({ source });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    const group = page.locator('[data-ref="zone"].tree-item');
    await group.focus();
    await page.keyboard.press("Shift+F10");
    const trigger = page.getByRole("menuitem", { name: "Layout", exact: true });
    await trigger.focus();
    await page.keyboard.press("ArrowRight");
    const submenu = page.getByRole("menu", { name: "Layout for zone" });
    await expect(submenu).toBeVisible();
    await expect(submenu.getByRole("menuitemradio", { name: "None" })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(submenu.getByRole("menuitemradio", { name: "row" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(submenu).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(page.locator("#contextMenu")).toBeHidden();
    await expect(group).toBeFocused();

    await group.evaluate((element) => {
      element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: window.innerWidth - 2,
          clientY: window.innerHeight - 2,
        }),
      );
    });
    await page.getByRole("menuitem", { name: "Layout", exact: true }).hover();
    const bounds = await submenu.boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  } finally {
    await harness.close();
  }
});

test("keyboard controls the context menu and closing returns focus to the target", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const api = page.locator('[data-ref="api"].tree-item');
    await api.focus();
    await page.keyboard.press("Shift+F10");
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Start connector here" })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.locator('[data-ref="api"].tree-item')).toBeFocused();

    const prevented = await page.locator('input[id^="field-"]').first().evaluate((input) => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  } finally {
    await harness.close();
  }
});

test("Ctrl+S while editing an inspector field commits and saves the change", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-ref="client"].tree-item').click();
    await openProperties(page);
    const text = page.locator('textarea[id^="field-text-"]');
    await text.fill("Updated client");
    await page.keyboard.press("Control+S");

    await expect(page.locator("#status")).toContainText("Saved");
    expect(harness.saves).toHaveLength(1);
    expect(JSON.parse(harness.saves[0]).elements[0].text).toBe("Updated client");
  } finally {
    await harness.close();
  }
});
