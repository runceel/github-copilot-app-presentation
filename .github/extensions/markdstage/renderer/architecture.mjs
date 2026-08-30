const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_CANVAS = Object.freeze({ width: 1600, height: 900 });
const DSL_VERSION = 1;
const EMPTY_ARCHITECTURE_SOURCE = '{\n  "version": 1,\n  "elements": []\n}\n';
const MAX_SOURCE_LENGTH = 64 * 1024;
const MAX_ELEMENTS = 200;
const MAX_CONNECTORS = 100;
const MAX_TOTAL_TEXT = 20_000;
const MAX_DEPTH = 4;
const MAX_POINTS = 12;
const CONNECTOR_ENDPOINT_GAP = 14;
const MIN_ORTHOGONAL_ENDPOINT_SPAN = 8;
const CONNECTOR_LANE_SPACING = 52;
const MAX_CONNECTOR_LABEL_WIDTH = 560;
const CONNECTOR_LABEL_PADDING = 28;
const MIN_CONNECTOR_LABEL_WIDTH = 70;
const CONNECTOR_LABEL_STROKE_WIDTH = 2;
// Gap between a label pill and its line after moving the pill away.
const CONNECTOR_LABEL_CLEARANCE = 8;
const CONNECTOR_MARKER_VIEWBOX_SIZE = 10;
const CONNECTOR_MARKER_SIZE = 7;
const CONNECTOR_MARKER_REF_X = 9;
const CONNECTOR_MARKER_REF_Y = 5;
const CONNECTOR_MARKER_POINTS = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 10, y: 5 }),
  Object.freeze({ x: 0, y: 10 }),
]);
// Required visible line length used to decide whether to move a pill away.
//
// An arrowhead has an effective width of 28 from markerWidth 7 × the default
// markerUnits="strokeWidth" value 4, and refX 9 extends it about 25 units back
// from the endpoint. A centered pill divides the outer line roughly in half, so
// 50 units are needed to preserve 25 on one side. This also leaves 25 on the
// opposite side, but that excess is preferable to clipping an arrowhead on an
// asymmetric route.
const MIN_VISIBLE_ROUTE_LENGTH = 50;
const MIN_FONT_SIZE = 8;
const MAX_ROUTING_GRID_COORDINATES = 120;
const MAX_ROUTING_GRID_POINTS = 10_000;
const MAX_ROUTING_GRID_VISITS = 20_000;

// ---------------------------------------------------------------- Route cost
// Collapse route quality into one scalar. Widely separated magnitudes make the
// comparison effectively lexicographic: node penetration > label covering node >
// crossing > label collision > bend > length. Initial routing and later rerouting
// use the same scale, so routes change only when total cost decreases.
//
// Weighting prioritizes defects that hide content. Node penetration is highest
// because it breaks the diagram. A label covering a node hides text and outweighs
// a crossing. One crossing yields 100 from routeInteractionScore, for an effective
// 10,000. Label-to-label and label-to-line overlap impairs reading but preserves
// information, so it carries less weight than a crossing.
const ROUTE_COST_NODE_HIT = 1_000_000;
const ROUTE_COST_INTERACTION = 100;
const ROUTE_COST_LABEL_OVER_NODE = 24_000;
const ROUTE_COST_LABEL_OVER_LABEL = 4_000;
const ROUTE_COST_LABEL_OVER_ROUTE = 2_000;
const ROUTE_COST_BEND = 30;
// Threshold that prevents floating-point error from being mistaken for improvement.
const ROUTE_IMPROVEMENT_EPSILON = 0.5;
// Prevent routes from detouring near the diagram boundary to avoid crossings and
// looking like unrelated lines. Within this range, fewer crossings still take priority.
const MAX_ROUTE_DETOUR_RATIO = 3;
// Rip-up-and-reroute limit, providing a deterministic termination budget.
const MAX_ROUTE_REFINEMENT_PASSES = 3;
const MAX_ROUTE_REFINEMENT_REROUTES = 600;

// Routing degradation reasons, mapped one-to-one to author-facing messages.
const ROUTE_FALLBACK_REASONS = Object.freeze({
  gridTooLarge: "grid-too-large",
  gridVisitBudget: "grid-visit-budget",
  gridUnreachable: "grid-unreachable",
  endpointBlocked: "endpoint-blocked",
  invalidEndpointGeometry: "invalid-endpoint-geometry",
  labelPlacementImpossible: "label-placement-impossible",
  noCleanCandidate: "no-clean-candidate",
});
const ROUTE_FALLBACK_REMEDIES = Object.freeze({
  "grid-too-large":
    "the detour grid exceeded its size budget, so the diagram is too dense to route automatically",
  "grid-visit-budget":
    "the detour search exceeded its work budget before reaching the target",
  "grid-unreachable": "no obstacle-free orthogonal corridor exists between the ports",
  "endpoint-blocked": "the connector ports are enclosed by other elements",
  "invalid-endpoint-geometry":
    "the endpoint ports cannot leave touching or overlapping nodes; increase the gap, choose different ports, or use an explicit polyline",
  "label-placement-impossible":
    "the connector label cannot expose enough of its route and terminal marker inside the canvas",
  "no-clean-candidate": "every candidate route is blocked by another element",
});

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SHAPES = new Set(["rect", "rounded-rect", "ellipse"]);
const ROUTINGS = new Set(["straight", "orthogonal", "polyline"]);
const PORTS = new Set(["auto", "top", "right", "bottom", "left"]);
const LABEL_LAYERS = new Set(["front", "behind"]);
const LAYOUTS = new Set(["row", "column", "grid", "layered"]);
const LAYOUT_DIRECTIONS = new Set(["down", "right"]);
const IMAGE_FITS = new Set(["contain", "cover", "stretch"]);
// Recursion limit while layered layout reads the connection graph. This runs
// before MAX_DEPTH validation, so impose an independent cutoff for unvalidated input.
const MAX_GRAPH_SCAN_DEPTH = 16;
// Fixed number of barycenter sweeps for deterministic output.
const LAYERED_ORDERING_SWEEPS = 4;
// Canonical built-in icon catalog; both ICONS and rendering derive from this table.
//
// Naming: lowercase kebab-case (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) nouns for
// general concepts, not product or vendor names. Names are public DSL vocabulary,
// so renaming or deleting a published name is a breaking change (see schema/README.md).
//
// Icons are 24x24 line art rendered with the node textColor as stroke, adapting
// automatically to all four themes. Only `solid: true` icons also use textColor
// as fill for small accent dots in the line art.
const ICON_SHAPES = Object.freeze({
  cloud: [
    {
      tag: "path",
      attributes: { d: "M6 18h11.5a4.5 4.5 0 0 0 .7-8.95A6.5 6.5 0 0 0 5.7 8.2 5 5 0 0 0 6 18Z" },
    },
  ],
  database: [
    { tag: "ellipse", attributes: { cx: 12, cy: 5, rx: 8, ry: 3 } },
    {
      tag: "path",
      attributes: { d: "M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" },
    },
  ],
  api: [{ tag: "path", attributes: { d: "m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" } }],
  user: [
    { tag: "circle", attributes: { cx: 12, cy: 8, r: 4 } },
    { tag: "path", attributes: { d: "M4 22a8 8 0 0 1 16 0" } },
  ],
  server: [
    { tag: "rect", attributes: { x: 3, y: 3, width: 18, height: 7, rx: 1.5 } },
    { tag: "rect", attributes: { x: 3, y: 14, width: 18, height: 7, rx: 1.5 } },
    { tag: "circle", attributes: { cx: 7, cy: 6.5, r: 0.8 }, solid: true },
    { tag: "circle", attributes: { cx: 7, cy: 17.5, r: 0.8 }, solid: true },
  ],
  analytics: [
    { tag: "path", attributes: { d: "M4 3.5v16.5h16" } },
    { tag: "path", attributes: { d: "M8 20v-5.5M12.5 20v-10.5M17 20v-3.5" } },
  ],
  browser: [
    { tag: "rect", attributes: { x: 2.5, y: 4, width: 19, height: 16, rx: 2 } },
    { tag: "path", attributes: { d: "M2.5 9h19" } },
    { tag: "circle", attributes: { cx: 5.5, cy: 6.5, r: 0.8 }, solid: true },
    { tag: "circle", attributes: { cx: 8, cy: 6.5, r: 0.8 }, solid: true },
  ],
  mobile: [
    { tag: "rect", attributes: { x: 7, y: 2.5, width: 10, height: 19, rx: 2.5 } },
    { tag: "path", attributes: { d: "M10.5 5.5h3" } },
    { tag: "circle", attributes: { cx: 12, cy: 18.5, r: 0.9 }, solid: true },
  ],
  network: [
    { tag: "circle", attributes: { cx: 12, cy: 4.5, r: 2.5 } },
    { tag: "circle", attributes: { cx: 5, cy: 18, r: 2.5 } },
    { tag: "circle", attributes: { cx: 19, cy: 18, r: 2.5 } },
    { tag: "path", attributes: { d: "M10.9 6.7 6.2 15.8M13.1 6.7l4.7 9.1M7.5 18h9" } },
  ],
  queue: [
    { tag: "path", attributes: { d: "M3 6.5h18M3 17.5h18" } },
    { tag: "rect", attributes: { x: 4.5, y: 10, width: 4, height: 4, rx: 1 } },
    { tag: "rect", attributes: { x: 10, y: 10, width: 4, height: 4, rx: 1 } },
    { tag: "rect", attributes: { x: 15.5, y: 10, width: 4, height: 4, rx: 1 } },
  ],
  shield: [
    { tag: "path", attributes: { d: "M12 2.5 20 5.5v6.2c0 4.6-3.2 8.1-8 9.8-4.8-1.7-8-5.2-8-9.8V5.5Z" } },
    { tag: "path", attributes: { d: "m8.5 12 2.5 2.5 4.5-4.5" } },
  ],
});
const ICONS = new Set(Object.keys(ICON_SHAPES));
// User-provided icons must be repository files under `assets/`. Rendering uses
// <image href="/assets/...">, served through safeJoin by the `/assets/*` route
// in extension.mjs or the test harness.
const ASSET_EXTENSIONS = Object.freeze(["svg", "png", "webp", "jpg", "jpeg"]);
// JSON Schema `pattern` has no flags, so expand both letter cases rather than
// using `/i`. This lets `.source` copy directly into the schema and guarantees
// that parser and schema handle uppercase extensions such as .PNG consistently.
const ASSET_EXTENSION_PATTERN = ASSET_EXTENSIONS.map((extension) =>
  [...extension].map((character) => `[${character.toUpperCase()}${character}]`).join(""),
).join("|");
// Path segments start with an alphanumeric character, and at least one character
// must follow '.'. This makes '..', '.', empty segments, and values containing ':'
// such as data: or http:// impossible to represent.
const ASSET_PATH_SEGMENT = "[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*";
const ASSET_PATH_PATTERN = new RegExp(
  `^assets/(?:${ASSET_PATH_SEGMENT}/)*${ASSET_PATH_SEGMENT}\\.(?:${ASSET_EXTENSION_PATTERN})$`,
);
const ICON_ASSET_PATTERN = ASSET_PATH_PATTERN;
const MAX_ASSET_REFERENCE = 200;
const MAX_ICON_REFERENCE = MAX_ASSET_REFERENCE;
const THEME_TOKENS = Object.freeze({
  accent: "var(--accent)",
  accentStrong: "var(--accent-strong)",
  accentSoft: "var(--accent-soft)",
  accentLine: "var(--accent-line)",
  surface: "var(--surface)",
  fg: "var(--fg)",
  muted: "var(--muted)",
  body: "var(--body)",
  border: "var(--border)",
  bg: "var(--bg)",
});
const LITERAL_COLORS = /^(?:#[0-9a-f]{3,8}|black|white|transparent|none)$/i;

function localAssetUrl(documentRef, path) {
  const normalized = String(path || "").replace(/^\/+/, "");
  try {
    const base = new URL(documentRef.baseURI);
    if (base.protocol === "http:" || base.protocol === "https:") {
      return new URL(normalized, base).pathname;
    }
  } catch (_) {}
  return `/${normalized}`;
}
const STYLE_KEYS = new Set([
  "fill",
  "stroke",
  "textColor",
  "strokeWidth",
  "fontSize",
  "opacity",
  "dash",
  "cornerRadius",
]);
const LAYOUT_KEYS = new Set([
  "type",
  "gap",
  "rowGap",
  "columnGap",
  "padding",
  "columns",
  "direction",
]);
const ELEMENT_KEYS = Object.freeze({
  node: new Set([
    "type",
    "id",
    "shape",
    "x",
    "y",
    "width",
    "height",
    "text",
    "icon",
    "ariaLabel",
    "z",
    "style",
  ]),
  group: new Set([
    "type",
    "id",
    "x",
    "y",
    "width",
    "height",
    "title",
    "ariaLabel",
    "layout",
    "z",
    "style",
    "children",
  ]),
  image: new Set([
    "type",
    "id",
    "src",
    "fit",
    "x",
    "y",
    "width",
    "height",
    "ariaLabel",
    "z",
    "style",
  ]),
  connector: new Set([
    "type",
    "from",
    "to",
    "fromPort",
    "toPort",
    "label",
    "labelLayer",
    "ariaLabel",
    "routing",
    "points",
    "arrow",
    "lane",
    "z",
    "style",
  ]),
});

let renderSequence = 0;

class ArchitectureError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArchitectureError";
  }
}

function fail(path, message, remedy) {
  const guidance = remedy ? `; ${remedy}` : "";
  throw new ArchitectureError(`${path}: ${message}${guidance}`);
}

function describeValue(value) {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") {
    return `'${value.length > 32 ? `${value.slice(0, 32)}…` : value}'`;
  }
  if (typeof value === "object") return "an object";
  return `'${String(value)}'`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function expectObject(value, path, remedy = "use a JSON object such as { }") {
  if (!isObject(value)) fail(path, "must be an object", remedy);
  return value;
}

function rejectUnknownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(
        `${path}.${key}`,
        "is not supported",
        `remove it or use one of: ${[...allowed].join(", ")}`,
      );
    }
  }
}

function numberIn(value, path, min, max, fallback, remedy) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    fail(
      path,
      "must be a finite number",
      remedy ?? `replace ${describeValue(candidate)} with a number between ${min} and ${max}`,
    );
  }
  if (candidate < min || candidate > max) {
    fail(path, `must be between ${min} and ${max}`, remedy ?? "adjust the value into that range");
  }
  return candidate;
}

function textValue(value, path, fallback = "", maxLength = 500, remedy) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string") {
    fail(
      path,
      "must be a string",
      remedy ?? `replace ${describeValue(candidate)} with text in double quotes`,
    );
  }
  if (candidate.length > maxLength) {
    fail(
      path,
      `must be at most ${maxLength} characters`,
      remedy ?? `shorten it by ${candidate.length - maxLength} characters`,
    );
  }
  return candidate;
}

function idValue(value, path) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    fail(
      path,
      "must start with a letter and contain only letters, numbers, '.', '_' or '-'",
      `replace ${describeValue(value)} with an id such as 'api-gateway' (64 characters or fewer)`,
    );
  }
  return value;
}

function enumValue(value, path, values, fallback) {
  const candidate = textValue(value, path, fallback, 32);
  if (!values.has(candidate)) {
    fail(
      path,
      `must be one of: ${[...values].join(", ")}`,
      `replace ${describeValue(candidate)} with one of them`,
    );
  }
  return candidate;
}

// icon is a union of built-in-name enum and path under assets/. Keep its accepted
// set synchronized with $defs.icon in schema/architecture-v1.schema.json.
function iconValue(value, path) {
  if (value === undefined) return "";
  const candidate = textValue(value, path, "", MAX_ASSET_REFERENCE);
  if (ICONS.has(candidate)) return candidate;
  if (ASSET_PATH_PATTERN.test(candidate)) return candidate;
  fail(
    path,
    `must be a built-in icon name (${[...ICONS].join(", ")}) or a path under assets/`,
    `replace ${describeValue(candidate)} with a built-in name, or with a repository asset such as 'assets/icons/logo.svg' (${ASSET_EXTENSIONS.map(
      (extension) => `.${extension}`,
    ).join(", ")} only; '..', 'data:' URIs and external URLs are rejected)`,
  );
}

function assetPathValue(value, path) {
  const candidate = textValue(value, path, "", MAX_ASSET_REFERENCE);
  if (ASSET_PATH_PATTERN.test(candidate)) return candidate;
  fail(
    path,
    "must be a path under assets/",
    `replace ${describeValue(candidate)} with a repository asset such as 'assets/images/diagram.png' (${ASSET_EXTENSIONS.map(
      (extension) => `.${extension}`,
    ).join(", ")} only; '..', 'data:' URIs and external URLs are rejected)`,
  );
}

function colorValue(value, path, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string") {
    fail(
      path,
      "must be a theme token or color string",
      `replace ${describeValue(candidate)} with a theme token such as accent, or a hex color such as "#1f6feb"`,
    );
  }
  if (Object.prototype.hasOwnProperty.call(THEME_TOKENS, candidate)) {
    return THEME_TOKENS[candidate];
  }
  if (LITERAL_COLORS.test(candidate)) return candidate;
  fail(
    path,
    "must be a theme token, hex color, black, white, transparent, or none",
    `replace ${describeValue(candidate)} with a theme token such as ${Object.keys(THEME_TOKENS).slice(0, 3).join(", ")}, or a hex color such as #1f6feb`,
  );
}

function normalizeStyle(value, path, defaults) {
  const style = value === undefined ? {} : expectObject(value, path);
  rejectUnknownKeys(style, STYLE_KEYS, path);
  const dash = textValue(style.dash, `${path}.dash`, defaults.dash || "", 40);
  if (dash && !/^\d+(?:\.\d+)?(?:[ ,]+\d+(?:\.\d+)?)*$/.test(dash)) {
    fail(
      `${path}.dash`,
      "must contain only non-negative dash lengths",
      'use space or comma separated numbers such as "12 8"',
    );
  }
  return {
    fill: colorValue(style.fill, `${path}.fill`, defaults.fill),
    stroke: colorValue(style.stroke, `${path}.stroke`, defaults.stroke),
    textColor: colorValue(style.textColor, `${path}.textColor`, defaults.textColor),
    strokeWidth: numberIn(style.strokeWidth, `${path}.strokeWidth`, 0.5, 20, defaults.strokeWidth),
    fontSize: numberIn(style.fontSize, `${path}.fontSize`, 8, 160, defaults.fontSize),
    opacity: numberIn(style.opacity, `${path}.opacity`, 0, 1, defaults.opacity ?? 1),
    dash,
    cornerRadius: numberIn(
      style.cornerRadius,
      `${path}.cornerRadius`,
      0,
      200,
      defaults.cornerRadius ?? 24,
    ),
  };
}

function normalizePoint(value, path, origin) {
  const point = expectObject(value, path);
  rejectUnknownKeys(point, new Set(["x", "y"]), path);
  return {
    x: origin.x + numberIn(point.x, `${path}.x`, -4000, 4000),
    y: origin.y + numberIn(point.y, `${path}.y`, -4000, 4000),
  };
}

function parseCanvas(value) {
  if (value === undefined) return { ...DEFAULT_CANVAS };
  const canvas = expectObject(value, "canvas");
  rejectUnknownKeys(canvas, new Set(["width", "height"]), "canvas");
  return {
    width: numberIn(canvas.width, "canvas.width", 320, 4000, DEFAULT_CANVAS.width),
    height: numberIn(canvas.height, "canvas.height", 180, 4000, DEFAULT_CANVAS.height),
  };
}

function parseLayout(value, path) {
  if (value === undefined) return null;
  if (typeof value === "string") {
    return {
      type: enumValue(value, path, LAYOUTS),
      gap: 36,
      rowGap: 36,
      columnGap: 36,
      padding: 54,
      columns: 3,
      direction: "down",
    };
  }
  const layout = expectObject(value, path);
  rejectUnknownKeys(layout, LAYOUT_KEYS, path);
  const gap = numberIn(layout.gap, `${path}.gap`, 0, 240, 36);
  const type = enumValue(layout.type, `${path}.type`, LAYOUTS);
  if (layout.direction !== undefined && type !== "layered") {
    fail(
      `${path}.direction`,
      "is only valid with layered layout",
      'set "type": "layered" or remove the direction',
    );
  }
  return {
    type,
    gap,
    rowGap: numberIn(layout.rowGap, `${path}.rowGap`, 0, 240, gap),
    columnGap: numberIn(layout.columnGap, `${path}.columnGap`, 0, 240, gap),
    padding: numberIn(layout.padding, `${path}.padding`, 0, 400, 54),
    columns: Math.trunc(numberIn(layout.columns, `${path}.columns`, 1, 12, 3)),
    direction: enumValue(
      layout.direction,
      `${path}.direction`,
      LAYOUT_DIRECTIONS,
      "down",
    ),
  };
}

/**
 * Pre-scan unvalidated raw JSON for element IDs and connector edges only.
 *
 * Layered layout needs connections among a group's direct children, but connectors
 * are often declared at the root, so inspecting only group children misses edges.
 * Scan the complete tree once before flattening.
 *
 * This runs before validation and must never throw on malformed input.
 * Later flattenElements / parseArchitecture produce the actual diagnostics.
 */
function collectGraphEdges(rawElements, edges = [], depth = 0) {
  if (!Array.isArray(rawElements) || depth > MAX_GRAPH_SCAN_DEPTH) return edges;
  for (const raw of rawElements) {
    if (!isObject(raw)) continue;
    if (raw.type === "connector") {
      if (typeof raw.from === "string" && typeof raw.to === "string") {
        edges.push({ from: raw.from, to: raw.to });
      }
      continue;
    }
    collectGraphEdges(raw.children, edges, depth + 1);
  }
  return edges;
}

/** Collect all IDs contained by one raw child element, including itself and descendants. */
function collectSubtreeIds(raw, into = new Set(), depth = 0) {
  if (!isObject(raw) || depth > MAX_GRAPH_SCAN_DEPTH) return into;
  if (typeof raw.id === "string") into.add(raw.id);
  if (Array.isArray(raw.children)) {
    for (const child of raw.children) collectSubtreeIds(child, into, depth + 1);
  }
  return into;
}

/**
 * Assign layers from the connection graph.
 *
 * A layer is the longest distance from an input source. Cycles would increase
 * indefinitely, so limit relaxation to the element count and then clamp layer
 * numbers below that count. This always terminates with cycles and produces the
 * same layer structure for identical input.
 */
function assignLayers(count, edges) {
  const layers = new Array(count).fill(0);
  for (let pass = 0; pass < count; pass += 1) {
    let changed = false;
    for (const [from, to] of edges) {
      if (layers[to] < layers[from] + 1) {
        layers[to] = layers[from] + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layers.map((layer) => Math.min(layer, Math.max(0, count - 1)));
}

/**
 * Order elements within layers using the barycenter method. Alternate a fixed
 * number of downward and upward sweeps toward mean positions in adjacent layers.
 * Stable sorting and a fixed iteration count make the result deterministic.
 */
function orderLayers(layers, edges) {
  const position = new Map();
  layers.forEach((layer) => {
    layer.forEach((item, index) => position.set(item, index));
  });
  const neighbours = new Map();
  const addNeighbour = (key, value) => {
    if (!neighbours.has(key)) neighbours.set(key, []);
    neighbours.get(key).push(value);
  };
  for (const [from, to] of edges) {
    addNeighbour(`down:${to}`, from);
    addNeighbour(`up:${from}`, to);
  }
  const sweep = (layer, key) => {
    const scored = layer.map((item, index) => {
      const related = neighbours.get(`${key}:${item}`) || [];
      const known = related
        .map((other) => position.get(other))
        .filter((value) => value !== undefined);
      const barycenter = known.length
        ? known.reduce((total, value) => total + value, 0) / known.length
        : index;
      return { item, index, barycenter };
    });
    scored.sort(
      (left, right) =>
        left.barycenter - right.barycenter || left.index - right.index,
    );
    const ordered = scored.map((entry) => entry.item);
    ordered.forEach((item, index) => position.set(item, index));
    return ordered;
  };
  let current = layers.map((layer) => layer.slice());
  for (let sweepIndex = 0; sweepIndex < LAYERED_ORDERING_SWEEPS; sweepIndex += 1) {
    if (sweepIndex % 2 === 0) {
      for (let index = 1; index < current.length; index += 1) {
        current[index] = sweep(current[index], "down");
      }
    } else {
      for (let index = current.length - 2; index >= 0; index -= 1) {
        current[index] = sweep(current[index], "up");
      }
    }
  }
  return current;
}

/** Return layered layout ranks, each containing an ordered list of flowIndex values. */
function layeredGrouping(flowItems, children, graphEdges) {
  const owner = new Map();
  flowItems.forEach(({ index }, flowIndex) => {
    for (const id of collectSubtreeIds(children[index])) {
      if (!owner.has(id)) owner.set(id, flowIndex);
    }
  });
  const seen = new Set();
  const edges = [];
  for (const edge of graphEdges) {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([from, to]);
  }
  const layerOf = assignLayers(flowItems.length, edges);
  const grouped = [];
  layerOf.forEach((layer, flowIndex) => {
    if (!grouped[layer]) grouped[layer] = [];
    grouped[layer].push(flowIndex);
  });
  return orderLayers(
    grouped.filter((layer) => layer && layer.length),
    edges,
  );
}

function layoutPlacements(children, group, layout, path, graphEdges = []) {
  if (!layout) return new Map();
  const flowItems = children
    .map((child, index) => ({ child, index }))
    .filter(
      ({ child }) =>
        child?.type === "node" || child?.type === "group" || child?.type === "image",
    );
  const placements = new Map();
  if (!flowItems.length) return placements;
  const titleReserve = group.title ? Math.max(46, group.style.fontSize * 1.7) : 0;
  const inner = {
    x: layout.padding,
    y: layout.padding + titleReserve,
    width: group.width - layout.padding * 2,
    height: group.height - layout.padding * 2 - titleReserve,
  };
  if (inner.width <= 0 || inner.height <= 0) {
    fail(
      `${path}.layout`,
      "padding and title leave no space for children",
      "reduce layout padding or increase the group width and height",
    );
  }
  const count = flowItems.length;
  // Normalize to tracks along the main axis and contents of each track before placement.
  // row / column / grid split mechanically by declaration order; only layered uses the graph.
  let tracks;
  let vertical;
  if (layout.type === "layered") {
    tracks = layeredGrouping(flowItems, children, graphEdges);
    vertical = layout.direction === "down";
  } else {
    const columns =
      layout.type === "column"
        ? 1
        : layout.type === "row"
          ? count
          : Math.min(layout.columns, count);
    tracks = [];
    for (let flowIndex = 0; flowIndex < count; flowIndex += 1) {
      const row = Math.floor(flowIndex / columns);
      if (!tracks[row]) tracks[row] = [];
      tracks[row].push(flowIndex);
    }
    vertical = true;
  }
  const trackCount = tracks.length;
  const widest = Math.max(...tracks.map((track) => track.length));
  const rows = vertical ? trackCount : widest;
  const columns = vertical ? widest : trackCount;
  const cellWidth = (inner.width - layout.columnGap * (columns - 1)) / columns;
  const cellHeight = (inner.height - layout.rowGap * (rows - 1)) / rows;
  if (cellWidth < 24 || cellHeight < 24) {
    fail(
      `${path}.layout`,
      "children do not fit",
      "reduce layout gap/padding, enlarge the group, or move some children out",
    );
  }
  tracks.forEach((track, trackIndex) => {
    // Layered ranks vary in size, so center each complete track on the cross axis.
    // Keep row / column / grid start-aligned to avoid shifting existing diagrams.
    const spanCells = track.length;
    const span = vertical
      ? spanCells * cellWidth + layout.columnGap * (spanCells - 1)
      : spanCells * cellHeight + layout.rowGap * (spanCells - 1);
    const offset =
      layout.type !== "layered"
        ? 0
        : vertical
          ? (inner.width - span) / 2
          : (inner.height - span) / 2;
    track.forEach((flowIndex, positionInTrack) => {
      const { child, index } = flowItems[flowIndex];
      const defaultWidth = child.type === "group" ? cellWidth : Math.min(cellWidth, 340);
      const defaultHeight =
        child.type === "group"
          ? cellHeight
          : child.type === "image"
            ? Math.min(cellHeight, 220)
            : Math.min(cellHeight, 170);
      const width = numberIn(
        child.width,
        `${path}.children[${index}].width`,
        1,
        cellWidth,
        defaultWidth,
        "the parent layout limits each cell; reduce the value, enlarge the group, or drop width to use the automatic size",
      );
      const height = numberIn(
        child.height,
        `${path}.children[${index}].height`,
        1,
        cellHeight,
        defaultHeight,
        "the parent layout limits each cell; reduce the value, enlarge the group, or drop height to use the automatic size",
      );
      const cellX = vertical
        ? inner.x + offset + positionInTrack * (cellWidth + layout.columnGap)
        : inner.x + trackIndex * (cellWidth + layout.columnGap);
      const cellY = vertical
        ? inner.y + trackIndex * (cellHeight + layout.rowGap)
        : inner.y + offset + positionInTrack * (cellHeight + layout.rowGap);
      placements.set(index, {
        x: cellX + (cellWidth - width) / 2,
        y: cellY + (cellHeight - height) / 2,
        width,
        height,
      });
    });
  });
  return placements;
}

function normalizeBox(element, origin, path, placement) {
  return {
    x:
      origin.x +
      (placement?.x ?? numberIn(element.x, `${path}.x`, -4000, 4000)),
    y:
      origin.y +
      (placement?.y ?? numberIn(element.y, `${path}.y`, -4000, 4000)),
    width: placement?.width ?? numberIn(element.width, `${path}.width`, 1, 4000),
    height: placement?.height ?? numberIn(element.height, `${path}.height`, 1, 4000),
  };
}

function flattenElements(
  rawElements,
  origin,
  depth,
  output,
  ids,
  path = "elements",
  placements = new Map(),
  graphEdges = [],
) {
  if (!Array.isArray(rawElements)) fail(path, "must be an array", "use a JSON array such as [ ]");
  if (depth > MAX_DEPTH) {
    fail(
      path,
      `nesting must not exceed ${MAX_DEPTH} levels`,
      "flatten the structure or split the diagram across slides",
    );
  }

  rawElements.forEach((raw, localIndex) => {
    if (output.length >= MAX_ELEMENTS) {
      fail(
        "elements",
        `must contain at most ${MAX_ELEMENTS} items`,
        "split the diagram across multiple slides",
      );
    }
    const elementPath = `${path}[${localIndex}]`;
    const element = expectObject(raw, elementPath);
    const type = textValue(element.type, `${elementPath}.type`, "", 20);
    if (!Object.prototype.hasOwnProperty.call(ELEMENT_KEYS, type)) {
      fail(
        `${elementPath}.type`,
        "must be node, group, image, or connector",
        element.type === undefined
          ? 'add a "type" of node, group, image, or connector'
          : `replace ${describeValue(element.type)} with node, group, image, or connector`,
      );
    }
    rejectUnknownKeys(element, ELEMENT_KEYS[type], elementPath);
    const order = output.length;
    const defaultZ = type === "group" ? -50 : type === "connector" ? -10 : 0;
    const z = numberIn(element.z, `${elementPath}.z`, -100, 100, defaultZ);

    if (type === "connector") {
      const routing = enumValue(
        element.routing,
        `${elementPath}.routing`,
        ROUTINGS,
        "straight",
      );
      const points = element.points === undefined ? [] : element.points;
      if (!Array.isArray(points) || points.length > MAX_POINTS) {
        fail(
          `${elementPath}.points`,
          `must be an array with at most ${MAX_POINTS} points`,
          "remove extra waypoints or split the connector into several connectors",
        );
      }
      if (routing !== "polyline" && points.length) {
        fail(
          `${elementPath}.points`,
          "is only valid with polyline routing",
          'set "routing": "polyline" or remove the points',
        );
      }
      if (element.arrow !== undefined && typeof element.arrow !== "boolean") {
        fail(
          `${elementPath}.arrow`,
          "must be a boolean",
          `replace ${describeValue(element.arrow)} with true or false`,
        );
      }
      output.push({
        type,
        from: idValue(element.from, `${elementPath}.from`),
        to: idValue(element.to, `${elementPath}.to`),
        fromPort: enumValue(element.fromPort, `${elementPath}.fromPort`, PORTS, "auto"),
        toPort: enumValue(element.toPort, `${elementPath}.toPort`, PORTS, "auto"),
        label: textValue(element.label, `${elementPath}.label`, "", 200),
        labelLayer: enumValue(
          element.labelLayer,
          `${elementPath}.labelLayer`,
          LABEL_LAYERS,
          "front",
        ),
        ariaLabel: textValue(element.ariaLabel, `${elementPath}.ariaLabel`, "", 300),
        routing,
        points: points.map((point, index) =>
          normalizePoint(point, `${elementPath}.points[${index}]`, origin),
        ),
        arrow: element.arrow !== false,
        lane:
          element.lane === undefined
            ? null
            : Math.trunc(numberIn(element.lane, `${elementPath}.lane`, -12, 12)),
        z,
        order,
        sourcePath: elementPath,
        style: normalizeStyle(element.style, `${elementPath}.style`, {
          fill: "none",
          stroke: "accent",
          textColor: "fg",
          strokeWidth: 4,
          fontSize: 24,
          opacity: 1,
          cornerRadius: 0,
        }),
      });
      return;
    }

    const id = idValue(element.id, `${elementPath}.id`);
    if (ids.has(id)) {
      fail(
        `${elementPath}.id`,
        `duplicates '${id}'`,
        "give every node, group, and image a unique id across the whole diagram",
      );
    }
    ids.add(id);
    const box = normalizeBox(element, origin, elementPath, placements.get(localIndex));

    if (type === "node") {
      const shape = enumValue(
        element.shape,
        `${elementPath}.shape`,
        SHAPES,
        "rounded-rect",
      );
      const icon = iconValue(element.icon, `${elementPath}.icon`);
      output.push({
        type,
        id,
        shape,
        ...box,
        text: textValue(element.text, `${elementPath}.text`, "", 500),
        icon,
        ariaLabel: textValue(element.ariaLabel, `${elementPath}.ariaLabel`, "", 300),
        z,
        order,
        sourcePath: elementPath,
        style: normalizeStyle(element.style, `${elementPath}.style`, {
          fill: "surface",
          stroke: "accent",
          textColor: "fg",
          strokeWidth: 4,
          fontSize: 32,
          opacity: 1,
          cornerRadius: 28,
        }),
      });
      return;
    }

    if (type === "image") {
      output.push({
        type,
        id,
        ...box,
        src: assetPathValue(element.src, `${elementPath}.src`),
        fit: enumValue(element.fit, `${elementPath}.fit`, IMAGE_FITS, "contain"),
        ariaLabel: textValue(element.ariaLabel, `${elementPath}.ariaLabel`, "", 300),
        z,
        order,
        sourcePath: elementPath,
        style: normalizeStyle(element.style, `${elementPath}.style`, {
          fill: "none",
          stroke: "none",
          textColor: "fg",
          strokeWidth: 1,
          fontSize: 24,
          opacity: 1,
          cornerRadius: 0,
        }),
      });
      return;
    }

    const groupStyle = normalizeStyle(element.style, `${elementPath}.style`, {
      fill: "accentSoft",
      stroke: "accentLine",
      textColor: "accentStrong",
      strokeWidth: 3,
      fontSize: 28,
      opacity: 1,
      dash: "12 8",
      cornerRadius: 32,
    });
    const group = {
      type,
      id,
      ...box,
      title: textValue(element.title, `${elementPath}.title`, "", 200),
      ariaLabel: textValue(element.ariaLabel, `${elementPath}.ariaLabel`, "", 300),
      layout: parseLayout(element.layout, `${elementPath}.layout`),
      z,
      order,
      sourcePath: elementPath,
      style: groupStyle,
    };
    output.push(group);
    const children = element.children === undefined ? [] : element.children;
    const childPlacements = layoutPlacements(
      children,
      group,
      group.layout,
      elementPath,
      graphEdges,
    );
    flattenElements(
      children,
      { x: group.x, y: group.y },
      depth + 1,
      output,
      ids,
      `${elementPath}.children`,
      childPlacements,
      graphEdges,
    );
  });
}

function assignConnectorLanes(elements) {
  const lookup = new Map(
    elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const records = elements
    .filter((element) => element.type === "connector")
    .map((connector) => {
      const from = lookup.get(connector.from);
      const to = lookup.get(connector.to);
      const fromPort =
        connector.fromPort === "auto"
          ? autoPort(from, elementCenter(to))
          : connector.fromPort;
      const toPort =
        connector.toPort === "auto"
          ? autoPort(to, elementCenter(from))
          : connector.toPort;
      const fromKey = `${connector.from}:${fromPort}`;
      const toKey = `${connector.to}:${toPort}`;
      return {
        connector,
        automatic: connector.lane === null,
        from,
        to,
        fromPort,
        toPort,
        fromKey,
        toKey,
        endpoints: new Set([fromKey, toKey]),
      };
    });
  const conflicts = (left, right) =>
    [...left.endpoints].some((endpoint) => right.endpoints.has(endpoint));

  records.forEach((record, index) => {
    const { connector } = record;
    if (connector.lane === null) return;
    const duplicate = records
      .slice(0, index)
      .some(
        (other) =>
          other.connector.lane === connector.lane && conflicts(record, other),
      );
    if (duplicate) {
      fail(
        `${connector.sourcePath}.lane`,
        `duplicates explicit lane ${connector.lane}`,
        "give overlapping connectors different lane values, or omit lane to assign them automatically",
      );
    }
  });

  records
    .filter((record) => record.automatic)
    .forEach((record) => {
      const automaticPeers = records.filter(
        (other) => other.automatic && conflicts(record, other),
      );
      const preferred =
        automaticPeers.indexOf(record) - (automaticPeers.length - 1) / 2;
      const reserved = new Set(
        records
          .filter(
            (other) =>
              other !== record &&
              other.connector.lane !== null &&
              conflicts(record, other),
          )
          .map((other) => other.connector.lane),
      );
      let selected = null;
      for (let distance = 0; distance <= 12 && selected === null; distance += 0.5) {
        const candidates =
          distance === 0
            ? [preferred]
            : [preferred - distance, preferred + distance];
        selected =
          candidates.find(
            (candidate) =>
              candidate >= -12 && candidate <= 12 && !reserved.has(candidate),
          ) ?? null;
      }
      if (selected === null) {
        fail(
          record.connector.sourcePath,
          "has no available connector lane",
          "reduce the number of connectors between the same elements, or set explicit lane values",
        );
      }
      record.connector.lane = selected;
    });

  const endpointGroups = new Map();
  for (const record of records) {
    for (const endpoint of [
      {
        key: record.fromKey,
        side: "from",
        port: record.fromPort,
        node: record.from,
      },
      {
        key: record.toKey,
        side: "to",
        port: record.toPort,
        node: record.to,
      },
    ]) {
      if (!endpointGroups.has(endpoint.key)) endpointGroups.set(endpoint.key, []);
      endpointGroups.get(endpoint.key).push({ record, ...endpoint });
    }
  }
  for (const endpoints of endpointGroups.values()) {
    endpoints.sort(
      (left, right) =>
        left.record.connector.lane - right.record.connector.lane ||
        left.record.connector.order - right.record.connector.order,
    );
    const { node, port } = endpoints[0];
    const sideLength =
      port === "top" || port === "bottom" ? node.width : node.height;
    const limit = Math.max(
      0,
      sideLength / 2 - Math.min(12, sideLength * 0.2),
    );
    const spacing =
      endpoints.length > 1
        ? Math.min(CONNECTOR_LANE_SPACING, (limit * 2) / (endpoints.length - 1))
        : 0;
    endpoints.forEach((endpoint, index) => {
      const offset = (index - (endpoints.length - 1) / 2) * spacing;
      if (endpoint.side === "from") {
        endpoint.record.connector.fromOffset = offset;
      } else {
        endpoint.record.connector.toOffset = offset;
      }
    });
  }
}

function totalTextLength(model) {
  return (
    model.title.length +
    model.description.length +
    model.elements.reduce(
      (total, element) =>
        total +
        (element.text?.length || 0) +
        (element.title?.length || 0) +
        (element.label?.length || 0) +
        (element.ariaLabel?.length || 0),
      0,
    )
  );
}

export function normalizeArchitectureSource(source) {
  return typeof source === "string" && source.trim() === "" ? EMPTY_ARCHITECTURE_SOURCE : source;
}

export function parseArchitecture(source) {
  if (typeof source !== "string") {
    fail("diagram", "must be JSON text", "pass the fenced block contents as a string");
  }
  if (source.length > MAX_SOURCE_LENGTH) {
    fail(
      "diagram",
      `must be at most ${MAX_SOURCE_LENGTH} characters`,
      "split the diagram across multiple slides",
    );
  }
  const normalizedSource = normalizeArchitectureSource(source);
  let raw;
  try {
    raw = JSON.parse(normalizedSource);
  } catch (error) {
    const detail = error?.message ? ` (${error.message})` : "";
    fail(
      "diagram",
      `contains invalid JSON${detail}`,
      "check for trailing commas, unquoted keys, or missing braces",
    );
  }
  const root = expectObject(
    raw,
    "diagram",
    'the top level must be a JSON object with an "elements" array',
  );
  rejectUnknownKeys(
    root,
    new Set(["$schema", "version", "canvas", "title", "description", "elements"]),
    "diagram",
  );
  const version = numberIn(
    root.version,
    "version",
    DSL_VERSION,
    DSL_VERSION,
    DSL_VERSION,
    `set "version": ${DSL_VERSION} or omit the field`,
  );
  if (!Number.isInteger(version)) {
    fail("version", "must be an integer", `set "version": ${DSL_VERSION} or omit the field`);
  }
  const model = {
    version,
    canvas: parseCanvas(root.canvas),
    title: textValue(root.title, "title", "Architecture diagram", 200),
    description: textValue(
      root.description,
      "description",
      "Architecture diagram rendered from a constrained JSON DSL.",
      1000,
    ),
    elements: [],
  };
  const ids = new Set();
  flattenElements(
    root.elements,
    { x: 0, y: 0 },
    0,
    model.elements,
    ids,
    "elements",
    new Map(),
    collectGraphEdges(root.elements),
  );
  const connectable = new Set(
    model.elements.filter((element) => element.type !== "connector").map((element) => element.id),
  );
  let connectorCount = 0;
  model.elements.forEach((element) => {
    if (element.type !== "connector") return;
    connectorCount += 1;
    if (!connectable.has(element.from)) {
      fail(
        `${element.sourcePath}.from`,
        `references unknown element '${element.from}'`,
        `add a node or group with id '${element.from}', or point the connector at an existing id`,
      );
    }
    if (!connectable.has(element.to)) {
      fail(
        `${element.sourcePath}.to`,
        `references unknown element '${element.to}'`,
        `add a node or group with id '${element.to}', or point the connector at an existing id`,
      );
    }
    if (element.from === element.to) {
      fail(
        element.sourcePath,
        "self-referencing connectors are not supported",
        "point the connector at a different element",
      );
    }
  });
  if (connectorCount > MAX_CONNECTORS) {
    fail(
      "elements",
      `must contain at most ${MAX_CONNECTORS} connectors`,
      "split the diagram across multiple slides",
    );
  }
  if (totalTextLength(model) > MAX_TOTAL_TEXT) {
    fail(
      "diagram",
      `text content must be at most ${MAX_TOTAL_TEXT} characters`,
      "shorten node text, group titles, labels, and descriptions",
    );
  }
  assignConnectorLanes(model.elements);
  model.elements = model.elements
    .slice()
    .sort((left, right) => left.z - right.z || left.order - right.order);
  return model;
}

function svgElement(documentRef, tag, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== "") element.setAttribute(name, String(value));
  }
  return element;
}

function appendSvgTitle(documentRef, parent, text) {
  const title = svgElement(documentRef, "title");
  title.textContent = text;
  parent.appendChild(title);
}

function textWidthUnits(text) {
  return [...text].reduce((total, character) => {
    if (character.charCodeAt(0) > 0x7f) return total + 1;
    if (/\s/.test(character)) return total + 0.35;
    if (/[mwMW@#%&]/.test(character)) return total + 0.95;
    if (/[A-Z]/.test(character)) return total + 0.72;
    if (/[ilI1.,'`|!]/.test(character)) return total + 0.35;
    return total + 0.6;
  }, 0);
}

function fitTextToWidth(text, requestedFontSize, maxWidth) {
  const units = Math.max(textWidthUnits(text), 1);
  const fontSize = Math.min(requestedFontSize, Math.max(MIN_FONT_SIZE, maxWidth / units));
  if (units * fontSize <= maxWidth) {
    return { text, fontSize, width: units * fontSize };
  }

  const ellipsis = "…";
  const maxUnits = maxWidth / fontSize;
  const ellipsisUnits = textWidthUnits(ellipsis);
  let usedUnits = 0;
  let fitted = "";
  for (const character of text) {
    const characterUnits = textWidthUnits(character);
    if (usedUnits + characterUnits + ellipsisUnits > maxUnits) break;
    fitted += character;
    usedUnits += characterUnits;
  }
  const displayText = `${fitted}${ellipsis}`;
  return {
    text: displayText,
    fontSize,
    width: textWidthUnits(displayText) * fontSize,
  };
}

function appendText(documentRef, parent, element, text, options = {}) {
  const lines = text.split(/\r?\n/).slice(0, 8);
  if (!lines.some(Boolean)) return;
  const availableWidth = options.availableWidth ?? Math.max(32, element.width - 32);
  const longestLine = Math.max(...lines.map(textWidthUnits), 1);
  const fontSize = Math.min(
    element.style.fontSize,
    Math.max(8, availableWidth / longestLine),
  );
  const centerX = options.centerX ?? element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const textElement = svgElement(documentRef, "text", {
    x: centerX,
    y: centerY,
    fill: element.style.textColor,
    "font-size": fontSize,
    "font-weight": 600,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "pointer-events": "none",
    // Visual only. The same string is already in the parent's aria-label and <title>;
    // without hiding it, assistive technology announces each element twice, as
    // verified in Chromium's AX tree. Width may truncate the display, so aria-label
    // remains authoritative.
    "aria-hidden": "true",
  });
  lines.forEach((line, index) => {
    const tspan = svgElement(documentRef, "tspan", {
      x: centerX,
      y: centerY + (index - (lines.length - 1) / 2) * fontSize * 1.2,
    });
    tspan.textContent = line;
    textElement.appendChild(tspan);
  });
  parent.appendChild(textElement);
}

function elementCenter(element) {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

function autoPort(element, toward) {
  const center = elementCenter(element);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function portPoint(element, requestedPort, toward, tangentOffset = 0) {
  const port = requestedPort === "auto" ? autoPort(element, toward) : requestedPort;
  const center = elementCenter(element);
  const horizontalLimit = Math.max(
    0,
    element.width / 2 - Math.min(12, element.width * 0.2),
  );
  const verticalLimit = Math.max(
    0,
    element.height / 2 - Math.min(12, element.height * 0.2),
  );
  if (port === "top") {
    return {
      point: {
        x: center.x + Math.max(-horizontalLimit, Math.min(horizontalLimit, tangentOffset)),
        y: element.y,
      },
      direction: { x: 0, y: -1 },
      port,
    };
  }
  if (port === "bottom") {
    return {
      point: {
        x: center.x + Math.max(-horizontalLimit, Math.min(horizontalLimit, tangentOffset)),
        y: element.y + element.height,
      },
      direction: { x: 0, y: 1 },
      port,
    };
  }
  if (port === "left") {
    return {
      point: {
        x: element.x,
        y: center.y + Math.max(-verticalLimit, Math.min(verticalLimit, tangentOffset)),
      },
      direction: { x: -1, y: 0 },
      port,
    };
  }
  return {
    point: {
      x: element.x + element.width,
      y: center.y + Math.max(-verticalLimit, Math.min(verticalLimit, tangentOffset)),
    },
    direction: { x: 1, y: 0 },
    port: "right",
  };
}

function offsetPoint(point, direction, distance) {
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
}

function compressPoints(points) {
  const unique = points.filter(
    (point, index) =>
      index === 0 ||
      Math.abs(point.x - points[index - 1].x) > 0.001 ||
      Math.abs(point.y - points[index - 1].y) > 0.001,
  );
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const previous = unique[index - 1];
    const next = unique[index + 1];
    const vertical = previous.x === point.x && point.x === next.x;
    const horizontal = previous.y === point.y && point.y === next.y;
    if (vertical) {
      return (point.y - previous.y) * (next.y - point.y) <= 0;
    }
    if (horizontal) {
      return (point.x - previous.x) * (next.x - point.x) <= 0;
    }
    return true;
  });
}

function routeIsOrthogonal(points) {
  return points
    .slice(1)
    .every(
      (point, index) =>
        point.x === points[index].x || point.y === points[index].y,
    );
}

function routeHasImmediateBacktrack(points) {
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
    if (Math.abs(cross) < 0.001 && dot < -0.001) return true;
  }
  return false;
}

function routeRespectsEndpointDirections(points, startDirection, endDirection) {
  if (points.length < 2) return false;
  const first = {
    x: points[1].x - points[0].x,
    y: points[1].y - points[0].y,
  };
  const last = {
    x: points.at(-1).x - points.at(-2).x,
    y: points.at(-1).y - points.at(-2).y,
  };
  return (
    first.x * startDirection.x + first.y * startDirection.y > 0.001 &&
    last.x * endDirection.x + last.y * endDirection.y > 0.001
  );
}

/**
 * Last-resort route. Only when normal candidates and grid solutions re-enter an
 * endpoint, trace the canvas boundary clockwise and counterclockwise to guarantee
 * candidates that preserve port direction.
 */
function perimeterRouteCandidates(
  start,
  end,
  fromDirection,
  toDirection,
  canvas,
) {
  const bounds = {
    left: Math.min(0, start.x, end.x),
    right: Math.max(canvas.width, start.x, end.x),
    top: Math.min(0, start.y, end.y),
    bottom: Math.max(canvas.height, start.y, end.y),
  };
  const sides = ["top", "right", "bottom", "left"];
  const sideOf = (direction) => {
    if (direction.y < 0) return "top";
    if (direction.x > 0) return "right";
    if (direction.y > 0) return "bottom";
    return "left";
  };
  const pointOnSide = (point, side) => {
    if (side === "top") return { x: point.x, y: bounds.top };
    if (side === "right") return { x: bounds.right, y: point.y };
    if (side === "bottom") return { x: point.x, y: bounds.bottom };
    return { x: bounds.left, y: point.y };
  };
  const cornerAfter = (side, step) => {
    if (step > 0) {
      if (side === "top") return { x: bounds.right, y: bounds.top };
      if (side === "right") return { x: bounds.right, y: bounds.bottom };
      if (side === "bottom") return { x: bounds.left, y: bounds.bottom };
      return { x: bounds.left, y: bounds.top };
    }
    if (side === "top") return { x: bounds.left, y: bounds.top };
    if (side === "left") return { x: bounds.left, y: bounds.bottom };
    if (side === "bottom") return { x: bounds.right, y: bounds.bottom };
    return { x: bounds.right, y: bounds.top };
  };
  const fromSide = sideOf(fromDirection);
  const toSide = sideOf(toDirection);
  const fromEdge = pointOnSide(start, fromSide);
  const toEdge = pointOnSide(end, toSide);
  const around = (step) => {
    const points = [start, fromEdge];
    let sideIndex = sides.indexOf(fromSide);
    const targetIndex = sides.indexOf(toSide);
    const transitions =
      fromSide === toSide
        ? sides.length
        : (targetIndex - sideIndex + sides.length) % sides.length;
    const count = step > 0 ? transitions : (sides.length - transitions) % sides.length;
    const transitionCount = fromSide === toSide ? sides.length : count;
    for (let index = 0; index < transitionCount; index += 1) {
      const side = sides[sideIndex];
      points.push(cornerAfter(side, step));
      sideIndex = (sideIndex + step + sides.length) % sides.length;
    }
    return compressPoints([...points, toEdge, end]);
  };
  const candidates =
    fromSide === toSide
      ? [
          compressPoints([start, fromEdge, toEdge, end]),
          around(1),
          around(-1),
        ]
      : [around(1), around(-1)];
  return candidates.filter(routeIsOrthogonal);
}

function segmentIntersectsBox(start, end, box, margin = 18) {
  const left = box.x - margin;
  const right = box.x + box.width + margin;
  const top = box.y - margin;
  const bottom = box.y + box.height + margin;
  if (start.x === end.x) {
    return start.x >= left && start.x <= right && Math.max(start.y, end.y) >= top && Math.min(start.y, end.y) <= bottom;
  }
  if (start.y === end.y) {
    return start.y >= top && start.y <= bottom && Math.max(start.x, end.x) >= left && Math.min(start.x, end.x) <= right;
  }
  return false;
}

function countNodeHits(points, nodes, excludedIds) {
  let hits = 0;
  for (let index = 1; index < points.length; index++) {
    for (const node of nodes) {
      if (excludedIds.has(node.id)) continue;
      if (segmentIntersectsBox(points[index - 1], points[index], node)) hits += 1;
    }
  }
  return hits;
}

function routeHitsNodes(points, nodes, excludedIds) {
  return countNodeHits(points, nodes, excludedIds) > 0;
}

function routeHitsEndpointNode(points, endpoints) {
  return points.slice(1).some((end, index) => {
    const start = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    return endpoints.some(
      (endpoint) =>
        segmentPortionInsideBox(start, end, endpoint) * length > 0.001,
    );
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

/**
 * Dimensions of a label pill (rounded rectangle). renderConnector and route
 * calculation share this function so visible labels match the boxes routes avoid.
 */
function connectorLabelMetrics(element, canvas = DEFAULT_CANVAS) {
  const maximumWidth = Math.max(
    1,
    Math.min(
      MAX_CONNECTOR_LABEL_WIDTH,
      canvas.width - CONNECTOR_LABEL_CLEARANCE * 2,
    ),
  );
  const fitted = fitTextToWidth(
    element.label,
    element.style.fontSize,
    Math.max(1, maximumWidth - CONNECTOR_LABEL_PADDING),
  );
  return {
    text: fitted.text,
    fontSize: fitted.fontSize,
    width: Math.min(
      maximumWidth,
      Math.max(MIN_CONNECTOR_LABEL_WIDTH, fitted.width + CONNECTOR_LABEL_PADDING),
    ),
    height: Math.min(
      Math.max(1, canvas.height - CONNECTOR_LABEL_CLEARANCE * 2),
      fitted.fontSize * 1.55,
    ),
  };
}

function connectorLabelPaintBox(position, metrics) {
  const strokeRadius = CONNECTOR_LABEL_STROKE_WIDTH / 2;
  return {
    x: position.x - metrics.width / 2 - strokeRadius,
    y: position.y - metrics.height / 2 - strokeRadius,
    width: metrics.width + CONNECTOR_LABEL_STROKE_WIDTH,
    height: metrics.height + CONNECTOR_LABEL_STROKE_WIDTH,
  };
}

/**
 * Default direction for moving a pill away from a line. Choose the segment normal
 * that remains on the same side when travel direction reverses: above horizontal
 * lines and right of vertical lines. Labels therefore stay on the same side from
 * either direction rather than alternating across adjacent connectors.
 *
 * Deliberately ignore nodes and other labels when choosing direction. Keeping this
 * pure over only the connector and route preserves the invariant that renderConnector
 * and route calculation use the same box (see {@link connectorLabelMetrics}).
 * routeCost evaluates destination overlap through ROUTE_COST_LABEL_OVER_NODE.
 */
function labelEscapeNormal(direction) {
  const normal = { x: -direction.y, y: direction.x };
  const flipped = normal.y > 0 || (normal.y === 0 && normal.x < 0);
  return flipped ? { x: -normal.x, y: -normal.y } : normal;
}

function terminalMarkerPolygon(element, points) {
  if (!element.arrow || points.length < 2) return null;
  const end = points.at(-1);
  const previous = points.at(-2);
  const length = Math.hypot(end.x - previous.x, end.y - previous.y);
  if (length < 0.001) return null;
  const direction = {
    x: (end.x - previous.x) / length,
    y: (end.y - previous.y) / length,
  };
  const normal = { x: -direction.y, y: direction.x };
  const scale =
    (CONNECTOR_MARKER_SIZE * element.style.strokeWidth) /
    CONNECTOR_MARKER_VIEWBOX_SIZE;
  return CONNECTOR_MARKER_POINTS.map((point) => {
    const localX = (point.x - CONNECTOR_MARKER_REF_X) * scale;
    const localY = (point.y - CONNECTOR_MARKER_REF_Y) * scale;
    return {
      x: end.x + direction.x * localX + normal.x * localY,
      y: end.y + direction.y * localX + normal.y * localY,
    };
  });
}

function polygonOverlapsBox(polygon, box) {
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const delta = { x: end.x - start.x, y: end.y - start.y };
    const length = Math.hypot(delta.x, delta.y);
    if (length > 0.001) {
      axes.push({ x: -delta.y / length, y: delta.x / length });
    }
  }
  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  return axes.every((axis) => {
    const projections = polygon.map((point) => point.x * axis.x + point.y * axis.y);
    const polygonMinimum = Math.min(...projections);
    const polygonMaximum = Math.max(...projections);
    const boxCenter = center.x * axis.x + center.y * axis.y;
    const boxRadius =
      Math.abs(axis.x) * box.width / 2 + Math.abs(axis.y) * box.height / 2;
    return (
      Math.min(polygonMaximum, boxCenter + boxRadius) -
        Math.max(polygonMinimum, boxCenter - boxRadius) >
      0.001
    );
  });
}

function terminalMarkerIsClear(element, points, box) {
  if (!element.arrow) return true;
  const polygon = terminalMarkerPolygon(element, points);
  return polygon ? !polygonOverlapsBox(polygon, box) : false;
}

function terminalMarkerEscapeReach(
  element,
  points,
  anchor,
  normal,
  metrics,
  sign,
  baseReach,
) {
  const position = {
    x: anchor.x + normal.x * baseReach * sign,
    y: anchor.y + normal.y * baseReach * sign,
  };
  const box = connectorLabelPaintBox(position, metrics);
  if (terminalMarkerIsClear(element, points, box)) return baseReach;
  const polygon = terminalMarkerPolygon(element, points);
  if (!polygon) return baseReach;
  const markerProjections = polygon.map(
    (point) => point.x * normal.x + point.y * normal.y,
  );
  const markerMinimum = Math.min(...markerProjections);
  const markerMaximum = Math.max(...markerProjections);
  const anchorProjection = anchor.x * normal.x + anchor.y * normal.y;
  const labelRadius =
    Math.abs(normal.x) * box.width / 2 +
    Math.abs(normal.y) * box.height / 2;
  const required =
    sign > 0
      ? markerMaximum - anchorProjection + labelRadius + 0.001
      : anchorProjection + labelRadius - markerMinimum + 0.001;
  return Math.max(baseReach, required);
}

function fullRouteEscapeReach(
  points,
  anchor,
  direction,
  metrics,
  sign,
  baseReach,
) {
  const projections = points.map(
    (point) => point.x * direction.x + point.y * direction.y,
  );
  const routeMinimum = Math.min(...projections);
  const routeMaximum = Math.max(...projections);
  const anchorProjection =
    anchor.x * direction.x + anchor.y * direction.y;
  const labelRadius =
    Math.abs(direction.x) *
      (metrics.width + CONNECTOR_LABEL_STROKE_WIDTH) /
      2 +
    Math.abs(direction.y) *
      (metrics.height + CONNECTOR_LABEL_STROKE_WIDTH) /
      2;
  const required =
    sign > 0
      ? routeMaximum -
        anchorProjection +
        labelRadius +
        CONNECTOR_LABEL_CLEARANCE
      : anchorProjection -
        routeMinimum +
        labelRadius +
        CONNECTOR_LABEL_CLEARANCE;
  return Math.max(baseReach, required);
}

/**
 * Label-pill anchor point and whether it was moved away from the line.
 *
 * Defaults to the route midpoint. Because the opaque pill has minimum width
 * {@link MIN_CONNECTOR_LABEL_WIDTH}, tight node spacing can hide the complete
 * line and arrowhead; shortening text cannot reduce it below that minimum.
 * Move the pill along the midpoint segment's normal only when less than
 * {@link MIN_VISIBLE_ROUTE_LENGTH} remains. Prefer the side inside the canvas,
 * then the side with greater visible length when both are equivalent.
 *
 * Escape distance equals the axis-aligned rectangle's extent along the normal
 * plus padding. Because the pill does not rotate, this guarantees its corners do
 * not touch even a diagonal line.
 */
function connectorLabelAnchor(
  element,
  points,
  metrics = null,
  canvas = DEFAULT_CANVAS,
) {
  metrics ??= connectorLabelMetrics(element, canvas);
  const measure = (position) => {
    const box = connectorLabelPaintBox(position, metrics);
    return {
      position,
      box,
      contained:
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= canvas.width &&
        box.y + box.height <= canvas.height,
      terminalClear: terminalMarkerIsClear(element, points, box),
      visible: routeLengthOutsideBox(points, box),
    };
  };
  const paintedWidth = metrics.width + CONNECTOR_LABEL_STROKE_WIDTH;
  const paintedHeight = metrics.height + CONNECTOR_LABEL_STROKE_WIDTH;
  const clampToCanvas = (position) => ({
    ...position,
    x:
      paintedWidth <= canvas.width
        ? Math.min(
            canvas.width - paintedWidth / 2,
            Math.max(paintedWidth / 2, position.x),
          )
        : canvas.width / 2,
    y:
      paintedHeight <= canvas.height
        ? Math.min(
            canvas.height - paintedHeight / 2,
            Math.max(paintedHeight / 2, position.y),
          )
        : canvas.height / 2,
  });
  const anchor = pointAtHalfLength(points);
  const centered = measure({ x: anchor.x, y: anchor.y, escaped: false });
  const minimumVisible = Math.min(MIN_VISIBLE_ROUTE_LENGTH, routeLength(points));
  if (
    centered.contained &&
    centered.terminalClear &&
    centered.visible >= minimumVisible
  ) {
    return { x: anchor.x, y: anchor.y, escaped: false };
  }
  const normals = [labelEscapeNormal(anchor.direction)];
  const segments = points
    .slice(1)
    .map((end, index) => {
      const start = points[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      return {
        length,
        direction: length
          ? { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
          : null,
      };
    })
    .sort((first, second) => second.length - first.length);
  for (const segment of segments) {
    if (!segment.direction) continue;
    const normal = labelEscapeNormal(segment.direction);
    if (
      normals.some(
        (known) => Math.abs(known.x * normal.x + known.y * normal.y) > 0.999,
      )
    ) {
      continue;
    }
    normals.push(normal);
  }
  const axes = normals.map((direction) => ({
    direction,
    clearFullRoute: false,
  }));
  for (const segment of segments) {
    if (
      !segment.direction ||
      axes.some(
        (axis) =>
          Math.abs(
            axis.direction.x * segment.direction.x +
              axis.direction.y * segment.direction.y,
          ) > 0.999,
      )
    ) {
      continue;
    }
    axes.push({
      direction: segment.direction,
      clearFullRoute: true,
    });
  }
  const escapedByAxis = axes.map(({ direction, clearFullRoute }) => {
    const reach =
      Math.abs(direction.x) * (paintedWidth / 2) +
      Math.abs(direction.y) * (paintedHeight / 2) +
      CONNECTOR_LABEL_CLEARANCE;
    return [1, -1].map((sign) => {
      const routeAdjustedReach = clearFullRoute
        ? fullRouteEscapeReach(
            points,
            anchor,
            direction,
            metrics,
            sign,
            reach,
          )
        : reach;
      const adjustedReach = terminalMarkerEscapeReach(
        element,
        points,
        anchor,
        direction,
        metrics,
        sign,
        routeAdjustedReach,
      );
      return measure({
        x: anchor.x + direction.x * adjustedReach * sign,
        y: anchor.y + direction.y * adjustedReach * sign,
        escaped: true,
      });
    });
  });
  const best = (candidates) =>
    candidates.reduce((selected, candidate) =>
      candidate.visible > selected.visible + 0.001 ? candidate : selected,
    );
  for (const candidates of escapedByAxis) {
    const viable = candidates.filter(
      (candidate) =>
        candidate.contained &&
        candidate.terminalClear &&
        candidate.visible >= minimumVisible - 0.001,
    );
    if (viable.length) return best(viable).position;
  }
  let candidates = escapedByAxis.flat().map((candidate) =>
    candidate.contained
      ? candidate
      : measure(clampToCanvas(candidate.position)),
  );
  const viable = candidates.filter(
    (candidate) =>
      candidate.contained &&
      candidate.terminalClear &&
      candidate.visible >= minimumVisible - 0.001,
  );
  if (viable.length) return best(viable).position;
  const terminalClear = candidates.filter(
    (candidate) => candidate.terminalClear,
  );
  if (terminalClear.length) candidates = terminalClear;
  return best(candidates).position;
}

/** Rectangle actually occupied by a label, or null for a connector without a label. */
function connectorLabelBox(element, points, canvas = DEFAULT_CANVAS) {
  if (!element?.label || points.length < 2) return null;
  const metrics = connectorLabelMetrics(element, canvas);
  const position = connectorLabelAnchor(element, points, metrics, canvas);
  return connectorLabelPaintBox(position, metrics);
}

/** Whether a route crosses a label rectangle, tested with margin 0. */
function boxOverlapsRoute(box, points) {
  for (let index = 1; index < points.length; index++) {
    if (segmentIntersectsBox(points[index - 1], points[index], box, 0)) return true;
  }
  return false;
}

/**
 * Fraction [0,1] of segment a→b inside box, using Liang–Barsky clipping.
 *
 * Used to measure how much line length a label hides. This needs an amount rather
 * than a Boolean intersection, so it differs from boxOverlapsRoute. The analytic,
 * nonsampled solution is deterministic for identical input.
 */
function segmentPortionInsideBox(a, b, box) {
  const deltaX = b.x - a.x;
  const deltaY = b.y - a.y;
  let enter = 0;
  let exit = 1;
  const clip = (edge, distance) => {
    if (edge === 0) return distance >= 0;
    const ratio = distance / edge;
    if (edge < 0) {
      if (ratio > exit) return false;
      if (ratio > enter) enter = ratio;
    } else {
      if (ratio < enter) return false;
      if (ratio < exit) exit = ratio;
    }
    return true;
  };
  if (!clip(-deltaX, a.x - box.x)) return 0;
  if (!clip(deltaX, box.x + box.width - a.x)) return 0;
  if (!clip(-deltaY, a.y - box.y)) return 0;
  if (!clip(deltaY, box.y + box.height - a.y)) return 0;
  return Math.max(0, exit - enter);
}

/** Route length outside box: line length that remains visible rather than hidden by a label. */
function routeLengthOutsideBox(points, box) {
  let outside = 0;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    outside += length * (1 - segmentPortionInsideBox(start, end, box));
  }
  return outside;
}

function availableStubDistance(start, direction, desired, nodes, excludedIds) {
  for (let distance = desired; distance >= 2; distance -= 2) {
    const end = offsetPoint(start, direction, distance);
    const blocked = nodes.some(
      (node) =>
        !excludedIds.has(node.id) && segmentIntersectsBox(start, end, node),
    );
    if (!blocked) return distance;
  }
  return 0;
}

function fitFacingDistances(
  start,
  end,
  fromDirection,
  toDirection,
  fromDistance,
  toDistance,
  minimumRemainingSpan = 0,
) {
  const directionsOppose =
    fromDirection.x === -toDirection.x &&
    fromDirection.y === -toDirection.y;
  const delta = { x: end.x - start.x, y: end.y - start.y };
  const forwardSpan = fromDirection.x * delta.x + fromDirection.y * delta.y;
  const total = fromDistance + toDistance;
  const reservedSpan = Math.min(minimumRemainingSpan, forwardSpan);
  const availableSpan = forwardSpan - reservedSpan;
  if (
    !directionsOppose ||
    forwardSpan <= 0 ||
    total <= availableSpan
  ) {
    return { fromDistance, toDistance };
  }
  const scale = availableSpan / total;
  return {
    fromDistance: fromDistance * scale,
    toDistance: toDistance * scale,
  };
}

function segmentInteractionScore(firstStart, firstEnd, secondStart, secondEnd) {
  const cross = (origin, first, second) =>
    (first.x - origin.x) * (second.y - origin.y) -
    (first.y - origin.y) * (second.x - origin.x);
  const firstSideA = cross(firstStart, firstEnd, secondStart);
  const firstSideB = cross(firstStart, firstEnd, secondEnd);
  const secondSideA = cross(secondStart, secondEnd, firstStart);
  const secondSideB = cross(secondStart, secondEnd, firstEnd);
  const epsilon = 0.001;
  const collinear =
    Math.abs(firstSideA) < epsilon &&
    Math.abs(firstSideB) < epsilon &&
    Math.abs(secondSideA) < epsilon &&
    Math.abs(secondSideB) < epsilon;
  if (collinear) {
    const useX =
      Math.abs(firstEnd.x - firstStart.x) >=
      Math.abs(firstEnd.y - firstStart.y);
    const firstMin = Math.min(
      useX ? firstStart.x : firstStart.y,
      useX ? firstEnd.x : firstEnd.y,
    );
    const firstMax = Math.max(
      useX ? firstStart.x : firstStart.y,
      useX ? firstEnd.x : firstEnd.y,
    );
    const secondMin = Math.min(
      useX ? secondStart.x : secondStart.y,
      useX ? secondEnd.x : secondEnd.y,
    );
    const secondMax = Math.max(
      useX ? secondStart.x : secondStart.y,
      useX ? secondEnd.x : secondEnd.y,
    );
    const overlap = Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin);
    return overlap > epsilon ? 1000 + overlap : 0;
  }
  const crosses =
    firstSideA * firstSideB < -epsilon &&
    secondSideA * secondSideB < -epsilon;
  return crosses ? 100 : 0;
}

function routeInteractionScore(points, occupiedRoutes) {
  let score = 0;
  for (let index = 1; index < points.length; index++) {
    for (const occupied of occupiedRoutes) {
      for (let occupiedIndex = 1; occupiedIndex < occupied.length; occupiedIndex++) {
        score += segmentInteractionScore(
          points[index - 1],
          points[index],
          occupied[occupiedIndex - 1],
          occupied[occupiedIndex],
        );
      }
    }
  }
  return score;
}

// Count only true crossings, not overlaps. Used to guarantee rerouting does not
// increase this value. Minimizing crossings is this phase's primary goal and must
// not be traded for label readability.
function countRouteCrossings(points, occupiedRoutes) {
  let crossings = 0;
  for (let index = 1; index < points.length; index++) {
    for (const occupied of occupiedRoutes) {
      for (let occupiedIndex = 1; occupiedIndex < occupied.length; occupiedIndex++) {
        const score = segmentInteractionScore(
          points[index - 1],
          points[index],
          occupied[occupiedIndex - 1],
          occupied[occupiedIndex],
        );
        if (score === 100) crossings += 1;
      }
    }
  }
  return crossings;
}

/**
 * Amount of otherwise readable content hidden by this route.
 *
 * Sum of nodes penetrated by the line and nodes overlapped by the label pill,
 * excluding endpoint nodes because they are connection targets. Crossings merely
 * impair reading; this hides information, so refinement guards weigh it more heavily.
 */
function countHiddenContent(
  connector,
  points,
  nodes,
  canvas = DEFAULT_CANVAS,
) {
  const excludedIds = new Set([connector.from, connector.to]);
  let hidden = countNodeHits(points, nodes, excludedIds);
  const labelBox = connectorLabelBox(connector, points, canvas);
  if (!labelBox) return hidden;
  for (const node of nodes) {
    if (excludedIds.has(node.id)) continue;
    if (boxesOverlap(labelBox, node)) hidden += 1;
  }
  return hidden;
}

function routeLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
  }
  return total;
}

function countBends(points) {
  let bends = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = Math.sign(current.x - previous.x) || Math.sign(current.y - previous.y) * 2;
    const outgoing = Math.sign(next.x - current.x) || Math.sign(next.y - current.y) * 2;
    const horizontalIn = Math.abs(current.x - previous.x) > 0.001;
    const horizontalOut = Math.abs(next.x - current.x) > 0.001;
    if (horizontalIn !== horizontalOut || incoming !== outgoing) bends += 1;
  }
  return bends;
}

/**
 * Aggregate cost of one route. Initial placement, grid search, and rerouting all use this scale.
 *
 * Count label terms in both directions: own label vs other routes and other labels
 * vs own route. One direction alone makes the cost delta of rerouting one connector
 * differ from the whole-diagram delta and can cause oscillation. Both directions
 * produce an exact delta, guaranteeing monotonic diagram-wide improvement when
 * adopting only improvements.
 *
 * Exclude both endpoint nodes from label terms. Otherwise a short connector may
 * make an unnatural detour solely to move its label away from its own targets.
 */
function routeCost(points, context) {
  const {
    nodes = [],
    excludedIds = new Set(),
    occupiedRoutes = [],
    occupiedLabels = [],
    connector = null,
    canvas = DEFAULT_CANVAS,
  } = context;
  let cost = countNodeHits(points, nodes, excludedIds) * ROUTE_COST_NODE_HIT;
  cost += routeInteractionScore(points, occupiedRoutes) * ROUTE_COST_INTERACTION;
  const labelBox = connectorLabelBox(connector, points, canvas);
  if (labelBox) {
    for (const node of nodes) {
      if (excludedIds.has(node.id)) continue;
      if (boxesOverlap(labelBox, node)) cost += ROUTE_COST_LABEL_OVER_NODE;
    }
    for (const other of occupiedLabels) {
      if (boxesOverlap(labelBox, other)) cost += ROUTE_COST_LABEL_OVER_LABEL;
    }
    for (const route of occupiedRoutes) {
      if (boxOverlapsRoute(labelBox, route)) cost += ROUTE_COST_LABEL_OVER_ROUTE;
    }
  }
  for (const other of occupiedLabels) {
    if (boxOverlapsRoute(other, points)) cost += ROUTE_COST_LABEL_OVER_ROUTE;
  }
  cost += countBends(points) * ROUTE_COST_BEND;
  return cost + routeLength(points);
}

/**
 * Choose the lowest-cost candidate. Ties preserve the earlier candidate, making
 * generation order, which is stable relative to declaration order, deterministic.
 */
function chooseRoute(candidates, nodes, excludedIds, occupiedRoutes, options = {}) {
  const context = {
    nodes,
    excludedIds,
    occupiedRoutes,
    occupiedLabels: options.occupiedLabels || [],
    connector: options.connector || null,
    canvas: options.canvas || DEFAULT_CANVAS,
  };
  let best = candidates[0];
  let bestCost = routeCost(best, context);
  for (let index = 1; index < candidates.length; index++) {
    const cost = routeCost(candidates[index], context);
    if (cost < bestCost) {
      best = candidates[index];
      bestCost = cost;
    }
  }
  return best;
}

function filterPreferredRouteCandidates(
  candidates,
  connector,
  nodes,
  maximumRouteLength,
  canvas,
) {
  if (!candidates.length) return [];
  const measured = candidates.map((points) => ({
    points,
    hidden: countHiddenContent(connector, points, nodes, canvas),
    length: routeLength(points),
  }));
  const bounded = measured.filter(
    (candidate) =>
      candidate.length <= maximumRouteLength + ROUTE_IMPROVEMENT_EPSILON,
  );
  const boundedHidden = bounded.length
    ? Math.min(...bounded.map((candidate) => candidate.hidden))
    : Infinity;
  const minimumHidden = Math.min(
    ...measured.map((candidate) => candidate.hidden),
  );
  const eligible = minimumHidden < boundedHidden ? measured : bounded;
  const eligibleHidden = Math.min(
    ...eligible.map((candidate) => candidate.hidden),
  );
  return eligible
    .filter((candidate) => candidate.hidden === eligibleHidden)
    .map((candidate) => candidate.points);
}

function gridRoute(
  start,
  end,
  nodes,
  excludedIds,
  canvas,
  occupiedRoutes,
  options = {},
) {
  const startDirection = options.startDirection || null;
  const endDirection = options.endDirection || null;
  const strictStartDirection = options.strictStartDirection === true;
  const strictEndDirection = options.strictEndDirection === true;
  // Keep endpoint nodes as physical obstacles, but test their actual bounds
  // (margin 0), not the usual 18px clearance, because endpoints have only a 14px gap.
  const obstacles = nodes.map((node) => ({
    node,
    margin: excludedIds.has(node.id) ? 0 : 18,
  }));
  const xs = new Set([0, canvas.width, start.x, end.x]);
  const ys = new Set([0, canvas.height, start.y, end.y]);
  for (const { node, margin } of obstacles) {
    const corridor = margin + 1;
    xs.add(Math.max(0, node.x - corridor));
    xs.add(Math.min(canvas.width, node.x + node.width + corridor));
    ys.add(Math.max(0, node.y - corridor));
    ys.add(Math.min(canvas.height, node.y + node.height + corridor));
  }
  for (const route of occupiedRoutes) {
    for (const point of route) {
      xs.add(Math.max(0, point.x - 8));
      xs.add(Math.min(canvas.width, point.x + 8));
      xs.add(Math.max(0, point.x - 12));
      xs.add(Math.min(canvas.width, point.x + 12));
      ys.add(Math.max(0, point.y - 8));
      ys.add(Math.min(canvas.height, point.y + 8));
      ys.add(Math.max(0, point.y - 12));
      ys.add(Math.min(canvas.height, point.y + 12));
    }
  }
  if (
    xs.size > MAX_ROUTING_GRID_COORDINATES ||
    ys.size > MAX_ROUTING_GRID_COORDINATES ||
    xs.size * ys.size > MAX_ROUTING_GRID_POINTS
  ) {
    return { points: null, reason: ROUTE_FALLBACK_REASONS.gridTooLarge };
  }
  const xValues = [...xs].sort((left, right) => left - right);
  const yValues = [...ys].sort((left, right) => left - right);
  const keyOf = (point) => `${point.x},${point.y}`;
  const insideObstacle = (point) =>
    obstacles.some(
      ({ node, margin }) =>
        point.x > node.x - margin &&
        point.x < node.x + node.width + margin &&
        point.y > node.y - margin &&
        point.y < node.y + node.height + margin,
    );
  const segmentBlocked = (startPoint, endPoint) =>
    obstacles.some(({ node, margin }) =>
      segmentIntersectsBox(startPoint, endPoint, node, margin),
    );
  const points = new Map();
  const rows = new Map();
  const columns = new Map();
  for (const y of yValues) {
    for (const x of xValues) {
      const point = { x, y };
      if (insideObstacle(point)) continue;
      const key = keyOf(point);
      points.set(key, point);
      if (!rows.has(y)) rows.set(y, []);
      if (!columns.has(x)) columns.set(x, []);
      rows.get(y).push(point);
      columns.get(x).push(point);
    }
  }
  const adjacency = new Map([...points.keys()].map((key) => [key, []]));
  const connect = (line) => {
    for (let index = 1; index < line.length; index++) {
      const from = line[index - 1];
      const to = line[index];
      if (segmentBlocked(from, to)) continue;
      adjacency.get(keyOf(from)).push(to);
      adjacency.get(keyOf(to)).push(from);
    }
  };
  for (const row of rows.values()) connect(row.sort((left, right) => left.x - right.x));
  for (const column of columns.values()) {
    connect(column.sort((left, right) => left.y - right.y));
  }

  const startKey = keyOf(start);
  const endKey = keyOf(end);
  if (!points.has(startKey) || !points.has(endKey)) {
    return { points: null, reason: ROUTE_FALLBACK_REASONS.endpointBlocked };
  }
  const stateKey = (pointKey, direction) => `${pointKey}|${direction}`;
  const initialState = stateKey(startKey, "N");
  const distances = new Map([[initialState, 0]]);
  const previous = new Map();
  const queue = [];
  const push = (entry) => {
    queue.push(entry);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent].distance <= queue[index].distance) break;
      [queue[parent], queue[index]] = [queue[index], queue[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const first = queue[0];
    const last = queue.pop();
    if (queue.length) {
      queue[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < queue.length && queue[left].distance < queue[smallest].distance) {
          smallest = left;
        }
        if (right < queue.length && queue[right].distance < queue[smallest].distance) {
          smallest = right;
        }
        if (smallest === index) break;
        [queue[index], queue[smallest]] = [queue[smallest], queue[index]];
        index = smallest;
      }
    }
    return first;
  };
  push({ state: initialState, distance: 0 });
  let finalState = null;
  let visits = 0;
  while (queue.length && visits < MAX_ROUTING_GRID_VISITS) {
    const { state: currentState, distance: currentDistance } = pop();
    if (currentDistance !== distances.get(currentState)) continue;
    visits += 1;
    const separator = currentState.lastIndexOf("|");
    const currentPointKey = currentState.slice(0, separator);
    const currentDirection = currentState.slice(separator + 1);
    if (currentPointKey === endKey) {
      finalState = currentState;
      break;
    }
    const currentPoint = points.get(currentPointKey);
    for (const neighbor of adjacency.get(currentPointKey)) {
      const movement = {
        x: neighbor.x - currentPoint.x,
        y: neighbor.y - currentPoint.y,
      };
      const startProjection = startDirection
        ? movement.x * startDirection.x + movement.y * startDirection.y
        : Infinity;
      if (
        currentPointKey === startKey &&
        startDirection &&
        (strictStartDirection
          ? startProjection <= 0.001
          : startProjection < -0.001)
      ) {
        continue;
      }
      const nextPointKey = keyOf(neighbor);
      const endProjection = endDirection
        ? movement.x * endDirection.x + movement.y * endDirection.y
        : Infinity;
      if (
        nextPointKey === endKey &&
        endDirection &&
        (strictEndDirection
          ? endProjection <= 0.001
          : endProjection < -0.001)
      ) {
        continue;
      }
      const nextDirection = neighbor.x === currentPoint.x ? "V" : "H";
      const bendCost =
        currentDirection === "N" || currentDirection === nextDirection ? 0 : 24;
      const interactionCost =
        routeInteractionScore([currentPoint, neighbor], occupiedRoutes) * 10_000;
      const nextDistance =
        currentDistance +
        Math.hypot(neighbor.x - currentPoint.x, neighbor.y - currentPoint.y) +
        bendCost +
        interactionCost;
      const nextState = stateKey(nextPointKey, nextDirection);
      if (nextDistance >= (distances.get(nextState) ?? Infinity)) continue;
      distances.set(nextState, nextDistance);
      previous.set(nextState, currentState);
      push({ state: nextState, distance: nextDistance });
    }
  }
  if (!finalState) {
    // Distinguish budget exhaustion from no possible route because author guidance differs.
    return {
      points: null,
      reason:
        visits >= MAX_ROUTING_GRID_VISITS
          ? ROUTE_FALLBACK_REASONS.gridVisitBudget
          : ROUTE_FALLBACK_REASONS.gridUnreachable,
    };
  }
  const route = [];
  for (let state = finalState; state; state = previous.get(state)) {
    route.push(points.get(state.slice(0, state.lastIndexOf("|"))));
  }
  return { points: compressPoints(route.reverse()), reason: null };
}

/**
 * Determine the route for one connector.
 *
 * Fixed fallback sequence:
 *   1. Enumerate candidates and choose the minimum routeCost.
 *   2. Use grid search only if it penetrates a node or interferes with existing routes.
 *   3. Measure grid solutions with routeCost and adopt only improvements.
 *   4. If it still covers a node or label, report through options.report.
 *      Do not throw, which would turn previously renderable diagrams into errors.
 *
 * options is purely additive; existing four-argument calls continue to work.
 */
export function computeConnectorRoute(
  connector,
  lookup,
  canvas = DEFAULT_CANVAS,
  occupiedRoutes = [],
  options = {},
) {
  const occupiedLabels = options.occupiedLabels || [];
  const detourBaseline = options.detourBaseline ?? null;
  const report = options.report || null;
  const onReason = options.onReason || null;
  const from = lookup.get(connector.from);
  const to = lookup.get(connector.to);
  if (!from || !to) throw new ArchitectureError("connector: references an unknown element");
  const laneOffset = connector.lane * CONNECTOR_LANE_SPACING;
  const fromPort = portPoint(
    from,
    connector.fromPort,
    elementCenter(to),
    connector.fromOffset ?? laneOffset,
  );
  const toPort = portPoint(
    to,
    connector.toPort,
    elementCenter(from),
    connector.toOffset ?? laneOffset,
  );
  const endpointDistances =
    connector.routing === "orthogonal"
      ? fitFacingDistances(
          fromPort.point,
          toPort.point,
          fromPort.direction,
          toPort.direction,
          CONNECTOR_ENDPOINT_GAP,
          CONNECTOR_ENDPOINT_GAP,
          MIN_ORTHOGONAL_ENDPOINT_SPAN,
        )
      : {
          fromDistance: CONNECTOR_ENDPOINT_GAP,
          toDistance: CONNECTOR_ENDPOINT_GAP,
        };
  const start = offsetPoint(
    fromPort.point,
    fromPort.direction,
    endpointDistances.fromDistance,
  );
  const end = offsetPoint(
    toPort.point,
    toPort.direction,
    endpointDistances.toDistance,
  );
  if (connector.routing === "straight") return [start, end];

  const nodes = [...lookup.values()].filter(
    (element) => element.type === "node" || element.type === "image",
  );
  const excluded = new Set([connector.from, connector.to]);
  const endpointNodes = [from, to].filter(
    (element) => element.type === "node" || element.type === "image",
  );
  const clearance = 42 + Math.abs(laneOffset) * 0.3;
  const fromStubExcluded =
    connector.routing === "orthogonal"
      ? new Set([connector.from])
      : excluded;
  const toStubExcluded =
    connector.routing === "orthogonal"
      ? new Set([connector.to])
      : excluded;
  const availableFromStub = availableStubDistance(
    start,
    fromPort.direction,
    clearance,
    nodes,
    fromStubExcluded,
  );
  const availableToStub = availableStubDistance(
    end,
    toPort.direction,
    clearance,
    nodes,
    toStubExcluded,
  );
  const stubDistances =
    connector.routing === "orthogonal"
      ? fitFacingDistances(
          start,
          end,
          fromPort.direction,
          toPort.direction,
          availableFromStub,
          availableToStub,
          MIN_ORTHOGONAL_ENDPOINT_SPAN,
        )
      : {
          fromDistance: availableFromStub,
          toDistance: availableToStub,
        };
  const fromStub = offsetPoint(
    start,
    fromPort.direction,
    stubDistances.fromDistance,
  );
  const toStub = offsetPoint(
    end,
    toPort.direction,
    stubDistances.toDistance,
  );
  if (connector.routing === "polyline") {
    return compressPoints([
      start,
      fromStub,
      ...connector.points,
      toStub,
      end,
    ]);
  }
  const fromHorizontal = fromPort.direction.x !== 0;
  const toHorizontal = toPort.direction.x !== 0;
  let candidates;

  if (fromHorizontal && toHorizontal) {
    const base = (fromStub.x + toStub.x) / 2 + laneOffset;
    const outsideLeft = Math.max(0, Math.min(fromStub.x, toStub.x) - 72 - Math.abs(laneOffset));
    const outsideRight = Math.min(
      canvas.width,
      Math.max(fromStub.x, toStub.x) + 72 + Math.abs(laneOffset),
    );
    candidates = [...new Set([
      base,
      fromStub.x,
      toStub.x,
      outsideLeft,
      outsideRight,
    ])].map((corridor) =>
      compressPoints([
        start,
        fromStub,
        { x: corridor, y: fromStub.y },
        { x: corridor, y: toStub.y },
        toStub,
        end,
      ]),
    );
    const top = Math.max(
      0,
      Math.min(fromStub.y, toStub.y, ...nodes.map((node) => node.y)) -
        54 -
        Math.abs(laneOffset),
    );
    const bottom = Math.min(
      canvas.height,
      Math.max(
        fromStub.y,
        toStub.y,
        ...nodes.map((node) => node.y + node.height),
      ) +
        54 +
        Math.abs(laneOffset),
    );
    candidates.push(
      compressPoints([
        start,
        fromStub,
        { x: fromStub.x, y: top },
        { x: toStub.x, y: top },
        toStub,
        end,
      ]),
      compressPoints([
        start,
        fromStub,
        { x: fromStub.x, y: bottom },
        { x: toStub.x, y: bottom },
        toStub,
        end,
      ]),
    );
  } else if (!fromHorizontal && !toHorizontal) {
    const base = (fromStub.y + toStub.y) / 2 + laneOffset;
    const outsideTop = Math.max(0, Math.min(fromStub.y, toStub.y) - 72 - Math.abs(laneOffset));
    const outsideBottom = Math.min(
      canvas.height,
      Math.max(fromStub.y, toStub.y) + 72 + Math.abs(laneOffset),
    );
    candidates = [...new Set([
      base,
      fromStub.y,
      toStub.y,
      outsideTop,
      outsideBottom,
    ])].map((corridor) =>
      compressPoints([
        start,
        fromStub,
        { x: fromStub.x, y: corridor },
        { x: toStub.x, y: corridor },
        toStub,
        end,
      ]),
    );
    const left = Math.max(
      0,
      Math.min(fromStub.x, toStub.x, ...nodes.map((node) => node.x)) -
        54 -
        Math.abs(laneOffset),
    );
    const right = Math.min(
      canvas.width,
      Math.max(
        fromStub.x,
        toStub.x,
        ...nodes.map((node) => node.x + node.width),
      ) +
        54 +
        Math.abs(laneOffset),
    );
    candidates.push(
      compressPoints([
        start,
        fromStub,
        { x: left, y: fromStub.y },
        { x: left, y: toStub.y },
        toStub,
        end,
      ]),
      compressPoints([
        start,
        fromStub,
        { x: right, y: fromStub.y },
        { x: right, y: toStub.y },
        toStub,
        end,
      ]),
    );
  } else {
    const horizontalBounds = nodes.flatMap((node) => [node.x, node.x + node.width]);
    const verticalBounds = nodes.flatMap((node) => [node.y, node.y + node.height]);
    const left = Math.max(
      0,
      Math.min(fromStub.x, toStub.x, ...horizontalBounds) -
        54 -
        Math.abs(laneOffset),
    );
    const right = Math.min(
      canvas.width,
      Math.max(fromStub.x, toStub.x, ...horizontalBounds) +
        54 +
        Math.abs(laneOffset),
    );
    const top = Math.max(
      0,
      Math.min(fromStub.y, toStub.y, ...verticalBounds) -
        54 -
        Math.abs(laneOffset),
    );
    const bottom = Math.min(
      canvas.height,
      Math.max(fromStub.y, toStub.y, ...verticalBounds) +
        54 +
        Math.abs(laneOffset),
    );
    const fromApproach = offsetPoint(fromStub, fromPort.direction, clearance);
    const toApproach = offsetPoint(toStub, toPort.direction, clearance);
    candidates = [
      compressPoints([
        start,
        fromStub,
        { x: toStub.x, y: fromStub.y },
        toStub,
        end,
      ]),
      compressPoints([
        start,
        fromStub,
        { x: fromStub.x, y: toStub.y },
        toStub,
        end,
      ]),
    ];
    const horizontalDetours = [
      compressPoints([start, { x: left, y: start.y }, { x: left, y: end.y }, end]),
      compressPoints([start, { x: right, y: start.y }, { x: right, y: end.y }, end]),
    ];
    const verticalDetours = [
      compressPoints([start, { x: start.x, y: top }, { x: end.x, y: top }, end]),
      compressPoints([start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end]),
    ];
    const endpointHorizontalDetours = [
      compressPoints([
        start,
        { x: left, y: start.y },
        { x: left, y: toStub.y },
        toStub,
        end,
      ]),
      compressPoints([
        start,
        { x: right, y: start.y },
        { x: right, y: toStub.y },
        toStub,
        end,
      ]),
    ];
    const endpointVerticalDetours = [
      compressPoints([
        start,
        { x: start.x, y: top },
        { x: toStub.x, y: top },
        toStub,
        end,
      ]),
      compressPoints([
        start,
        { x: start.x, y: bottom },
        { x: toStub.x, y: bottom },
        toStub,
        end,
      ]),
    ];
    candidates.push(
      ...(fromHorizontal ? endpointHorizontalDetours : endpointVerticalDetours),
      ...(fromHorizontal ? endpointVerticalDetours : endpointHorizontalDetours),
      ...(fromHorizontal ? horizontalDetours : verticalDetours),
      ...(fromHorizontal ? verticalDetours : horizontalDetours),
    );
    for (const horizontal of [left, right]) {
      for (const vertical of [top, bottom]) {
        candidates.push(
          compressPoints([
            start,
            { x: horizontal, y: start.y },
            { x: horizontal, y: vertical },
            { x: end.x, y: vertical },
            end,
          ]),
          compressPoints([
            start,
            { x: start.x, y: vertical },
            { x: horizontal, y: vertical },
            { x: horizontal, y: end.y },
            end,
          ]),
        );
      }
    }
    if (fromHorizontal) {
      candidates.push(
        compressPoints([
          start,
          fromStub,
          { x: left, y: fromStub.y },
          { x: left, y: toApproach.y },
          toApproach,
          toStub,
          end,
        ]),
        compressPoints([
          start,
          fromStub,
          { x: right, y: fromStub.y },
          { x: right, y: toApproach.y },
          toApproach,
          toStub,
          end,
        ]),
        compressPoints([
          start,
          fromStub,
          fromApproach,
          { x: fromApproach.x, y: top },
          { x: toStub.x, y: top },
          toStub,
          end,
        ]),
        compressPoints([
          start,
          fromStub,
          fromApproach,
          { x: fromApproach.x, y: bottom },
          { x: toStub.x, y: bottom },
          toStub,
          end,
        ]),
      );
    } else {
      candidates.push(
        compressPoints([
          start,
          fromStub,
          { x: fromStub.x, y: top },
          { x: toApproach.x, y: top },
          toApproach,
          toStub,
          end,
        ]),
        compressPoints([
          start,
          fromStub,
          { x: fromStub.x, y: bottom },
          { x: toApproach.x, y: bottom },
          toApproach,
          toStub,
          end,
        ]),
        compressPoints([
          start,
          fromStub,
          fromApproach,
          { x: left, y: fromApproach.y },
          { x: left, y: toStub.y },
          toStub,
          end,
        ]),
        compressPoints([
          start,
          fromStub,
          fromApproach,
          { x: right, y: fromApproach.y },
          { x: right, y: toStub.y },
          toStub,
          end,
        ]),
      );
    }
  }
  candidates = candidates
    .map((points) =>
      compressPoints([
        start,
        fromStub,
        ...points.slice(1, -1),
        toStub,
        end,
      ]),
    )
    .filter(routeIsOrthogonal);
  if (!candidates.length) {
    candidates = [
      compressPoints([
        start,
        fromStub,
        { x: toStub.x, y: fromStub.y },
        toStub,
        end,
      ]),
      compressPoints([
        start,
        fromStub,
        { x: fromStub.x, y: toStub.y },
        toStub,
        end,
      ]),
    ];
  }
  const routingContext = {
    nodes,
    excludedIds: excluded,
    occupiedRoutes,
    occupiedLabels,
    connector,
    canvas,
  };
  const endDirection = {
    x: -toPort.direction.x,
    y: -toPort.direction.y,
  };
  const hasForwardAutomaticGeometry = (points) =>
    !routeHasImmediateBacktrack(points) &&
    routeRespectsEndpointDirections(
      points,
      fromPort.direction,
      endDirection,
    );
  const hasValidAutomaticGeometry = (points) =>
    hasForwardAutomaticGeometry(points) &&
    !routeHitsEndpointNode(points, endpointNodes);
  let routePool = candidates;
  let maximumRouteLength = Infinity;
  if (occupiedRoutes.length || occupiedLabels.length) {
    const standalone =
      detourBaseline ??
      computeConnectorRoute(connector, lookup, canvas, [], {
        occupiedLabels: [],
      });
    maximumRouteLength = routeLength(standalone) * MAX_ROUTE_DETOUR_RATIO;
    routePool = [...candidates, standalone];
    candidates = filterPreferredRouteCandidates(
      routePool,
      connector,
      nodes,
      maximumRouteLength,
      canvas,
    );
  }
  const selected = chooseRoute(candidates, nodes, excluded, occupiedRoutes, {
    occupiedLabels,
    connector,
    canvas,
  });
  const selectedCost = routeCost(selected, routingContext);
  const selectedHitsNodes = routeHitsNodes(selected, nodes, excluded);
  const selectedInteraction = routeInteractionScore(selected, occupiedRoutes);
  const selectedHasInvalidGeometry = !hasValidAutomaticGeometry(selected);
  let chosen = selected;
  let gridReason = null;
  // Fallback stage 2: escalate to expensive grid search only for a dirty candidate.
  if (
    selectedHasInvalidGeometry ||
    selectedHitsNodes ||
    (occupiedRoutes.length && selectedInteraction > 0)
  ) {
    const grid = gridRoute(
      fromStub,
      toStub,
      nodes,
      excluded,
      canvas,
      occupiedRoutes,
      {
        startDirection: fromPort.direction,
        endDirection,
        strictStartDirection: stubDistances.fromDistance <= 0.001,
        strictEndDirection: stubDistances.toDistance <= 0.001,
      },
    );
    gridReason = grid.reason;
    const alternate = grid.points
      ? compressPoints([start, fromStub, ...grid.points, toStub, end])
      : null;
    const selectedHidden = countHiddenContent(connector, selected, nodes, canvas);
    const alternateHidden = alternate
      ? countHiddenContent(connector, alternate, nodes, canvas)
      : Infinity;
    const alternateIsUsable =
      alternate &&
      hasValidAutomaticGeometry(alternate) &&
      alternateHidden <= selectedHidden &&
      (alternateHidden < selectedHidden ||
        routeLength(alternate) <=
          maximumRouteLength + ROUTE_IMPROVEMENT_EPSILON);
    if (selectedHasInvalidGeometry) {
      const validCandidates = routePool.filter(hasValidAutomaticGeometry);
      if (alternate && hasValidAutomaticGeometry(alternate)) {
        validCandidates.push(alternate);
      }
      let preferredCandidates = filterPreferredRouteCandidates(
        validCandidates,
        connector,
        nodes,
        maximumRouteLength,
        canvas,
      );
      if (!preferredCandidates.length) {
        // If endpoint re-entry is unavoidable, return and diagnose a route that preserves direction without doubling back.
        const perimeterCandidates = [
          ...routePool,
          ...(alternate ? [alternate] : []),
          ...perimeterRouteCandidates(
            start,
            end,
            fromPort.direction,
            toPort.direction,
            canvas,
          ),
        ].filter(hasForwardAutomaticGeometry);
        preferredCandidates = filterPreferredRouteCandidates(
          perimeterCandidates,
          connector,
          nodes,
          maximumRouteLength,
          canvas,
        );
      }
      if (preferredCandidates.length) {
        chosen = chooseRoute(
          preferredCandidates,
          nodes,
          excluded,
          occupiedRoutes,
          { occupiedLabels, connector, canvas },
        );
      }
    } else if (
      alternateIsUsable &&
      routeCost(alternate, routingContext) < selectedCost
    ) {
      // Fallback stage 3: measure grid solutions on the same scale and adopt only improvements.
      chosen = alternate;
    }
  }
  // Fallback stage 4: report any remaining invalid shape rather than silently rendering it.
  // onReason tells the caller why grid search could not be used. planConnectorRoutes
  // gathers diagnostics after finalizing routes, so retain intermediate termination
  // reasons here instead of collapsing them to no-clean-candidate.
  if (!hasValidAutomaticGeometry(chosen)) {
    gridReason = ROUTE_FALLBACK_REASONS.invalidEndpointGeometry;
  }
  if (typeof onReason === "function") onReason(gridReason);
  reportRouteDegradation(report, connector, chosen, routingContext, gridReason);
  return chosen;
}

/**
 * Add diagnostics only when rendered output hides content.
 *
 * Do not report crossings alone; nonplanar graphs cannot avoid them, and reporting
 * all crossings creates noise that obscures genuinely problematic diagrams.
 * Report only a route penetrating a node, a label covering a node, a label failing
 * to expose enough of its route and arrowhead, or contact/overlap placement that
 * cannot produce a route preserving endpoint direction.
 *
 * connectorLabelAnchor tries the normal, normals of other segments, and for a
 * single segment, tangents outside the route. If the canvas remains too small,
 * emit this diagnostic rather than accepting overlap silently. Exclude straight /
 * polyline because authors explicitly define those routes, following the existing
 * planConnectorRoutes policy of diagnosing only orthogonal routes.
 */
function reportRouteDegradation(report, connector, points, context, gridReason) {
  if (typeof report !== "function") return;
  const { nodes, excludedIds, canvas = DEFAULT_CANVAS } = context;
  const pathHits = countNodeHits(points, nodes, excludedIds);
  const labelBox = connectorLabelBox(connector, points, canvas);
  const labelHits = labelBox
    ? nodes.filter(
        (node) => !excludedIds.has(node.id) && boxesOverlap(labelBox, node),
      ).length
    : 0;
  const requiredVisible = labelBox
    ? Math.min(MIN_VISIBLE_ROUTE_LENGTH, routeLength(points))
    : 0;
  const routeVisible = labelBox
    ? routeLengthOutsideBox(points, labelBox)
    : requiredVisible;
  const markerClear = labelBox
    ? terminalMarkerIsClear(connector, points, labelBox)
    : true;
  const labelPlacementInvalid =
    Boolean(labelBox) &&
    (routeVisible < requiredVisible - 0.001 || !markerClear);
  const invalidEndpointGeometry =
    gridReason === ROUTE_FALLBACK_REASONS.invalidEndpointGeometry;
  if (
    !pathHits &&
    !labelHits &&
    !invalidEndpointGeometry &&
    !labelPlacementInvalid
  ) {
    return;
  }
  report({
    from: connector.from,
    to: connector.to,
    sourcePath: connector.sourcePath,
    kind: pathHits
      ? "path-overlaps-node"
      : labelHits
        ? "label-overlaps-node"
        : invalidEndpointGeometry
          ? "invalid-endpoint-geometry"
          : "label-overlaps-route",
    reason:
      gridReason ||
      (labelPlacementInvalid
        ? ROUTE_FALLBACK_REASONS.labelPlacementImpossible
        : ROUTE_FALLBACK_REASONS.noCleanCandidate),
    pathOverlaps: pathHits,
    labelOverlaps: labelHits,
    routeVisible,
    requiredRouteVisible: requiredVisible,
    markerClear,
  });
}

/**
 * Determine routes for the complete diagram.
 *
 * Pass 0 performs the existing sequential placement, followed by a fixed number
 * of rip-up-and-reroute passes. Sequential placement chooses the first route before
 * any others exist, which can leave globally poor choices. Rerouting evaluates
 * each connector against all other routes and replaces it only when routeCost
 * definitely decreases.
 *
 * Determinism: fixed connector order, no randomness, and strict inequality for adoption.
 * Termination: cost is monotonically nonincreasing, with limits on passes and reroutes.
 */
function planConnectorRoutes(model, lookup) {
  const connectors = model.elements
    .filter((element) => element.type === "connector")
    .slice()
    .sort((left, right) => {
      const leftFrom = elementCenter(lookup.get(left.from));
      const leftTo = elementCenter(lookup.get(left.to));
      const rightFrom = elementCenter(lookup.get(right.from));
      const rightTo = elementCenter(lookup.get(right.to));
      const leftDistance =
        Math.abs(leftFrom.x - leftTo.x) + Math.abs(leftFrom.y - leftTo.y);
      const rightDistance =
        Math.abs(rightFrom.x - rightTo.x) + Math.abs(rightFrom.y - rightTo.y);
      return leftDistance - rightDistance || left.order - right.order;
    });
  const nodes = [...lookup.values()].filter(
    (element) => element.type === "node" || element.type === "image",
  );
  const standaloneRoutes = new Map(
    connectors
      .filter((connector) => connector.routing === "orthogonal")
      .map((connector) => [
        connector,
        computeConnectorRoute(connector, lookup, model.canvas),
      ]),
  );
  const routes = new Map();
  const occupied = [];
  const labels = new Map();
  // Reason grid search was abandoned for each route, used by final diagnostics.
  const reasons = new Map();
  const noteReason = (connector) => (reason) => {
    if (reason) reasons.set(connector, reason);
    else reasons.delete(connector);
  };
  for (const connector of connectors) {
    const route = computeConnectorRoute(connector, lookup, model.canvas, occupied, {
      occupiedLabels: [...labels.values()],
      detourBaseline: standaloneRoutes.get(connector),
      onReason: noteReason(connector),
    });
    routes.set(connector, route);
    occupied.push(route);
    const box = connectorLabelBox(connector, route, model.canvas);
    if (box) labels.set(connector, box);
  }

  const othersOf = (target) =>
    connectors.filter((c) => c !== target).map((c) => routes.get(c));
  const otherLabelsOf = (target) =>
    connectors.filter((c) => c !== target).map((c) => labels.get(c)).filter(Boolean);
  const costOf = (connector, points, others, otherLabels) =>
    routeCost(points, {
      nodes,
      excludedIds: new Set([connector.from, connector.to]),
      occupiedRoutes: others,
      occupiedLabels: otherLabels,
      connector,
      canvas: model.canvas,
    });

  let reroutes = 0;
  for (let pass = 0; pass < MAX_ROUTE_REFINEMENT_PASSES; pass += 1) {
    let improved = false;
    for (const connector of connectors) {
      // straight / polyline are author-defined shapes; do not reroute them automatically.
      if (connector.routing !== "orthogonal") continue;
      if (reroutes >= MAX_ROUTE_REFINEMENT_REROUTES) break;
      reroutes += 1;
      const others = othersOf(connector);
      const otherLabels = otherLabelsOf(connector);
      const current = routes.get(connector);
      const currentCost = costOf(connector, current, others, otherLabels);
      const currentCrossings = countRouteCrossings(current, others);
      const currentHidden = countHiddenContent(
        connector,
        current,
        nodes,
        model.canvas,
      );
      let candidateReason = null;
      const candidate = computeConnectorRoute(
        connector,
        lookup,
        model.canvas,
        others,
        {
          occupiedLabels: otherLabels,
          detourBaseline: standaloneRoutes.get(connector),
          onReason: (reason) => {
            candidateReason = reason;
          },
        },
      );
      if (routeHasImmediateBacktrack(candidate)) continue;
      if (costOf(connector, candidate, others, otherLabels) >= currentCost - ROUTE_IMPROVEMENT_EPSILON) {
        continue;
      }
      // Normally reject lower-cost routes that add crossings. This guard prohibits
      // trading extra crossings for label readability. Because only one connector
      // changes, this delta equals the change in total graph crossings.
      //
      // Allow only the exception that reveals a hidden node; one extra crossing is
      // preferable to an unreadable diagram.
      if (countRouteCrossings(candidate, others) > currentCrossings) {
        if (
          countHiddenContent(connector, candidate, nodes, model.canvas) >=
          currentHidden
        ) {
          continue;
        }
      }
      routes.set(connector, candidate);
      // Replace the reason only when replacing the route; do not retain rejected-candidate reasons.
      if (candidateReason) reasons.set(connector, candidateReason);
      else reasons.delete(connector);
      const box = connectorLabelBox(connector, candidate, model.canvas);
      if (box) labels.set(connector, box);
      else labels.delete(connector);
      improved = true;
    }
    if (!improved) break;
  }

  // Gather diagnostics once after finalizing the shape; reporting intermediate
  // states would include degradation resolved by later rerouting.
  const diagnostics = [];
  for (const connector of connectors) {
    if (connector.routing !== "orthogonal") continue;
    reportRouteDegradation(
      (entry) => diagnostics.push(entry),
      connector,
      routes.get(connector),
      {
        nodes,
        excludedIds: new Set([connector.from, connector.to]),
        occupiedRoutes: othersOf(connector),
        occupiedLabels: otherLabelsOf(connector),
        connector,
        canvas: model.canvas,
      },
      reasons.get(connector) || null,
    );
  }
  diagnostics.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to),
  );
  return { routes, diagnostics };
}

/**
 * Route midpoint and unit direction vector of its segment.
 * Direction determines how {@link labelEscapeNormal} moves a label away from the line.
 */
function pointAtHalfLength(points) {
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const length = Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y,
    );
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const span = lengths[index];
      const ratio = span ? remaining / span : 0;
      const deltaX = points[index + 1].x - points[index].x;
      const deltaY = points[index + 1].y - points[index].y;
      return {
        x: points[index].x + deltaX * ratio,
        y: points[index].y + deltaY * ratio,
        direction: span ? { x: deltaX / span, y: deltaY / span } : { x: 1, y: 0 },
      };
    }
    remaining -= lengths[index];
  }
  return { x: points[0].x, y: points[0].y, direction: { x: 1, y: 0 } };
}

function iconShapeAttributes(shape, textColor) {
  // Apply textColor as fill only to solid icons. Preserve attribute insertion order
  // as table order + fill so existing icon output remains byte-for-byte identical.
  return shape.solid ? { ...shape.attributes, fill: textColor } : shape.attributes;
}

function renderIcon(documentRef, element) {
  if (!element.icon) return null;
  const size = Math.min(58, element.height * 0.36, element.width * 0.2);
  const x = element.text
    ? element.x + Math.max(20, element.width * 0.08)
    : element.x + element.width / 2 - size / 2;
  const y = element.y + element.height / 2 - size / 2;
  const shapes = ICON_SHAPES[element.icon];
  if (!shapes) {
    // User-provided icon. Theme colors cannot modify <image> content, so omit
    // ineffective stroke / fill attributes and retain only meaningful attributes.
    const group = svgElement(documentRef, "g", {
      "data-architecture-icon": element.icon,
      "data-architecture-icon-source": "asset",
      transform: `translate(${x} ${y}) scale(${size / 24})`,
      "aria-hidden": "true",
      "pointer-events": "none",
    });
    group.appendChild(
      svgElement(documentRef, "image", {
        x: 0,
        y: 0,
        width: 24,
        height: 24,
        href: localAssetUrl(documentRef, element.icon),
        preserveAspectRatio: "xMidYMid meet",
      }),
    );
    return { group, size, x };
  }
  const group = svgElement(documentRef, "g", {
    "data-architecture-icon": element.icon,
    "data-architecture-icon-source": "builtin",
    transform: `translate(${x} ${y}) scale(${size / 24})`,
    fill: "none",
    stroke: element.style.textColor,
    "stroke-width": 1.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  for (const shape of shapes) {
    group.appendChild(
      svgElement(documentRef, shape.tag, iconShapeAttributes(shape, element.style.textColor)),
    );
  }
  return { group, size, x };
}

function renderGroup(documentRef, element) {
  const label = element.ariaLabel || element.title || `Group ${element.id}`;
  const group = svgElement(documentRef, "g", {
    "data-architecture-id": element.id,
    "data-architecture-type": "group",
    // Declaration order in the DSL. DOM order is rendering/z order and may differ.
    // Code requiring logical order independent of rendering must use this attribute.
    "data-architecture-order": element.order,
    opacity: element.style.opacity,
    role: "group",
    "aria-label": label,
  });
  appendSvgTitle(documentRef, group, label);
  group.appendChild(
    svgElement(documentRef, "rect", {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rx: element.style.cornerRadius,
      fill: element.style.fill,
      stroke: element.style.stroke,
      "stroke-width": element.style.strokeWidth,
      "stroke-dasharray": element.style.dash,
    }),
  );
  if (element.title) {
    const title = svgElement(documentRef, "text", {
      x: element.x + 24,
      y: element.y + element.style.fontSize * 1.35,
      fill: element.style.textColor,
      "font-size": element.style.fontSize,
      "font-weight": 700,
      "pointer-events": "none",
      // Visual only; aria-label / <title> above provide the accessible name.
      "aria-hidden": "true",
    });
    title.textContent = element.title;
    group.appendChild(title);
  }
  return group;
}

function renderNode(documentRef, element) {
  // Include meaningful built-in icon names in accessible names. User-provided
  // icons are only file paths and convey nothing when announced, so omit them;
  // authors needing meaning should provide text / ariaLabel.
  const label =
    element.ariaLabel ||
    [ICONS.has(element.icon) ? `${element.icon} icon` : "", element.text || element.id]
      .filter(Boolean)
      .join(", ");
  const group = svgElement(documentRef, "g", {
    "data-architecture-id": element.id,
    "data-architecture-type": "node",
    "data-architecture-order": element.order,
    opacity: element.style.opacity,
    role: "img",
    "aria-label": label,
  });
  appendSvgTitle(documentRef, group, label);
  const common = {
    fill: element.style.fill,
    stroke: element.style.stroke,
    "stroke-width": element.style.strokeWidth,
    "stroke-dasharray": element.style.dash,
  };
  if (element.shape === "ellipse") {
    group.appendChild(
      svgElement(documentRef, "ellipse", {
        cx: element.x + element.width / 2,
        cy: element.y + element.height / 2,
        rx: element.width / 2,
        ry: element.height / 2,
        ...common,
      }),
    );
  } else {
    group.appendChild(
      svgElement(documentRef, "rect", {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rx: element.shape === "rounded-rect" ? element.style.cornerRadius : 0,
        ...common,
      }),
    );
  }
  const icon = renderIcon(documentRef, element);
  if (icon) group.appendChild(icon.group);
  if (icon && element.text) {
    const textLeft = icon.x + icon.size + 16;
    const textRight = element.x + element.width - 16;
    appendText(documentRef, group, element, element.text, {
      centerX: (textLeft + textRight) / 2,
      availableWidth: Math.max(32, textRight - textLeft),
    });
  } else {
    appendText(documentRef, group, element, element.text);
  }
  return group;
}

function imageAccessibleName(element) {
  const filename = element.src.split("/").at(-1);
  return element.ariaLabel || filename || element.id;
}

function renderImage(documentRef, element, clipId) {
  const label = imageAccessibleName(element);
  const preserveAspectRatio = {
    contain: "xMidYMid meet",
    cover: "xMidYMid slice",
    stretch: "none",
  }[element.fit];
  const group = svgElement(documentRef, "g", {
    "data-architecture-id": element.id,
    "data-architecture-type": "image",
    "data-architecture-order": element.order,
    "data-architecture-src": element.src,
    opacity: element.style.opacity,
    role: "img",
    "aria-label": label,
  });
  appendSvgTitle(documentRef, group, label);
  group.appendChild(
    svgElement(documentRef, "rect", {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rx: element.style.cornerRadius,
      fill: element.style.fill,
      stroke: "none",
    }),
  );
  group.appendChild(
    svgElement(documentRef, "image", {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      href: localAssetUrl(documentRef, element.src),
      preserveAspectRatio,
      "clip-path": `url(#${clipId})`,
      "aria-hidden": "true",
    }),
  );
  group.appendChild(
    svgElement(documentRef, "rect", {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rx: element.style.cornerRadius,
      fill: "none",
      stroke: element.style.stroke,
      "stroke-width": element.style.strokeWidth,
      "stroke-dasharray": element.style.dash,
      "pointer-events": "none",
      "aria-hidden": "true",
    }),
  );
  return group;
}

/**
 * Build a table resolving connector endpoints to names used by assistive technology.
 *
 * Endpoints use IDs, which are often machine-oriented values such as `svc-a1` or
 * `db-primary`. Announcing them directly does not match visible node `text` or
 * group `title`, making it difficult to identify which line is being described.
 *
 * Therefore **use a visible label when available and otherwise fall back to the ID**.
 * Keep IDs in `data-architecture-connector` because editing mode and existing
 * tests depend on it; change only the accessible name and `<title>`.
 *
 * @param {Array<object>} elements Flattened element list.
 * @returns {Map<string, string>} ID-to-visible-label map, excluding IDs without visible labels.
 */
function endpointDisplayNames(elements) {
  const names = new Map();
  for (const element of elements) {
    if (!element || element.type === "connector" || typeof element.id !== "string") continue;
    const visible =
      element.type === "group"
        ? element.title
        : element.type === "image"
          ? imageAccessibleName(element)
          : element.text;
    if (typeof visible !== "string") continue;
    const trimmed = visible.trim();
    if (trimmed) names.set(element.id, trimmed);
  }
  return names;
}

/**
 * Default accessible name for a connector, used only when `ariaLabel` is absent.
 *
 * @param {object} element Connector element.
 * @param {Map<string, string>} [endpointNames] Result of {@link endpointDisplayNames}.
 * @returns {string} Text in the form `<from> to <to>[: <label>]`.
 */
function describeConnector(element, endpointNames) {
  const from = endpointNames?.get(element.from) || element.from;
  const to = endpointNames?.get(element.to) || element.to;
  return `${from} to ${to}${element.label ? `: ${element.label}` : ""}`;
}

function renderConnector(
  documentRef,
  element,
  points,
  markerId,
  endpointNames,
  canvas,
) {
  const label = element.ariaLabel || describeConnector(element, endpointNames);
  const group = svgElement(documentRef, "g", {
    opacity: element.style.opacity,
    "data-architecture-connector": `${element.from}-${element.to}`,
    "data-architecture-type": "connector",
    "data-architecture-order": element.order,
    "data-architecture-label-layer": element.labelLayer,
    role: "group",
    "aria-label": label,
  });
  appendSvgTitle(documentRef, group, label);
  group.appendChild(
    svgElement(documentRef, "path", {
      d: points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "),
      fill: "none",
      stroke: element.style.stroke,
      "stroke-width": element.style.strokeWidth,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      "stroke-dasharray": element.style.dash,
      "marker-end": element.arrow ? `url(#${markerId})` : "",
    }),
  );
  let frontLabel = null;
  if (element.label) {
    const fittedLabel = connectorLabelMetrics(element, canvas);
    const position = connectorLabelAnchor(element, points, fittedLabel, canvas);
    const { width, height } = fittedLabel;
    const labelGroup = svgElement(documentRef, "g", {
      "data-architecture-connector-label": `${element.from}-${element.to}`,
      "data-architecture-label-layer": element.labelLayer,
      "pointer-events": "none",
      "aria-hidden": "true",
      ...(element.labelLayer === "front" ? { opacity: element.style.opacity } : {}),
    });
    labelGroup.appendChild(
      svgElement(documentRef, "rect", {
        x: position.x - width / 2,
        y: position.y - height / 2,
        width,
        height,
        rx: height / 2,
        fill: "var(--surface)",
        stroke: "var(--border)",
        "stroke-width": CONNECTOR_LABEL_STROKE_WIDTH,
      }),
    );
    const text = svgElement(documentRef, "text", {
      x: position.x,
      y: position.y,
      fill: element.style.textColor,
      "font-size": fittedLabel.fontSize,
      "font-weight": 600,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      // Visual only. Width may truncate it, so the parent's aria-label is authoritative.
      "aria-hidden": "true",
    });
    text.textContent = fittedLabel.text;
    labelGroup.appendChild(text);
    if (element.labelLayer === "front") frontLabel = labelGroup;
    else group.appendChild(labelGroup);
  }
  return { group, frontLabel };
}

export function architectureSemanticSnapshot(model) {
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const { routes: connectorRoutes, diagnostics } = planConnectorRoutes(model, lookup);
  return {
    version: model.version,
    canvas: model.canvas,
    routing: {
      degraded: diagnostics.length > 0,
      diagnostics,
    },
    elements: model.elements.map((element) => {
      if (element.type === "connector") {
        return {
          type: "connector",
          from: element.from,
          to: element.to,
          fromPort: element.fromPort,
          toPort: element.toPort,
          lane: element.lane,
          points: connectorRoutes.get(element),
        };
      }
      return {
        type: element.type,
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        ...(element.type === "node" ? { icon: element.icon || undefined } : {}),
        ...(element.type === "image" ? { src: element.src, fit: element.fit } : {}),
      };
    }),
  };
}

export function renderArchitectureDiagram(
  model,
  documentRef = globalThis.document,
) {
  if (!documentRef?.createElementNS || !documentRef?.createElement) {
    throw new ArchitectureError("diagram: a DOM document is required for SVG rendering");
  }
  const wrapper = documentRef.createElement("div");
  wrapper.className = "architecture-diagram";
  const renderId = ++renderSequence;
  const titleId = `architecture-title-${renderId}`;
  const descriptionId = `architecture-description-${renderId}`;
  const svg = svgElement(documentRef, "svg", {
    class: "architecture-svg",
    viewBox: `0 0 ${model.canvas.width} ${model.canvas.height}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "group",
    "aria-labelledby": `${titleId} ${descriptionId}`,
    // Normal and presenter views have no interactive controls inside the diagram,
    // so use **one tab stop for the complete diagram** rather than one per element.
    // Keyboard users can reach it and hear <title> and <desc>, the diagram summary.
    // Editing mode (architecture-editor.mjs) handles element-level traversal.
    tabindex: "0",
  });
  const title = svgElement(documentRef, "title", { id: titleId });
  title.textContent = model.title;
  svg.appendChild(title);
  const description = svgElement(documentRef, "desc", { id: descriptionId });
  description.textContent = model.description;
  svg.appendChild(description);

  const defs = svgElement(documentRef, "defs");
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const { routes: connectorRoutes, diagnostics: routingDiagnostics } =
    planConnectorRoutes(model, lookup);
  model.elements.forEach((element, index) => {
    if (element.type === "image") {
      const clipPath = svgElement(documentRef, "clipPath", {
        id: `architecture-image-clip-${renderId}-${index}`,
      });
      clipPath.appendChild(
        svgElement(documentRef, "rect", {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          rx: element.style.cornerRadius,
        }),
      );
      defs.appendChild(clipPath);
    }
    if (element.type !== "connector" || !element.arrow) return;
    const markerId = `architecture-arrow-${renderId}-${index}`;
    const marker = svgElement(documentRef, "marker", {
      id: markerId,
      viewBox: `0 0 ${CONNECTOR_MARKER_VIEWBOX_SIZE} ${CONNECTOR_MARKER_VIEWBOX_SIZE}`,
      refX: CONNECTOR_MARKER_REF_X,
      refY: CONNECTOR_MARKER_REF_Y,
      markerWidth: CONNECTOR_MARKER_SIZE,
      markerHeight: CONNECTOR_MARKER_SIZE,
      orient: "auto-start-reverse",
      markerUnits: "strokeWidth",
    });
    marker.appendChild(
      svgElement(documentRef, "path", {
        d: "M 0 0 L 10 5 L 0 10 z",
        fill: element.style.stroke,
      }),
    );
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  // Table for announcing connector endpoints by visible label; traverse elements only once.
  const endpointNames = endpointDisplayNames(model.elements);
  const frontLabels = [];

  model.elements.forEach((element, index) => {
    if (element.type === "group") {
      svg.appendChild(renderGroup(documentRef, element));
    } else if (element.type === "node") {
      svg.appendChild(renderNode(documentRef, element));
    } else if (element.type === "image") {
      svg.appendChild(
        renderImage(documentRef, element, `architecture-image-clip-${renderId}-${index}`),
      );
    } else {
      const rendered = renderConnector(
        documentRef,
        element,
        connectorRoutes.get(element),
        `architecture-arrow-${renderId}-${index}`,
        endpointNames,
        model.canvas,
      );
      svg.appendChild(rendered.group);
      if (rendered.frontLabel) frontLabels.push(rendered.frontLabel);
    }
  });
  frontLabels.forEach((label) => svg.appendChild(label));
  wrapper.appendChild(svg);
  appendRoutingWarning(documentRef, wrapper, routingDiagnostics);
  return wrapper;
}

/**
 * Notify the author of degraded routing.
 *
 * Do not throw ArchitectureError; that would be a breaking change turning previously
 * renderable diagrams into error blocks. Report through three channels instead:
 *
 *  1. A strip below the diagram (role="status" / aria-live="polite").
 *     Use "status", not "alert", because this is quality degradation rather than
 *     an error and should not interrupt screen-reader output during a presentation.
 *  2. The wrapper's data-architecture-routing attribute for tests and automation.
 *  3. console.warn for authoring visibility. console.error would make visual
 *     regression tests fail by treating it as a page JavaScript error.
 */
function appendRoutingWarning(documentRef, wrapper, diagnostics) {
  if (!diagnostics?.length) return;
  wrapper.setAttribute("data-architecture-routing", "degraded");
  const summary = diagnostics
    .map(
      (entry) =>
        `${entry.sourcePath}: ${entry.from} -> ${entry.to} (${entry.kind}, ${entry.reason})`,
    )
    .join("; ");
  globalThis.console?.warn?.(
    `architecture: ${diagnostics.length} connector route(s) could not be rendered cleanly; ${summary}`,
  );
  const banner = documentRef.createElement("div");
  banner.className = "architecture-routing-warning";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  const heading = documentRef.createElement("strong");
  heading.textContent = `Connector routing degraded (${diagnostics.length})`;
  banner.appendChild(heading);
  const detail = documentRef.createElement("span");
  detail.textContent = `${summary}. Add "routing": "polyline" with explicit points, or move the elements apart.`;
  banner.appendChild(detail);
  wrapper.appendChild(banner);
}

export function renderArchitectureBlock(
  source,
  documentRef = globalThis.document,
) {
  try {
    return renderArchitectureDiagram(parseArchitecture(source), documentRef);
  } catch (error) {
    const wrapper = documentRef.createElement("div");
    wrapper.className = "architecture-error";
    wrapper.setAttribute("role", "alert");
    const heading = documentRef.createElement("strong");
    heading.textContent = "Architecture diagram error";
    const detail = documentRef.createElement("span");
    detail.textContent = error?.message || "The diagram could not be rendered.";
    wrapper.appendChild(heading);
    wrapper.appendChild(detail);
    return wrapper;
  }
}

export {
  ArchitectureError,
  CONNECTOR_LABEL_CLEARANCE,
  DSL_VERSION,
  ICONS,
  ICON_ASSET_PATTERN,
  ASSET_EXTENSIONS,
  ASSET_PATH_PATTERN,
  ID_PATTERN,
  IMAGE_FITS,
  LABEL_LAYERS,
  LAYOUT_DIRECTIONS,
  LAYOUTS,
  LITERAL_COLORS,
  MAX_CONNECTORS,
  MAX_DEPTH,
  MAX_ELEMENTS,
  MAX_ICON_REFERENCE,
  MAX_POINTS,
  MAX_ROUTE_REFINEMENT_PASSES,
  MAX_ROUTING_GRID_COORDINATES,
  MAX_ROUTING_GRID_POINTS,
  MAX_ROUTING_GRID_VISITS,
  MAX_SOURCE_LENGTH,
  MAX_TOTAL_TEXT,
  MIN_CONNECTOR_LABEL_WIDTH,
  MIN_VISIBLE_ROUTE_LENGTH,
  PORTS,
  ROUTE_FALLBACK_REASONS,
  ROUTINGS,
  SHAPES,
  THEME_TOKENS,
  connectorLabelAnchor,
  connectorLabelBox,
  connectorLabelMetrics,
  pointAtHalfLength,
  routeLengthOutsideBox,
};
