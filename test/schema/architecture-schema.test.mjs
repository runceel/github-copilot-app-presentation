// Consistency tests for the Architecture DSL v1 JSON Schema and parseArchitecture.
//
// Validate four layers:
//   1. The schema itself is valid draft 2020-12 and compiles with ajv
//   2. Every repository architecture block and example passes both validators
//   3. Both validators agree on the conformance corpus (divergences must be explicit)
//   4. Constants encoded in the schema match implementation exports
//
// Run: node --test test/schema/architecture-schema.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as architecture from "../../.github/extensions/markdstage/renderer/architecture.mjs";
import { extractArchitectureSources } from "../utils/architecture.mjs";
import {
  schema,
  schemaCheckSource,
  schemaCheckValue,
  validateAgainstMetaSchema,
} from "./validator.mjs";
import { corpus } from "./corpus.mjs";

const { parseArchitecture } = architecture;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const examplesDir = path.join(
  repoRoot,
  ".github",
  "extensions",
  "markdstage",
  "schema",
  "examples",
);
const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "test-results",
  "playwright-report",
  "dist",
]);

async function collectMarkdownFiles(directory) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...(await collectMarkdownFiles(path.join(directory, entry.name))));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      found.push(path.join(directory, entry.name));
    }
  }
  return found;
}

function parserCheck(source) {
  try {
    parseArchitecture(source);
    return { ok: true, message: "" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

// --------------------------------------------------------------- 1. Schema itself

test("schema is a valid draft 2020-12 document", () => {
  const result = validateAgainstMetaSchema();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.$id.endsWith("architecture-v1.schema.json"));
});

test("schema rejects unknown keys everywhere an object is defined", () => {
  // additionalProperties: false is required to match rejectUnknownKeys.
  const missing = [];
  const walk = (subschema, pointer) => {
    if (!subschema || typeof subschema !== "object") return;
    if (Array.isArray(subschema)) {
      subschema.forEach((item, index) => walk(item, `${pointer}/${index}`));
      return;
    }
    if (subschema.properties && subschema.additionalProperties !== false) {
      missing.push(pointer);
    }
    for (const [key, value] of Object.entries(subschema)) {
      if (key === "properties" || key === "$defs") {
        for (const [name, child] of Object.entries(value)) {
          walk(child, `${pointer}/${key}/${name}`);
        }
      } else if (typeof value === "object") {
        walk(value, `${pointer}/${key}`);
      }
    }
  };
  walk(schema, "#");
  // Exclude if/then/else overlays and wrappers that only branch on type (elementFixedL* /
  // elementFlowL*). nodeBase, groupBase, and connector enforce the actual key restrictions.
  // Setting additionalProperties: false on wrappers would hide allOf contents and reject valid
  // elements.
  const offenders = missing.filter(
    (pointer) =>
      !/\/(?:then|else|if)(?:\/|$)/.test(pointer) &&
      !/\/element(?:Fixed|Flow)L\d+$/.test(pointer),
  );
  assert.deepEqual(offenders, []);
});

// ------------------------------------------------- 2. Real repository samples

test("every architecture block in the repository passes both validators", async () => {
  const markdownFiles = await collectMarkdownFiles(repoRoot);
  const blocks = [];
  for (const file of markdownFiles) {
    const markdown = await readFile(file, "utf8");
    extractArchitectureSources(markdown).forEach((source, index) => {
      blocks.push({ label: `${path.relative(repoRoot, file)}#${index}`, source });
    });
  }

  assert.ok(blocks.length >= 5, `expected repository samples, found ${blocks.length}`);

  for (const block of blocks) {
    // An empty fence is Markdown shorthand. Expand it to the same canonical empty document used by
    // the renderer before passing it to strict JSON Schema validation.
    const normalized = architecture.normalizeArchitectureSource(block.source);
    const schemaResult = schemaCheckSource(normalized);
    assert.equal(schemaResult.ok, true, `${block.label} failed schema: ${schemaResult.message}`);
    const parserResult = parserCheck(block.source);
    assert.equal(parserResult.ok, true, `${block.label} failed parser: ${parserResult.message}`);
  }
});

test("every schema example passes both validators and points at the schema", async () => {
  const entries = (await readdir(examplesDir)).filter((name) =>
    name.endsWith(".architecture.json"),
  );
  assert.ok(entries.length >= 1, "expected at least one schema example");

  for (const entry of entries) {
    const file = path.join(examplesDir, entry);
    await stat(file);
    const source = await readFile(file, "utf8");
    const document = JSON.parse(source);

    // Keep $schema relative so editor validation works before merge, in forks, and offline.
    assert.ok(
      typeof document.$schema === "string" && document.$schema.startsWith("."),
      `${entry}: $schema must be a relative path, got ${document.$schema}`,
    );

    const schemaResult = schemaCheckValue(document);
    assert.equal(schemaResult.ok, true, `${entry} failed schema: ${schemaResult.message}`);
    const parserResult = parserCheck(source);
    assert.equal(parserResult.ok, true, `${entry} failed parser: ${parserResult.message}`);
  }
});

// ------------------------------------------------------------- 3. Conformance corpus

test("corpus case names are unique", () => {
  const names = corpus.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length);
});

test("corpus covers both verdicts and at least one documented divergence", () => {
  assert.ok(corpus.filter((entry) => entry.expect === "accept").length >= 20);
  assert.ok(corpus.filter((entry) => entry.expect === "reject").length >= 20);
  assert.ok(corpus.some((entry) => entry.divergence));
});

for (const entry of corpus) {
  test(`corpus: ${entry.name}`, () => {
    const parserResult = parserCheck(entry.source);
    const schemaResult = schemaCheckSource(entry.source);

    const expectedParser = entry.expect === "accept";
    const expectedSchema = entry.divergence
      ? entry.divergence.schema === "accept"
      : expectedParser;

    assert.equal(
      parserResult.ok,
      expectedParser,
      `parseArchitecture should ${entry.expect}; got ${parserResult.message || "accept"}`,
    );

    assert.equal(
      schemaResult.ok,
      expectedSchema,
      entry.divergence
        ? `documented divergence expects the schema to ${entry.divergence.schema}; got ${schemaResult.message || "accept"}`
        : `schema and parser disagree. Either fix the schema, or declare a divergence with a reason in test/schema/corpus.mjs. schema said: ${schemaResult.message || "accept"}`,
    );

    if (entry.divergence) {
      assert.ok(
        typeof entry.divergence.reason === "string" && entry.divergence.reason.length > 0,
        "a divergence must carry a written reason",
      );
    }

    if (entry.parserMessage) {
      assert.match(parserResult.message, entry.parserMessage);
    }
  });
}

test("literal colour pattern is behaviourally equivalent to LITERAL_COLORS", () => {
  // LITERAL_COLORS has an /i flag, but JSON Schema patterns have no flags. The schema therefore
  // expands both uppercase and lowercase character classes manually. Test behavioral equivalence
  // with matching verdicts rather than comparing .source strings.
  const schemaPattern = new RegExp(schema.$defs.literalColor.pattern);
  const probes = [
    "#abc",
    "#ABC",
    "#AbC",
    "#123",
    "#12345",
    "#aabbccdd",
    "#AABBCCDD",
    "#12",
    "#123456789",
    "black",
    "BLACK",
    "Black",
    "white",
    "WHITE",
    "transparent",
    "TRANSPARENT",
    "Transparent",
    "none",
    "NONE",
    "red",
    "rgb(0,0,0)",
    "",
    "#",
  ];
  for (const probe of probes) {
    assert.equal(
      schemaPattern.test(probe),
      architecture.LITERAL_COLORS.test(probe),
      `literal colour verdict differs for ${JSON.stringify(probe)}`,
    );
  }
});

// ----------------------------------------------------------- 4. Constant synchronization

const enumSyncCases = [
  ["SHAPES", architecture.SHAPES, schema.$defs.nodeBase.properties.shape.enum],
  ["ICONS", architecture.ICONS, schema.$defs.iconName.enum],
  ["ROUTINGS", architecture.ROUTINGS, schema.$defs.connector.properties.routing.enum],
  ["PORTS", architecture.PORTS, schema.$defs.connector.properties.fromPort.enum],
  ["PORTS (toPort)", architecture.PORTS, schema.$defs.connector.properties.toPort.enum],
  ["LABEL_LAYERS", architecture.LABEL_LAYERS, schema.$defs.connector.properties.labelLayer.enum],
  ["LAYOUTS (shorthand)", architecture.LAYOUTS, schema.$defs.layout.anyOf[0].enum],
  ["LAYOUTS (object)", architecture.LAYOUTS, schema.$defs.layoutObject.properties.type.enum],
  ["IMAGE_FITS", architecture.IMAGE_FITS, schema.$defs.imageBase.properties.fit.enum],
  [
    "LAYOUT_DIRECTIONS",
    architecture.LAYOUT_DIRECTIONS,
    schema.$defs.layoutObject.properties.direction.enum,
  ],
  ["THEME_TOKENS", Object.keys(architecture.THEME_TOKENS), schema.$defs.themeToken.enum],
];

for (const [label, implementation, schemaEnum] of enumSyncCases) {
  test(`schema enum matches ${label}`, () => {
    assert.deepEqual([...schemaEnum].sort(), [...implementation].sort());
  });
}

test("schema pattern matches ID_PATTERN", () => {
  assert.equal(schema.$defs.identifier.pattern, architecture.ID_PATTERN.source);
  assert.equal(architecture.ID_PATTERN.flags, "");
});

test("schema pattern matches asset path patterns", () => {
  // RegExp.prototype.source always normalizes `/` to `\/`. Keep readable bare slashes in the
  // schema and apply the same normalization before comparing.
  assert.equal(
    new RegExp(schema.$defs.assetPath.pattern).source,
    architecture.ASSET_PATH_PATTERN.source,
  );
  // A flag would change case handling when copied to `pattern`, so require no flags.
  assert.equal(architecture.ICON_ASSET_PATTERN.flags, "");
  assert.equal(architecture.ASSET_PATH_PATTERN.flags, "");
  assert.equal(architecture.ICON_ASSET_PATTERN, architecture.ASSET_PATH_PATTERN);
});

test("asset path pattern is behaviourally equivalent between schema and parser", () => {
  // Equal .source values imply equal behavior, but enumerate intended accepted inputs here so any
  // relaxation of rejected inputs fails immediately.
  const schemaPattern = new RegExp(schema.$defs.assetPath.pattern);
  const accepted = [
    "assets/sample.svg",
    "assets/sample-profile.jpg",
    "assets/sample-photo.png",
    "assets/icons/logo.webp",
    "assets/a/b/c/deep.jpeg",
    "assets/UPPER.SVG",
    "assets/Mixed.PnG",
    "assets/my.brand.logo.svg",
    "assets/icons/name_1.png",
    "assets/2024/q1-diagram.webp",
  ];
  const rejected = [
    "assets/_under-score/name_1.png",
    "assets/-leading-dash.svg",
    "assets/../secret.svg",
    "assets/..%2fsecret.svg",
    "../assets/logo.svg",
    "/assets/logo.svg",
    "assets//logo.svg",
    "assets/./logo.svg",
    "assets/.hidden.svg",
    "assets/logo.svg/../../etc/passwd.png",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "https://example.com/logo.svg",
    "http://example.com/logo.svg",
    "//example.com/logo.svg",
    "assets\\logo.svg",
    "images/logo.svg",
    "assets/logo.gif",
    "assets/logo.svgz",
    "assets/logo.js",
    "assets/logo",
    "assets/",
    "assets",
    "assets/logo.svg?x=1",
    "assets/logo.svg#frag",
    "assets/lo go.svg",
    "assets/logo.svg ",
  ];
  for (const probe of [...accepted, ...rejected]) {
    assert.equal(
      schemaPattern.test(probe),
      architecture.ASSET_PATH_PATTERN.test(probe),
      `asset path verdict differs for ${JSON.stringify(probe)}`,
    );
  }
  for (const probe of accepted) {
    assert.ok(
      architecture.ASSET_PATH_PATTERN.test(probe),
      `${JSON.stringify(probe)} should be an allowed asset reference`,
    );
  }
  for (const probe of rejected) {
    assert.equal(
      architecture.ASSET_PATH_PATTERN.test(probe),
      false,
      `${JSON.stringify(probe)} must not be an allowed asset reference`,
    );
  }
});

test("the corpus exercises every built-in icon", () => {
  // If a built-in icon is added but omitted from the corpus, it could ship without ever checking
  // agreement between schema and parser verdicts.
  const entry = corpus.find((candidate) => candidate.name === "every icon");
  assert.ok(entry, "corpus must keep an 'every icon' case");
  const used = JSON.parse(entry.source).elements.map((element) => element.icon);
  assert.deepEqual([...used].sort(), [...architecture.ICONS].sort());
});

test("built-in icon names follow the naming convention", () => {
  // Naming convention: generic lowercase kebab-case nouns. Vendor names or uppercase characters
  // would make the DSL's public vocabulary inconsistent.
  const convention = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  for (const name of architecture.ICONS) {
    assert.match(name, convention, `built-in icon name ${JSON.stringify(name)}`);
  }
  // A built-in name that also parses as an asset path would make the accepted set ambiguous.
  for (const name of architecture.ICONS) {
    assert.equal(architecture.ICON_ASSET_PATTERN.test(name), false);
  }
  // Do not rename or remove names already published in v1 (schema/README.md policy).
  for (const name of ["cloud", "database", "api", "user", "server"]) {
    assert.ok(architecture.ICONS.has(name), `${name} is part of the v1 public vocabulary`);
  }
});

test("schema constants match the parser limits", () => {
  assert.equal(schema.properties.version.const, architecture.DSL_VERSION);
  assert.equal(schema.properties.elements.maxItems, architecture.MAX_ELEMENTS);
  assert.equal(
    schema.$defs.groupBase.properties.children.maxItems,
    architecture.MAX_ELEMENTS,
  );
  assert.equal(schema.$defs.connector.properties.points.maxItems, architecture.MAX_POINTS);
  assert.equal(schema.$defs.assetPath.maxLength, architecture.MAX_ICON_REFERENCE);
  for (const extension of architecture.ASSET_EXTENSIONS) {
    assert.match(`assets/image.${extension}`, new RegExp(schema.$defs.assetPath.pattern));
  }
});

test("schema nesting chain matches MAX_DEPTH", () => {
  const depth = architecture.MAX_DEPTH;
  for (let level = 0; level <= depth; level += 1) {
    assert.ok(schema.$defs[`elementFixedL${level}`], `missing elementFixedL${level}`);
  }
  assert.equal(schema.$defs[`elementFixedL${depth + 1}`], undefined);

  // Do not allow groups at the deepest level because parseArchitecture rejects excess depth.
  const deepest = schema.$defs[`elementFixedL${depth}`].properties.type.enum;
  assert.deepEqual([...deepest].sort(), ["connector", "image", "node"]);
  const deepestFlow = schema.$defs[`elementFlowL${depth}`].properties.type.enum;
  assert.deepEqual([...deepestFlow].sort(), ["connector", "image", "node"]);

  // Allow groups one level above the deepest level.
  const inner = schema.$defs[`elementFixedL${depth - 1}`].properties.type.enum;
  assert.ok(inner.includes("group"));
});

test("every exported constant is classified as schema-encoded, parser-only, or renderer-only", () => {
  // Explicitly classify constants encoded by the schema, used only for semantic validation, or used
  // only during rendering. Exporting a new constant fails here so it cannot evade synchronization
  // tests.
  const schemaEncoded = new Set([
    "DSL_VERSION",
    "ICONS",
    "ICON_ASSET_PATTERN",
    "ASSET_EXTENSIONS",
    "ASSET_PATH_PATTERN",
    "ID_PATTERN",
    "IMAGE_FITS",
    "LABEL_LAYERS",
    "LAYOUTS",
    "LAYOUT_DIRECTIONS",
    "LITERAL_COLORS",
    "MAX_DEPTH",
    "MAX_ELEMENTS",
    "MAX_ICON_REFERENCE",
    "MAX_POINTS",
    "PORTS",
    "ROUTINGS",
    "SHAPES",
    "THEME_TOKENS",
  ]);
  // Cannot be expressed in JSON Schema: post-flatten totals and pre-parse string length.
  const parserOnly = new Set(["MAX_CONNECTORS", "MAX_SOURCE_LENGTH", "MAX_TOTAL_TEXT"]);
  // These do not constrain DSL input. They define route-search budgets, fallback-reason vocabulary,
  // and rendering dimensions used to keep label pills clear of lines. They never appear in source,
  // so the schema has no corresponding values.
  const rendererOnly = new Set([
    "CONNECTOR_LABEL_CLEARANCE",
    "MAX_ROUTE_REFINEMENT_PASSES",
    "MAX_ROUTING_GRID_COORDINATES",
    "MAX_ROUTING_GRID_POINTS",
    "MAX_ROUTING_GRID_VISITS",
    "MIN_CONNECTOR_LABEL_WIDTH",
    "MIN_VISIBLE_ROUTE_LENGTH",
    "ROUTE_FALLBACK_REASONS",
  ]);

  const exported = Object.keys(architecture).filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
  const unclassified = exported.filter(
    (name) => !schemaEncoded.has(name) && !parserOnly.has(name) && !rendererOnly.has(name),
  );
  assert.deepEqual(
    unclassified,
    [],
    "classify the new constant in test/schema/architecture-schema.test.mjs, then extend the sync assertions",
  );

  for (const name of [...schemaEncoded, ...parserOnly, ...rendererOnly]) {
    assert.ok(exported.includes(name), `${name} must be exported from architecture.mjs`);
  }

  // Renderer-only constants must not appear in the schema; if they do, the classification is wrong.
  const schemaText = JSON.stringify(schema);
  for (const name of rendererOnly) {
    assert.ok(
      !schemaText.includes(name),
      `${name} is classified renderer-only but appears in the schema`,
    );
  }
});
