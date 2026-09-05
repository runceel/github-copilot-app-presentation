// Corpus that locks down agreement between schema structural validation and parseArchitecture
// semantic validation.
//
// By default, both validators must return the same verdict. If implementation and schema cannot
// agree, the case must declare `divergence` or the test fails. Silent divergence is always detected.
//
//   expect       : Expected parseArchitecture verdict and, by default, schema verdict
//   divergence   : Explicit schema-only verdict and reason when it differs
//   parserMessage: Optional regular expression proving the parser failed for the intended reason

const node = (over = {}) => ({
  type: "node",
  id: "a",
  x: 0,
  y: 0,
  width: 120,
  height: 60,
  ...over,
});

const image = (over = {}) => ({
  type: "image",
  id: "image",
  src: "assets/sample.svg",
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  ...over,
});

const group = (over = {}) => ({
  type: "group",
  id: "g",
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  children: [],
  ...over,
});

const connector = (over = {}) => ({ type: "connector", from: "a", to: "b", ...over });

const doc = (elements, over = {}) => JSON.stringify({ elements, ...over });

/** Minimal pair of nodes that can support a→b. Only the parser validates connector references. */
const twoNodes = () => [node({ id: "a" }), node({ id: "b", x: 300 })];

const withConnector = (over = {}) => doc([...twoNodes(), connector(over)]);

const nest = (depth) => {
  // Create `depth` nested group levels. depth=1 creates one group.
  let current = node({ id: "leaf", x: 10, y: 10, width: 40, height: 20 });
  for (let level = depth; level >= 1; level -= 1) {
    current = group({ id: `g${level}`, children: [current] });
  }
  return doc([current]);
};

const repeat = (count, char = "x") => char.repeat(count);
const dashOfLength = (length) => {
  // "1 1 1 ..." with k digits has length 2k-1.
  const digits = (length + 1) / 2;
  return Array.from({ length: digits }, () => "1").join(" ");
};

export const corpus = [
  // ---------------------------------------------------------------- Accepted
  { name: "minimal document", expect: "accept", source: doc([]) },
  { name: "version omitted", expect: "accept", source: doc([node()]) },
  { name: "version 1", expect: "accept", source: doc([node()], { version: 1 }) },
  {
    name: "version 1.0 (JSON has no integer type)",
    expect: "accept",
    source: doc([node()], { version: 1.0 }),
  },
  {
    name: "$schema at root is accepted and ignored",
    expect: "accept",
    source: JSON.stringify({
      $schema: "../architecture-v1.schema.json",
      elements: [node()],
    }),
  },
  {
    name: "full root metadata",
    expect: "accept",
    source: doc([node()], {
      version: 1,
      canvas: { width: 1600, height: 900 },
      title: "Diagram",
      description: "Description",
    }),
  },
  {
    name: "canvas lower bounds",
    expect: "accept",
    source: doc([], { canvas: { width: 320, height: 180 } }),
  },
  {
    name: "canvas upper bounds",
    expect: "accept",
    source: doc([], { canvas: { width: 4000, height: 4000 } }),
  },
  {
    name: "coordinate bounds",
    expect: "accept",
    source: doc([
      node({ id: "lo", x: -4000, y: -4000, width: 1, height: 1 }),
      node({ id: "hi", x: 4000, y: 4000, width: 4000, height: 4000 }),
    ]),
  },
  {
    name: "id at maximum length (64)",
    expect: "accept",
    source: doc([node({ id: `a${repeat(63, "b")}` })]),
  },
  {
    name: "id with dot, dash and underscore",
    expect: "accept",
    source: doc([node({ id: "Web.api_gateway-01" })]),
  },
  {
    name: "every shape",
    expect: "accept",
    source: doc([
      node({ id: "s1", shape: "rect" }),
      node({ id: "s2", shape: "rounded-rect", x: 200 }),
      node({ id: "s3", shape: "ellipse", x: 400 }),
      node({ id: "s4", shape: "diamond", x: 600 }),
      node({ id: "s5", shape: "triangle", x: 800 }),
      node({ id: "s6", shape: "hexagon", x: 1000 }),
      node({ id: "s7", shape: "parallelogram", x: 1200 }),
    ]),
  },
  {
    name: "every icon",
    expect: "accept",
    // Complete built-in icon set. architecture-schema.test.mjs verifies equality with ICONS.
    source: doc(
      [
        "cloud",
        "database",
        "api",
        "user",
        "server",
        "analytics",
        "browser",
        "mobile",
        "network",
        "queue",
        "shield",
      ].map((icon, index) => node({ id: `i${index}`, icon, x: index * 160 })),
    ),
  },
  {
    name: "asset icon in every allowed format",
    expect: "accept",
    source: doc(
      ["assets/sample.svg", "assets/logo.png", "assets/logo.webp", "assets/sample-profile.jpg", "assets/photo.jpeg"].map(
        (icon, index) => node({ id: `a${index}`, icon, x: index * 160 }),
      ),
    ),
  },
  {
    name: "asset icon in a nested folder",
    expect: "accept",
    source: doc([node({ icon: "assets/icons/brand/logo.svg" })]),
  },
  {
    name: "asset icon with an uppercase extension",
    expect: "accept",
    source: doc([node({ icon: "assets/Logo.PNG" })]),
  },
  {
    name: "asset icon with dots inside the file name",
    expect: "accept",
    source: doc([node({ icon: "assets/my.brand.logo.svg" })]),
  },
  {
    name: "asset icon at maximum length",
    expect: "accept",
    // "assets/" (7) + name + ".svg" (4) = 200
    source: doc([node({ icon: `assets/${repeat(189, "a")}.svg` })]),
  },
  {
    name: "standalone image in every fit mode",
    expect: "accept",
    source: doc([
      image({ id: "contain", fit: "contain" }),
      image({ id: "cover", fit: "cover", x: 160 }),
      image({ id: "stretch", fit: "stretch", x: 320 }),
    ]),
  },
  {
    name: "standalone image in every allowed format",
    expect: "accept",
    source: doc(
      ["svg", "png", "webp", "jpg", "jpeg"].map((extension, index) =>
        image({
          id: `image-${extension}`,
          src: `assets/image.${extension}`,
          x: index * 160,
        }),
      ),
    ),
  },
  {
    name: "standalone image in a row layout",
    expect: "accept",
    source: doc([
      group({
        width: 500,
        height: 300,
        layout: { type: "row", gap: 20, padding: 20 },
        children: [
          { type: "image", id: "flow-image", src: "assets/sample.svg", fit: "contain" },
        ],
      }),
    ]),
  },
  {
    name: "standalone image at maximum nesting depth",
    expect: "accept",
    source: doc([
      group({
        id: "g1",
        children: [
          group({
            id: "g2",
            x: 10,
            y: 10,
            children: [
              group({
                id: "g3",
                x: 10,
                y: 10,
                children: [
                  group({
                    id: "g4",
                    x: 10,
                    y: 10,
                    children: [image({ id: "deep-image", x: 10, y: 10 })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ]),
  },
  {
    name: "standalone image as connector endpoint",
    expect: "accept",
    source: doc([
      image({ id: "picture" }),
      node({ id: "details", x: 300 }),
      connector({ from: "picture", to: "details" }),
    ]),
  },
  {
    name: "text and ariaLabel at maximum length",
    expect: "accept",
    source: doc([node({ text: repeat(500), ariaLabel: repeat(300) })]),
  },
  {
    name: "root title and description at maximum length",
    expect: "accept",
    source: doc([], { title: repeat(200), description: repeat(1000) }),
  },
  {
    name: "theme token colors",
    expect: "accept",
    source: doc([
      node({ style: { fill: "surface", stroke: "border", textColor: "fg" } }),
    ]),
  },
  // LITERAL_COLORS has an /i flag, so the parser accepts uppercase input. JSON Schema patterns have
  // no flags, so the schema spells out both uppercase and lowercase character classes manually.
  // This is the only place where .source intentionally differs.
  {
    name: "uppercase hex color (#ABC) — /i flag equivalence",
    expect: "accept",
    source: doc([node({ style: { fill: "#ABC" } })]),
  },
  {
    name: "uppercase hex color (#AABBCCDD)",
    expect: "accept",
    source: doc([node({ style: { fill: "#AABBCCDD" } })]),
  },
  {
    name: "uppercase keyword color (BLACK) — /i flag equivalence",
    expect: "accept",
    source: doc([node({ style: { fill: "BLACK" } })]),
  },
  {
    name: "mixed case keyword color (Transparent)",
    expect: "accept",
    source: doc([node({ style: { stroke: "Transparent" } })]),
  },
  {
    name: "five digit hex color (#12345)",
    expect: "accept",
    source: doc([node({ style: { fill: "#12345" } })]),
  },
  {
    name: "literal colors white / none",
    expect: "accept",
    source: doc([node({ style: { fill: "white", stroke: "none" } })]),
  },
  {
    name: "style numeric bounds (low)",
    expect: "accept",
    source: doc([
      node({
        style: { strokeWidth: 0.5, fontSize: 8, opacity: 0, cornerRadius: 0 },
      }),
    ]),
  },
  {
    name: "style numeric bounds (high)",
    expect: "accept",
    source: doc([
      node({
        style: { strokeWidth: 20, fontSize: 160, opacity: 1, cornerRadius: 200 },
      }),
    ]),
  },
  {
    name: "empty dash string",
    expect: "accept",
    source: doc([node({ style: { dash: "" } })]),
  },
  {
    name: "dash with spaces, commas and decimals",
    expect: "accept",
    source: doc([node({ style: { dash: "12 8,4 1.5" } })]),
  },
  {
    name: "dash at maximum length",
    expect: "accept",
    source: doc([node({ style: { dash: dashOfLength(39) } })]),
  },
  {
    name: "fractional z and lane",
    expect: "accept",
    source: doc([...twoNodes(), connector({ z: 1.5, lane: 2.7 })]),
  },
  {
    name: "connector with all optional keys",
    expect: "accept",
    source: withConnector({
      fromPort: "right",
      toPort: "left",
      label: "calls",
      labelLayer: "behind",
      ariaLabel: "a calls b",
      routing: "orthogonal",
      arrow: false,
      lane: -12,
      z: 3,
      style: { stroke: "accentLine", strokeWidth: 2, dash: "6 4" },
    }),
  },
  {
    name: "polyline connector with maximum points",
    expect: "accept",
    source: withConnector({
      routing: "polyline",
      points: Array.from({ length: 12 }, (_value, index) => ({
        x: index * 10,
        y: index * 5,
      })),
    }),
  },
  {
    name: "empty points array with straight routing",
    expect: "accept",
    source: withConnector({ routing: "straight", points: [] }),
  },
  {
    name: "every routing and port",
    expect: "accept",
    source: doc([
      ...twoNodes(),
      connector({ routing: "straight", fromPort: "auto", toPort: "top" }),
      connector({ routing: "orthogonal", fromPort: "right", toPort: "bottom" }),
      connector({ routing: "polyline", fromPort: "left", toPort: "auto", points: [] }),
    ]),
  },
  {
    name: "group with layout shorthand string",
    expect: "accept",
    source: doc([
      group({ layout: "row", children: [node({ id: "c1" }), node({ id: "c2" })] }),
    ]),
  },
  {
    name: "group with layout object and all keys",
    expect: "accept",
    source: doc([
      group({
        layout: {
          type: "grid",
          columns: 2,
          gap: 24,
          rowGap: 12,
          columnGap: 12,
          padding: 40,
        },
        children: [node({ id: "c1" }), node({ id: "c2" })],
      }),
    ]),
  },
  {
    name: "layout children omit x/y/width/height",
    expect: "accept",
    source: doc([
      group({
        layout: "column",
        children: [
          { type: "node", id: "c1", text: "first" },
          { type: "node", id: "c2", text: "second" },
        ],
      }),
    ]),
  },
  {
    name: "layout numeric bounds",
    expect: "accept",
    source: doc([
      group({
        width: 900,
        height: 700,
        layout: { type: "grid", columns: 1, gap: 0, padding: 0 },
        children: [{ type: "node", id: "c1" }],
      }),
    ]),
  },
  {
    name: "fixed group children keep explicit boxes",
    expect: "accept",
    source: doc([
      group({
        children: [node({ id: "c1", x: 10, y: 10, width: 100, height: 40 })],
      }),
    ]),
  },
  {
    name: "layered layout shorthand string",
    expect: "accept",
    source: doc([
      group({
        layout: "layered",
        children: [
          { type: "node", id: "c1" },
          { type: "node", id: "c2" },
          { type: "connector", from: "c1", to: "c2" },
        ],
      }),
    ]),
  },
  {
    name: "layered layout with direction down",
    expect: "accept",
    source: doc([
      group({
        layout: { type: "layered", direction: "down", gap: 40 },
        children: [
          { type: "node", id: "c1" },
          { type: "node", id: "c2" },
          { type: "connector", from: "c1", to: "c2" },
        ],
      }),
    ]),
  },
  {
    name: "layered layout with direction right",
    expect: "accept",
    source: doc([
      group({
        layout: { type: "layered", direction: "right" },
        children: [
          { type: "node", id: "c1" },
          { type: "node", id: "c2" },
        ],
      }),
    ]),
  },
  { name: "group nesting depth 1", expect: "accept", source: nest(1) },
  { name: "group nesting depth 4", expect: "accept", source: nest(4) },
  {
    name: "connector nested inside a group",
    expect: "accept",
    source: doc([
      group({
        children: [
          node({ id: "a", x: 10, y: 10, width: 80, height: 40 }),
          node({ id: "b", x: 200, y: 10, width: 80, height: 40 }),
          connector({ from: "a", to: "b" }),
        ],
      }),
    ]),
  },
  {
    name: "exactly 200 elements",
    expect: "accept",
    source: doc(
      Array.from({ length: 200 }, (_value, index) =>
        node({ id: `n${index}`, x: index, y: 0 }),
      ),
    ),
  },

  // ---------------------------------------------------------------- Rejected by both
  {
    name: "unknown root key",
    expect: "reject",
    parserMessage: /diagram\.onclick: is not supported/,
    source: JSON.stringify({ elements: [], onclick: "alert(1)" }),
  },
  {
    name: "unknown node key",
    expect: "reject",
    source: doc([node({ tooltip: "nope" })]),
  },
  {
    name: "unknown style key",
    expect: "reject",
    source: doc([node({ style: { shadow: "big" } })]),
  },
  {
    name: "unknown layout key",
    expect: "reject",
    source: doc([group({ layout: { type: "row", align: "center" }, children: [] })]),
  },
  {
    name: "unknown canvas key",
    expect: "reject",
    source: doc([], { canvas: { width: 1600, height: 900, dpi: 2 } }),
  },
  {
    name: "unknown point key",
    expect: "reject",
    source: withConnector({ routing: "polyline", points: [{ x: 1, y: 2, z: 3 }] }),
  },
  {
    name: "version 2",
    expect: "reject",
    parserMessage: /version: must be between 1 and 1/,
    source: doc([], { version: 2 }),
  },
  {
    name: "version as string",
    expect: "reject",
    source: doc([], { version: "1" }),
  },
  {
    name: "elements missing",
    expect: "reject",
    source: JSON.stringify({ version: 1 }),
  },
  {
    name: "elements not an array",
    expect: "reject",
    source: JSON.stringify({ elements: { type: "node" } }),
  },
  {
    name: "root is not an object",
    expect: "reject",
    source: JSON.stringify([{ type: "node" }]),
  },
  {
    name: "element is not an object",
    expect: "reject",
    source: JSON.stringify({ elements: ["node"] }),
  },
  {
    name: "element type missing",
    expect: "reject",
    source: JSON.stringify({ elements: [{ id: "a", x: 0, y: 0, width: 1, height: 1 }] }),
  },
  {
    name: "unknown element type",
    expect: "reject",
    parserMessage: /must be node, group, image, or connector/,
    source: JSON.stringify({ elements: [{ type: "widget", id: "a" }] }),
  },
  {
    name: "node without id",
    expect: "reject",
    source: JSON.stringify({
      elements: [{ type: "node", x: 0, y: 0, width: 10, height: 10 }],
    }),
  },
  {
    name: "node without x in a fixed parent",
    expect: "reject",
    source: JSON.stringify({
      elements: [{ type: "node", id: "a", y: 0, width: 10, height: 10 }],
    }),
  },
  {
    name: "id starting with a digit",
    expect: "reject",
    source: doc([node({ id: "1web" })]),
  },
  {
    name: "id with a space",
    expect: "reject",
    source: doc([node({ id: "web api" })]),
  },
  {
    name: "id longer than 64",
    expect: "reject",
    source: doc([node({ id: `a${repeat(64, "b")}` })]),
  },
  {
    name: "unknown shape",
    expect: "reject",
    source: doc([node({ shape: "pentagon" })]),
  },
  {
    name: "unknown icon",
    expect: "reject",
    source: doc([node({ icon: "rocket" })]),
    parserMessage: /elements\[0\]\.icon: must be a built-in icon name/,
  },
  {
    name: "icon escaping the assets folder",
    expect: "reject",
    source: doc([node({ icon: "assets/../.github/extensions/markdstage/extension.mjs" })]),
    parserMessage: /elements\[0\]\.icon: must be a built-in icon name/,
  },
  {
    name: "icon with a parent segment in the middle",
    expect: "reject",
    source: doc([node({ icon: "assets/icons/../../secret.svg" })]),
  },
  {
    name: "icon outside the assets folder",
    expect: "reject",
    source: doc([node({ icon: "../assets/logo.svg" })]),
  },
  {
    name: "icon rooted at an absolute path",
    expect: "reject",
    source: doc([node({ icon: "/assets/logo.svg" })]),
  },
  {
    name: "icon in a folder other than assets",
    expect: "reject",
    source: doc([node({ icon: "images/logo.svg" })]),
  },
  {
    name: "icon as a data URI",
    expect: "reject",
    source: doc([node({ icon: "data:image/svg+xml;base64,PHN2Zy8+" })]),
  },
  {
    name: "icon as an https URL",
    expect: "reject",
    source: doc([node({ icon: "https://example.com/logo.svg" })]),
  },
  {
    name: "icon as a protocol-relative URL",
    expect: "reject",
    source: doc([node({ icon: "//example.com/logo.svg" })]),
  },
  {
    name: "icon with a disallowed extension",
    expect: "reject",
    source: doc([node({ icon: "assets/logo.gif" })]),
  },
  {
    name: "icon with no extension",
    expect: "reject",
    source: doc([node({ icon: "assets/logo" })]),
  },
  {
    name: "standalone image without src",
    expect: "reject",
    source: doc([
      { type: "image", id: "picture", x: 0, y: 0, width: 120, height: 80 },
    ]),
  },
  {
    name: "standalone image with unknown fit",
    expect: "reject",
    source: doc([image({ fit: "scale-down" })]),
  },
  {
    name: "standalone image escaping assets",
    expect: "reject",
    parserMessage: /elements\[0\]\.src: must be a path under assets\//,
    source: doc([image({ src: "assets/../secret.svg" })]),
  },
  {
    name: "standalone image as data URI",
    expect: "reject",
    source: doc([image({ src: "data:image/svg+xml;base64,PHN2Zy8+" })]),
  },
  {
    name: "standalone image as https URL",
    expect: "reject",
    source: doc([image({ src: "https://example.com/image.svg" })]),
  },
  {
    name: "standalone image with disallowed extension",
    expect: "reject",
    source: doc([image({ src: "assets/image.gif" })]),
  },
  {
    name: "icon with a backslash separator",
    expect: "reject",
    source: doc([node({ icon: "assets\\logo.svg" })]),
  },
  {
    name: "icon with a query string",
    expect: "reject",
    source: doc([node({ icon: "assets/logo.svg?v=2" })]),
  },
  {
    name: "icon with a leading dot in the file name",
    expect: "reject",
    source: doc([node({ icon: "assets/.hidden.svg" })]),
  },
  {
    name: "icon with an empty path segment",
    expect: "reject",
    source: doc([node({ icon: "assets//logo.svg" })]),
  },
  {
    name: "icon longer than the maximum reference length",
    expect: "reject",
    // "assets/" (7) + name + ".svg" (4) = 201
    source: doc([node({ icon: `assets/${repeat(190, "a")}.svg` })]),
  },
  {
    name: "icon as a number",
    expect: "reject",
    source: doc([node({ icon: 3 })]),
  },
  {
    name: "unknown routing",
    expect: "reject",
    source: withConnector({ routing: "curved" }),
  },
  {
    name: "unknown port",
    expect: "reject",
    source: withConnector({ fromPort: "north" }),
  },
  {
    name: "unknown layout type",
    expect: "reject",
    source: doc([group({ layout: "flex", children: [] })]),
  },
  {
    name: "layout object without type",
    expect: "reject",
    source: doc([group({ layout: { gap: 10 }, children: [] })]),
  },
  {
    name: "layout as a number",
    expect: "reject",
    source: doc([group({ layout: 3, children: [] })]),
  },
  {
    name: "layout as an array",
    expect: "reject",
    source: doc([group({ layout: ["row"], children: [] })]),
  },
  {
    name: "direction on a row layout",
    expect: "reject",
    source: doc([group({ layout: { type: "row", direction: "down" }, children: [] })]),
  },
  {
    name: "direction on a grid layout",
    expect: "reject",
    source: doc([group({ layout: { type: "grid", direction: "right" }, children: [] })]),
  },
  {
    name: "unknown layered direction",
    expect: "reject",
    source: doc([group({ layout: { type: "layered", direction: "up" }, children: [] })]),
  },
  {
    name: "layered direction as a number",
    expect: "reject",
    source: doc([group({ layout: { type: "layered", direction: 1 }, children: [] })]),
  },
  {
    name: "arbitrary CSS colour name",
    expect: "reject",
    parserMessage: /theme token/,
    source: doc([node({ style: { fill: "red" } })]),
  },
  {
    name: "rgb() colour function",
    expect: "reject",
    source: doc([node({ style: { fill: "rgb(0, 0, 0)" } })]),
  },
  {
    name: "two digit hex colour",
    expect: "reject",
    source: doc([node({ style: { fill: "#12" } })]),
  },
  {
    name: "nine digit hex colour",
    expect: "reject",
    source: doc([node({ style: { fill: "#123456789" } })]),
  },
  {
    name: "malformed dash",
    expect: "reject",
    source: doc([node({ style: { dash: "4 4," } })]),
  },
  {
    name: "dash longer than 40",
    expect: "reject",
    source: doc([node({ style: { dash: dashOfLength(41) } })]),
  },
  {
    name: "strokeWidth below minimum",
    expect: "reject",
    source: doc([node({ style: { strokeWidth: 0.4 } })]),
  },
  {
    name: "fontSize above maximum",
    expect: "reject",
    source: doc([node({ style: { fontSize: 161 } })]),
  },
  {
    name: "opacity above maximum",
    expect: "reject",
    source: doc([node({ style: { opacity: 1.1 } })]),
  },
  {
    name: "cornerRadius above maximum",
    expect: "reject",
    source: doc([node({ style: { cornerRadius: 201 } })]),
  },
  {
    name: "x below minimum",
    expect: "reject",
    source: doc([node({ x: -4001 })]),
  },
  {
    name: "width of zero",
    expect: "reject",
    source: doc([node({ width: 0 })]),
  },
  {
    name: "height above maximum",
    expect: "reject",
    source: doc([node({ height: 4001 })]),
  },
  {
    name: "canvas width below minimum",
    expect: "reject",
    source: doc([], { canvas: { width: 319, height: 900 } }),
  },
  {
    name: "canvas height above maximum",
    expect: "reject",
    source: doc([], { canvas: { width: 1600, height: 4001 } }),
  },
  {
    name: "layout columns out of range",
    expect: "reject",
    source: doc([group({ layout: { type: "grid", columns: 13 }, children: [] })]),
  },
  {
    name: "layout gap above maximum",
    expect: "reject",
    source: doc([group({ layout: { type: "row", gap: 241 }, children: [] })]),
  },
  {
    name: "layout padding above maximum",
    expect: "reject",
    source: doc([group({ layout: { type: "row", padding: 401 }, children: [] })]),
  },
  {
    name: "text longer than 500",
    expect: "reject",
    source: doc([node({ text: repeat(501) })]),
  },
  {
    name: "ariaLabel longer than 300",
    expect: "reject",
    source: doc([node({ ariaLabel: repeat(301) })]),
  },
  {
    name: "root description longer than 1000",
    expect: "reject",
    source: doc([], { description: repeat(1001) }),
  },
  {
    name: "group title longer than 200",
    expect: "reject",
    source: doc([group({ title: repeat(201) })]),
  },
  {
    name: "connector label longer than 200",
    expect: "reject",
    source: withConnector({ label: repeat(201) }),
  },
  {
    name: "connector without from",
    expect: "reject",
    source: JSON.stringify({
      elements: [...twoNodes(), { type: "connector", to: "b" }],
    }),
  },
  {
    name: "arrow is not a boolean",
    expect: "reject",
    source: withConnector({ arrow: "yes" }),
  },
  {
    name: "unknown connector label layer",
    expect: "reject",
    source: withConnector({ labelLayer: "middle" }),
  },
  {
    name: "lane out of range",
    expect: "reject",
    source: withConnector({ lane: 13 }),
  },
  {
    name: "z out of range",
    expect: "reject",
    source: doc([node({ z: 101 })]),
  },
  {
    name: "points with straight routing",
    expect: "reject",
    source: withConnector({ routing: "straight", points: [{ x: 1, y: 2 }] }),
  },
  {
    name: "points without routing",
    expect: "reject",
    source: withConnector({ points: [{ x: 1, y: 2 }] }),
  },
  {
    name: "more than 12 points",
    expect: "reject",
    source: withConnector({
      routing: "polyline",
      points: Array.from({ length: 13 }, (_value, index) => ({ x: index, y: index })),
    }),
  },
  {
    name: "point without y",
    expect: "reject",
    source: withConnector({ routing: "polyline", points: [{ x: 1 }] }),
  },
  {
    name: "group children not an array",
    expect: "reject",
    source: doc([group({ children: { type: "node", id: "c" } })]),
  },
  { name: "group nesting depth 5", expect: "reject", source: nest(5) },
  {
    name: "201 elements",
    expect: "reject",
    parserMessage: /at most 200 items/,
    source: doc(
      Array.from({ length: 201 }, (_value, index) =>
        node({ id: `n${index}`, x: index, y: 0 }),
      ),
    ),
  },

  // ---------------------------------------------------------------- Known divergences
  {
    name: "non-numeric x on a layout child",
    expect: "accept",
    divergence: {
      schema: "reject",
      reason:
        "Under a layout, normalizeBox prioritizes placement, so the parser silently discards x/y " +
        "without validating their values. The schema checks types and rejects this input. " +
        "This divergence makes the schema stricter and provides a useful warning to authors.",
    },
    source: doc([
      group({
        layout: "row",
        children: [{ type: "node", id: "c1", x: "left" }],
      }),
    ]),
  },
  {
    name: "non-numeric y on a layout child",
    expect: "accept",
    divergence: {
      schema: "reject",
      reason:
        "For the same reason as x above, y under a layout is silently discarded without validation.",
    },
    source: doc([
      group({
        layout: "column",
        children: [{ type: "node", id: "c1", y: null }],
      }),
    ]),
  },
  {
    name: "out-of-range coordinates on a layout child",
    expect: "accept",
    divergence: {
      schema: "reject",
      reason:
        "Parent-managed placement ignores x/y altogether, including numbers outside the schema range. " +
        "Preflight reports the ignored authoring values as warnings without changing v1 acceptance.",
    },
    source: doc([
      group({
        layout: "row",
        children: [{ type: "node", id: "c1", x: 9000, y: -9000 }],
      }),
    ]),
  },
  {
    name: "non-string root schema reference is ignored",
    expect: "accept",
    divergence: {
      schema: "reject",
      reason:
        "The v1 runtime has always ignored root $schema without reading or resolving it. " +
        "JSON Schema requires a string for editor completion; this is a warning, not a new runtime rejection.",
    },
    source: doc([node()], { $schema: { ignored: true } }),
  },
];
