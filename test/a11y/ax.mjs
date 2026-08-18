// Chromium のアクセシビリティツリー（CDP: Accessibility.getFullAXTree）を読むヘルパー。
//
// なぜ DOM の属性ではなくアクセシビリティツリーを見るのか:
//   aria-label や role を DOM で確認しても「支援技術に何が届くか」は分からない。
//   実際に起きていた不具合（可視 <text> がアクセシブル名と**二重に**読み上げられる）は、
//   DOM 属性だけを見ていると絶対に検出できない。ブラウザーが計算した後の結果を見る。
//
// 実スクリーンリーダー（NVDA / JAWS / ナレーター）の読み上げそのものは CI で取得できない。
// アクセシビリティツリーは「スクリーンリーダーが読む入力」であって読み上げ結果ではないため、
// ここで固定できるのは **ブラウザーが AT に渡す内容** までである。この限界は README に明記し、
// ロールの妥当性そのもの（例: connector の role="group"）はここでは判断しない。

import { expect } from "@playwright/test";

/**
 * ページ全体のアクセシビリティツリーを取得し、扱いやすい木に組み直す。
 *
 * `ignored`（AT に露出しないノード）は落とすが、その子は親へ引き上げる。
 * 落としたまま子まで捨てると DOM の器（div など）が消えた拍子に中身まで消えて、
 * 「AT から見えていない」という誤検出になる。
 */
export async function accessibilityTree(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));

    const build = (node) => ({
      role: node.role?.value ?? "",
      name: node.name?.value ?? "",
      description: node.description?.value ?? "",
      children: (node.childIds ?? [])
        .map((childId) => byId.get(childId))
        .filter(Boolean)
        .flatMap((child) => (child.ignored ? build(child).children : [build(child)])),
    });

    const roots = nodes.filter((node) => !node.parentId || !byId.has(node.parentId));
    return roots.flatMap((root) => (root.ignored ? build(root).children : [build(root)]));
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** 木を平坦化して `{depth, role, name}` の並びにする（読み上げ順の比較用）。 */
export function flatten(nodes, depth = 0, out = []) {
  for (const node of nodes) {
    out.push({ depth, role: node.role, name: node.name });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

/**
 * アクセシビリティツリーから architecture 図の部分木を取り出す。
 *
 * 図のルートは `<svg role="group" aria-labelledby="{title} {desc}">` なので、
 * 「アクセシブル名が図のタイトルで始まる group」で特定できる。
 */
export function findDiagram(nodes, title) {
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node.role === "group" && node.name.startsWith(title)) return node;
    queue.push(...node.children);
  }
  return null;
}

/**
 * 図の意味構造をページから読み出す。
 *
 * canvas / presenter / 印刷の 3 経路で「同じ意味の出力になっているか」を比べるための正規形。
 * 座標は経路ごとに違って当然（印刷は用紙サイズに合わせて縮む）なので **含めない**。
 * 逆に、ここに含めたものが 1 つでもずれたら出力の等価性が壊れている。
 */
export async function readDiagramSemantics(page, title) {
  return page.evaluate((wantedTitle) => {
    const svg = [...document.querySelectorAll("svg.architecture-svg")].find(
      (candidate) => candidate.querySelector(":scope > title")?.textContent === wantedTitle,
    );
    if (!svg) return null;
    return {
      title: svg.querySelector(":scope > title")?.textContent ?? null,
      description: svg.querySelector(":scope > desc")?.textContent ?? null,
      role: svg.getAttribute("role"),
      viewBox: svg.getAttribute("viewBox"),
      elements: [...svg.querySelectorAll("[data-architecture-order]")]
        .map((element) => ({
          order: Number(element.getAttribute("data-architecture-order")),
          type: element.getAttribute("data-architecture-type"),
          id:
            element.getAttribute("data-architecture-id") ??
            element.getAttribute("data-architecture-connector"),
          role: element.getAttribute("role"),
          label: element.getAttribute("aria-label"),
          title: element.querySelector(":scope > title")?.textContent ?? null,
        }))
        .sort((left, right) => left.order - right.order),
    };
  }, title);
}

/** 図の DOM 順（= 描画順 = 支援技術の読み上げ順）に並んだ要素 id。 */
export async function domOrder(page, title) {
  const order = await page.evaluate((wantedTitle) => {
    const svg = [...document.querySelectorAll("svg.architecture-svg")].find(
      (candidate) => candidate.querySelector(":scope > title")?.textContent === wantedTitle,
    );
    if (!svg) return null;
    return [...svg.querySelectorAll("[data-architecture-order]")].map(
      (element) =>
        element.getAttribute("data-architecture-id") ??
        element.getAttribute("data-architecture-connector"),
    );
  }, title);
  expect(order, `diagram "${title}" was not rendered`).not.toBeNull();
  return order;
}
