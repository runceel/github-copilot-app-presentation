import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ArchitectureError,
  ICONS,
  LAYOUT_DIRECTIONS,
  MAX_ELEMENTS,
  MAX_ROUTING_GRID_COORDINATES,
  MAX_SOURCE_LENGTH,
  ROUTE_FALLBACK_REASONS,
  architectureSemanticSnapshot,
  computeConnectorRoute,
  parseArchitecture,
  renderArchitectureBlock,
  renderArchitectureDiagram,
} from "../renderer/architecture.mjs";

const validDiagram = {
  title: "Safe architecture",
  canvas: { width: 1600, height: 900 },
  elements: [
    {
      type: "group",
      id: "cloud",
      x: 400,
      y: 100,
      width: 1000,
      height: 700,
      title: "Cloud",
      children: [
        {
          type: "node",
          id: "api",
          shape: "rounded-rect",
          x: 100,
          y: 150,
          width: 300,
          height: 140,
          text: "API",
          style: { fill: "surface", stroke: "accent" },
        },
        {
          type: "node",
          id: "db",
          shape: "ellipse",
          x: 600,
          y: 430,
          width: 280,
          height: 150,
          text: "Database",
        },
      ],
    },
    {
      type: "connector",
      from: "api",
      to: "db",
      routing: "orthogonal",
      label: "SQL",
      arrow: true,
      z: -10,
    },
  ],
};

class FakeElement {
  constructor(tagName, namespace = "") {
    this.tagName = tagName;
    this.namespaceURI = namespace;
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this._textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  get textContent() {
    return `${this._textContent}${this.children.map((child) => child.textContent).join("")}`;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createElementNS(namespace, tagName) {
    return new FakeElement(tagName, namespace);
  }
}

function descendants(root) {
  return [root, ...root.children.flatMap(descendants)];
}

function routeIntersectsNode(points, node, margin = 18) {
  const left = node.x - margin;
  const right = node.x + node.width + margin;
  const top = node.y - margin;
  const bottom = node.y + node.height + margin;
  return points.slice(1).some((end, index) => {
    const start = points[index];
    if (start.x === end.x) {
      return start.x >= left && start.x <= right &&
        Math.max(start.y, end.y) >= top && Math.min(start.y, end.y) <= bottom;
    }
    if (start.y === end.y) {
      return start.y >= top && start.y <= bottom &&
        Math.max(start.x, end.x) >= left && Math.min(start.x, end.x) <= right;
    }
    return false;
  });
}

function countRouteCrossings(first, second) {
  const firstSegments = first.slice(1).map((end, index) => [first[index], end]);
  const secondSegments = second.slice(1).map((end, index) => [second[index], end]);
  const cross = (origin, firstPoint, secondPoint) =>
    (firstPoint.x - origin.x) * (secondPoint.y - origin.y) -
    (firstPoint.y - origin.y) * (secondPoint.x - origin.x);
  let crossings = 0;
  for (const [firstStart, firstEnd] of firstSegments) {
    for (const [secondStart, secondEnd] of secondSegments) {
      const firstSideA = cross(firstStart, firstEnd, secondStart);
      const firstSideB = cross(firstStart, firstEnd, secondEnd);
      const secondSideA = cross(secondStart, secondEnd, firstStart);
      const secondSideB = cross(secondStart, secondEnd, firstEnd);
      if (firstSideA * firstSideB < -0.001 && secondSideA * secondSideB < -0.001) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function routesInteract(first, second) {
  const firstSegments = first.slice(1).map((end, index) => [first[index], end]);
  const secondSegments = second.slice(1).map((end, index) => [second[index], end]);
  return firstSegments.some(([firstStart, firstEnd]) =>
    secondSegments.some(([secondStart, secondEnd]) => {
      const cross = (origin, firstPoint, secondPoint) =>
        (firstPoint.x - origin.x) * (secondPoint.y - origin.y) -
        (firstPoint.y - origin.y) * (secondPoint.x - origin.x);
      const firstSideA = cross(firstStart, firstEnd, secondStart);
      const firstSideB = cross(firstStart, firstEnd, secondEnd);
      const secondSideA = cross(secondStart, secondEnd, firstStart);
      const secondSideB = cross(secondStart, secondEnd, firstEnd);
      return firstSideA * firstSideB < -0.001 && secondSideA * secondSideB < -0.001;
    }),
  );
}

test("parses nested groups, theme tokens, connectors, and stable z-order", () => {
  const model = parseArchitecture(JSON.stringify(validDiagram));
  assert.deepEqual(model.canvas, { width: 1600, height: 900 });
  const api = model.elements.find((element) => element.id === "api");
  assert.deepEqual({ x: api.x, y: api.y }, { x: 500, y: 250 });
  assert.equal(api.style.fill, "var(--surface)");
  assert.equal(api.style.stroke, "var(--accent)");
  assert.equal(model.elements[0].type, "group");
  assert.equal(model.elements[1].type, "connector");
  assert.deepEqual(
    model.elements.filter((element) => element.type !== "connector").map((element) => element.id),
    ["cloud", "api", "db"],
  );
});

test("rejects malformed JSON, unknown references, unsafe colors, and unsupported fields", () => {
  assert.throws(() => parseArchitecture("{"), ArchitectureError);
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            { type: "node", id: "a", x: 0, y: 0, width: 100, height: 100 },
            { type: "connector", from: "a", to: "missing" },
          ],
        }),
      ),
    /unknown element 'missing'/,
  );
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            {
              type: "node",
              id: "a",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              style: { fill: "url(https://example.test/evil.svg)" },
            },
          ],
        }),
      ),
    /theme token/,
  );
  for (const inheritedName of ["constructor", "toString", "__proto__"]) {
    assert.throws(
      () =>
        parseArchitecture(
          JSON.stringify({
            elements: [
              {
                type: "node",
                id: "a",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                style: { fill: inheritedName },
              },
            ],
          }),
        ),
      ArchitectureError,
    );
    assert.throws(
      () => parseArchitecture(JSON.stringify({ elements: [{ type: inheritedName }] })),
      ArchitectureError,
    );
  }
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            {
              type: "node",
              id: "a",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              onclick: "alert(1)",
            },
          ],
        }),
      ),
    /onclick: is not supported/,
  );
});

test("builds only allowlisted SVG DOM and keeps DSL text inert", () => {
  const malicious = structuredClone(validDiagram);
  malicious.elements[0].children[0].text = "<script>alert('x')</script>";
  const documentRef = new FakeDocument();
  const wrapper = renderArchitectureDiagram(
    parseArchitecture(JSON.stringify(malicious)),
    documentRef,
  );
  const nodes = descendants(wrapper);
  const tags = new Set(nodes.map((node) => node.tagName));
  assert.equal(wrapper.className, "architecture-diagram");
  assert.equal(tags.has("script"), false);
  assert.deepEqual(
    [...tags].sort(),
    ["defs", "desc", "div", "ellipse", "g", "marker", "path", "rect", "svg", "text", "title", "tspan"].sort(),
  );
  assert.match(wrapper.textContent, /<script>alert\('x'\)<\/script>/);
  for (const node of nodes) {
    for (const name of node.attributes.keys()) {
      assert.doesNotMatch(name, /^on/i);
      assert.notEqual(name, "href");
    }
  }
  const svg = nodes.find((node) => node.tagName === "svg");
  assert.equal(svg.attributes.get("viewBox"), "0 0 1600 900");
  assert.equal(svg.attributes.get("preserveAspectRatio"), "xMidYMid meet");
  assert.equal(svg.attributes.get("role"), "group");
  assert.match(svg.attributes.get("aria-labelledby"), /^architecture-title-/);
  assert.equal(nodes.find((node) => node.tagName === "desc").textContent, validDiagram.description ?? "Architecture diagram rendered from a constrained JSON DSL.");
});

test("renders an explicit in-place error without throwing", () => {
  const wrapper = renderArchitectureBlock('{"elements":[{"type":"wat"}]}', new FakeDocument());
  assert.equal(wrapper.className, "architecture-error");
  assert.equal(wrapper.attributes.get("role"), "alert");
  assert.match(wrapper.textContent, /Architecture diagram error/);
  assert.match(wrapper.textContent, /must be node, group, or connector/);
});

test("the mixed Mermaid and architecture fixture contains a renderable DSL block", async () => {
  const markdown = await readFile(
    new URL("./fixtures/architecture.md", import.meta.url),
    "utf8",
  );
  assert.match(markdown, /```mermaid[\s\S]*?```/);
  const architecture = markdown.match(/```architecture\s*([\s\S]*?)```/);
  assert.ok(architecture, "architecture fixture block is missing");
  const model = parseArchitecture(architecture[1].trim());
  assert.equal(model.version, 1);
  assert.equal(model.elements.filter((element) => element.type === "group").length, 3);
  assert.equal(model.elements.filter((element) => element.type === "node").length, 10);
  assert.equal(model.elements.filter((element) => element.type === "connector").length, 11);
  assert.equal(model.elements.filter((element) => element.icon).length, 10);
  const lookup = new Map(
    model.elements.filter((element) => element.type !== "connector").map((element) => [element.id, element]),
  );
  const catalogToCache = model.elements.find(
    (element) => element.type === "connector" && element.from === "catalog" && element.to === "cache",
  );
  const route = computeConnectorRoute(catalogToCache, lookup, model.canvas);
  assert.equal(
    routeIntersectsNode(route, lookup.get("queue")),
    false,
    "mixed-port route should detour around the Event queue node",
  );
  const orderConnectors = model.elements.filter(
    (element) =>
      element.type === "connector" &&
      element.from === "orders" &&
      ["queue", "sql"].includes(element.to),
  );
  const orderRoutes = orderConnectors.map((connector) =>
    computeConnectorRoute(connector, lookup, model.canvas),
  );
  assert.notEqual(orderConnectors[0].lane, orderConnectors[1].lane);
  assert.notEqual(
    orderRoutes[0][0].y,
    orderRoutes[1][0].y,
    "connectors sharing a source port should leave on distinct lanes",
  );
  const plannedConnectors = architectureSemanticSnapshot(model).elements.filter(
    (element) => element.type === "connector",
  );
  const plannedRoute = (from, to) =>
    plannedConnectors.find(
      (element) => element.from === from && element.to === to,
    ).points;
  assert.equal(
    routesInteract(plannedRoute("orders", "queue"), plannedRoute("orders", "sql")),
    false,
    "the direct Order service to Event queue edge should remain visually distinct",
  );
  assert.equal(
    routesInteract(plannedRoute("orders", "queue"), plannedRoute("catalog", "cache")),
    false,
    "unrelated routed edges should not cross the direct Order service to Event queue edge",
  );
  const transaction = plannedRoute("orders", "sql");
  assert.equal(transaction[0].y, transaction[1].y);
  assert.ok(transaction[1].x > transaction[0].x);
  assert.equal(transaction.at(-2).y, transaction.at(-1).y);
  assert.ok(transaction.at(-1).x > transaction.at(-2).x);
});

test("row, column, and grid layouts place and size children inside their groups", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      elements: [
        {
          type: "group",
          id: "row",
          x: 0,
          y: 0,
          width: 900,
          height: 280,
          layout: "row",
          children: [
            { type: "node", id: "r1", text: "one" },
            { type: "node", id: "r2", text: "two" },
            { type: "node", id: "r3", text: "three" },
          ],
        },
        {
          type: "group",
          id: "column",
          x: 0,
          y: 300,
          width: 360,
          height: 600,
          layout: "column",
          children: [
            { type: "node", id: "c1" },
            { type: "node", id: "c2" },
          ],
        },
        {
          type: "group",
          id: "grid",
          x: 400,
          y: 300,
          width: 900,
          height: 600,
          layout: { type: "grid", columns: 2, gap: 30, padding: 40 },
          children: [
            { type: "node", id: "g1" },
            { type: "node", id: "g2" },
            { type: "node", id: "g3" },
            { type: "node", id: "g4" },
          ],
        },
      ],
    }),
  );
  const byId = new Map(model.elements.filter((element) => element.id).map((element) => [element.id, element]));
  assert.ok(byId.get("r1").x < byId.get("r2").x && byId.get("r2").x < byId.get("r3").x);
  assert.equal(byId.get("r1").y, byId.get("r2").y);
  assert.ok(byId.get("c1").y < byId.get("c2").y);
  assert.equal(byId.get("c1").x, byId.get("c2").x);
  assert.equal(byId.get("g1").y, byId.get("g2").y);
  assert.equal(byId.get("g1").x, byId.get("g3").x);
  for (const id of ["r1", "r2", "r3"]) {
    const node = byId.get(id);
    assert.ok(node.x >= byId.get("row").x && node.x + node.width <= byId.get("row").x + byId.get("row").width);
  }
});

test("cardinal ports, lane allocation, and obstacle-aware orthogonal routing are stable", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 1400, height: 800 },
      elements: [
        { type: "node", id: "left", x: 100, y: 300, width: 200, height: 100 },
        { type: "node", id: "blocker", x: 600, y: 250, width: 200, height: 200 },
        { type: "node", id: "right", x: 1100, y: 300, width: 200, height: 100 },
        {
          type: "connector",
          from: "left",
          to: "right",
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
        },
        {
          type: "connector",
          from: "left",
          to: "right",
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
        },
        {
          type: "connector",
          from: "right",
          to: "left",
          fromPort: "left",
          toPort: "right",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const lookup = new Map(
    model.elements.filter((element) => element.type !== "connector").map((element) => [element.id, element]),
  );
  const connectors = model.elements.filter((element) => element.type === "connector");
  assert.deepEqual(connectors.map((connector) => connector.lane), [-1, 0, 1]);
  const first = computeConnectorRoute(connectors[0], lookup, model.canvas);
  const second = computeConnectorRoute(connectors[1], lookup, model.canvas);
  const reverse = computeConnectorRoute(connectors[2], lookup, model.canvas);
  assert.equal(first[0].x, 314);
  assert.equal(first.at(-1).x, 1086);
  assert.notEqual(first[0].y, second[0].y);
  assert.notEqual(second[0].y, reverse.at(-1).y);
  assert.ok(
    first.some((point) => point.y < 232 || point.y > 468),
    "route should detour around the expanded blocker bounds",
  );
});

test("orthogonal routing avoids occupied diagonal connectors", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 900, height: 700 },
      elements: [
        { type: "node", id: "a", x: 20, y: 100, width: 180, height: 100 },
        { type: "node", id: "b", x: 700, y: 500, width: 180, height: 100 },
        { type: "node", id: "c", x: 350, y: 0, width: 100, height: 80 },
        { type: "node", id: "d", x: 350, y: 620, width: 100, height: 80 },
        {
          type: "connector",
          from: "a",
          to: "b",
          fromPort: "right",
          toPort: "left",
          routing: "straight",
        },
        {
          type: "connector",
          from: "c",
          to: "d",
          fromPort: "bottom",
          toPort: "top",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const lookup = new Map(
    model.elements.filter((element) => element.type !== "connector").map((element) => [element.id, element]),
  );
  const [straight, orthogonal] = model.elements.filter(
    (element) => element.type === "connector",
  );
  const straightRoute = computeConnectorRoute(straight, lookup, model.canvas);
  const orthogonalRoute = computeConnectorRoute(
    orthogonal,
    lookup,
    model.canvas,
    [straightRoute],
  );
  assert.equal(routesInteract(straightRoute, orthogonalRoute), false);
});

test("mixed-port orthogonal routes preserve source and target directions", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 900, height: 700 },
      elements: [
        { type: "node", id: "source", x: 80, y: 280, width: 140, height: 100 },
        { type: "node", id: "target", x: 680, y: 500, width: 140, height: 100 },
        { type: "node", id: "blocker", x: 320, y: 340, width: 120, height: 120 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "right",
          toPort: "top",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const lookup = new Map(
    model.elements.filter((element) => element.type !== "connector").map((element) => [element.id, element]),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const route = computeConnectorRoute(connector, lookup, model.canvas);
  assert.equal(route[0].y, route[1].y);
  assert.ok(route[1].x > route[0].x);
  assert.equal(route.at(-2).x, route.at(-1).x);
  assert.ok(route.at(-1).y > route.at(-2).y);
  assert.equal(routeIntersectsNode(route, lookup.get("blocker")), false);
  assert.ok(
    route.slice(1).every(
      (point, index) =>
        point.x === route[index].x || point.y === route[index].y,
    ),
  );
});

test("renders only built-in primitive icons and exposes semantic accessibility labels", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      title: "Icon sample",
      description: "Five safe built-in icons.",
      elements: ["cloud", "database", "api", "user", "server"].map((icon, index) => ({
        type: "node",
        id: `node${index}`,
        x: index * 220,
        y: 100,
        width: 190,
        height: 130,
        text: icon,
        icon,
        style: index === 0 ? { fontSize: 8 } : undefined,
      })),
    }),
  );
  const wrapper = renderArchitectureDiagram(model, new FakeDocument());
  const nodes = descendants(wrapper);
  const renderedIcons = nodes
    .filter((node) => node.attributes.has("data-architecture-icon"))
    .map((node) => node.attributes.get("data-architecture-icon"));
  assert.deepEqual(renderedIcons, ["cloud", "database", "api", "user", "server"]);
  assert.ok(nodes.some((node) => node.tagName === "circle"));
  const semanticNodes = nodes.filter(
    (node) => node.attributes.get("data-architecture-type") === "node",
  );
  assert.equal(semanticNodes.length, 5);
  assert.ok(semanticNodes.every((node) => node.attributes.get("role") === "img"));
  assert.ok(semanticNodes.every((node) => node.attributes.get("aria-label").includes("icon")));
  const firstVisualText = nodes.find(
    (node) => node.tagName === "text" && node.children.some((child) => child.tagName === "tspan"),
  );
  assert.ok(Number(firstVisualText.attributes.get("x")) > 95, "icon text should use the reserved right-hand region");
  assert.equal(firstVisualText.attributes.get("font-size"), "8");
});

test("built-in icons inherit the theme text colour instead of hard-coding one", () => {
  // 組み込みアイコンは stroke にテーマトークンをそのまま流し込むので、
  // 4 テーマのどれで表示されても CSS 変数経由で配色が追従する。
  const build = (style) =>
    parseArchitecture(
      JSON.stringify({
        elements: [...ICONS].map((icon, index) => ({
          type: "node",
          id: `n${index}`,
          x: index * 130,
          y: 0,
          width: 120,
          height: 120,
          icon,
          style,
        })),
      }),
    );

  for (const [style, expected] of [
    [undefined, "var(--fg)"],
    [{ textColor: "accent" }, "var(--accent)"],
    [{ textColor: "#ff00aa" }, "#ff00aa"],
  ]) {
    const nodes = descendants(renderArchitectureDiagram(build(style), new FakeDocument()));
    const groups = nodes.filter(
      (node) => node.attributes.get("data-architecture-icon-source") === "builtin",
    );
    assert.equal(groups.length, ICONS.size, "every built-in icon should render");
    const strokes = new Set();
    const fills = new Set();
    for (const group of groups) {
      strokes.add(group.attributes.get("stroke"));
      fills.add(group.attributes.get("fill"));
      for (const shape of group.children) {
        // 子に stroke を焼き込むとテーマ追従が壊れるので、継承のみを許す。
        assert.equal(shape.attributes.has("stroke"), false);
        if (shape.attributes.has("fill")) fills.add(shape.attributes.get("fill"));
      }
    }
    assert.deepEqual([...strokes], [expected], "icon strokes must come from the node text colour");
    // 塗りは「線画のための none」か「テキスト色と同じ」しか許さない。
    // 固定色を焼き込むとテーマ追従が壊れる。
    assert.deepEqual([...fills].sort(), ["none", expected].sort());
  }
});

test("every theme keeps built-in icon strokes legible against the slide surface", async () => {
  // 組み込みアイコンは --fg で描かれるので、4 テーマそれぞれで
  // --fg と背景（--surface / --bg）のコントラストが確保されている必要がある。
  const css = await readFile(new URL("../renderer/slides.css", import.meta.url), "utf8");
  const channel = (value) => {
    const ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  const themes = ["dark", "light", "microsoft", "ms-modern"];
  for (const theme of themes) {
    const block = css.match(
      new RegExp(`\\.deck\\[data-theme="${theme}"\\]\\{([^}]*)\\}`),
    );
    assert.ok(block, `slides.css must define the ${theme} theme`);
    const read = (name) => {
      const found = block[1].match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
      assert.ok(found, `${theme} must define --${name} as a 6-digit hex colour`);
      return found[1];
    };
    const fg = read("fg");
    for (const background of ["surface", "bg"]) {
      const ratio = contrast(fg, read(background));
      // WCAG 2.1 SC 1.4.11 (non-text contrast) の 3:1。アイコンは線画なのでこの基準。
      assert.ok(
        ratio >= 3,
        `${theme}: --fg on --${background} is ${ratio.toFixed(2)}:1, below the 3:1 minimum`,
      );
    }
  }
});

test("user-supplied icons render as a sandboxed same-origin image reference", () => {
  const assets = [
    "assets/sample.svg",
    "assets/kazuki-san-post.png",
    "assets/profile.jpg",
    "assets/icons/brand/logo.webp",
    "assets/Logo.PNG",
  ];
  const model = parseArchitecture(
    JSON.stringify({
      elements: [
        ...assets.map((icon, index) => ({
          type: "node",
          id: `a${index}`,
          x: index * 150,
          y: 0,
          width: 140,
          height: 140,
          icon,
        })),
        { type: "node", id: "builtin", x: 0, y: 300, width: 140, height: 140, icon: "cloud" },
      ],
    }),
  );
  const nodes = descendants(renderArchitectureDiagram(model, new FakeDocument()));

  const assetGroups = nodes.filter(
    (node) => node.attributes.get("data-architecture-icon-source") === "asset",
  );
  assert.deepEqual(
    assetGroups.map((node) => node.attributes.get("data-architecture-icon")),
    assets,
  );

  const images = nodes.filter((node) => node.tagName === "image");
  assert.equal(images.length, assets.length);
  assert.deepEqual(
    images.map((node) => node.attributes.get("href")),
    assets.map((icon) => `/${icon}`),
  );

  // href はループバックサーバー配下の /assets/ 以外に現れてはならない。
  // 外部 URL や data: URI が混ざっていないことの最終防衛線。
  for (const node of nodes) {
    for (const [name, value] of node.attributes) {
      assert.doesNotMatch(name, /^on/i);
      assert.notEqual(name, "xlink:href");
      if (name === "href") {
        assert.equal(node.tagName, "image");
        assert.match(value, /^\/assets\//);
        assert.doesNotMatch(value, /^[a-z][a-z0-9+.-]*:/i);
        assert.doesNotMatch(value, /\.\./);
      }
    }
  }

  // アセットのパスはアクセシブル名に漏らさない。読み上げても意味を成さないため。
  const labels = nodes
    .filter((node) => node.attributes.get("data-architecture-type") === "node")
    .map((node) => node.attributes.get("aria-label"));
  assert.deepEqual(labels, [...assets.map((_, index) => `a${index}`), "cloud icon, builtin"]);
});

test("rejects icon references that leave the assets folder or name a remote resource", () => {
  const unsafe = [
    "assets/../extension.mjs",
    "assets/icons/../../secret.svg",
    "../assets/logo.svg",
    "/assets/logo.svg",
    "assets//logo.svg",
    "assets/.hidden.svg",
    "images/logo.svg",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "https://example.com/logo.svg",
    "http://example.com/logo.svg",
    "//example.com/logo.svg",
    "assets\\logo.svg",
    "assets/logo.gif",
    "assets/logo.js",
    "assets/logo.svg?v=2",
    "assets/logo",
  ];
  for (const icon of unsafe) {
    assert.throws(
      () =>
        parseArchitecture(
          JSON.stringify({
            elements: [{ type: "node", id: "n", x: 0, y: 0, width: 100, height: 100, icon }],
          }),
        ),
      (error) => {
        assert.ok(error instanceof ArchitectureError);
        assert.match(error.message, /^elements\[0\]\.icon: must be a built-in icon name/);
        assert.match(error.message, /assets\/icons\/logo\.svg/);
        return true;
      },
      `${icon} must be rejected`,
    );
  }
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            {
              type: "node",
              id: "n",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              icon: `assets/${"a".repeat(190)}.svg`,
            },
          ],
        }),
      ),
    /elements\[0\]\.icon: must be at most 200 characters/,
  );
});

test("fits connector labels inside a bounded Unicode-aware background", () => {
  for (const label of ["イベント".repeat(50), "W".repeat(100), "m".repeat(100)]) {
    const model = parseArchitecture(
      JSON.stringify({
        version: 1,
        elements: [
          { type: "node", id: "left", x: 50, y: 100, width: 180, height: 100 },
          { type: "node", id: "right", x: 900, y: 100, width: 180, height: 100 },
          { type: "connector", from: "left", to: "right", label },
        ],
      }),
    );
    const wrapper = renderArchitectureDiagram(model, new FakeDocument());
    const connector = descendants(wrapper).find(
      (node) => node.attributes.get("data-architecture-connector") === "left-right",
    );
    const background = connector.children.find((node) => node.tagName === "rect");
    const text = connector.children.find((node) => node.tagName === "text");
    assert.equal(text.textContent.endsWith("…"), true);
    assert.ok(Number(background.attributes.get("width")) <= 560);
    assert.equal(connector.attributes.get("aria-label"), `left to right: ${label}`);
  }
});

test("connector accessible names use the visible labels of both endpoints", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      elements: [
        {
          type: "group",
          id: "zone-a1",
          title: "Trusted zone",
          x: 50,
          y: 100,
          width: 260,
          height: 180,
          children: [
            { type: "node", id: "svc-a1", text: "Checkout service", x: 80, y: 140, width: 180, height: 100 },
          ],
        },
        { type: "node", id: "db-primary", text: "Order database", x: 900, y: 100, width: 180, height: 100 },
        // text も title も無い端点。ID にフォールバックする。
        { type: "node", id: "cache-x9", x: 900, y: 400, width: 180, height: 100 },
        { type: "connector", from: "svc-a1", to: "db-primary", label: "writes" },
        { type: "connector", from: "zone-a1", to: "cache-x9" },
        { type: "connector", from: "svc-a1", to: "cache-x9", ariaLabel: "custom wording wins" },
      ],
    }),
  );
  const wrapper = renderArchitectureDiagram(model, new FakeDocument());
  const labelOf = (key) =>
    descendants(wrapper)
      .find((node) => node.attributes.get("data-architecture-connector") === key)
      .attributes.get("aria-label");

  // ID（svc-a1 / db-primary）ではなく、画面に見えている文字列で読み上げる。
  assert.equal(labelOf("svc-a1-db-primary"), "Checkout service to Order database: writes");
  // group は title を使う。可視ラベルが無い端点だけ ID のまま残る。
  assert.equal(labelOf("zone-a1-cache-x9"), "Trusted zone to cache-x9");
  // 明示的な ariaLabel は従来どおり全体を上書きする。
  assert.equal(labelOf("svc-a1-cache-x9"), "custom wording wins");

  // data-architecture-connector 自体は ID のままでなければならない
  // （編集モードと既存の回帰テストがこの属性で要素を引く）。
  const keys = descendants(wrapper)
    .map((node) => node.attributes.get("data-architecture-connector"))
    .filter(Boolean);
  assert.deepEqual(keys.sort(), ["svc-a1-cache-x9", "svc-a1-db-primary", "zone-a1-cache-x9"]);
});

test("enforces DSL version, icon allowlist, nested JSON paths, and resource limits", () => {
  assert.throws(
    () => parseArchitecture(JSON.stringify({ version: 2, elements: [] })),
    /version: must be between 1 and 1/,
  );
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            {
              type: "group",
              id: "g",
              x: 0,
              y: 0,
              width: 500,
              height: 500,
              children: [
                { type: "node", id: "n", x: 0, y: 0, width: 100, height: 100, icon: "remote" },
              ],
            },
          ],
        }),
      ),
    /elements\[0\]\.children\[0\]\.icon/,
  );
  const tooMany = {
    elements: Array.from({ length: MAX_ELEMENTS + 1 }, (_, index) => ({
      type: "node",
      id: `n${index}`,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })),
  };
  assert.throws(() => parseArchitecture(JSON.stringify(tooMany)), /at most 200 items/);
  assert.throws(() => parseArchitecture(" ".repeat(MAX_SOURCE_LENGTH + 1)), /at most 65536/);
});

test("accepts a root $schema reference and keeps it out of the model", () => {
  const model = parseArchitecture(
    JSON.stringify({
      $schema: "../schema/architecture-v1.schema.json",
      elements: [{ type: "node", id: "n", x: 0, y: 0, width: 100, height: 100 }],
    }),
  );
  assert.equal(model.version, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(model, "$schema"), false);
  assert.equal(model.elements.length, 1);

  // $schema declares the whole document, so it stays rejected on elements.
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            { type: "node", id: "n", x: 0, y: 0, width: 100, height: 100, $schema: "x" },
          ],
        }),
      ),
    /elements\[0\]\.\$schema: is not supported/,
  );
});

test("diagnostics pair every problem with remediation guidance", () => {
  const cases = [
    [
      { elements: [{ type: "node", id: "n", x: 0, y: 0, width: 100, height: 100, onclick: "x" }] },
      /onclick: is not supported; remove it or use one of: type, id, shape/,
    ],
    [
      { version: 2, elements: [] },
      /version: must be between 1 and 1; set "version": 1 or omit the field/,
    ],
    [
      {
        elements: [
          { type: "node", id: "n", x: 0, y: 0, width: 100, height: 100, style: { fill: "red" } },
        ],
      },
      /theme token[^;]*; replace 'red' with a theme token such as accent/,
    ],
    [
      {
        elements: [
          { type: "node", id: "n", x: 0, y: 0, width: 100, height: 100 },
          { type: "connector", from: "n", to: "ghost" },
        ],
      },
      /references unknown element 'ghost'; add a node or group with id 'ghost'/,
    ],
    [
      {
        elements: [
          { type: "node", id: "dup", x: 0, y: 0, width: 10, height: 10 },
          { type: "node", id: "dup", x: 0, y: 0, width: 10, height: 10 },
        ],
      },
      /duplicates 'dup'; give every node and group a unique id/,
    ],
    [
      { elements: [{ type: "node", id: "n", x: 0, y: 0, width: 100, height: 100, icon: "remote" }] },
      /icon: must be a built-in icon name \([^)]+\) or a path under assets\/; replace 'remote' with a built-in name, or with a repository asset/,
    ],
  ];
  for (const [diagram, pattern] of cases) {
    assert.throws(() => parseArchitecture(JSON.stringify(diagram)), pattern);
  }
  assert.throws(() => parseArchitecture("{"), /contains invalid JSON[^;]*; check for trailing commas/);
});

test("semantic snapshot contains deterministic geometry only", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 800, height: 450 },
      elements: [
        { type: "node", id: "a", x: 40, y: 100, width: 160, height: 80, icon: "api" },
        { type: "node", id: "b", x: 600, y: 100, width: 160, height: 80 },
        {
          type: "connector",
          from: "a",
          to: "b",
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
          lane: 0,
        },
      ],
    }),
  );
  assert.deepEqual(architectureSemanticSnapshot(model), {
    version: 1,
    canvas: { width: 800, height: 450 },
    // Phase 3 で追加。ルーティングが劣化したかどうかを機械可読な形で載せる。
    // この図は素直に引けるので degraded は false。
    routing: { degraded: false, diagnostics: [] },
    elements: [
      {
        type: "connector",
        from: "a",
        to: "b",
        fromPort: "right",
        toPort: "left",
        lane: 0,
        points: [
          { x: 214, y: 140 },
          { x: 586, y: 140 },
        ],
      },
      { type: "node", id: "a", x: 40, y: 100, width: 160, height: 80, icon: "api" },
      { type: "node", id: "b", x: 600, y: 100, width: 160, height: 80, icon: undefined },
    ],
  });
});

test("automatic lanes reserve explicit lanes and resolve equivalent auto ports", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      elements: [
        { type: "node", id: "a", x: 0, y: 0, width: 160, height: 100 },
        { type: "node", id: "b", x: 500, y: 0, width: 160, height: 100 },
        {
          type: "connector",
          from: "a",
          to: "b",
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
          lane: 0,
        },
        {
          type: "connector",
          from: "a",
          to: "b",
          fromPort: "auto",
          toPort: "auto",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connectors = model.elements.filter((element) => element.type === "connector");
  assert.deepEqual(connectors.map((connector) => connector.lane), [0, -0.5]);
});

test("shared endpoint offsets remain unique when fixed lane spacing would clamp", () => {
  const targets = Array.from({ length: 5 }, (_, index) => ({
    type: "node",
    id: `target${index}`,
    x: 700,
    y: index * 140,
    width: 160,
    height: 100,
  }));
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      elements: [
        { type: "node", id: "source", x: 100, y: 280, width: 180, height: 100 },
        ...targets,
        ...targets.map((target) => ({
          type: "connector",
          from: "source",
          to: target.id,
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
        })),
      ],
    }),
  );
  const lookup = new Map(
    model.elements.filter((element) => element.type !== "connector").map((element) => [element.id, element]),
  );
  const starts = model.elements
    .filter((element) => element.type === "connector")
    .map((connector) => computeConnectorRoute(connector, lookup, model.canvas)[0].y);
  assert.equal(new Set(starts).size, 5);

  const small = parseArchitecture(
    JSON.stringify({
      version: 1,
      elements: [
        { type: "node", id: "tiny", x: 100, y: 100, width: 20, height: 20 },
        { type: "node", id: "top", x: 400, y: 60, width: 40, height: 40 },
        { type: "node", id: "bottom", x: 400, y: 140, width: 40, height: 40 },
        { type: "connector", from: "tiny", to: "top", fromPort: "right", toPort: "left" },
        { type: "connector", from: "tiny", to: "bottom", fromPort: "right", toPort: "left" },
      ],
    }),
  );
  const smallLookup = new Map(
    small.elements.filter((element) => element.type !== "connector").map((element) => [element.id, element]),
  );
  const smallStarts = small.elements
    .filter((element) => element.type === "connector")
    .map((connector) => computeConnectorRoute(connector, smallLookup, small.canvas)[0].y);
  assert.equal(new Set(smallStarts).size, 2);
});

test("dense diagrams stay within the routing work budget", () => {
  const nodes = Array.from({ length: 160 }, (_, index) => ({
    type: "node",
    id: `node${index}`,
    x: 20 + index * 20,
    y: 20 + index * 20,
    width: 12,
    height: 12,
  }));
  const connectors = Array.from({ length: 30 }, (_, index) => ({
    type: "connector",
    from: `node${index}`,
    to: `node${159 - index}`,
    fromPort: "right",
    toPort: "left",
    routing: "orthogonal",
  }));
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 4000, height: 4000 },
      elements: [...nodes, ...connectors],
    }),
  );
  const started = performance.now();
  architectureSemanticSnapshot(model);
  assert.ok(performance.now() - started < 1500);
});

// ---------------------------------------------------------------- Phase 3
// 描画品質。交差の少なさ・ラベル領域の考慮・階層レイアウト・
// 予算枯渇時の「決定的かつ作者に伝わる」挙動を守る。

// 図全体の品質を測る。交差だけでなくラベルの衝突も数える。
function measureQuality(source) {
  const model = parseArchitecture(source);
  const snapshot = architectureSemanticSnapshot(model);
  const nodes = snapshot.elements.filter((element) => element.type === "node");
  const connectors = snapshot.elements.filter((element) => element.type === "connector");
  const overlaps = (first, second) =>
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height;

  const result = { crossings: 0, nodeHits: 0, labelHits: 0, degraded: snapshot.routing.degraded };
  for (let index = 0; index < connectors.length; index += 1) {
    const current = connectors[index];
    const excluded = new Set([current.from, current.to]);
    for (const node of nodes) {
      if (!excluded.has(node.id) && routeIntersectsNode(current.points, node)) result.nodeHits += 1;
    }
    // ラベルは経路の中点に置かれる。実寸は描画時にしか分からないため、
    // 保守的な最大幅で近似して「ノードを覆っていないか」だけを見る。
    if (current.label) {
      const mid = current.points[Math.floor(current.points.length / 2)];
      const box = { x: mid.x - 60, y: mid.y - 15, width: 120, height: 30 };
      for (const node of nodes) {
        if (!excluded.has(node.id) && overlaps(box, node)) result.labelHits += 1;
      }
    }
    for (let other = index + 1; other < connectors.length; other += 1) {
      result.crossings += countRouteCrossings(current.points, connectors[other].points);
    }
  }
  return result;
}

// 手動 polyline を一切使わない密な図。ノードは格子状、connector は意図的に交差させる。
function denseDiagram({ columns, rows, pairs, label = true }) {
  const total = columns * rows;
  const ids = Array.from({ length: total }, (_, index) => `n${index}`);
  const elements = ids.map((id, index) => ({
    type: "node",
    id,
    text: id,
    x: 90 + (index % columns) * Math.floor(1420 / columns),
    y: 120 + Math.floor(index / columns) * Math.floor(760 / rows),
    width: Math.floor(1420 / columns) - 90,
    height: 100,
  }));
  for (const [from, to] of pairs) {
    elements.push({
      type: "connector",
      from: ids[from],
      to: ids[to],
      routing: "orthogonal",
      ...(label ? { label: `${from}-${to}` } : {}),
    });
  }
  return JSON.stringify({ version: 1, canvas: { width: 1600, height: 900 }, elements });
}

const NINE_NODE_PAIRS = [
  [0, 4], [1, 3], [2, 5], [3, 7], [4, 6], [5, 8],
  [0, 8], [2, 6], [1, 7], [0, 5], [3, 8], [2, 4],
];
const TWELVE_NODE_PAIRS = [
  [0, 5], [1, 4], [2, 7], [3, 6], [4, 9], [5, 8],
  [6, 11], [7, 10], [0, 11], [3, 8], [1, 10], [2, 9],
];
// 総当たりに近い交差を意図的に作る 12 ノード / 14 connector。
const CRISSCROSS_NODE_PAIRS = [
  [0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10], [6, 3],
  [7, 2], [8, 1], [9, 0], [10, 5], [11, 4], [0, 5], [2, 11],
];

test("dense 9-node diagrams route around every node without manual polylines", () => {
  const quality = measureQuality(
    denseDiagram({ columns: 3, rows: 3, pairs: NINE_NODE_PAIRS }),
  );
  // 経路がノードを貫通したら図として破綻している。ここは 0 でなければならない。
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.labelHits, 0);
  assert.equal(quality.degraded, false);
});

test("dense 12-node diagrams never route a path through an unrelated node", () => {
  const quality = measureQuality(
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS }),
  );
  // 「破綻しない」の定義は経路がノードを貫通しないこと。ここは無条件に 0。
  assert.equal(quality.nodeHits, 0);
});

test("unavoidable label collisions are reported rather than silently drawn", () => {
  // 4 列 x 3 行にノードを敷き詰めて長い斜め connector を張ると、ラベルを置く
  // 余白が物理的に足りなくなる。経路自体は健全でもラベルはノードに乗る。
  // 重要なのは「黙って乗せない」こと。
  const model = parseArchitecture(
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  assert.equal(snapshot.routing.degraded, true);
  assert.ok(snapshot.routing.diagnostics.length > 0);
  for (const diagnostic of snapshot.routing.diagnostics) {
    // 経路がノードを貫通した報告は出ていないはず（貫通していないので）。
    assert.equal(diagnostic.kind, "label-overlaps-node");
    assert.equal(diagnostic.pathOverlaps, 0);
    assert.ok(diagnostic.labelOverlaps > 0);
  }
  // ラベルを外せば劣化は消える。つまり報告はラベル起因だと作者が確かめられる。
  const unlabelled = architectureSemanticSnapshot(
    parseArchitecture(
      denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS, label: false }),
    ),
  );
  assert.equal(unlabelled.routing.degraded, false);
});

test("global refinement lowers crossings below the greedy-only result", () => {
  // 交差の数え方は「交差点の個数」。再配線の受理条件がまさにこの値を
  // 増やさないことを保証しているので、テストもこの値で見る。
  //
  // 12 ノード / 12 connector（ラベル付き）は逐次配置だけだと 13 交差になる。
  // 再配線が効いていれば 6 まで下がる。上限 8 は「再配線を無効化すると必ず
  // 落ちる」位置に置いてある。
  const quality = measureQuality(
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS }),
  );
  assert.ok(
    quality.crossings <= 8,
    `expected refinement to keep crossings at or below 8, got ${quality.crossings}`,
  );
});

test("refinement never trades a crossing away for label placement", () => {
  // 再配線は「総コストが下がる」だけでは採用しない。交差が増えるなら棄却する。
  // このガードが無いと、ラベル penalty（ノードを隠す = 24,000）が交差
  // （約 10,000）より重いせいで、ラベルを避けるために交差を増やす取引が通る。
  //
  // 12 ノード / 14 connector の総当たり交差図での実測（交差点の個数）:
  //   ガードあり 22 / ガードなし 25 / 再配線なし 29
  // 上限 22 はガードを外すと必ず落ちる位置に置いてある。
  const quality = measureQuality(
    denseDiagram({ columns: 4, rows: 3, pairs: CRISSCROSS_NODE_PAIRS }),
  );
  assert.ok(
    quality.crossings <= 22,
    `expected the crossing guard to hold crossings at or below 22, got ${quality.crossings}`,
  );
  assert.equal(quality.nodeHits, 0);
});

test("routing avoids parking a connector label on top of an unrelated node", () => {
  // src -> dst の最短経路上に blocker がある。ラベル領域を見ていなければ
  // ラベルが blocker を覆う。
  //
  // 注意: この単独 connector のケースは ROUTE_COST_LABEL_OVER_NODE を 0 にしても
  // 落ちない。ノード貫通コスト（1,000,000）だけで blocker を回避する経路が
  // 選ばれ、その結果ラベルも自然に空きスペースへ落ちるため。ラベルコストが
  // 単独で効いていることは下の crisscross のテストで担保している。
  const source = JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements: [
      { type: "node", id: "src", x: 80, y: 400, width: 200, height: 120, text: "Source" },
      { type: "node", id: "blocker", x: 660, y: 380, width: 280, height: 160, text: "Blocker" },
      { type: "node", id: "dst", x: 1320, y: 400, width: 200, height: 120, text: "Target" },
      {
        type: "connector",
        from: "src",
        to: "dst",
        routing: "orthogonal",
        label: "replicates to",
      },
    ],
  });
  const quality = measureQuality(source);
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.labelHits, 0);
});

test("label area cost buys a crossing to stop a label from hiding a node", () => {
  // ラベル領域を考慮した経路決定が、密な図で単独で効いていることの証明。
  //
  // 12 ノード / 14 connector の総当たり交差図にラベルを付けると、交差ガードを
  // そのまま適用した場合はラベルが 1 個ノードを覆ったまま残る。ガードには
  // 「隠れている中身が減るなら交差 1 本の増加を許す」という例外があり、
  // ROUTE_COST_LABEL_OVER_NODE がその再配線を動機づける。
  //
  // 実測（ラベル付き crisscross）:
  //   ラベルコスト 24,000 -> 交差 22 / 隠れ 0
  //   ラベルコスト 0      -> 交差 21 / 隠れ 1
  // 交差 1 本と引き換えにノードが 1 個読めるようになる、という意図した取引。
  const model = parseArchitecture(
    denseDiagram({ columns: 4, rows: 3, pairs: CRISSCROSS_NODE_PAIRS }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const labelOverlaps = snapshot.routing.diagnostics.filter(
    (diagnostic) => diagnostic.kind === "label-overlaps-node",
  );
  assert.deepEqual(
    labelOverlaps,
    [],
    `expected label-area cost to clear every hidden node, got ${JSON.stringify(labelOverlaps)}`,
  );
  assert.equal(snapshot.routing.degraded, false);
});

test("routing budget exhaustion is reported instead of silently drawing through nodes", () => {
  // 座標軸あたりの候補が MAX_ROUTING_GRID_COORDINATES を超えると格子探索は
  // 打ち切られる。従来はそのまま無警告でノードを貫通した経路が描かれていた。
  const elements = [];
  const filler = MAX_ROUTING_GRID_COORDINATES - 50;
  for (let index = 0; index < filler; index += 1) {
    elements.push({
      type: "node",
      id: `filler${index}`,
      x: 20 + index * 21,
      y: 20 + index * 11,
      width: 17,
      height: 13,
    });
  }
  elements.push({ type: "node", id: "src", x: 40, y: 700, width: 120, height: 80 });
  elements.push({ type: "node", id: "dst", x: 1400, y: 700, width: 120, height: 80 });
  elements.push({ type: "node", id: "wall", x: 700, y: 620, width: 200, height: 240 });
  elements.push({
    type: "connector",
    from: "src",
    to: "dst",
    routing: "orthogonal",
    fromPort: "right",
    toPort: "left",
  });
  const source = JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements,
  });

  const snapshot = architectureSemanticSnapshot(parseArchitecture(source));
  assert.equal(snapshot.routing.degraded, true);
  assert.equal(snapshot.routing.diagnostics.length, 1);
  const [diagnostic] = snapshot.routing.diagnostics;
  assert.equal(diagnostic.from, "src");
  assert.equal(diagnostic.to, "dst");
  assert.equal(diagnostic.kind, "path-overlaps-node");
  // 打ち切りの理由が「予算切れ」だと分かること。no-clean-candidate に
  // 丸められてしまうと、作者は配置が悪いのか探索が諦めたのか区別できない。
  assert.equal(diagnostic.reason, ROUTE_FALLBACK_REASONS.gridTooLarge);
  assert.ok(diagnostic.pathOverlaps > 0);
  assert.ok(diagnostic.sourcePath.startsWith("elements["));

  // 劣化していても決定的であること。
  const again = architectureSemanticSnapshot(parseArchitecture(source));
  assert.deepEqual(again.routing, snapshot.routing);
  assert.deepEqual(again.elements, snapshot.elements);
});

test("degraded routing surfaces a non-fatal warning in the rendered diagram", () => {
  const elements = [];
  const filler = MAX_ROUTING_GRID_COORDINATES - 50;
  for (let index = 0; index < filler; index += 1) {
    elements.push({
      type: "node",
      id: `filler${index}`,
      x: 20 + index * 21,
      y: 20 + index * 11,
      width: 17,
      height: 13,
    });
  }
  elements.push({ type: "node", id: "src", x: 40, y: 700, width: 120, height: 80 });
  elements.push({ type: "node", id: "dst", x: 1400, y: 700, width: 120, height: 80 });
  elements.push({ type: "node", id: "wall", x: 700, y: 620, width: 200, height: 240 });
  elements.push({
    type: "connector",
    from: "src",
    to: "dst",
    routing: "orthogonal",
    fromPort: "right",
    toPort: "left",
  });
  const source = JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements,
  });

  const warnings = [];
  const originalWarn = globalThis.console.warn;
  globalThis.console.warn = (message) => warnings.push(message);
  let wrapper;
  try {
    wrapper = renderArchitectureDiagram(parseArchitecture(source), new FakeDocument());
  } finally {
    globalThis.console.warn = originalWarn;
  }

  // 破壊的変更を避けるため throw はしない。図は描かれ続ける。
  assert.equal(wrapper.attributes.get("data-architecture-routing"), "degraded");
  const svg = wrapper.children.find((child) => child.tagName === "svg");
  assert.ok(svg, "the diagram itself must still render");

  const banner = wrapper.children.find(
    (child) => child.className === "architecture-routing-warning",
  );
  assert.ok(banner, "a routing warning banner must be appended");
  assert.equal(banner.attributes.get("role"), "status");
  assert.equal(banner.attributes.get("aria-live"), "polite");
  assert.ok(banner.textContent.includes("src"));
  assert.ok(banner.textContent.includes("polyline"), "the banner must point at the remedy");

  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("grid-too-large"));
});

test("clean diagrams emit no routing warning at all", () => {
  const warnings = [];
  const originalWarn = globalThis.console.warn;
  globalThis.console.warn = (message) => warnings.push(message);
  let wrapper;
  try {
    wrapper = renderArchitectureDiagram(parseArchitecture(JSON.stringify(validDiagram)), new FakeDocument());
  } finally {
    globalThis.console.warn = originalWarn;
  }
  assert.equal(wrapper.attributes.get("data-architecture-routing"), undefined);
  assert.equal(
    wrapper.children.some((child) => child.className === "architecture-routing-warning"),
    false,
  );
  assert.deepEqual(warnings, []);
});

test("routing is deterministic: the same source renders identical markup twice", () => {
  // FakeElement を安定した文字列へ落として比較する。
  // architecture-{title,description,arrow}-<n> の <n> だけは renderSequence 由来で、
  // 1 ページに複数の図を置いたときに ID が衝突しないよう意図的に増える
  // （main 時点から存在する既存の仕組み）。ここでは伏せて比較する。
  // 幾何そのものの決定性は architectureSemanticSnapshot を突き合わせる
  // 隣のテストが担保している。
  const serializeElement = (element) =>
    JSON.stringify({
      tagName: element.tagName,
      namespaceURI: element.namespaceURI,
      className: element.className,
      attributes: [...element.attributes.entries()],
      text: element._textContent,
      children: element.children.map(serializeElement),
    }).replace(/(architecture-(?:title|description|arrow))-\d+/g, "$1-N");
  const sources = [
    denseDiagram({ columns: 3, rows: 3, pairs: NINE_NODE_PAIRS }),
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS, label: false }),
    JSON.stringify(validDiagram),
  ];
  for (const source of sources) {
    const first = serializeElement(
      renderArchitectureDiagram(parseArchitecture(source), new FakeDocument()),
    );
    const second = serializeElement(
      renderArchitectureDiagram(parseArchitecture(source), new FakeDocument()),
    );
    assert.equal(first, second);
  }
});

test("connector declaration order does not depend on object identity across parses", () => {
  // 同一入力を 2 回パースして経路点まで完全一致することを確認する。
  // ここが崩れるとビジュアル回帰が不安定になる。
  const source = denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS });
  const first = architectureSemanticSnapshot(parseArchitecture(source));
  const second = architectureSemanticSnapshot(parseArchitecture(source));
  assert.deepEqual(second, first);
});

test("layered layout stacks children by connector depth", () => {
  const source = JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements: [
      {
        type: "group",
        id: "flow",
        x: 100,
        y: 100,
        width: 1200,
        height: 700,
        layout: "layered",
        children: [
          { type: "node", id: "sink", text: "Sink" },
          { type: "node", id: "middle", text: "Middle" },
          { type: "node", id: "source", text: "Source" },
          { type: "connector", from: "source", to: "middle" },
          { type: "connector", from: "middle", to: "sink" },
        ],
      },
    ],
  });
  const model = parseArchitecture(source);
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  // 宣言順は sink -> middle -> source だが、階層は source -> middle -> sink。
  assert.ok(byId.get("source").y < byId.get("middle").y);
  assert.ok(byId.get("middle").y < byId.get("sink").y);
  // down が既定なので x は揃う（各層 1 ノードなので中央寄せ）。
  assert.equal(byId.get("source").x, byId.get("sink").x);
});

test("layered layout honours direction right", () => {
  const source = JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements: [
      {
        type: "group",
        id: "flow",
        x: 100,
        y: 100,
        width: 1200,
        height: 700,
        layout: { type: "layered", direction: "right" },
        children: [
          { type: "node", id: "sink", text: "Sink" },
          { type: "node", id: "source", text: "Source" },
          { type: "connector", from: "source", to: "sink" },
        ],
      },
    ],
  });
  const model = parseArchitecture(source);
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  assert.ok(byId.get("source").x < byId.get("sink").x);
  assert.equal(byId.get("source").y, byId.get("sink").y);
});

test("layered layout breaks cycles deterministically instead of hanging", () => {
  const source = JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements: [
      {
        type: "group",
        id: "loop",
        x: 100,
        y: 100,
        width: 1200,
        height: 700,
        layout: "layered",
        children: [
          { type: "node", id: "a" },
          { type: "node", id: "b" },
          { type: "node", id: "c" },
          { type: "connector", from: "a", to: "b" },
          { type: "connector", from: "b", to: "c" },
          { type: "connector", from: "c", to: "a" },
        ],
      },
    ],
  });
  const first = architectureSemanticSnapshot(parseArchitecture(source));
  const second = architectureSemanticSnapshot(parseArchitecture(source));
  assert.deepEqual(second, first);
  const nodes = first.elements.filter((element) => element.type === "node");
  assert.equal(nodes.length, 3);
});

test("direction is rejected on layouts other than layered", () => {
  for (const type of ["row", "column", "grid"]) {
    assert.throws(
      () =>
        parseArchitecture(
          JSON.stringify({
            version: 1,
            elements: [
              {
                type: "group",
                id: "g",
                x: 100,
                y: 100,
                width: 600,
                height: 400,
                layout: { type, direction: "down" },
                children: [{ type: "node", id: "n" }],
              },
            ],
          }),
        ),
      (error) => {
        assert.ok(error instanceof ArchitectureError);
        assert.match(error.message, /direction/);
        assert.match(error.message, /;/, "diagnostics must keep the problem; remedy shape");
        return true;
      },
      `layout type ${type} must reject direction`,
    );
  }
});

test("unknown layered direction is rejected with the allowed values", () => {
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          version: 1,
          elements: [
            {
              type: "group",
              id: "g",
              x: 100,
              y: 100,
              width: 600,
              height: 400,
              layout: { type: "layered", direction: "up" },
              children: [{ type: "node", id: "n" }],
            },
          ],
        }),
      ),
    (error) => {
      assert.ok(error instanceof ArchitectureError);
      for (const allowed of LAYOUT_DIRECTIONS) assert.ok(error.message.includes(allowed));
      return true;
    },
  );
});
