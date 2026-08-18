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

// ---------------------------------------------------------------- ルート費用
// 経路の良し悪しを 1 本のスカラーに畳み込む。桁を大きく離してあるので比較は
// 実質「ノード貫通 > ラベルがノードを隠す > 交差 > ラベル衝突 > 曲がり > 長さ」
// の辞書式順序になる。逐次配置と後段の再配線が同じ物差しを使うことで、
// 全体費用が下がったときだけ経路を差し替えられる。
//
// 重みの根拠: 「内容が読めなくなる」ものを最優先で潰す。ノード貫通は図が破綻する
// ので最大。ラベルがノードを覆うと文字が消えるので交差より重い。交差 1 本は
// routeInteractionScore が 100 を返すので実効 10,000。ラベル同士やラベルと線の
// 重なりは読み取りに手間はかかるが情報は残るため、交差より軽くしてある。
const ROUTE_COST_NODE_HIT = 1_000_000;
const ROUTE_COST_INTERACTION = 100;
const ROUTE_COST_LABEL_OVER_NODE = 24_000;
const ROUTE_COST_LABEL_OVER_LABEL = 4_000;
const ROUTE_COST_LABEL_OVER_ROUTE = 2_000;
const ROUTE_COST_BEND = 30;
// 浮動小数の誤差で「改善した」と誤判定しないための下限。
const ROUTE_IMPROVEMENT_EPSILON = 0.5;
// 再配線（rip-up and reroute）の上限。決定的に打ち切るための予算。
const MAX_ROUTE_REFINEMENT_PASSES = 3;
const MAX_ROUTE_REFINEMENT_REROUTES = 600;

// ルーティングが劣化したときの理由。作者に出す文言と 1:1 で対応させる。
const ROUTE_FALLBACK_REASONS = Object.freeze({
  gridTooLarge: "grid-too-large",
  gridVisitBudget: "grid-visit-budget",
  gridUnreachable: "grid-unreachable",
  endpointBlocked: "endpoint-blocked",
  noCleanCandidate: "no-clean-candidate",
});
const ROUTE_FALLBACK_REMEDIES = Object.freeze({
  "grid-too-large":
    "the detour grid exceeded its size budget, so the diagram is too dense to route automatically",
  "grid-visit-budget":
    "the detour search exceeded its work budget before reaching the target",
  "grid-unreachable": "no obstacle-free orthogonal corridor exists between the ports",
  "endpoint-blocked": "the connector ports are enclosed by other elements",
  "no-clean-candidate": "every candidate route is blocked by another element",
});

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SHAPES = new Set(["rect", "rounded-rect", "ellipse"]);
const ROUTINGS = new Set(["straight", "orthogonal", "polyline"]);
const PORTS = new Set(["auto", "top", "right", "bottom", "left"]);
const LAYOUTS = new Set(["row", "column", "grid", "layered"]);
const LAYOUT_DIRECTIONS = new Set(["down", "right"]);
// layered レイアウトが接続グラフを読むときの再帰上限。MAX_DEPTH の検証より前に
// 走るため、未検証の入力でスタックを溢れさせないよう独自に打ち切る。
const MAX_GRAPH_SCAN_DEPTH = 16;
// バリセンター法のスイープ回数。決定性のため固定する。
const LAYERED_ORDERING_SWEEPS = 4;
// 組み込みアイコンのカタログ。ここが唯一の出典で、ICONS も描画も同じ表から作る。
//
// 命名規則: 小文字の kebab-case（`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`）で、製品名や
// ベンダー名ではなく一般的な概念を表す名詞にする。名前は DSL の公開語彙なので、
// 一度公開した名前の改名・削除は破壊的変更として扱う（schema/README.md 参照）。
//
// 図形は 24x24 座標系の線画で、描画時に stroke へノードの textColor が入る。
// そのため 4 テーマすべてで配色が自動的に追従する。`solid: true` の図形だけは
// 塗り（fill）にも textColor を入れる（線画のアクセントとして使う小さな点）。
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
// ユーザーが持ち込むアイコンは `assets/` 配下のリポジトリ内ファイルだけを許す。
// 描画は <image href="/assets/..."> で、extension.mjs / テストハーネスの
// `/assets/*` ルートが safeJoin 経由で配信する。
const ICON_ASSET_EXTENSIONS = Object.freeze(["svg", "png", "webp", "jpg", "jpeg"]);
// JSON Schema の `pattern` にはフラグの概念が無いので `/i` を使わず、大小両方の
// 文字クラスを機械的に展開する。こうすると `.source` をそのままスキーマへ写せて、
// パーサーとスキーマで大文字拡張子（.PNG など）の扱いが必ず一致する。
const ICON_ASSET_EXTENSION_PATTERN = ICON_ASSET_EXTENSIONS.map((extension) =>
  [...extension].map((character) => `[${character.toUpperCase()}${character}]`).join(""),
).join("|");
// パス要素は英数字で始まり、'.' の後には必ず 1 文字以上が続く。これだけで
// '..' / '.' / 空要素 / ':' を含む値（data: や http:// など）が構文的に作れなくなる。
const ICON_ASSET_SEGMENT = "[A-Za-z0-9][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]+)*";
const ICON_ASSET_PATTERN = new RegExp(
  `^assets/(?:${ICON_ASSET_SEGMENT}/)*${ICON_ASSET_SEGMENT}\\.(?:${ICON_ASSET_EXTENSION_PATTERN})$`,
);
const MAX_ICON_REFERENCE = 200;
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

// icon は「組み込み名の enum」または「assets/ 配下のパス」の合成型。
// 受理集合は schema/architecture-v1.schema.json の $defs.icon と一致させること。
function iconValue(value, path) {
  if (value === undefined) return "";
  const candidate = textValue(value, path, "", MAX_ICON_REFERENCE);
  if (ICONS.has(candidate)) return candidate;
  if (ICON_ASSET_PATTERN.test(candidate)) return candidate;
  fail(
    path,
    `must be a built-in icon name (${[...ICONS].join(", ")}) or a path under assets/`,
    `replace ${describeValue(candidate)} with a built-in name, or with a repository asset such as 'assets/icons/logo.svg' (${ICON_ASSET_EXTENSIONS.map(
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
 * 未検証の生 JSON から、要素 id と connector の辺だけを拾う先読みパス。
 *
 * layered レイアウトは「その group の直下の子」同士の接続を知る必要があるが、
 * connector はルート直下に書かれることが多く、group の children だけを見ても
 * 辺が見つからない。そこで flatten の前にツリー全体を 1 度走査しておく。
 *
 * ここはまだ検証前なので、壊れた入力でも決して throw しないこと。
 * 本来の診断は後段の flattenElements / parseArchitecture が出す。
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

/** 生の子要素 1 つが抱える id をすべて集める（自分自身と子孫）。 */
function collectSubtreeIds(raw, into = new Set(), depth = 0) {
  if (!isObject(raw) || depth > MAX_GRAPH_SCAN_DEPTH) return into;
  if (typeof raw.id === "string") into.add(raw.id);
  if (Array.isArray(raw.children)) {
    for (const child of raw.children) collectSubtreeIds(child, into, depth + 1);
  }
  return into;
}

/**
 * 接続グラフから層を割り当てる。
 *
 * 層 = 「入力元からの最長距離」。閉路があると単調増加してしまうため、緩和回数を
 * 要素数で打ち切り、最後に層番号を要素数未満へ丸める。これで閉路入りでも必ず
 * 停止し、同じ入力からは必ず同じ層構成になる。
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
 * 層内の並び順をバリセンター法で決める。隣接層での平均位置に寄せる操作を
 * 上下方向へ交互に固定回数だけ繰り返す。安定ソート + 固定回数なので決定的。
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

/** layered レイアウトの層構成（層ごとの flowIndex の並び）を返す。 */
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
    fail(
      `${path}.layout`,
      "padding and title leave no space for children",
      "reduce layout padding or increase the group width and height",
    );
  }
  const count = flowItems.length;
  // 「主軸に何本並ぶか（tracks）」と「各 track の中身」に正規化してから配置する。
  // row / column / grid は宣言順で機械的に切り、layered だけ接続グラフから決める。
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
    // layered は層ごとに本数が違うので track 全体を副軸方向で中央へ寄せる。
    // row / column / grid は従来どおり先頭詰めのまま（既存の図をずらさない）。
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
      const defaultHeight = child.type === "group" ? cellHeight : Math.min(cellHeight, 170);
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
        "must be node, group, or connector",
        element.type === undefined
          ? 'add a "type" of node, group, or connector'
          : `replace ${describeValue(element.type)} with node, group, or connector`,
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
        "give every node and group a unique id across the whole diagram",
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
  let raw;
  try {
    raw = JSON.parse(source);
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

function boxesOverlap(first, second) {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

/**
 * ラベルのピル（角丸矩形）の寸法。renderConnector と経路計算が同じ関数を使うことで
 * 「見えているラベル」と「経路計算が避けようとしたラベル」がずれないようにする。
 */
function connectorLabelMetrics(element) {
  const fitted = fitTextToWidth(
    element.label,
    element.style.fontSize,
    MAX_CONNECTOR_LABEL_WIDTH - CONNECTOR_LABEL_PADDING,
  );
  return {
    text: fitted.text,
    fontSize: fitted.fontSize,
    width: Math.min(
      MAX_CONNECTOR_LABEL_WIDTH,
      Math.max(70, fitted.width + CONNECTOR_LABEL_PADDING),
    ),
    height: fitted.fontSize * 1.55,
  };
}

/** ラベルが実際に占める矩形。ラベルが無い connector は null。 */
function connectorLabelBox(element, points) {
  if (!element?.label || points.length < 2) return null;
  const metrics = connectorLabelMetrics(element);
  const position = pointAtHalfLength(points);
  return {
    x: position.x - metrics.width / 2,
    y: position.y - metrics.height / 2,
    width: metrics.width,
    height: metrics.height,
  };
}

/** ラベルの矩形を経路が横切るか。矩形との交差判定は margin 0 で行う。 */
function boxOverlapsRoute(box, points) {
  for (let index = 1; index < points.length; index++) {
    if (segmentIntersectsBox(points[index - 1], points[index], box, 0)) return true;
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

// 「重なり」ではなく純粋な交差だけを数える。
// 再配線でこの値が増えないことを保証するために使う。交差の最小化が
// このフェーズの第一目標であり、ラベルの見やすさと引き換えにしてはいけない。
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
 * この経路が隠してしまう「読めるはずだった中身」の数。
 *
 * 線がノードを貫いた数と、ラベルのピルがノードに重なった数の合計。両端の
 * ノードは接続先なので数えない。交差は読みにくいだけだが、これは情報が
 * 消えるので、refinement のガードで交差より重く扱うための指標。
 */
function countHiddenContent(connector, points, nodes) {
  const excludedIds = new Set([connector.from, connector.to]);
  let hidden = countNodeHits(points, nodes, excludedIds);
  const labelBox = connectorLabelBox(connector, points);
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
 * 経路 1 本の総合コスト。逐次配置・格子探索・再配線がすべてこの 1 本の物差しを使う。
 *
 * ラベル項を「自分のラベル vs 他人の経路」と「他人のラベル vs 自分の経路」の
 * 両方向で数えているのが要点。片側だけだと、1 本だけ引き直したときのコスト差が
 * 図全体のコスト差と一致せず、再配線が振動しうる。両方向を数えれば差分は厳密で、
 * 「改善したときだけ採用」が図全体の単調改善になることを保証できる。
 *
 * ラベル項は connector の両端ノードを除外する。除外しないと、短い connector が
 * 自分の接続先からラベルを逃がすためだけに不自然な大回りをしてしまう。
 */
function routeCost(points, context) {
  const {
    nodes = [],
    excludedIds = new Set(),
    occupiedRoutes = [],
    occupiedLabels = [],
    connector = null,
  } = context;
  let cost = countNodeHits(points, nodes, excludedIds) * ROUTE_COST_NODE_HIT;
  cost += routeInteractionScore(points, occupiedRoutes) * ROUTE_COST_INTERACTION;
  const labelBox = connectorLabelBox(connector, points);
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
 * 候補からコスト最小のものを選ぶ。同点なら先に並んでいるほうを残すので、
 * 候補の生成順（＝宣言順に対して安定）がそのまま決定性になる。
 */
function chooseRoute(candidates, nodes, excludedIds, occupiedRoutes, options = {}) {
  const context = {
    nodes,
    excludedIds,
    occupiedRoutes,
    occupiedLabels: options.occupiedLabels || [],
    connector: options.connector || null,
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
    return { points: null, reason: ROUTE_FALLBACK_REASONS.gridTooLarge };
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
  if (!finalState) {
    // 打ち切りと「そもそも通れない」を区別する。作者への案内が変わるため。
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
 * connector 1 本の経路を決める。
 *
 * フォールバックの段取り（仕様として固定）:
 *   1. 候補列挙 → routeCost 最小を選ぶ
 *   2. それがノードを貫通する / 既存経路と干渉するときだけ格子探索へ
 *   3. 格子解も routeCost で測り、改善したときだけ採用する
 *   4. それでもノードやラベルを覆っているなら options.report へ通知する
 *      （throw はしない。今まで描けていた図をエラーに変えないため）
 *
 * options は純粋な追加。4 引数で呼ぶ既存コードはそのまま動く。
 */
export function computeConnectorRoute(
  connector,
  lookup,
  canvas = DEFAULT_CANVAS,
  occupiedRoutes = [],
  options = {},
) {
  const occupiedLabels = options.occupiedLabels || [];
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
  const routingContext = {
    nodes,
    excludedIds: excluded,
    occupiedRoutes,
    occupiedLabels,
    connector,
  };
  const selected = chooseRoute(candidates, nodes, excluded, occupiedRoutes, {
    occupiedLabels,
    connector,
  });
  const selectedCost = routeCost(selected, routingContext);
  const selectedHitsNodes = routeHitsNodes(selected, nodes, excluded);
  const selectedInteraction = routeInteractionScore(selected, occupiedRoutes);
  let chosen = selected;
  let gridReason = null;
  // フォールバック段階 2: 候補が汚れているときだけ格子探索へエスカレートする。
  // 格子探索は高価なので、無条件には走らせない。
  if (selectedHitsNodes || (occupiedRoutes.length && selectedInteraction > 0)) {
    const grid = gridRoute(
      fromStub,
      toStub,
      nodes,
      excluded,
      canvas,
      occupiedRoutes,
    );
    gridReason = grid.reason;
    const alternate = grid.points
      ? compressPoints([start, fromStub, ...grid.points, toStub, end])
      : null;
    // フォールバック段階 3: 格子解も同じ物差しで測り、改善したときだけ採る。
    if (alternate && routeCost(alternate, routingContext) < selectedCost) {
      chosen = alternate;
    }
  }
  // フォールバック段階 4: それでも内容を隠しているなら、黙って出さずに報告する。
  // onReason は「なぜ格子探索に頼れなかったか」を呼び出し元へ渡すためのフック。
  // planConnectorRoutes は経路確定後にまとめて診断を採るので、途中で分かった
  // 打ち切り理由をここで拾っておかないと no-clean-candidate に丸められてしまう。
  if (typeof onReason === "function") onReason(gridReason);
  reportRouteDegradation(report, connector, chosen, routingContext, gridReason);
  return chosen;
}

/**
 * 描画結果が「内容を隠している」ときだけ診断を積む。
 *
 * 交差そのものは報告しない。平面的でないグラフでは交差は避けようがなく、
 * すべて報告するとノイズになって本当に困っている図が埋もれる。
 * 報告するのは経路がノードを貫通した場合とラベルがノードを覆った場合だけ。
 */
function reportRouteDegradation(report, connector, points, context, gridReason) {
  if (typeof report !== "function") return;
  const { nodes, excludedIds } = context;
  const pathHits = countNodeHits(points, nodes, excludedIds);
  const labelBox = connectorLabelBox(connector, points);
  const labelHits = labelBox
    ? nodes.filter(
        (node) => !excludedIds.has(node.id) && boxesOverlap(labelBox, node),
      ).length
    : 0;
  if (!pathHits && !labelHits) return;
  report({
    from: connector.from,
    to: connector.to,
    sourcePath: connector.sourcePath,
    kind: pathHits ? "path-overlaps-node" : "label-overlaps-node",
    reason: gridReason || ROUTE_FALLBACK_REASONS.noCleanCandidate,
    pathOverlaps: pathHits,
    labelOverlaps: labelHits,
  });
}

/**
 * 図全体の経路を決める。
 *
 * パス 0 は従来どおりの逐次配置。その後 rip-up and reroute を固定回数だけ回す。
 * 逐次配置は最初の 1 本が「まだ何も置かれていない」状態で決まってしまうため、
 * 全体を見れば明らかに損な経路が残る。再配線では各 connector を「自分以外の
 * すべての経路」に対して引き直し、routeCost が確実に下がったときだけ差し替える。
 *
 * 決定性: connector の走査順は固定、乱数なし、採用条件は厳密な不等号。
 * 停止性: コストは単調非増加で、パス数と再配線本数の両方に上限がある。
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
  const nodes = [...lookup.values()].filter((element) => element.type === "node");
  const routes = new Map();
  const occupied = [];
  const labels = new Map();
  // 経路ごとの「格子探索を諦めた理由」。最後の診断でこれを使う。
  const reasons = new Map();
  const noteReason = (connector) => (reason) => {
    if (reason) reasons.set(connector, reason);
    else reasons.delete(connector);
  };
  for (const connector of connectors) {
    const route = computeConnectorRoute(connector, lookup, model.canvas, occupied, {
      occupiedLabels: [...labels.values()],
      onReason: noteReason(connector),
    });
    routes.set(connector, route);
    occupied.push(route);
    const box = connectorLabelBox(connector, route);
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
    });

  let reroutes = 0;
  for (let pass = 0; pass < MAX_ROUTE_REFINEMENT_PASSES; pass += 1) {
    let improved = false;
    for (const connector of connectors) {
      // straight / polyline は作者が明示した形。勝手に引き直さない。
      if (connector.routing !== "orthogonal") continue;
      if (reroutes >= MAX_ROUTE_REFINEMENT_REROUTES) break;
      reroutes += 1;
      const others = othersOf(connector);
      const otherLabels = otherLabelsOf(connector);
      const current = routes.get(connector);
      const currentCost = costOf(connector, current, others, otherLabels);
      const currentCrossings = countRouteCrossings(current, others);
      const currentHidden = countHiddenContent(connector, current, nodes);
      let candidateReason = null;
      const candidate = computeConnectorRoute(
        connector,
        lookup,
        model.canvas,
        others,
        {
          occupiedLabels: otherLabels,
          onReason: (reason) => {
            candidateReason = reason;
          },
        },
      );
      if (costOf(connector, candidate, others, otherLabels) >= currentCost - ROUTE_IMPROVEMENT_EPSILON) {
        continue;
      }
      // コストが下がっても交差が増えるなら原則として採らない。ラベルを
      // 見やすくするために交差を増やす取引を禁じるガード。connector 1 本しか
      // 変わらないので、この差分はそのままグラフ全体の交差数の差分になる。
      //
      // 例外は「ノードが隠れている状態を解消する」場合だけ。読めない図より
      // 交差が 1 本増えた図のほうがましなので、そこだけ通す。
      if (countRouteCrossings(candidate, others) > currentCrossings) {
        if (countHiddenContent(connector, candidate, nodes) >= currentHidden) continue;
      }
      routes.set(connector, candidate);
      // 経路を差し替えたときだけ理由も差し替える。棄却した候補の理由は残さない。
      if (candidateReason) reasons.set(connector, candidateReason);
      else reasons.delete(connector);
      const box = connectorLabelBox(connector, candidate);
      if (box) labels.set(connector, box);
      else labels.delete(connector);
      improved = true;
    }
    if (!improved) break;
  }

  // 最終形が確定してから 1 度だけ診断を採る。途中経過で警告を出すと、
  // 後で解消された劣化まで報告してしまう。
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

function iconShapeAttributes(shape, textColor) {
  // solid な図形だけ塗りにも textColor を入れる。属性の挿入順は表の記載順 + fill で、
  // 既存アイコンの出力を 1 バイトも変えないために順序を保つ。
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
    // ユーザー提供アイコン。テーマ色は適用できない（<image> の中身は差し替えられない）。
    // stroke / fill を付けても効かないので、意味のある属性だけを残す。
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
        href: `/${element.icon}`,
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
  // 組み込みアイコンの名前は意味のある語なのでアクセシブル名に含める。ユーザー提供
  // アイコンはファイルパスでしかなく、読み上げても意味を成さないので含めない
  // （意味が要るときは text / ariaLabel に書く）。
  const label =
    element.ariaLabel ||
    [ICONS.has(element.icon) ? `${element.icon} icon` : "", element.text || element.id]
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
    const fittedLabel = connectorLabelMetrics(element);
    const { width, height } = fittedLabel;
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
        icon: element.icon || undefined,
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
  appendRoutingWarning(documentRef, wrapper, routingDiagnostics);
  return wrapper;
}

/**
 * ルーティングが劣化したことを作者に伝える。
 *
 * ArchitectureError は投げない。投げると、これまで描けていた図が突然エラー
 * ブロックに変わる破壊的変更になるため。代わりに次の 3 経路で知らせる。
 *
 *  1. 図の下の帯（role="status" / aria-live="polite"）
 *     - "alert" ではなく "status" にしてある。これはエラーではなく品質劣化で、
 *       発表中の読み上げに割り込むほどの緊急度ではないため。
 *  2. wrapper の data-architecture-routing 属性（テストや自動化からの参照用）
 *  3. console.warn（オーサリング中に気づくため。error にすると
 *     ビジュアル回帰テストが「ページの JS エラー」として落ちてしまう）
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
    `architecture: ${diagnostics.length} connector route(s) could not avoid other elements; ${summary}`,
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
  DSL_VERSION,
  ICONS,
  ICON_ASSET_PATTERN,
  ID_PATTERN,
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
  PORTS,
  ROUTE_FALLBACK_REASONS,
  ROUTINGS,
  SHAPES,
  THEME_TOKENS,
};
