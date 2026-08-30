import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArchitectureError,
  CONNECTOR_LABEL_CLEARANCE,
  ICONS,
  LAYOUT_DIRECTIONS,
  MAX_ELEMENTS,
  MAX_ROUTING_GRID_COORDINATES,
  MAX_SOURCE_LENGTH,
  MIN_VISIBLE_ROUTE_LENGTH,
  ROUTE_FALLBACK_REASONS,
  architectureSemanticSnapshot,
  computeConnectorRoute,
  connectorLabelAnchor,
  connectorLabelBox,
  parseArchitecture,
  pointAtHalfLength,
  renderArchitectureBlock,
  renderArchitectureDiagram,
  routeLengthOutsideBox,
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

function boxesOverlap(first, second) {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function terminalMarkerBounds(connector, points) {
  const end = points.at(-1);
  const previous = points.at(-2);
  const length = Math.hypot(end.x - previous.x, end.y - previous.y);
  assert.ok(length > 0.001, "terminal marker requires a non-zero final segment");
  const direction = {
    x: (end.x - previous.x) / length,
    y: (end.y - previous.y) / length,
  };
  const normal = { x: -direction.y, y: direction.x };
  const scale = connector.style.strokeWidth * 7 / 10;
  const pointsInCanvas = [
    { x: -9 * scale, y: -5 * scale },
    { x: scale, y: 0 },
    { x: -9 * scale, y: 5 * scale },
  ].map((point) => ({
    x: end.x + direction.x * point.x + normal.x * point.y,
    y: end.y + direction.y * point.x + normal.y * point.y,
  }));
  const xs = pointsInCanvas.map((point) => point.x);
  const ys = pointsInCanvas.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
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

function countImmediateBacktracks(points) {
  let backtracks = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = {
      x: current.x - previous.x,
      y: current.y - previous.y,
    };
    const outgoing = {
      x: next.x - current.x,
      y: next.y - current.y,
    };
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
    if (Math.abs(cross) < 0.001 && dot < -0.001) backtracks += 1;
  }
  return backtracks;
}

function polylineLength(points) {
  return points.slice(1).reduce(
    (total, point, index) =>
      total + Math.hypot(point.x - points[index].x, point.y - points[index].y),
    0,
  );
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
  assert.equal(model.elements[1].labelLayer, "front");
  assert.deepEqual(
    model.elements.filter((element) => element.type !== "connector").map((element) => element.id),
    ["cloud", "api", "db"],
  );
});

test("treats an empty fenced body as an empty architecture diagram", () => {
  const model = parseArchitecture(" \n\t");
  assert.equal(model.version, 1);
  assert.deepEqual(model.canvas, { width: 1600, height: 900 });
  assert.deepEqual(model.elements, []);

  const wrapper = renderArchitectureBlock("", new FakeDocument());
  assert.equal(wrapper.className, "architecture-diagram");
  assert.equal(descendants(wrapper).some((element) => element.tagName === "svg"), true);
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
  assert.match(wrapper.textContent, /must be node, group, image, or connector/);
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

test("short facing orthogonal ports do not overshoot and backtrack", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 700, height: 400 },
      elements: [
        { type: "node", id: "source", x: 100, y: 150, width: 200, height: 100 },
        { type: "node", id: "target", x: 396, y: 150, width: 200, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const route = computeConnectorRoute(connector, lookup, model.canvas);

  assert.equal(
    countImmediateBacktracks(route),
    0,
    `facing endpoint stubs must not cross each other: ${JSON.stringify(route)}`,
  );
});

test("narrow facing ports retain an 8px visible span when possible", () => {
  for (const gap of [28, 12, 8, 1]) {
    const model = parseArchitecture(
      JSON.stringify({
        version: 1,
        canvas: { width: 700, height: 300 },
        elements: [
          {
            type: "group",
            id: "row",
            x: 50,
            y: 50,
            width: 400 + gap,
            height: 100,
            layout: { type: "row", gap, padding: 0 },
            children: [
              { type: "node", id: "source", width: 200, height: 100 },
              { type: "node", id: "target", width: 200, height: 100 },
            ],
          },
          {
            type: "connector",
            from: "source",
            to: "target",
            fromPort: "right",
            toPort: "left",
            routing: "orthogonal",
          },
        ],
      }),
    );
    const snapshot = architectureSemanticSnapshot(model);
    const route = snapshot.elements.find(
      (element) => element.type === "connector",
    ).points;

    assert.ok(route.length >= 2, `gap ${gap} collapsed to ${JSON.stringify(route)}`);
    const expectedSpan = Math.min(8, gap);
    assert.ok(
      polylineLength(route) >= expectedSpan - 0.001,
      `gap ${gap} should retain a ${expectedSpan}px span: ${JSON.stringify(route)}`,
    );
    assert.equal(snapshot.routing.degraded, false);
  }
});

test("automatic routes approach both requested ports in the required direction", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 320, height: 180 },
      elements: [
        { type: "node", id: "source", x: 120, y: 60, width: 80, height: 90 },
        { type: "node", id: "target", x: 220, y: 100, width: 70, height: 40 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "left",
          toPort: "left",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const route = snapshot.elements.find(
    (element) => element.type === "connector",
  ).points;
  const first = {
    x: route[1].x - route[0].x,
    y: route[1].y - route[0].y,
  };
  const last = {
    x: route.at(-1).x - route.at(-2).x,
    y: route.at(-1).y - route.at(-2).y,
  };

  assert.ok(first.x < -0.001, `route does not leave the left port: ${JSON.stringify(route)}`);
  assert.ok(last.x > 0.001, `route does not enter the left port: ${JSON.stringify(route)}`);
  assert.equal(snapshot.routing.degraded, false);
});

test("stub fitting preserves a corridor between offset facing ports", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 320, height: 180 },
      elements: [
        { type: "node", id: "source", x: 145, y: 0, width: 100, height: 40 },
        { type: "node", id: "target", x: 40, y: 20, width: 100, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "left",
          toPort: "right",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const route = snapshot.elements.find(
    (element) => element.type === "connector",
  ).points;

  assert.ok(
    route.some((point) => point.x > 140.001 && point.x < 144.999),
    `route did not retain the 5px corridor: ${JSON.stringify(route)}`,
  );
  assert.equal(countImmediateBacktracks(route), 0);
  assert.equal(snapshot.routing.degraded, false);
});

test("touching facing nodes report invalid endpoint geometry", () => {
  const snapshot = architectureSemanticSnapshot(
    parseArchitecture(
      JSON.stringify({
        version: 1,
        canvas: { width: 400, height: 300 },
        elements: [
          { type: "node", id: "source", x: 100, y: 100, width: 100, height: 100 },
          { type: "node", id: "target", x: 200, y: 100, width: 100, height: 100 },
          {
            type: "connector",
            from: "source",
            to: "target",
            fromPort: "right",
            toPort: "left",
            routing: "orthogonal",
          },
        ],
      }),
    ),
  );

  assert.equal(snapshot.routing.degraded, true);
  assert.equal(snapshot.routing.diagnostics.length, 1);
  assert.equal(
    snapshot.routing.diagnostics[0].kind,
    "invalid-endpoint-geometry",
  );
  assert.equal(
    snapshot.routing.diagnostics[0].reason,
    ROUTE_FALLBACK_REASONS.invalidEndpointGeometry,
  );
});

test("invalid endpoint fallback never renders an immediate reversal", () => {
  const snapshot = architectureSemanticSnapshot(
    parseArchitecture(
      JSON.stringify({
        version: 1,
        canvas: { width: 400, height: 400 },
        elements: [
          { type: "node", id: "source", x: 100, y: 200, width: 100, height: 100 },
          { type: "node", id: "target", x: 212, y: 180, width: 100, height: 100 },
          {
            type: "connector",
            from: "source",
            to: "target",
            fromPort: "right",
            toPort: "bottom",
            routing: "orthogonal",
          },
        ],
      }),
    ),
  );
  const route = snapshot.elements.find(
    (element) => element.type === "connector",
  ).points;

  assert.equal(
    countImmediateBacktracks(route),
    0,
    `invalid endpoint fallback must still avoid hairpins: ${JSON.stringify(route)}`,
  );
  assert.equal(snapshot.routing.degraded, true);
  assert.equal(
    snapshot.routing.diagnostics[0].reason,
    ROUTE_FALLBACK_REASONS.invalidEndpointGeometry,
  );
});

test("near-aligned facing ports stay within their forward span", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 700, height: 400 },
      elements: [
        { type: "node", id: "source", x: 100, y: 200, width: 200, height: 100 },
        { type: "node", id: "target", x: 396, y: 201, width: 200, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "right",
          toPort: "left",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const route = computeConnectorRoute(connector, lookup, model.canvas);

  assert.equal(countImmediateBacktracks(route), 0);
  assert.ok(
    polylineLength(route) <= 69.001,
    `near-aligned facing ports should take the 69px Manhattan route: ${JSON.stringify(route)}`,
  );
});

test("explicit polyline routing preserves its endpoint stubs", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 500, height: 300 },
      elements: [
        { type: "node", id: "source", x: 100, y: 100, width: 100, height: 100 },
        { type: "node", id: "target", x: 260, y: 100, width: 100, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "right",
          toPort: "left",
          routing: "polyline",
          points: [{ x: 230, y: 50 }],
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const route = computeConnectorRoute(connector, lookup, model.canvas);

  assert.equal(route[1].x, 256);
  assert.equal(route.at(-2).x, 204);
});

test("zero-length stubs never send a route backward through its endpoint", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 400, height: 300 },
      elements: [
        { type: "node", id: "target", x: 0, y: 100, width: 50, height: 100 },
        { type: "node", id: "source", x: 100, y: 100, width: 100, height: 100 },
        { type: "node", id: "blocker", x: 234, y: 100, width: 100, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "right",
          toPort: "right",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const route = computeConnectorRoute(connector, lookup, model.canvas);

  assert.ok(
    route[1].x >= route[0].x,
    `source.right must not depart to the left: ${JSON.stringify(route)}`,
  );
  assert.equal(
    routeIntersectsNode(route, lookup.get("source"), 0),
    false,
    `route must not re-enter the source node: ${JSON.stringify(route)}`,
  );
});

test("grid fallback keeps connector endpoints excluded from obstacles", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 900, height: 700 },
      elements: [
        { type: "node", id: "source", x: 321, y: 524, width: 116, height: 81 },
        { type: "node", id: "target", x: 288, y: 348, width: 102, height: 124 },
        { type: "node", id: "blocker-a", x: 698, y: 67, width: 127, height: 86 },
        { type: "node", id: "blocker-b", x: 117, y: 188, width: 130, height: 122 },
        {
          type: "connector",
          from: "source",
          to: "target",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const route = snapshot.elements.find((element) => element.type === "connector");

  assert.equal(
    countImmediateBacktracks(route.points),
    0,
    `grid fallback must not leave an endpoint spur: ${JSON.stringify(route.points)}`,
  );
  assert.equal(snapshot.routing.degraded, false);
});

test("the slides.md dense sample has no spurs or excessive detours", async () => {
  const markdown = await readFile(
    new URL("../../../../slides.md", import.meta.url),
    "utf8",
  );
  const blocks = [...markdown.matchAll(/^```architecture[^\S\r\n]*\r?\n([\s\S]*?)^```$/gm)];
  const source = blocks
    .map((match) => match[1])
    .find((block) => block.includes('"title": "Dense service routing"'));
  assert.ok(source, "Dense service routing diagram not found in slides.md");

  const model = parseArchitecture(source);
  const snapshot = architectureSemanticSnapshot(model);
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const modelConnectors = model.elements.filter((element) => element.type === "connector");
  const plannedConnectors = snapshot.elements.filter((element) => element.type === "connector");

  for (const planned of plannedConnectors) {
    const edge = `${planned.from}->${planned.to}`;
    assert.equal(
      countImmediateBacktracks(planned.points),
      0,
      `${edge} has a 180-degree reversal that resembles a disconnected line: ${JSON.stringify(planned.points)}`,
    );

    const connector = modelConnectors.find(
      (element) => element.from === planned.from && element.to === planned.to,
    );
    const standalone = computeConnectorRoute(connector, lookup, model.canvas);
    assert.ok(
      polylineLength(planned.points) <= polylineLength(standalone) * 3 + 0.001,
      `${edge} detours more than three times the isolated route: ` +
        `${polylineLength(planned.points)} > ${polylineLength(standalone) * 3}`,
    );
  }
});

test("planned routes stay within the standalone detour limit", () => {
  const nodes = [
    { type: "node", id: "n0", x: 763, y: 518, width: 143, height: 107 },
    { type: "node", id: "n1", x: 385, y: 221, width: 94, height: 77 },
    { type: "node", id: "n2", x: 101, y: 115, width: 131, height: 109 },
    { type: "node", id: "n3", x: 264, y: 63, width: 175, height: 82 },
    { type: "node", id: "n4", x: 532, y: 366, width: 168, height: 92 },
  ];
  const pairs = [
    ["n0", "n2"],
    ["n2", "n4"],
    ["n1", "n2"],
    ["n1", "n0"],
    ["n4", "n2"],
  ];
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 900, height: 700 },
      elements: [
        ...nodes,
        ...pairs.map(([from, to]) => ({
          type: "connector",
          from,
          to,
          routing: "orthogonal",
        })),
      ],
    }),
  );
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const connector = model.elements.find(
    (element) =>
      element.type === "connector" &&
      element.from === "n1" &&
      element.to === "n0",
  );
  const planned = architectureSemanticSnapshot(model).elements.find(
    (element) =>
      element.type === "connector" &&
      element.from === connector.from &&
      element.to === connector.to,
  );
  const standalone = computeConnectorRoute(connector, lookup, model.canvas);

  assert.ok(
    polylineLength(planned.points) <= polylineLength(standalone) * 3 + 0.001,
    `planned route is ${polylineLength(planned.points)}px, standalone is ` +
      `${polylineLength(standalone)}px`,
  );
});

test("backtrack replacement obeys the standalone detour limit during refinement", () => {
  const nodes = [
    { type: "node", id: "n0", x: 377, y: 142, width: 133, height: 100 },
    { type: "node", id: "n1", x: 561, y: 236, width: 122, height: 66 },
    { type: "node", id: "n2", x: 166, y: 545, width: 174, height: 90 },
    { type: "node", id: "n3", x: 574, y: 507, width: 167, height: 106 },
    { type: "node", id: "n4", x: 440, y: 417, width: 97, height: 86 },
    { type: "node", id: "n5", x: 68, y: 418, width: 160, height: 79 },
  ];
  const pairs = [
    ["n2", "n0"],
    ["n3", "n4"],
    ["n2", "n4"],
    ["n5", "n3"],
  ];
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 900, height: 700 },
      elements: [
        ...nodes,
        ...pairs.map(([from, to]) => ({
          type: "connector",
          from,
          to,
          routing: "orthogonal",
        })),
      ],
    }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const connector = model.elements.find(
    (element) =>
      element.type === "connector" &&
      element.from === "n2" &&
      element.to === "n4",
  );
  const planned = snapshot.elements.find(
    (element) =>
      element.type === "connector" &&
      element.from === connector.from &&
      element.to === connector.to,
  );
  const standalone = computeConnectorRoute(connector, lookup, model.canvas);

  assert.equal(snapshot.routing.degraded, false);
  assert.equal(countImmediateBacktracks(planned.points), 0);
  assert.ok(
    polylineLength(planned.points) <= polylineLength(standalone) * 3 + 0.001,
    `planned route is ${polylineLength(planned.points)}px, standalone is ` +
      `${polylineLength(standalone)}px`,
  );
});

test("hidden-content filtering never leaves a backtracking route", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 800, height: 600 },
      elements: [
        { type: "node", id: "n0", x: 206, y: 258, width: 108, height: 94 },
        { type: "node", id: "n1", x: 479, y: 296, width: 91, height: 90 },
        { type: "node", id: "n2", x: 389, y: 118, width: 151, height: 125 },
        { type: "node", id: "n3", x: 563, y: 151, width: 116, height: 82 },
        {
          type: "connector",
          from: "n0",
          to: "n3",
          routing: "orthogonal",
        },
        {
          type: "connector",
          from: "n3",
          to: "n2",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const route = architectureSemanticSnapshot(model).elements.find(
    (element) =>
      element.type === "connector" &&
      element.from === "n0" &&
      element.to === "n3",
  );

  assert.equal(
    countImmediateBacktracks(route.points),
    0,
    `content filtering must retain a forward route: ${JSON.stringify(route.points)}`,
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
  // Built-in icons pass theme tokens directly to stroke, so CSS variables adapt
  // their colors in all four themes.
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
        // A fixed child stroke breaks theme adaptation, so allow inheritance only.
        assert.equal(shape.attributes.has("stroke"), false);
        if (shape.attributes.has("fill")) fills.add(shape.attributes.get("fill"));
      }
    }
    assert.deepEqual([...strokes], [expected], "icon strokes must come from the node text colour");
    // Fill may be only none for line art or the text color. Fixed colors break theme adaptation.
    assert.deepEqual([...fills].sort(), ["none", expected].sort());
  }
});

test("every theme keeps built-in icon strokes legible against the slide surface", async () => {
  // Built-in icons use --fg, which must contrast with --surface / --bg in each
  // of the three built-in themes.
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

  const themes = ["dark", "light", "microsoft"];
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
      // WCAG 2.1 SC 1.4.11 requires 3:1 non-text contrast for line-art icons.
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
    "assets/sample-photo.png",
    "assets/sample-profile.jpg",
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

  // href may reference only /assets/ under the loopback server. This is the final
  // defense against external URLs and data: URIs.
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

  // Do not expose asset paths in accessible names because announcing them is meaningless.
  const labels = nodes
    .filter((node) => node.attributes.get("data-architecture-type") === "node")
    .map((node) => node.attributes.get("aria-label"));
  assert.deepEqual(labels, [...assets.map((_, index) => `a${index}`), "cloud icon, builtin"]);
});

test("asset references follow a nested loopback renderer base path", () => {
  const model = parseArchitecture(
    JSON.stringify({
      elements: [
        {
          type: "node",
          id: "logo",
          x: 20,
          y: 20,
          width: 220,
          height: 120,
          icon: "assets/icons/logo.svg",
        },
      ],
    }),
  );
  const documentRef = new FakeDocument();
  documentRef.baseURI = "http://127.0.0.1:1234/session-token/?preview=1";
  const image = descendants(renderArchitectureDiagram(model, documentRef)).find(
    (node) => node.tagName === "image",
  );

  assert.equal(image.attributes.get("href"), "/session-token/assets/icons/logo.svg");
});

test("standalone images support safe fit modes, accessibility, layout, and connectors", () => {
  const model = parseArchitecture(
    JSON.stringify({
      elements: [
        {
          type: "group",
          id: "gallery",
          x: 40,
          y: 40,
          width: 1000,
          height: 420,
          layout: "row",
          children: [
            {
              type: "image",
              id: "contained",
              src: "assets/photos/contained.png",
              fit: "contain",
              ariaLabel: "Contained architecture",
            },
            {
              type: "image",
              id: "covered",
              src: "assets/photos/covered.webp",
              fit: "cover",
            },
            {
              type: "image",
              id: "stretched",
              src: "assets/photos/stretched.jpg",
              fit: "stretch",
            },
            {
              type: "connector",
              from: "contained",
              to: "covered",
              routing: "orthogonal",
            },
          ],
        },
      ],
    }),
  );
  const rendered = descendants(renderArchitectureDiagram(model, new FakeDocument()));
  const images = rendered.filter(
    (node) =>
      node.tagName === "image" &&
      !node.attributes.has("data-architecture-icon-source"),
  );
  assert.deepEqual(
    images.map((node) => node.attributes.get("href")),
    [
      "/assets/photos/contained.png",
      "/assets/photos/covered.webp",
      "/assets/photos/stretched.jpg",
    ],
  );
  assert.deepEqual(
    images.map((node) => node.attributes.get("preserveAspectRatio")),
    ["xMidYMid meet", "xMidYMid slice", "none"],
  );
  assert.ok(images.every((node) => /^url\(#architecture-image-clip-/.test(node.attributes.get("clip-path"))));

  const groups = rendered.filter(
    (node) => node.attributes.get("data-architecture-type") === "image",
  );
  assert.deepEqual(
    groups.map((node) => node.attributes.get("aria-label")),
    ["Contained architecture", "covered.webp", "stretched.jpg"],
  );
  assert.ok(
    rendered.some(
      (node) =>
        node.attributes.get("data-architecture-type") === "connector" &&
        node.attributes.get("aria-label") === "Contained architecture to covered.webp",
    ),
  );

  const snapshot = architectureSemanticSnapshot(model);
  assert.deepEqual(
    snapshot.elements
      .filter((element) => element.type === "image")
      .map(({ id, src, fit }) => ({ id, src, fit })),
    [
      { id: "contained", src: "assets/photos/contained.png", fit: "contain" },
      { id: "covered", src: "assets/photos/covered.webp", fit: "cover" },
      { id: "stretched", src: "assets/photos/stretched.jpg", fit: "stretch" },
    ],
  );
});

test("standalone images reject unsafe sources and unknown fit modes", () => {
  for (const src of [
    "https://example.com/image.png",
    "data:image/png;base64,AA==",
    "../assets/image.png",
    "/assets/image.png",
    "assets/../image.png",
    "assets/image.gif",
  ]) {
    assert.throws(
      () =>
        parseArchitecture(
          JSON.stringify({
            elements: [
              {
                type: "image",
                id: "hero",
                src,
                x: 0,
                y: 0,
                width: 320,
                height: 180,
              },
            ],
          }),
        ),
      /elements\[0\]\.src: must be a path under assets\//,
    );
  }
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            {
              type: "image",
              id: "hero",
              src: "assets/hero.png",
              fit: "tile",
              x: 0,
              y: 0,
              width: 320,
              height: 180,
            },
          ],
        }),
      ),
    /elements\[0\]\.fit: must be one of: contain, cover, stretch/,
  );
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
  for (const label of ["Event".repeat(40), "W".repeat(100), "m".repeat(100)]) {
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
    const labelGroup = descendants(wrapper).find(
      (node) => node.attributes.get("data-architecture-connector-label") === "left-right",
    );
    const background = labelGroup.children.find((node) => node.tagName === "rect");
    const text = labelGroup.children.find((node) => node.tagName === "text");
    assert.equal(text.textContent.endsWith("…"), true);
    assert.ok(Number(background.attributes.get("width")) <= 560);
    const connector = descendants(wrapper).find(
      (node) => node.attributes.get("data-architecture-connector") === "left-right",
    );
    assert.equal(connector.attributes.get("aria-label"), `left to right: ${label}`);
  }
});

test("connector labels default in front of boxes and can retain the connector z-order", () => {
  const render = (labelLayer) => {
    const connector = {
      type: "connector",
      from: "left",
      to: "right",
      label: "calls",
      routing: "straight",
      ...(labelLayer ? { labelLayer } : {}),
    };
    const model = parseArchitecture(
      JSON.stringify({
        version: 1,
        elements: [
          { type: "node", id: "left", x: 100, y: 100, width: 200, height: 100 },
          { type: "node", id: "right", x: 700, y: 100, width: 200, height: 100 },
          connector,
        ],
      }),
    );
    const svg = renderArchitectureDiagram(model, new FakeDocument()).children.find(
      (node) => node.tagName === "svg",
    );
    const connectorGroup = svg.children.find(
      (node) => node.attributes.get("data-architecture-connector") === "left-right",
    );
    const rightBox = svg.children.find(
      (node) => node.attributes.get("data-architecture-id") === "right",
    );
    const labelGroup = descendants(svg).find(
      (node) => node.attributes.get("data-architecture-connector-label") === "left-right",
    );
    return { model, svg, connectorGroup, rightBox, labelGroup };
  };

  const front = render();
  assert.equal(
    front.model.elements.find((element) => element.type === "connector").labelLayer,
    "front",
  );
  assert.ok(front.svg.children.indexOf(front.labelGroup) > front.svg.children.indexOf(front.rightBox));
  assert.equal(front.connectorGroup.children.includes(front.labelGroup), false);

  const behind = render("behind");
  assert.equal(
    behind.model.elements.find((element) => element.type === "connector").labelLayer,
    "behind",
  );
  assert.equal(behind.connectorGroup.children.includes(behind.labelGroup), true);
  assert.ok(
    behind.svg.children.indexOf(behind.connectorGroup) <
      behind.svg.children.indexOf(behind.rightBox),
  );
});

test("rejects unsupported connector label layers", () => {
  assert.throws(
    () =>
      parseArchitecture(
        JSON.stringify({
          elements: [
            { type: "node", id: "left", x: 0, y: 0, width: 100, height: 100 },
            { type: "node", id: "right", x: 300, y: 0, width: 100, height: 100 },
            {
              type: "connector",
              from: "left",
              to: "right",
              label: "calls",
              labelLayer: "middle",
            },
          ],
        }),
      ),
    /elements\[2\]\.labelLayer: must be one of: front, behind/,
  );
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
        // Endpoint without text or title; fall back to its ID.
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

  // Announce visible text rather than IDs such as svc-a1 / db-primary.
  assert.equal(labelOf("svc-a1-db-primary"), "Checkout service to Order database: writes");
  // Groups use title; only endpoints without visible labels retain IDs.
  assert.equal(labelOf("zone-a1-cache-x9"), "Trusted zone to cache-x9");
  // An explicit ariaLabel continues to override the complete name.
  assert.equal(labelOf("svc-a1-cache-x9"), "custom wording wins");

  // data-architecture-connector must retain IDs because editing mode and existing
  // regression tests locate elements through this attribute.
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
      /duplicates 'dup'; give every node, group, and image a unique id/,
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
    // Added in Phase 3 to expose routing degradation in machine-readable form.
    // This diagram routes cleanly, so degraded is false.
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
// Rendering quality: protect crossing minimization, label-area awareness,
// hierarchical layout, and deterministic author-visible behavior on budget exhaustion.

// Measure complete-diagram quality, including both crossings and label collisions.
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

  const result = {
    crossings: 0,
    nodeHits: 0,
    labelHits: 0,
    backtracks: 0,
    degraded: snapshot.routing.degraded,
  };
  for (let index = 0; index < connectors.length; index += 1) {
    const current = connectors[index];
    const excluded = new Set([current.from, current.to]);
    result.backtracks += countImmediateBacktracks(current.points);
    for (const node of nodes) {
      if (!excluded.has(node.id) && routeIntersectsNode(current.points, node)) result.nodeHits += 1;
    }
    // Labels sit at route midpoints. Actual size is known only during rendering,
    // so use a conservative maximum width and test only whether they cover nodes.
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

// Dense diagram without manual polylines: grid nodes with intentionally crossing connectors.
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
// Twelve nodes and fourteen connectors intentionally producing near-all-pairs crossings.
const CRISSCROSS_NODE_PAIRS = [
  [0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10], [6, 3],
  [7, 2], [8, 1], [9, 0], [10, 5], [11, 4], [0, 5], [2, 11],
];
const CROSSING_GUARD_NODE_PAIRS = [
  [3, 2], [3, 8], [6, 5], [4, 3], [4, 6], [3, 7], [3, 1],
  [1, 2], [6, 7], [6, 4], [4, 5], [0, 4], [0, 7],
];

function crossingGuardDiagram() {
  const ids = Array.from({ length: 9 }, (_, index) => `n${index}`);
  const elements = ids.map((id, index) => ({
    type: "node",
    id,
    text: id,
    x: 90 + (index % 3) * 470,
    y: 100 + Math.floor(index / 3) * 260,
    width: 280,
    height: 100,
  }));
  for (const [from, to] of CROSSING_GUARD_NODE_PAIRS) {
    elements.push({
      type: "connector",
      from: ids[from],
      to: ids[to],
      routing: "orthogonal",
      label: `${from}-${to}`,
    });
  }
  return JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements,
  });
}

function unavoidableLabelDiagram({ label = true } = {}) {
  return JSON.stringify({
    version: 1,
    canvas: { width: 1600, height: 900 },
    elements: [
      { type: "node", id: "source", x: 50, y: 430, width: 120, height: 40 },
      { type: "node", id: "target", x: 1430, y: 430, width: 120, height: 40 },
      {
        type: "node",
        id: "top-wall",
        x: 0,
        y: 0,
        width: 1600,
        height: 431.45,
      },
      {
        type: "node",
        id: "bottom-wall",
        x: 0,
        y: 468.55,
        width: 1600,
        height: 431.45,
      },
      {
        type: "connector",
        from: "source",
        to: "target",
        routing: "orthogonal",
        ...(label ? { label: "unavoidable label" } : {}),
      },
    ],
  });
}

test("dense 9-node diagrams route around every node without manual polylines", () => {
  const quality = measureQuality(
    denseDiagram({ columns: 3, rows: 3, pairs: NINE_NODE_PAIRS }),
  );
  // A route penetrating a node breaks the diagram; this must be zero.
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.labelHits, 0);
  assert.equal(quality.backtracks, 0);
  assert.equal(quality.degraded, false);
});

test("dense 12-node diagrams never route a path through an unrelated node", () => {
  const quality = measureQuality(
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS }),
  );
  // A valid diagram has no routes penetrating nodes; this is unconditionally zero.
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.backtracks, 0);
});

test("unavoidable label collisions are reported rather than silently drawn", () => {
  // A 37.1px corridor allows 18px line clearance on each side, but a 37.2px-high
  // label does not fit. The route remains valid while the label overlaps the walls.
  const model = parseArchitecture(unavoidableLabelDiagram());
  const snapshot = architectureSemanticSnapshot(model);
  assert.equal(snapshot.routing.degraded, true);
  assert.ok(snapshot.routing.diagnostics.length > 0);
  for (const diagnostic of snapshot.routing.diagnostics) {
    // No node-penetration report should appear because the route does not penetrate one.
    assert.equal(diagnostic.kind, "label-overlaps-node");
    assert.equal(diagnostic.pathOverlaps, 0);
    assert.ok(diagnostic.labelOverlaps > 0);
  }
  // Removing the label removes degradation, letting authors confirm it is label-related.
  const unlabelled = architectureSemanticSnapshot(
    parseArchitecture(unavoidableLabelDiagram({ label: false })),
  );
  assert.equal(unlabelled.routing.degraded, false);
});

test("global refinement lowers crossings below the greedy-only result", () => {
  // Count crossings as intersection points. Rerouting acceptance guarantees this
  // exact value never increases, so test the same value.
  //
  // With 180-degree reversals and endpoint re-entry prohibited and opposing stubs
  // constrained to their forward region, sequential placement alone yields 29
  // crossings. Rerouting reduces this to 28. The limit of 28 always fails when
  // rerouting is disabled.
  const quality = measureQuality(
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS }),
  );
  assert.ok(
    quality.crossings <= 28,
    `expected refinement to keep crossings at or below 28, got ${quality.crossings}`,
  );
  assert.equal(quality.backtracks, 0);
});

test("refinement never trades a crossing away for label placement", () => {
  // Rerouting requires more than lower total cost; reject it if crossings increase.
  // Without this guard, the 24,000 penalty for a label hiding a node outweighs an
  // approximately 10,000 crossing and permits extra crossings to avoid labels.
  //
  // Measured on a crossing diagram with 9 nodes / 13 connectors, including 2px label borders:
  //   with guard 24 / without guard 25
  // The limit of 24 always fails when the guard is removed.
  const quality = measureQuality(crossingGuardDiagram());
  assert.ok(
    quality.crossings <= 24,
    `expected the crossing guard to hold crossings at or below 24, got ${quality.crossings}`,
  );
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.backtracks, 0);
});

test("routing avoids parking a connector label on top of an unrelated node", () => {
  // A blocker lies on the shortest src -> dst route. Without label-area awareness,
  // the label covers the blocker.
  //
  // This single-connector case still passes with ROUTE_COST_LABEL_OVER_NODE set to
  // zero. The 1,000,000 node-penetration cost alone selects a route around the
  // blocker, naturally placing the label in empty space. The crisscross test below
  // proves the independent effect of label cost.
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
  // Prove label-area-aware routing independently affects dense diagrams.
  //
  // Adding labels to the 12-node / 14-connector all-pairs crossing diagram leaves
  // one label covering a node under the normal crossing guard. The guard permits
  // one extra crossing when it reduces hidden content, and
  // ROUTE_COST_LABEL_OVER_NODE motivates that reroute.
  //
  // Measured with labeled crisscross:
  //   label cost 24,000 -> crossings 22 / hidden 0
  //   label cost 0      -> crossings 21 / hidden 1
  // This is the intended trade: one extra crossing makes one node readable.
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
  // Grid search stops when candidates on either axis exceed
  // MAX_ROUTING_GRID_COORDINATES. Previously this silently rendered a route through a node.
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
  // Preserve budget exhaustion as the termination reason. Collapsing it to
  // no-clean-candidate prevents authors from distinguishing poor placement from abandoned search.
  assert.equal(diagnostic.reason, ROUTE_FALLBACK_REASONS.gridTooLarge);
  assert.ok(diagnostic.pathOverlaps > 0);
  assert.ok(diagnostic.sourcePath.startsWith("elements["));

  // Output remains deterministic even when degraded.
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

  // Do not throw, avoiding a breaking change; the diagram continues rendering.
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
  // Convert FakeElement to a stable string for comparison. Only <n> in
  // architecture-{title,description,arrow}-<n> derives from renderSequence and
  // intentionally increases to prevent ID collisions among multiple diagrams on
  // one page, an existing mechanism since main. Mask it here. The adjacent
  // architectureSemanticSnapshot test protects geometry determinism itself.
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
  // Parse identical input twice and require exact route-point equality.
  // Breaking this makes visual regression tests unstable.
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
  // Declaration order is sink -> middle -> source, but hierarchy is source -> middle -> sink.
  assert.ok(byId.get("source").y < byId.get("middle").y);
  assert.ok(byId.get("middle").y < byId.get("sink").y);
  // down is the default, so x aligns; each rank contains one centered node.
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
// ---------------------------------------------------------------- Phase 7
// Put shipped diagrams themselves behind a quality gate.
//
// Phase 3 quality tests measure only the **synthetic diagram** built by
// `denseDiagram()`. Synthetic diagrams catch algorithm regressions but not broken
// diagrams that users actually see.
//
// Visual regression renders representative diagrams but checks only pixels and
// zero `.architecture-error` elements. **Even regression to routes penetrating
// nodes passes after refreshing the baseline.** No prior repository test inspected
// `data-architecture-routing` or `routing.degraded`.
//
// The acceptance criterion requiring deterministic output for dense diagrams with
// 8–12 nodes is meaningful only when grounded in shipped content, so enforce it here.
//
// Limitation: **shipped diagrams have enough whitespace that even completely
// disabling route avoidance** (zeroing the node-penetration penalty in `routeCost`
// or removing obstacles from `gridRoute`) does not cause penetration in measured
// output. Scanning shipped diagrams alone cannot detect dead degradation checks.
// The tests below first run a synthetic diagram that always degrades and a polyline
// that always penetrates as canaries, proving the checks work before inspecting
// shipped diagrams.

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Excluded from scanning; synchronized with SKIP_DIRECTORIES in schema tests. */
const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "test-results",
  "playwright-report",
  "dist",
]);

const ARCHITECTURE_BLOCK = /^```architecture[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;

/**
 * Guard against passing when scanning finds nothing.
 * Every listed file must contain an architecture block.
 */
const REQUIRED_DIAGRAM_FILES = [
  path.join(".github", "extensions", "markdstage", "README.md"),
  path.join(".github", "extensions", "markdstage", "test", "fixtures", "architecture.md"),
  path.join("test", "fixtures", "architecture-visual.md"),
];

/** Currently nine blocks; fail on reductions because a representative diagram disappeared. */
const MINIMUM_SHIPPED_DIAGRAMS = 9;

async function collectShippedDiagrams() {
  const found = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const markdown = await readFile(full, "utf8");
        ARCHITECTURE_BLOCK.lastIndex = 0;
        let match;
        let index = 0;
        while ((match = ARCHITECTURE_BLOCK.exec(markdown)) !== null) {
          found.push({ file: path.relative(repoRoot, full), index, source: match[1] });
          index += 1;
        }
      }
    }
  };
  await walk(repoRoot);
  return found;
}

test("every architecture diagram shipped in this repository routes without degrading", async () => {
  // --- First prove the detection mechanism is active (canaries) -----------------
  // Shipped diagrams have enough whitespace that disabling route avoidance still
  // causes no penetration. Looking only at them misses a regression that disables
  // degradation detection. First run diagrams guaranteed to degrade and penetrate,
  // confirm the checks report them, and only then inspect shipped diagrams.
  const knownDegraded = architectureSemanticSnapshot(
    parseArchitecture(unavoidableLabelDiagram()),
  );
  assert.equal(
    knownDegraded.routing.degraded,
    true,
    "A diagram expected to degrade reports degraded=false; degradation detection is inactive, so later checks are meaningless",
  );
  assert.ok(knownDegraded.routing.diagnostics.length > 0);

  // Similarly prove the independent geometry check (measureQuality) counts penetration.
  const penetrating = measureQuality(
    JSON.stringify({
      version: 1,
      canvas: { width: 600, height: 300 },
      elements: [
        { type: "node", id: "a", text: "A", x: 20, y: 130, width: 80, height: 40 },
        { type: "node", id: "mid", text: "M", x: 260, y: 120, width: 80, height: 60 },
        { type: "node", id: "c", text: "C", x: 500, y: 130, width: 80, height: 40 },
        {
          type: "connector",
          from: "a",
          to: "c",
          routing: "polyline",
          points: [
            { x: 100, y: 150 },
            { x: 300, y: 150 },
            { x: 500, y: 150 },
          ],
        },
      ],
    }),
  );
  assert.ok(
    penetrating.nodeHits > 0,
    "A route through an unrelated node is counted as nodeHits=0; geometry validation is inactive",
  );

  // --- Shipped-diagram checks ---------------------------------------------------
  const diagrams = await collectShippedDiagrams();

  // Prevent a broken scan returning zero from passing through an empty loop.
  const files = new Set(diagrams.map((diagram) => diagram.file));
  for (const required of REQUIRED_DIAGRAM_FILES) {
    assert.ok(files.has(required), `Could not scan the architecture block in ${required}`);
  }
  assert.ok(
    diagrams.length >= MINIMUM_SHIPPED_DIAGRAMS,
    `Found only ${diagrams.length} architecture blocks; expected at least ${MINIMUM_SHIPPED_DIAGRAMS}`,
  );

  for (const diagram of diagrams) {
    const where = `${diagram.file}#${diagram.index}`;
    const snapshot = architectureSemanticSnapshot(parseArchitecture(diagram.source));

    // 1. Engine report: diagrams with unplaceable labels or unroutable paths appear here.
    assert.equal(snapshot.routing.degraded, false, `${where} falls back to degraded routing`);
    assert.deepEqual(snapshot.routing.diagnostics, [], `${where} reports routing diagnostics`);

    // 2. Validate geometry independently rather than trusting the engine report.
    //    A route penetrating an unrelated node breaks the diagram.
    const quality = measureQuality(diagram.source);
    assert.equal(quality.nodeHits, 0, `${where} has a route penetrating an unrelated node`);
    assert.equal(quality.labelHits, 0, `${where} has a label overlapping an unrelated node`);
    assert.equal(
      quality.backtracks,
      0,
      `${where} has a 180-degree route reversal that resembles a disconnected line`,
    );
  }
});

test("shipped diagrams stay deterministic across independent parses", async () => {
  const diagrams = await collectShippedDiagrams();
  assert.ok(diagrams.length >= MINIMUM_SHIPPED_DIAGRAMS);

  for (const diagram of diagrams) {
    // Parse identical source twice and require exact route-point equality.
    // Breaking this causes unexplained visual-regression instability.
    const first = architectureSemanticSnapshot(parseArchitecture(diagram.source));
    const second = architectureSemanticSnapshot(parseArchitecture(diagram.source));
    assert.deepEqual(second, first, `${diagram.file}#${diagram.index} output is not deterministic`);
  }
});

test("a shipped diagram actually covers the 8-12 node dense case", async () => {
  // Require shipped content to meet the scale named by the acceptance criteria.
  // Otherwise reducing a representative diagram to three nodes leaves both checks passing.
  const diagrams = await collectShippedDiagrams();
  const dense = [];
  for (const diagram of diagrams) {
    const model = parseArchitecture(diagram.source);
    const snapshot = architectureSemanticSnapshot(model);
    const nodes = snapshot.elements.filter((element) => element.type === "node").length;
    const connectors = snapshot.elements.filter((element) => element.type === "connector").length;
    // Manual polyline routes are author-defined and do not demonstrate automatic
    // routing. The parser populates `points` on every connector, so inspect `routing`.
    const manual = model.elements.filter(
      (element) => element.type === "connector" && element.routing === "polyline",
    ).length;
    if (nodes >= 8 && nodes <= 12 && connectors >= 10 && manual === 0) {
      dense.push(`${diagram.file}#${diagram.index}`);
    }
  }
  assert.ok(
    dense.length > 0,
    "No shipped diagram routes 8–12 nodes and at least 10 connectors without manual polylines",
  );
});

// --- Issue #22: A label hides its own line and arrowhead ---

/** Build a one-connector diagram and return measurable route and label bounds. */
function labeledConnector({ label = "HTML", gap = 60, routing = "orthogonal", ...rest } = {}) {
  const elements = [
    { type: "node", id: "a", x: 400, y: 400, width: 220, height: 110, text: "A" },
    { type: "node", id: "b", x: 400 + 220 + gap, y: 400, width: 220, height: 110, text: "B" },
    { type: "connector", from: "a", to: "b", label, routing, ...rest },
  ];
  const model = parseArchitecture(
    JSON.stringify({ version: 1, canvas: { width: 1600, height: 900 }, elements }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const index = model.elements.findIndex((element) => element.type === "connector");
  const connector = model.elements[index];
  const points = snapshot.elements[index].points;
  return { model, snapshot, connector, points, box: connectorLabelBox(connector, points) };
}

test("connector label no longer hides its own line and arrowhead", () => {
  // Issue #22 reproduction. The label has a 70px minimum width, so a centered
  // frame completely covered the 32px visible line left by a 60px gap minus 14px at each end.
  const { connector, points, box } = labeledConnector({ gap: 60 });
  assert.ok(box, "Label bounds were not calculated");
  const visible = routeLengthOutsideBox(points, box);
  const expectedVisible = Math.min(MIN_VISIBLE_ROUTE_LENGTH, polylineLength(points));
  assert.ok(
    visible >= expectedVisible - 0.001,
    `Label covers its own route: visible length ${visible.toFixed(2)} < ${expectedVisible}`,
  );
  assert.equal(
    boxesOverlap(box, terminalMarkerBounds(connector, points)),
    false,
    `Label covers the arrowhead's two-dimensional area: ${JSON.stringify(box)}`,
  );
});

test("label anchor stays on the midpoint when the line has room", () => {
  // Move a label only when it hides content; preserve appearance when space is sufficient.
  const { connector, points } = labeledConnector({ gap: 420 });
  const anchor = connectorLabelAnchor(connector, points);
  const midpoint = pointAtHalfLength(points);
  assert.equal(anchor.escaped, false);
  assert.ok(Math.abs(anchor.x - midpoint.x) < 1e-9, "Label moved horizontally despite sufficient space");
  assert.ok(Math.abs(anchor.y - midpoint.y) < 1e-9, "Label moved vertically despite sufficient space");
});

test("label escapes perpendicular to its own segment", () => {
  // Move away vertically from horizontal lines and horizontally from vertical lines.
  // Moving along the line does not change overlap, so normal direction is essential.
  const horizontal = labeledConnector({ gap: 60, arrow: false });
  const midpoint = pointAtHalfLength(horizontal.points);
  const anchor = connectorLabelAnchor(horizontal.connector, horizontal.points);
  assert.equal(anchor.escaped, true);
  assert.ok(Math.abs(anchor.x - midpoint.x) < 1e-9, "Label escaped horizontally from a horizontal line");
  assert.ok(Math.abs(anchor.y - midpoint.y) > 1, "Label did not escape vertically from a horizontal line");
  // The frame edge remains CONNECTOR_LABEL_CLEARANCE away from the line.
  const clearance = Math.abs(anchor.y - midpoint.y) - horizontal.box.height / 2;
  assert.ok(
    Math.abs(clearance - CONNECTOR_LABEL_CLEARANCE) < 1e-9,
    `Line clearance ${clearance} does not equal ${CONNECTOR_LABEL_CLEARANCE}`,
  );
});

test("escaped labels stay inside the canvas near folded edge routes", () => {
  const canvas = { width: 1518, height: 550 };
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas,
      elements: [
        { type: "node", id: "source", x: 0, y: 180, width: 40, height: 100 },
        { type: "node", id: "target", x: 60, y: 180, width: 40, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          label: "a",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const points = [
    { x: 47, y: 231 },
    { x: 5, y: 231 },
    { x: 5, y: 223 },
    { x: 53.5, y: 223 },
  ];
  const box = connectorLabelBox(connector, points, canvas);

  assert.ok(box.x >= 0, `label escaped beyond the left edge: ${JSON.stringify(box)}`);
  assert.ok(
    box.x + box.width <= canvas.width,
    `label escaped beyond the right edge: ${JSON.stringify(box)}`,
  );
  assert.ok(box.y >= 0 && box.y + box.height <= canvas.height);
});

test("near-edge arrowless labels prefer the escape side that already fits", () => {
  const canvas = { width: 320, height: 180 };
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas,
      elements: [
        { type: "node", id: "source", x: 0, y: 20, width: 40, height: 40 },
        { type: "node", id: "target", x: 45, y: 20, width: 40, height: 40 },
        {
          type: "connector",
          from: "source",
          to: "target",
          label: "a",
          arrow: false,
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const points = [{ x: 40, y: 40 }, { x: 45, y: 40 }];
  const box = connectorLabelBox(connector, points, canvas);
  const clearance = box.y - points[0].y;

  assert.ok(
    clearance >= CONNECTOR_LABEL_CLEARANCE - 0.001,
    `contained escape side lost its line clearance: ${clearance}`,
  );
});

test("wide labels try another route axis before clamping over their route", () => {
  const canvas = { width: 560, height: 298 };
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas,
      elements: [
        { type: "node", id: "source", x: 100, y: 100, width: 100, height: 100 },
        { type: "node", id: "target", x: 360, y: 100, width: 100, height: 100 },
        {
          type: "connector",
          from: "source",
          to: "target",
          label: "publishes events to the terminal service",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const points = [
    { x: 222, y: 154 },
    { x: 285.5, y: 154 },
    { x: 285.5, y: 142 },
    { x: 349, y: 142 },
  ];
  const box = connectorLabelBox(connector, points, canvas);
  const visible = routeLengthOutsideBox(points, box);
  const expectedVisible = Math.min(MIN_VISIBLE_ROUTE_LENGTH, polylineLength(points));

  assert.ok(box.x >= 0 && box.y >= 0);
  assert.ok(box.x + box.width <= canvas.width && box.y + box.height <= canvas.height);
  assert.ok(
    visible >= expectedVisible - 0.001,
    `clamped label hides its route: ${visible} < ${expectedVisible}`,
  );
  assert.equal(
    boxesOverlap(box, terminalMarkerBounds(connector, points)),
    false,
    `clamped label covers the terminal marker: ${JSON.stringify(box)}`,
  );
});

test("single-axis routes can move wide labels beyond an endpoint", () => {
  const canvas = { width: 504, height: 400 };
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas,
      elements: [
        { type: "node", id: "source", x: 200, y: 185, width: 100, height: 100 },
        { type: "node", id: "target", x: 200, y: 20, width: 100, height: 111 },
        {
          type: "connector",
          from: "source",
          to: "target",
          label: "publishes events to the terminal service",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const snapshot = architectureSemanticSnapshot(model);
  const index = model.elements.findIndex((element) => element.type === "connector");
  const connector = model.elements[index];
  const points = snapshot.elements[index].points;
  const box = connectorLabelBox(connector, points, canvas);

  assert.equal(routeLengthOutsideBox(points, box), polylineLength(points));
  assert.equal(
    boxesOverlap(box, terminalMarkerBounds(connector, points)),
    false,
    `label covers the terminal marker: ${JSON.stringify(box)}`,
  );
  assert.equal(snapshot.routing.degraded, false);
});

test("impossible label placement is reported instead of silently hiding the connector", () => {
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas: { width: 320, height: 180 },
      elements: [
        { type: "node", id: "source", x: 20, y: 70, width: 100, height: 40 },
        { type: "node", id: "target", x: 146, y: 70, width: 100, height: 40 },
        {
          type: "connector",
          from: "source",
          to: "target",
          fromPort: "right",
          toPort: "left",
          label: "WW",
          routing: "orthogonal",
          style: { fontSize: 160 },
        },
      ],
    }),
  );
  const snapshot = architectureSemanticSnapshot(model);

  assert.equal(snapshot.routing.degraded, true);
  assert.equal(snapshot.routing.diagnostics.length, 1);
  assert.equal(snapshot.routing.diagnostics[0].kind, "label-overlaps-route");
  assert.equal(
    snapshot.routing.diagnostics[0].reason,
    ROUTE_FALLBACK_REASONS.labelPlacementImpossible,
  );
  assert.ok(
    snapshot.routing.diagnostics[0].routeVisible <
      snapshot.routing.diagnostics[0].requiredRouteVisible,
  );
});

test("escaped labels keep the terminal marker footprint visible", () => {
  const canvas = { width: 1518, height: 550 };
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas,
      elements: [
        { type: "node", id: "source", x: 300, y: 140, width: 60, height: 80 },
        { type: "node", id: "target", x: 730, y: 120, width: 60, height: 80 },
        {
          type: "connector",
          from: "source",
          to: "target",
          label: "publishes events to the terminal service",
          routing: "orthogonal",
          style: { strokeWidth: 8 },
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const points = [
    { x: 377, y: 186.5 },
    { x: 545.5, y: 186.5 },
    { x: 545.5, y: 160.5 },
    { x: 714, y: 160.5 },
  ];
  const box = connectorLabelBox(connector, points, canvas);

  assert.equal(
    boxesOverlap(box, terminalMarkerBounds(connector, points)),
    false,
    `label covers the scaled terminal marker: ${JSON.stringify(box)}`,
  );
});

test("connector labels are capped to the canvas dimensions", () => {
  const canvas = { width: 320, height: 180 };
  const model = parseArchitecture(
    JSON.stringify({
      version: 1,
      canvas,
      elements: [
        { type: "node", id: "source", x: 10, y: 60, width: 40, height: 60 },
        { type: "node", id: "target", x: 270, y: 60, width: 40, height: 60 },
        {
          type: "connector",
          from: "source",
          to: "target",
          label:
            "this connector label is intentionally much wider than the small canvas",
          routing: "orthogonal",
        },
      ],
    }),
  );
  const connector = model.elements.find((element) => element.type === "connector");
  const points = [
    { x: 64, y: 90 },
    { x: 256, y: 90 },
  ];
  const box = connectorLabelBox(connector, points, canvas);

  assert.ok(box.x >= 0 && box.x + box.width <= canvas.width);
  assert.ok(box.y >= 0 && box.y + box.height <= canvas.height);
});

test("pointAtHalfLength reports a unit direction, including the degenerate span", () => {
  const { points } = labeledConnector({ gap: 60 });
  const midpoint = pointAtHalfLength(points);
  assert.ok(midpoint.direction, "No direction returned");
  const length = Math.hypot(midpoint.direction.x, midpoint.direction.y);
  assert.ok(Math.abs(length - 1) < 1e-9, `Direction is not a unit vector: ${length}`);
  // Return a default direction so a normal can be determined for a zero-length route.
  const degenerate = pointAtHalfLength([{ x: 10, y: 20 }, { x: 10, y: 20 }]);
  assert.ok(degenerate.direction, "No direction returned for a zero-length route");
  assert.equal(Math.hypot(degenerate.direction.x, degenerate.direction.y), 1);
});

test("the rendered label matches the box used for routing", () => {
  // routeCost measures label bounds, so a mismatch between rendered and routing
  // positions draws labels where routing intended to avoid them. Require equality.
  const { model, connector, points, box } = labeledConnector({ gap: 60 });
  const document = new FakeDocument();
  const svg = renderArchitectureDiagram(model, document);
  const labels = descendants(svg).filter(
    (node) => node.tagName === "text" && node.textContent === "HTML",
  );
  assert.equal(labels.length, 1, "Exactly one label text element was not rendered");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  assert.ok(
    Math.abs(Number(labels[0].attributes.get("x")) - centerX) < 1e-9 &&
      Math.abs(Number(labels[0].attributes.get("y")) - centerY) < 1e-9,
    "Rendered label position does not match the center of the frame used for routing",
  );
  // Also confirm it was moved; a midpoint would not exercise the invariant.
  assert.equal(connectorLabelAnchor(connector, points).escaped, true);
});

test("orthogonal labels never cover their own route across a generated space", () => {
  // Verify across a generated placement space that label escape is not a one-off fix.
  // This justifies omitting diagnostics, so one representative case is insufficient.
  const ports = ["auto", "top", "right", "bottom", "left"];
  let checked = 0;
  let worst = Infinity;
  let worstCase = null;
  let backtrackingCase = null;
  let collapsedCase = null;
  for (const fromPort of ports) {
    for (const toPort of ports) {
      for (const dx of [-320, -200, -120, -40, 0, 40, 120, 200, 320]) {
        for (const dy of [-320, -200, -80, 0, 80, 200, 320]) {
          for (const label of ["a", "HTML", "publishes events"]) {
            const endpointsOverlap = Math.abs(dx) < 220 && Math.abs(dy) < 110;
            const elements = [
              { type: "node", id: "a", x: 600, y: 380, width: 220, height: 110, text: "A" },
              { type: "node", id: "b", x: 600 + dx, y: 380 + dy, width: 220, height: 110, text: "B" },
              { type: "node", id: "c", x: 900, y: 200, width: 260, height: 400, text: "C" },
              { type: "connector", from: "a", to: "b", label, routing: "orthogonal", fromPort, toPort },
            ];
            const model = parseArchitecture(
              JSON.stringify({ version: 1, canvas: { width: 1600, height: 900 }, elements }),
            );
            const snapshot = architectureSemanticSnapshot(model);
            const index = model.elements.findIndex((element) => element.type === "connector");
            const points = snapshot.elements[index].points;
            if (!points || points.length < 2) {
              if (!endpointsOverlap && !collapsedCase) {
                collapsedCase = { fromPort, toPort, dx, dy, label, points };
              }
              continue;
            }
            if (
              !endpointsOverlap &&
              !backtrackingCase &&
              countImmediateBacktracks(points) > 0
            ) {
              backtrackingCase = { fromPort, toPort, dx, dy, label, points };
            }
            const box = connectorLabelBox(model.elements[index], points);
            if (!box) continue;
            const visible = routeLengthOutsideBox(points, box);
            const expectedVisible = Math.min(
              MIN_VISIBLE_ROUTE_LENGTH,
              polylineLength(points),
            );
            const margin = visible - expectedVisible;
            checked++;
            if (margin < worst) {
              worst = margin;
              worstCase = {
                fromPort,
                toPort,
                dx,
                dy,
                label,
                visible,
                expectedVisible,
                points,
                box,
              };
            }
          }
        }
      }
    }
  }
  // Guard against a reduced scan that passes trivially.
  assert.ok(checked > 4000, `Only ${checked} placements were checked`);
  assert.ok(
    worst >= -0.001,
    `A placement is ${(-worst).toFixed(2)}px short of required visible length: ${JSON.stringify(worstCase)}`,
  );
  assert.equal(
    backtrackingCase,
    null,
    `A placement reverses 180 degrees: ${JSON.stringify(backtrackingCase)}`,
  );
  assert.equal(
    collapsedCase,
    null,
    `A placement has a route without segments: ${JSON.stringify(collapsedCase)}`,
  );
});
