// Helper for reading Chromium's accessibility tree (CDP: Accessibility.getFullAXTree).
//
// Why inspect the accessibility tree rather than DOM attributes:
//   Checking aria-label or role in the DOM does not reveal what reaches assistive technology.
//   A real bug where visible <text> was announced **twice** with the accessible name could not be
//   detected from DOM attributes alone. Inspect the browser's computed result.
//
// CI cannot capture actual output from screen readers (NVDA / JAWS / Narrator). The accessibility
// tree is input to a screen reader, not its spoken result, so these tests only guarantee **what the
// browser passes to AT**. README documents this limitation; role suitability itself (for example,
// role="group" on a connector) is not evaluated here.

import { expect } from "@playwright/test";

/**
 * Retrieve the full-page accessibility tree and rebuild it into a convenient structure.
 *
 * Remove `ignored` nodes (not exposed to AT), but promote their children to the parent. Discarding
 * children as well would make content disappear with a DOM container such as a div and falsely
 * report that it is invisible to AT.
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

/** Flatten a tree into `{depth, role, name}` entries for comparing announcement order. */
export function flatten(nodes, depth = 0, out = []) {
  for (const node of nodes) {
    out.push({ depth, role: node.role, name: node.name });
    flatten(node.children, depth + 1, out);
  }
  return out;
}

/**
 * Extract an Architecture diagram subtree from the accessibility tree.
 *
 * The diagram root is `<svg role="group" aria-labelledby="{title} {desc}">`, so identify it as a
 * group whose accessible name starts with the diagram title.
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
 * Read a diagram's semantic structure from the page.
 *
 * This canonical form compares whether canvas, presenter, and print paths produce equivalent
 * semantics. Coordinates naturally differ by path (print scales to paper), so they are **excluded**.
 * Any difference among included properties breaks output equivalence.
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

/** Element IDs in diagram DOM order (= paint order = assistive-technology announcement order). */
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
