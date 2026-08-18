const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_CANVAS = Object.freeze({ width: 1600, height: 900 });
const DSL_VERSION = 1;
const MAX_SOURCE_LENGTH = 64 * 1024;
const MAX_ELEMENTS = 200;
const MAX_CONNECTORS = 100;
const MAX_TOTAL_TEXT = 20_000;
const MAX_DEPTH = 4;
const MAX_POINTS = 12;
const CONNECTOR_ENDPOINT_GAP = 14;
const CONNECTOR_LANE_SPACING = 52;
const MAX_CONNECTOR_LABEL_WIDTH = 560;
const CONNECTOR_LABEL_PADDING = 28;
const MIN_FONT_SIZE = 8;
const MAX_ROUTING_GRID_COORDINATES = 120;
const MAX_ROUTING_GRID_POINTS = 10_000;
const MAX_ROUTING_GRID_VISITS = 20_000;
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SHAPES = new Set(["rect", "rounded-rect", "ellipse"]);
const ROUTINGS = new Set(["straight", "orthogonal", "polyline"]);
const PORTS = new Set(["auto", "top", "right", "bottom", "left"]);
const LAYOUTS = new Set(["row", "column", "grid"]);
const ICONS = new Set(["cloud", "database", "api", "user", "server"]);
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
  connector: new Set([
    "type",
    "from",
    "to",
    "fromPort",
    "toPort",
    "label",
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

function fail(path, message) {
  throw new ArchitectureError(`${path}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function expectObject(value, path) {
  if (!isObject(value)) fail(path, "must be an object");
  return value;
}

function rejectUnknownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "is not supported");
  }
}

function numberIn(value, path, min, max, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    fail(path, "must be a finite number");
  }
  if (candidate < min || candidate > max) {
    fail(path, `must be between ${min} and ${max}`);
  }
  return candidate;
}

function textValue(value, path, fallback = "", maxLength = 500) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string") fail(path, "must be a string");
  if (candidate.length > maxLength) fail(path, `must be at most ${maxLength} characters`);
  return candidate;
}

function idValue(value, path) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    fail(path, "must start with a letter and contain only letters, numbers, '.', '_' or '-'");
  }
  return value;
}

function enumValue(value, path, values, fallback) {
  const candidate = textValue(value, path, fallback, 32);
  if (!values.has(candidate)) fail(path, `must be one of: ${[...values].join(", ")}`);
  return candidate;
}

function colorValue(value, path, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string") fail(path, "must be a theme token or color string");
  if (Object.prototype.hasOwnProperty.call(THEME_TOKENS, candidate)) {
    return THEME_TOKENS[candidate];
  }
  if (LITERAL_COLORS.test(candidate)) return candidate;
  fail(path, "must be a theme token, hex color, black, white, transparent, or none");
}

function normalizeStyle(value, path, defaults) {
  const style = value === undefined ? {} : expectObject(value, path);
  rejectUnknownKeys(style, STYLE_KEYS, path);
  const dash = textValue(style.dash, `${path}.dash`, defaults.dash || "", 40);
  if (dash && !/^\d+(?:\.\d+)?(?:[ ,]+\d+(?:\.\d+)?)*$/.test(dash)) {
    fail(`${path}.dash`, "must contain only non-negative dash lengths");
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
    };
  }
  const layout = expectObject(value, path);
  rejectUnknownKeys(layout, LAYOUT_KEYS, path);
  const gap = numberIn(layout.gap, `${path}.gap`, 0, 240, 36);
  return {
    type: enumValue(layout.type, `${path}.type`, LAYOUTS),
    gap,
    rowGap: numberIn(layout.rowGap, `${path}.rowGap`, 0, 240, gap),
    columnGap: numberIn(layout.columnGap, `${path}.columnGap`, 0, 240, gap),
    padding: numberIn(layout.padding, `${path}.padding`, 0, 400, 54),
    columns: Math.trunc(numberIn(layout.columns, `${path}.columns`, 1, 12, 3)),
  };
}

function layoutPlacements(children, group, layout, path) {
  if (!layout) return new Map();
  const flowItems = children
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => child?.type === "node" || child?.type === "group");
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
    fail(`${path}.layout`, "padding and title leave no space for children");
  }
  const count = flowItems.length;
  const columns =
    layout.type === "column"
      ? 1
      : layout.type === "row"
        ? count
        : Math.min(layout.columns, count);
  const rows = Math.ceil(count / columns);
  const cellWidth = (inner.width - layout.columnGap * (columns - 1)) / columns;
  const cellHeight = (inner.height - layout.rowGap * (rows - 1)) / rows;
  if (cellWidth < 24 || cellHeight < 24) {
    fail(`${path}.layout`, "children do not fit; reduce gap/padding or add group space");
  }
  flowItems.forEach(({ child, index }, flowIndex) => {
    const column = flowIndex % columns;
    const row = Math.floor(flowIndex / columns);
    const defaultWidth = child.type === "group" ? cellWidth : Math.min(cellWidth, 340);
    const defaultHeight = child.type === "group" ? cellHeight : Math.min(cellHeight, 170);
    const width = numberIn(child.width, `${path}.children[${index}].width`, 1, cellWidth, defaultWidth);
    const height = numberIn(
      child.height,
      `${path}.children[${index}].height`,
      1,
      cellHeight,
      defaultHeight,
    );
    placements.set(index, {
      x:
        inner.x +
        column * (cellWidth + layout.columnGap) +
        (cellWidth - width) / 2,
      y:
        inner.y +
        row * (cellHeight + layout.rowGap) +
        (cellHeight - height) / 2,
      width,
      height,
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
) {
  if (!Array.isArray(rawElements)) fail(path, "must be an array");
  if (depth > MAX_DEPTH) fail(path, `nesting must not exceed ${MAX_DEPTH} levels`);

  rawElements.forEach((raw, localIndex) => {
    if (output.length >= MAX_ELEMENTS) fail("elements", `must contain at most ${MAX_ELEMENTS} items`);
    const elementPath = `${path}[${localIndex}]`;
    const element = expectObject(raw, elementPath);
    const type = textValue(element.type, `${elementPath}.type`, "", 20);
    if (!Object.prototype.hasOwnProperty.call(ELEMENT_KEYS, type)) {
      fail(`${elementPath}.type`, "must be node, group, or connector");
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
        fail(`${elementPath}.points`, `must be an array with at most ${MAX_POINTS} points`);
      }
      if (routing !== "polyline" && points.length) {
        fail(`${elementPath}.points`, "is only valid with polyline routing");
      }
      if (element.arrow !== undefined && typeof element.arrow !== "boolean") {
        fail(`${elementPath}.arrow`, "must be a boolean");
      }
      output.push({
        type,
        from: idValue(element.from, `${elementPath}.from`),
        to: idValue(element.to, `${elementPath}.to`),
        fromPort: enumValue(element.fromPort, `${elementPath}.fromPort`, PORTS, "auto"),
        toPort: enumValue(element.toPort, `${elementPath}.toPort`, PORTS, "auto"),
        label: textValue(element.label, `${elementPath}.label`, "", 200),
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
    if (ids.has(id)) fail(`${elementPath}.id`, `duplicates '${id}'`);
    ids.add(id);
    const box = normalizeBox(element, origin, elementPath, placements.get(localIndex));

    if (type === "node") {
      const shape = enumValue(
        element.shape,
        `${elementPath}.shape`,
        SHAPES,
        "rounded-rect",
      );
      const icon =
        element.icon === undefined
          ? ""
          : enumValue(element.icon, `${elementPath}.icon`, ICONS);
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
    const childPlacements = layoutPlacements(children, group, group.layout, elementPath);
    flattenElements(
      children,
      { x: group.x, y: group.y },
      depth + 1,
      output,
      ids,
      `${elementPath}.children`,
      childPlacements,
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
      fail(`${connector.sourcePath}.lane`, `duplicates explicit lane ${connector.lane}`);
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
        fail(record.connector.sourcePath, "has no available connector lane");
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

export function parseArchitecture(source) {
  if (typeof source !== "string") fail("diagram", "must be JSON text");
  if (source.length > MAX_SOURCE_LENGTH) {
    fail("diagram", `must be at most ${MAX_SOURCE_LENGTH} characters`);
  }
  let raw;
  try {
    raw = JSON.parse(source);
  } catch (error) {
    const detail = error?.message ? ` (${error.message})` : "";
    fail("diagram", `contains invalid JSON${detail}`);
  }
  const root = expectObject(raw, "diagram");
  rejectUnknownKeys(root, new Set(["version", "canvas", "title", "description", "elements"]), "diagram");
  const version = numberIn(root.version, "version", DSL_VERSION, DSL_VERSION, DSL_VERSION);
  if (!Number.isInteger(version)) fail("version", "must be an integer");
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
  flattenElements(root.elements, { x: 0, y: 0 }, 0, model.elements, ids);
  const connectable = new Set(
    model.elements.filter((element) => element.type !== "connector").map((element) => element.id),
  );
  let connectorCount = 0;
  model.elements.forEach((element) => {
    if (element.type !== "connector") return;
    connectorCount += 1;
    if (!connectable.has(element.from)) {
      fail(`${element.sourcePath}.from`, `references unknown element '${element.from}'`);
    }
    if (!connectable.has(element.to)) {
      fail(`${element.sourcePath}.to`, `references unknown element '${element.to}'`);
    }
    if (element.from === element.to) {
      fail(element.sourcePath, "self-referencing connectors are not supported");
    }
  });
  if (connectorCount > MAX_CONNECTORS) {
    fail("elements", `must contain at most ${MAX_CONNECTORS} connectors`);
  }
  if (totalTextLength(model) > MAX_TOTAL_TEXT) {
    fail("diagram", `text content must be at most ${MAX_TOTAL_TEXT} characters`);
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

function routeHitsNodes(points, nodes, excludedIds) {
  for (let index = 1; index < points.length; index++) {
    for (const node of nodes) {
      if (excludedIds.has(node.id)) continue;
      if (segmentIntersectsBox(points[index - 1], points[index], node)) return true;
    }
  }
  return false;
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

function chooseRoute(candidates, nodes, excludedIds, occupiedRoutes) {
  const safe = candidates.filter(
    (points) => !routeHitsNodes(points, nodes, excludedIds),
  );
  const available = safe.length ? safe : candidates;
  if (!occupiedRoutes.length) return available[0];
  return available.reduce((best, candidate) =>
    routeInteractionScore(candidate, occupiedRoutes) <
    routeInteractionScore(best, occupiedRoutes)
      ? candidate
      : best,
  );
}

function gridRoute(start, end, nodes, excludedIds, canvas, occupiedRoutes) {
  const obstacles = nodes.filter((node) => !excludedIds.has(node.id));
  const xs = new Set([0, canvas.width, start.x, end.x]);
  const ys = new Set([0, canvas.height, start.y, end.y]);
  for (const node of obstacles) {
    xs.add(Math.max(0, node.x - 19));
    xs.add(Math.min(canvas.width, node.x + node.width + 19));
    ys.add(Math.max(0, node.y - 19));
    ys.add(Math.min(canvas.height, node.y + node.height + 19));
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
    return null;
  }
  const xValues = [...xs].sort((left, right) => left - right);
  const yValues = [...ys].sort((left, right) => left - right);
  const keyOf = (point) => `${point.x},${point.y}`;
  const insideObstacle = (point) =>
    obstacles.some(
      (node) =>
        point.x > node.x - 18 &&
        point.x < node.x + node.width + 18 &&
        point.y > node.y - 18 &&
        point.y < node.y + node.height + 18,
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
      if (routeHitsNodes([from, to], nodes, excludedIds)) continue;
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
  if (!points.has(startKey) || !points.has(endKey)) return null;
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
      const nextPointKey = keyOf(neighbor);
      const nextState = stateKey(nextPointKey, nextDirection);
      if (nextDistance >= (distances.get(nextState) ?? Infinity)) continue;
      distances.set(nextState, nextDistance);
      previous.set(nextState, currentState);
      push({ state: nextState, distance: nextDistance });
    }
  }
  if (!finalState) return null;
  const route = [];
  for (let state = finalState; state; state = previous.get(state)) {
    route.push(points.get(state.slice(0, state.lastIndexOf("|"))));
  }
  return compressPoints(route.reverse());
}

export function computeConnectorRoute(
  connector,
  lookup,
  canvas = DEFAULT_CANVAS,
  occupiedRoutes = [],
) {
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
  const start = offsetPoint(
    fromPort.point,
    fromPort.direction,
    CONNECTOR_ENDPOINT_GAP,
  );
  const end = offsetPoint(
    toPort.point,
    toPort.direction,
    CONNECTOR_ENDPOINT_GAP,
  );
  if (connector.routing === "straight") return [start, end];

  const nodes = [...lookup.values()].filter((element) => element.type === "node");
  const excluded = new Set([connector.from, connector.to]);
  const clearance = 42 + Math.abs(laneOffset) * 0.3;
  const fromStub = offsetPoint(
    start,
    fromPort.direction,
    availableStubDistance(start, fromPort.direction, clearance, nodes, excluded),
  );
  const toStub = offsetPoint(
    end,
    toPort.direction,
    availableStubDistance(end, toPort.direction, clearance, nodes, excluded),
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
  candidates = candidates.map((points) =>
    compressPoints([
      start,
      fromStub,
      ...points.slice(1, -1),
      toStub,
      end,
    ]),
  ).filter(routeIsOrthogonal);
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
  const selected = chooseRoute(candidates, nodes, excluded, occupiedRoutes);
  const selectedHitsNodes = routeHitsNodes(selected, nodes, excluded);
  const selectedInteraction = routeInteractionScore(selected, occupiedRoutes);
  if (selectedHitsNodes || (occupiedRoutes.length && selectedInteraction > 0)) {
    const alternateCore = gridRoute(
      fromStub,
      toStub,
      nodes,
      excluded,
      canvas,
      occupiedRoutes,
    );
    const alternate = alternateCore
      ? compressPoints([start, fromStub, ...alternateCore, toStub, end])
      : null;
    if (
      alternate &&
      (!routeHitsNodes(alternate, nodes, excluded)) &&
      (selectedHitsNodes ||
        routeInteractionScore(alternate, occupiedRoutes) < selectedInteraction)
    ) {
      return alternate;
    }
  }
  return selected;
}

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
  const routes = new Map();
  const occupied = [];
  for (const connector of connectors) {
    const route = computeConnectorRoute(
      connector,
      lookup,
      model.canvas,
      occupied,
    );
    routes.set(connector, route);
    occupied.push(route);
  }
  return routes;
}

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
      const ratio = lengths[index] ? remaining / lengths[index] : 0;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    remaining -= lengths[index];
  }
  return points[0];
}

function renderIcon(documentRef, element) {
  if (!element.icon) return null;
  const size = Math.min(58, element.height * 0.36, element.width * 0.2);
  const x = element.text
    ? element.x + Math.max(20, element.width * 0.08)
    : element.x + element.width / 2 - size / 2;
  const y = element.y + element.height / 2 - size / 2;
  const group = svgElement(documentRef, "g", {
    "data-architecture-icon": element.icon,
    transform: `translate(${x} ${y}) scale(${size / 24})`,
    fill: "none",
    stroke: element.style.textColor,
    "stroke-width": 1.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    "pointer-events": "none",
  });
  if (element.icon === "cloud") {
    group.appendChild(
      svgElement(documentRef, "path", {
        d: "M6 18h11.5a4.5 4.5 0 0 0 .7-8.95A6.5 6.5 0 0 0 5.7 8.2 5 5 0 0 0 6 18Z",
      }),
    );
  } else if (element.icon === "database") {
    group.appendChild(svgElement(documentRef, "ellipse", { cx: 12, cy: 5, rx: 8, ry: 3 }));
    group.appendChild(svgElement(documentRef, "path", { d: "M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" }));
  } else if (element.icon === "api") {
    group.appendChild(svgElement(documentRef, "path", { d: "m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" }));
  } else if (element.icon === "user") {
    group.appendChild(svgElement(documentRef, "circle", { cx: 12, cy: 8, r: 4 }));
    group.appendChild(svgElement(documentRef, "path", { d: "M4 22a8 8 0 0 1 16 0" }));
  } else {
    group.appendChild(svgElement(documentRef, "rect", { x: 3, y: 3, width: 18, height: 7, rx: 1.5 }));
    group.appendChild(svgElement(documentRef, "rect", { x: 3, y: 14, width: 18, height: 7, rx: 1.5 }));
    group.appendChild(svgElement(documentRef, "circle", { cx: 7, cy: 6.5, r: 0.8, fill: element.style.textColor }));
    group.appendChild(svgElement(documentRef, "circle", { cx: 7, cy: 17.5, r: 0.8, fill: element.style.textColor }));
  }
  return { group, size, x };
}

function renderGroup(documentRef, element) {
  const label = element.ariaLabel || element.title || `Group ${element.id}`;
  const group = svgElement(documentRef, "g", {
    "data-architecture-id": element.id,
    "data-architecture-type": "group",
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
    });
    title.textContent = element.title;
    group.appendChild(title);
  }
  return group;
}

function renderNode(documentRef, element) {
  const label =
    element.ariaLabel ||
    [element.icon ? `${element.icon} icon` : "", element.text || element.id]
      .filter(Boolean)
      .join(", ");
  const group = svgElement(documentRef, "g", {
    "data-architecture-id": element.id,
    "data-architecture-type": "node",
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

function renderConnector(documentRef, element, points, markerId) {
  const label =
    element.ariaLabel ||
    `${element.from} to ${element.to}${element.label ? `: ${element.label}` : ""}`;
  const group = svgElement(documentRef, "g", {
    opacity: element.style.opacity,
    "data-architecture-connector": `${element.from}-${element.to}`,
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
  if (element.label) {
    const position = pointAtHalfLength(points);
    const fittedLabel = fitTextToWidth(
      element.label,
      element.style.fontSize,
      MAX_CONNECTOR_LABEL_WIDTH - CONNECTOR_LABEL_PADDING,
    );
    const width = Math.min(
      MAX_CONNECTOR_LABEL_WIDTH,
      Math.max(70, fittedLabel.width + CONNECTOR_LABEL_PADDING),
    );
    const height = fittedLabel.fontSize * 1.55;
    group.appendChild(
      svgElement(documentRef, "rect", {
        x: position.x - width / 2,
        y: position.y - height / 2,
        width,
        height,
        rx: height / 2,
        fill: "var(--surface)",
        stroke: "var(--border)",
        "stroke-width": 2,
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
      "pointer-events": "none",
    });
    text.textContent = fittedLabel.text;
    group.appendChild(text);
  }
  return group;
}

export function createOverridePayload(offsets) {
  const overrides = [...offsets.entries()]
    .filter(([, offset]) => offset.x !== 0 || offset.y !== 0)
    .map(([id, offset]) => ({ id, x: offset.x, y: offset.y }));
  return { version: DSL_VERSION, overrides };
}

function attachArchitectureEditor(wrapper, documentRef) {
  const svg = wrapper.querySelector("svg");
  if (!svg) return;
  wrapper.classList.add("architecture-editable");
  const toolbar = documentRef.createElement("div");
  toolbar.className = "architecture-editor-toolbar";
  const copy = documentRef.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy overrides";
  const status = documentRef.createElement("span");
  status.className = "architecture-editor-status";
  status.setAttribute("aria-live", "polite");
  toolbar.appendChild(copy);
  toolbar.appendChild(status);
  wrapper.prepend(toolbar);

  const offsets = new Map();
  let selected = null;
  const select = (node) => {
    if (selected === node) return;
    selected?.classList.remove("architecture-selected");
    selected = node;
    if (!selected) return;
    selected.classList.add("architecture-selected");
    selected.focus();
    status.textContent = `Selected ${selected.dataset.architectureId}`;
  };
  const move = (node, event) => {
    if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    select(node);
    const step = event.shiftKey ? 1 : 10;
    const id = node.dataset.architectureId;
    const offset = offsets.get(id) || { x: 0, y: 0 };
    if (event.key === "ArrowLeft") offset.x -= step;
    if (event.key === "ArrowRight") offset.x += step;
    if (event.key === "ArrowUp") offset.y -= step;
    if (event.key === "ArrowDown") offset.y += step;
    offsets.set(id, offset);
    node.setAttribute("transform", `translate(${offset.x} ${offset.y})`);
    status.textContent = `${id}: x ${offset.x}, y ${offset.y}`;
  };
  svg.querySelectorAll('[data-architecture-type="node"]').forEach((node) => {
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-keyshortcuts", "ArrowUp ArrowRight ArrowDown ArrowLeft");
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      select(node);
    });
    node.addEventListener("focus", () => select(node));
    node.addEventListener("keydown", (event) => move(node, event));
  });
  svg.addEventListener("click", () => select(null));
  copy.addEventListener("click", async () => {
    const payload = JSON.stringify(createOverridePayload(offsets), null, 2);
    try {
      await globalThis.navigator.clipboard.writeText(payload);
      status.textContent = "Override JSON copied";
    } catch (error) {
      status.textContent = `Copy failed: ${error?.message || "clipboard unavailable"}`;
    }
  });
}

export function architectureSemanticSnapshot(model) {
  const lookup = new Map(
    model.elements
      .filter((element) => element.type !== "connector")
      .map((element) => [element.id, element]),
  );
  const connectorRoutes = planConnectorRoutes(model, lookup);
  return {
    version: model.version,
    canvas: model.canvas,
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
        icon: element.icon || undefined,
      };
    }),
  };
}

export function renderArchitectureDiagram(
  model,
  documentRef = globalThis.document,
  options = {},
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
  const connectorRoutes = planConnectorRoutes(model, lookup);
  model.elements.forEach((element, index) => {
    if (element.type !== "connector" || !element.arrow) return;
    const markerId = `architecture-arrow-${renderId}-${index}`;
    const marker = svgElement(documentRef, "marker", {
      id: markerId,
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
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

  model.elements.forEach((element, index) => {
    if (element.type === "group") {
      svg.appendChild(renderGroup(documentRef, element));
    } else if (element.type === "node") {
      svg.appendChild(renderNode(documentRef, element));
    } else {
      svg.appendChild(
        renderConnector(
          documentRef,
          element,
          connectorRoutes.get(element),
          `architecture-arrow-${renderId}-${index}`,
        ),
      );
    }
  });
  wrapper.appendChild(svg);
  if (options.editable) attachArchitectureEditor(wrapper, documentRef);
  return wrapper;
}

export function renderArchitectureBlock(
  source,
  documentRef = globalThis.document,
  options = {},
) {
  try {
    return renderArchitectureDiagram(parseArchitecture(source), documentRef, options);
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
  DSL_VERSION,
  ICONS,
  MAX_CONNECTORS,
  MAX_ELEMENTS,
  MAX_SOURCE_LENGTH,
  THEME_TOKENS,
};
