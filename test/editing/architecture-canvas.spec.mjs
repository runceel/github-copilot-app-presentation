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

async function openEditor(page) {
  const harness = await startArchitectureEditorHarness({ source: SOURCE });
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

test("変更は draft に留まり、保存ボタンで初めて Markdown へ反映される", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await expect(page.locator('[data-action="save"]')).toBeDisabled();
    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(4);
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    expect(harness.saves).toHaveLength(0);
    expect(harness.markdown).not.toContain('"id": "node"');

    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("保存しました");
    expect(harness.saves).toHaveLength(1);
    expect(harness.markdown).toContain('"id": "node"');
    await expect(page.locator('[data-action="save"]')).toBeDisabled();
  } finally {
    await harness.close();
  }
});

test("選択、キーボード移動、リサイズ、Undo/Redo を同じ draft で扱う", async ({ page }) => {
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

test("大きい図を横スクロールとパンで端まで移動し、全体表示では中央へ収める", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  const harness = await openEditor(page);
  try {
    const viewport = page.locator("#viewport");
    const surface = page.locator("#canvasSurface");
    const diagram = page.locator(".architecture-diagram");
    await expect(page.locator("#status")).toContainText("図を選択して編集できます");
    await page.locator('[data-action="zoom-in"]').click();
    await page.locator('[data-action="zoom-in"]').click();
    await page.locator('[data-action="zoom-in"]').click();
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
    });
    const bounds = await viewport.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(bounds.x + bounds.width / 2 - 140, bounds.y + bounds.height / 2);
    await page.mouse.up({ button: "middle" });
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    await page.locator('[data-action="zoom-fit"]').click();
    const fitted = await viewport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
    }));
    expect(fitted.scrollWidth - fitted.clientWidth).toBeLessThanOrEqual(1);
    expect(fitted.scrollLeft).toBe(0);

    await page.locator('[data-action="zoom-out"]').click();
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

test("コネクター追加と node 削除で参照整合性を保つ", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-action="add-connector"]').click();
    await page.locator('[data-editor-ref="api"]').click();
    await page.locator('[data-editor-ref="client"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(4);

    await page.locator('[data-ref="api"].tree-item').click();
    await page.locator('[data-action="delete"]').click();
    await expect(page.locator('[data-ref="api"].tree-item')).toHaveCount(0);
    await expect(page.locator(".tree-item")).toHaveCount(1);
  } finally {
    await harness.close();
  }
});

test("外部変更との競合は Markdown を上書きせず画面に残す", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-action="add-node"]').click();
    harness.setConflict();
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("changed outside");
    await expect(page.locator("#status")).toHaveAttribute("data-kind", "error");
    expect(harness.saves).toHaveLength(0);
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
  } finally {
    await harness.close();
  }
});

test("未保存 draft を再読み込みした後も revision を継続して編集できる", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(4);
    await page.reload({ waitUntil: "load" });
    await expect(page.locator(".tree-item")).toHaveCount(4);

    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(5);
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("保存しました");
    expect(JSON.parse(harness.saves[0]).elements).toHaveLength(5);
  } finally {
    await harness.close();
  }
});

test("元 Markdown の reload は古い generation の draft を引き継がない", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(1);

    harness.reloadSource(SOURCE.replace('"text": "Client"', '"text": "Reloaded client"'));
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(0);
    await expect(page.locator('[data-ref="client"].tree-item')).toContainText("Reloaded client");

    await page.locator('[data-action="add-node"]').click();
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("保存しました");
    expect(harness.markdown).toContain("Reloaded client");
    expect(harness.markdown).toContain('"id": "node"');
  } finally {
    await harness.close();
  }
});

test("遅れて届いた古い state 応答で reload 後の generation を巻き戻さない", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    harness.delayNextState(300);
    await page.locator('[data-action="add-node"]').click();
    harness.reloadSource(SOURCE.replace('"text": "Client"', '"text": "Reloaded client"'));

    await expect(page.locator('[data-ref="client"].tree-item')).toContainText("Reloaded client");
    await page.waitForTimeout(400);
    await expect(page.locator('[data-ref="client"].tree-item')).toContainText("Reloaded client");
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(0);

    await page.locator('[data-action="add-node"]').click();
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("保存しました");
    expect(harness.markdown).toContain("Reloaded client");
  } finally {
    await harness.close();
  }
});

test("保存中の追加編集を保存済みにせず dirty のまま保持する", async ({ page }) => {
  const harness = await startArchitectureEditorHarness({
    source: SOURCE,
    saveDelay: 300,
  });
  try {
    await page.goto(harness.url, { waitUntil: "load" });
    await expect(page.locator(".tree-item")).toHaveCount(3);
    await page.locator('[data-action="add-node"]').click();
    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("保存中");

    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(5);
    await expect(page.locator("#status")).toContainText("未保存");
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    expect(JSON.parse(harness.saves[0]).elements).toHaveLength(4);

    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("保存しました");
    expect(JSON.parse(harness.saves[1]).elements).toHaveLength(5);
  } finally {
    await harness.close();
  }
});

test("保存サーバーへの通信失敗を画面に表示する", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
    await page.route("**/save", (route) => route.abort("connectionfailed"));

    await page.locator('[data-action="save"]').click();
    await expect(page.locator("#status")).toContainText("接続できませんでした");
    await expect(page.locator('[data-action="save"]')).toBeEnabled();
  } finally {
    await harness.close();
  }
});

test("作図面と要素ツリーの右クリックから対象別の編集操作を実行できる", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    await page.locator('[data-editor-ref="client"]').click({ button: "right" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-label", /client/);
    await menu.getByRole("menuitem", { name: "ここからコネクター" }).click();
    await expect(page.locator(".connector-source")).toHaveCount(1);
    await page.locator('[data-editor-ref="api"]').click();
    await expect(page.locator(".tree-item")).toHaveCount(4);

    await page.locator('[data-ref="api"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "複製" }).click();
    await expect(page.locator('[data-ref="api-copy"].tree-item')).toHaveCount(1);

    await page.locator('[data-ref="api-copy"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "削除" }).click();
    await expect(page.locator('[data-ref="api-copy"].tree-item')).toHaveCount(0);
  } finally {
    await harness.close();
  }
});

test("余白の右クリック位置へ追加し、group 内では親相対座標へ変換する", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    const groupPoint = await screenPoint(page, 1200, 650);
    await page.mouse.click(groupPoint.x, groupPoint.y, { button: "right" });
    await menu.getByRole("menuitem", { name: "グループをここに追加" }).click();
    await expect(page.locator('[data-ref="group"].tree-item')).toHaveCount(1);
    await expect.poll(() => JSON.parse(harness.draftSource).elements.find(
      (element) => element.id === "group",
    )).toMatchObject({ x: 940, y: 490, width: 520, height: 320 });

    const childPoint = await screenPoint(page, 1100, 600);
    await page.mouse.click(childPoint.x, childPoint.y, { button: "right" });
    await expect(menu.getByRole("menuitem", { name: "子ノードをここに追加" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "子ノードをここに追加" }).click();
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

test("右クリックメニューから並び順、connector 複製、Undo、保存を操作できる", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    await page.locator('[data-ref="client"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "前面へ" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[1].id).toBe("client");
    await page.locator('[data-ref="client"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "背面へ" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].id).toBe("client");

    await page.locator(".tree-item").filter({ hasText: "client → api" }).click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "ここからコネクター" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "複製" }).click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(2);

    const panel = page.locator(".element-panel");
    await panel.click({ button: "right", position: { x: 40, y: 400 } });
    await menu.getByRole("menuitem", { name: "元に戻す" }).click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(1);
    await panel.click({ button: "right", position: { x: 40, y: 400 } });
    await menu.getByRole("menuitem", { name: "やり直す" }).click();
    await expect(page.locator('[data-architecture-type="connector"]')).toHaveCount(2);

    await panel.click({ button: "right", position: { x: 40, y: 400 } });
    await menu.getByRole("menuitem", { name: "Markdown に保存" }).click();
    await expect(page.locator("#status")).toContainText("保存しました");
    expect(harness.saves).toHaveLength(1);
  } finally {
    await harness.close();
  }
});

test("要素ツリーの余白では既定位置への追加操作を表示する", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const menu = page.locator("#contextMenu");
    await page.locator(".element-panel").click({
      button: "right",
      position: { x: 40, y: 400 },
    });
    await expect(menu.getByRole("menuitem", { name: "ノードを追加", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "元に戻す" })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: "Markdown に保存" })).toBeDisabled();

    await menu.getByRole("menuitem", { name: "ノードを追加", exact: true }).click();
    await expect(page.locator('[data-ref="node"].tree-item')).toHaveCount(1);
    await expect.poll(() => JSON.parse(harness.draftSource).elements.find(
      (element) => element.id === "node",
    )).toMatchObject({ x: 140, y: 140 });
  } finally {
    await harness.close();
  }
});

test("レイアウト操作は group の右クリックサブメニューだけに表示する", async ({ page }) => {
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
    await expect(menu.getByRole("menuitem", { name: "レイアウト", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "レイアウト解除" })).toHaveCount(0);
    await expect(page.locator('[data-action="release-layout"]')).toBeDisabled();

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    const layoutTrigger = menu.getByRole("menuitem", { name: "レイアウト", exact: true });
    await expect(layoutTrigger).toHaveAttribute("aria-haspopup", "menu");
    await layoutTrigger.hover();
    const submenu = page.getByRole("menu", { name: "zone のレイアウト" });
    await expect(submenu).toBeVisible();
    await expect(submenu.getByRole("menuitemradio", { name: "grid" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByLabel("列数")).toBeVisible();
    await submenu.getByRole("menuitemradio", { name: "layered" }).click();

    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].layout).toEqual({
      type: "layered",
      gap: 30,
      rowGap: 24,
      columnGap: 36,
      padding: 40,
    });
    await page.getByLabel("方向").selectOption("right");
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements[0].layout.direction,
    ).toBe("right");
    await expect(page.getByLabel("列数")).toHaveCount(0);

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "レイアウト", exact: true }).hover();
    await submenu.getByRole("menuitemradio", { name: "column" }).click();
    await expect.poll(() => JSON.parse(harness.draftSource).elements[0].layout).toEqual({
      type: "column",
      gap: 30,
      rowGap: 24,
      columnGap: 36,
      padding: 40,
    });
    await expect(page.getByLabel("方向")).toHaveCount(0);

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "レイアウト", exact: true }).hover();
    await submenu.getByRole("menuitemradio", { name: "なし" }).click();
    await expect.poll(
      () => JSON.parse(harness.draftSource).elements[0].layout,
    ).toBeUndefined();
    const child = JSON.parse(harness.draftSource).elements[0].children[0];
    expect(child.x).toEqual(expect.any(Number));
    expect(child.y).toEqual(expect.any(Number));

    await page.locator('[data-ref="zone"].tree-item').click({ button: "right" });
    await menu.getByRole("menuitem", { name: "レイアウト", exact: true }).hover();
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

test("group のレイアウトサブメニューを左右矢印で往復し Escape で対象へ戻る", async ({ page }) => {
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
    const trigger = page.getByRole("menuitem", { name: "レイアウト", exact: true });
    await trigger.focus();
    await page.keyboard.press("ArrowRight");
    const submenu = page.getByRole("menu", { name: "zone のレイアウト" });
    await expect(submenu).toBeVisible();
    await expect(submenu.getByRole("menuitemradio", { name: "なし" })).toBeFocused();

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
    await page.getByRole("menuitem", { name: "レイアウト", exact: true }).hover();
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

test("コンテキストメニューをキーボード操作し、閉じたら対象へフォーカスを戻す", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    const api = page.locator('[data-ref="api"].tree-item');
    await api.focus();
    await page.keyboard.press("Shift+F10");
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "ここからコネクター" })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "複製" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "削除" })).toBeFocused();
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

test("インスペクター入力中の Ctrl+S は変更を確定して保存する", async ({ page }) => {
  const harness = await openEditor(page);
  try {
    await page.locator('[data-ref="client"].tree-item').click();
    const text = page.locator('textarea[id^="field-text-"]');
    await text.fill("Updated client");
    await page.keyboard.press("Control+S");

    await expect(page.locator("#status")).toContainText("保存しました");
    expect(harness.saves).toHaveLength(1);
    expect(JSON.parse(harness.saves[0]).elements[0].text).toBe("Updated client");
  } finally {
    await harness.close();
  }
});
