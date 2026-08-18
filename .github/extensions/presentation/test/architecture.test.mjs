import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ArchitectureError,
  MAX_ELEMENTS,
  MAX_SOURCE_LENGTH,
  architectureSemanticSnapshot,
  computeConnectorRoute,
  createOverridePayload,
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

test("semantic snapshot and edit overrides contain deterministic geometry only", () => {
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
  assert.deepEqual(
    createOverridePayload(
      new Map([
        ["a", { x: 20, y: -10 }],
        ["b", { x: 0, y: 0 }],
      ]),
    ),
    { version: 1, overrides: [{ id: "a", x: 20, y: -10 }] },
  );
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
