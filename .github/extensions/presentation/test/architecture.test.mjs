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
  assert.ok(source, "slides.md の Dense service routing 図が見つからない");

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
      `${edge} に未接続線のように見える180度折り返しがある: ${JSON.stringify(planned.points)}`,
    );

    const connector = modelConnectors.find(
      (element) => element.from === planned.from && element.to === planned.to,
    );
    const standalone = computeConnectorRoute(connector, lookup, model.canvas);
    assert.ok(
      polylineLength(planned.points) <= polylineLength(standalone) * 3 + 0.001,
      `${edge} が単独経路の3倍を超えて迂回している: ` +
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
  // 経路がノードを貫通したら図として破綻している。ここは 0 でなければならない。
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.labelHits, 0);
  assert.equal(quality.backtracks, 0);
  assert.equal(quality.degraded, false);
});

test("dense 12-node diagrams never route a path through an unrelated node", () => {
  const quality = measureQuality(
    denseDiagram({ columns: 4, rows: 3, pairs: TWELVE_NODE_PAIRS }),
  );
  // 「破綻しない」の定義は経路がノードを貫通しないこと。ここは無条件に 0。
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.backtracks, 0);
});

test("unavoidable label collisions are reported rather than silently drawn", () => {
  // 37.1px の通路は線の 18px clearance を両側に確保できるが、37.2px 高の
  // ラベルは収まらない。経路自体は健全でもラベルは上下の wall に乗る。
  const model = parseArchitecture(unavoidableLabelDiagram());
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
    parseArchitecture(unavoidableLabelDiagram({ label: false })),
  );
  assert.equal(unlabelled.routing.degraded, false);
});

test("global refinement lowers crossings below the greedy-only result", () => {
  // 交差の数え方は「交差点の個数」。再配線の受理条件がまさにこの値を
  // 増やさないことを保証しているので、テストもこの値で見る。
  //
  // 180度折り返しと端点再貫通を認めず、向かい合うスタブを前方範囲へ収める状態では、
  // 逐次配置だけだと 29 交差になる。再配線が効いていれば 28 まで下がる。上限 28 は
  // 「再配線を無効化すると必ず落ちる」位置に置いてある。
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
  // 再配線は「総コストが下がる」だけでは採用しない。交差が増えるなら棄却する。
  // このガードが無いと、ラベル penalty（ノードを隠す = 24,000）が交差
  // （約 10,000）より重いせいで、ラベルを避けるために交差を増やす取引が通る。
  //
  // 9 ノード / 13 connector の交差図での実測（2px のラベル枠まで含む）:
  //   ガードあり 24 / ガードなし 25
  // 上限 24 はガードを外すと必ず落ちる位置に置いてある。
  const quality = measureQuality(crossingGuardDiagram());
  assert.ok(
    quality.crossings <= 24,
    `expected the crossing guard to hold crossings at or below 24, got ${quality.crossings}`,
  );
  assert.equal(quality.nodeHits, 0);
  assert.equal(quality.backtracks, 0);
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
// ---------------------------------------------------------------- Phase 7
// 「出荷する図」そのものを品質ゲートに載せる。
//
// Phase 3 の品質テストが測っているのは `denseDiagram()` が組み立てる **合成図**
// だけである。合成図はアルゴリズムの退行を捕まえるが、「利用者が実際に目にする図」
// が壊れたことは捕まえない。
//
// ビジュアル回帰は代表図を描画しているが、その判定はピクセル比較と
// `.architecture-error` が 0 件であることだけで、**経路がノードを貫通する形に
// 退行してもベースラインを撮り直せば緑になる**。実際 `data-architecture-routing`
// や `routing.degraded` を検査するテストはリポジトリのどこにも無かった。
//
// 受け入れ基準「8〜12 ノード規模および密な図で決定的な出力になる」の根拠は
// 合成図ではなく出荷物でなければ意味がないので、ここで固定する。
//
// ただし正直に書いておく。**出荷図は余白が十分にあり、経路回避を完全に無効化
// （`routeCost` のノード貫通ペナルティを 0 にする／`gridRoute` の障害物を空にする）
// しても貫通は起きない**ことを実測で確認した。したがって出荷図の走査だけでは
// 「劣化検出が死んだ」退行を捕まえられない。そのため下のテストは、必ず劣化する
// 合成図と必ず貫通する polyline をカナリアとして先に通し、判定側が生きている
// ことを確かめてから出荷図を検査する構成にしている。

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** 走査対象外。schema テストの SKIP_DIRECTORIES と揃えている。 */
const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "test-results",
  "playwright-report",
  "dist",
]);

const ARCHITECTURE_BLOCK = /^```architecture[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;

/**
 * 走査が何も拾わなくても緑になる事故を防ぐ番人。
 * ここに挙げたファイルは architecture ブロックを必ず持っている。
 */
const REQUIRED_DIAGRAM_FILES = [
  path.join(".github", "extensions", "presentation", "README.md"),
  path.join(".github", "extensions", "presentation", "test", "fixtures", "architecture.md"),
  path.join("test", "fixtures", "architecture-visual.md"),
];

/** 現状 9 ブロック。減る方向は「代表図が消えた」ことなので落とす。 */
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
  // --- 検出機構そのものが生きていることを先に固定する（カナリア）---------------
  // 出荷図はどれも余白が十分で、経路回避を完全に無効化しても貫通が起きない。
  // つまり出荷図だけを見ていると「劣化を検出できなくなった」退行を見逃す。
  // そこで、必ず劣化する図・必ず貫通する図を先に通し、判定側が黙っていないことを
  // 確かめてから出荷図を検査する。
  const knownDegraded = architectureSemanticSnapshot(
    parseArchitecture(unavoidableLabelDiagram()),
  );
  assert.equal(
    knownDegraded.routing.degraded,
    true,
    "劣化するはずの図が degraded=false になっている。劣化検出が死んでいるので以降の検査は無意味",
  );
  assert.ok(knownDegraded.routing.diagnostics.length > 0);

  // 幾何の独立検算（measureQuality）も同様に、貫通を貫通と数えられることを確かめる。
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
    "無関係なノードを貫く経路を nodeHits=0 と数えている。幾何検算が死んでいる",
  );

  // --- ここから出荷図の検査 ---------------------------------------------------
  const diagrams = await collectShippedDiagrams();

  // 走査が壊れて 0 件になっても以降の for が空回りするだけで緑になる。先に塞ぐ。
  const files = new Set(diagrams.map((diagram) => diagram.file));
  for (const required of REQUIRED_DIAGRAM_FILES) {
    assert.ok(files.has(required), `${required} の architecture ブロックを走査できていない`);
  }
  assert.ok(
    diagrams.length >= MINIMUM_SHIPPED_DIAGRAMS,
    `architecture ブロックが ${diagrams.length} 件しか見つからない（${MINIMUM_SHIPPED_DIAGRAMS} 件以上のはず）`,
  );

  for (const diagram of diagrams) {
    const where = `${diagram.file}#${diagram.index}`;
    const snapshot = architectureSemanticSnapshot(parseArchitecture(diagram.source));

    // 1. エンジン自身の申告。ラベルが置けない・経路が引けない図はここに出る。
    assert.equal(snapshot.routing.degraded, false, `${where} が劣化経路にフォールバックしている`);
    assert.deepEqual(snapshot.routing.diagnostics, [], `${where} に配線診断が出ている`);

    // 2. エンジンの自己申告を鵜呑みにせず、幾何を独立に検算する。
    //    経路が無関係なノードを貫通したら図として破綻している。
    const quality = measureQuality(diagram.source);
    assert.equal(quality.nodeHits, 0, `${where} の経路が無関係なノードを貫通している`);
    assert.equal(quality.labelHits, 0, `${where} のラベルが無関係なノードに乗っている`);
    assert.equal(
      quality.backtracks,
      0,
      `${where} の経路に未接続線のように見える180度折り返しがある`,
    );
  }
});

test("shipped diagrams stay deterministic across independent parses", async () => {
  const diagrams = await collectShippedDiagrams();
  assert.ok(diagrams.length >= MINIMUM_SHIPPED_DIAGRAMS);

  for (const diagram of diagrams) {
    // 同一ソースを 2 回パースして経路点まで完全一致すること。
    // ここが崩れるとビジュアル回帰が原因不明にちらつく。
    const first = architectureSemanticSnapshot(parseArchitecture(diagram.source));
    const second = architectureSemanticSnapshot(parseArchitecture(diagram.source));
    assert.deepEqual(second, first, `${diagram.file}#${diagram.index} の出力が決定的でない`);
  }
});

test("a shipped diagram actually covers the 8-12 node dense case", async () => {
  // 受け入れ基準が名指ししている規模を、出荷物の側で満たしていることを固定する。
  // これが無いと、代表図を 3 ノードに縮めても上の 2 本は緑のままになる。
  const diagrams = await collectShippedDiagrams();
  const dense = [];
  for (const diagram of diagrams) {
    const model = parseArchitecture(diagram.source);
    const snapshot = architectureSemanticSnapshot(model);
    const nodes = snapshot.elements.filter((element) => element.type === "node").length;
    const connectors = snapshot.elements.filter((element) => element.type === "connector").length;
    // 手動 polyline は作者が経路を書いたものなので、自動配線の証跡にはならない。
    // parser は全 connector に `points` を埋めるので、判定は `routing` で行う。
    const manual = model.elements.filter(
      (element) => element.type === "connector" && element.routing === "polyline",
    ).length;
    if (nodes >= 8 && nodes <= 12 && connectors >= 10 && manual === 0) {
      dense.push(`${diagram.file}#${diagram.index}`);
    }
  }
  assert.ok(
    dense.length > 0,
    "8〜12 ノードかつ connector 10 本以上を手動 polyline なしで捌く図が出荷物に存在しない",
  );
});

// --- Issue #22: ラベルが自分の線と矢尻を覆い隠す ---

/** 単一 connector の図を組み立て、経路とラベル枠を実測できる形で返す。 */
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
  // Issue #22 の再現配置。ラベル枠には 70px の下限があるため、
  // gap 60 から両端 14px を差し引いた 32px の可視線を中央配置の枠が覆い切っていた。
  const { connector, points, box } = labeledConnector({ gap: 60 });
  assert.ok(box, "ラベル枠が算出されていない");
  const visible = routeLengthOutsideBox(points, box);
  const expectedVisible = Math.min(MIN_VISIBLE_ROUTE_LENGTH, polylineLength(points));
  assert.ok(
    visible >= expectedVisible - 0.001,
    `ラベルが自分の経路を覆っている: 可視長 ${visible.toFixed(2)} < ${expectedVisible}`,
  );
  assert.equal(
    boxesOverlap(box, terminalMarkerBounds(connector, points)),
    false,
    `ラベルが矢頭の2次元領域を覆っている: ${JSON.stringify(box)}`,
  );
});

test("label anchor stays on the midpoint when the line has room", () => {
  // 逃がすのは覆い隠すときだけ。余裕がある図の見た目を動かさないことを固定する。
  const { connector, points } = labeledConnector({ gap: 420 });
  const anchor = connectorLabelAnchor(connector, points);
  const midpoint = pointAtHalfLength(points);
  assert.equal(anchor.escaped, false);
  assert.ok(Math.abs(anchor.x - midpoint.x) < 1e-9, "余裕がある図でラベルが横に動いた");
  assert.ok(Math.abs(anchor.y - midpoint.y) < 1e-9, "余裕がある図でラベルが縦に動いた");
});

test("label escapes perpendicular to its own segment", () => {
  // 水平な線からは上下へ、垂直な線からは左右へ逃がす。線に沿って動かしても
  // 覆う範囲は変わらないので、法線方向であることがこの修正の本質になる。
  const horizontal = labeledConnector({ gap: 60, arrow: false });
  const midpoint = pointAtHalfLength(horizontal.points);
  const anchor = connectorLabelAnchor(horizontal.connector, horizontal.points);
  assert.equal(anchor.escaped, true);
  assert.ok(Math.abs(anchor.x - midpoint.x) < 1e-9, "水平な線で横方向へ逃げている");
  assert.ok(Math.abs(anchor.y - midpoint.y) > 1, "水平な線で縦方向へ逃げていない");
  // 枠の縁が線から CONNECTOR_LABEL_CLEARANCE だけ離れていること。
  const clearance = Math.abs(anchor.y - midpoint.y) - horizontal.box.height / 2;
  assert.ok(
    Math.abs(clearance - CONNECTOR_LABEL_CLEARANCE) < 1e-9,
    `線との間隔が ${clearance} で ${CONNECTOR_LABEL_CLEARANCE} と一致しない`,
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
  assert.ok(midpoint.direction, "direction を返していない");
  const length = Math.hypot(midpoint.direction.x, midpoint.direction.y);
  assert.ok(Math.abs(length - 1) < 1e-9, `direction が単位ベクトルでない: ${length}`);
  // 長さ 0 の経路でも法線を決められるよう既定の向きを返す。
  const degenerate = pointAtHalfLength([{ x: 10, y: 20 }, { x: 10, y: 20 }]);
  assert.ok(degenerate.direction, "長さ 0 の経路で direction を返していない");
  assert.equal(Math.hypot(degenerate.direction.x, degenerate.direction.y), 1);
});

test("the rendered label matches the box used for routing", () => {
  // routeCost はラベル枠でコストを測るので、描画位置と routing 位置がずれると
  // 「避けたはずの場所に描かれる」状態になる。両者が同一であることを固定する。
  const { model, connector, points, box } = labeledConnector({ gap: 60 });
  const document = new FakeDocument();
  const svg = renderArchitectureDiagram(model, document);
  const labels = descendants(svg).filter(
    (node) => node.tagName === "text" && node.textContent === "HTML",
  );
  assert.equal(labels.length, 1, "ラベルの text が 1 つ描かれていない");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  assert.ok(
    Math.abs(Number(labels[0].attributes.get("x")) - centerX) < 1e-9 &&
      Math.abs(Number(labels[0].attributes.get("y")) - centerY) < 1e-9,
    "描画されたラベル位置が routing の使う枠の中心と一致しない",
  );
  // 逃がした結果であることも確認する（中点のままなら不変条件の検証にならない）。
  assert.equal(connectorLabelAnchor(connector, points).escaped, true);
});

test("orthogonal labels never cover their own route across a generated space", () => {
  // 逃がす仕組みが「その場しのぎ」でないことを、生成した配置空間で確かめる。
  // 診断を積まずに済ませている根拠がこれなので、代表例 1 つでは足りない。
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
  // 走査が痩せて自明に通ることを防ぐ番人。
  assert.ok(checked > 4000, `検査した配置が ${checked} 件しかない`);
  assert.ok(
    worst >= -0.001,
    `必要な可視長に ${(-worst).toFixed(2)}px 足りない配置がある: ${JSON.stringify(worstCase)}`,
  );
  assert.equal(
    backtrackingCase,
    null,
    `180度折り返す配置がある: ${JSON.stringify(backtrackingCase)}`,
  );
  assert.equal(
    collapsedCase,
    null,
    `経路が線分を持たない配置がある: ${JSON.stringify(collapsedCase)}`,
  );
});
