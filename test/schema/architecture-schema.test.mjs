// Architecture DSL v1 の JSON Schema と parseArchitecture の整合性テスト。
//
// 4 層で検証する。
//   1. スキーマ自体が draft 2020-12 として妥当で、ajv でコンパイルできる
//   2. リポジトリ内の全 architecture ブロックと examples が「両方」を通る
//   3. 適合コーパスで両検証器の判定が一致する（乖離は明示しないと落ちる）
//   4. スキーマが焼き込む定数が実装の export と一致する
//
// 実行: node --test test/schema/architecture-schema.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as architecture from "../../.github/extensions/presentation/renderer/architecture.mjs";
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
  "presentation",
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

// --------------------------------------------------------------- 1. スキーマ自体

test("schema is a valid draft 2020-12 document", () => {
  const result = validateAgainstMetaSchema();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema.$id.endsWith("architecture-v1.schema.json"));
});

test("schema rejects unknown keys everywhere an object is defined", () => {
  // rejectUnknownKeys に対応するため additionalProperties: false が必須。
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
  // if/then/else のオーバーレイと、type で分岐するだけのラッパー（elementFixedL* /
  // elementFlowL*）は除外する。実際のキー制限は nodeBase / groupBase / connector が
  // 持っており、ラッパー側に additionalProperties: false を置くと allOf の中身が
  // 見えないため正しい要素まで拒否してしまう。
  const offenders = missing.filter(
    (pointer) =>
      !/\/(?:then|else|if)(?:\/|$)/.test(pointer) &&
      !/\/element(?:Fixed|Flow)L\d+$/.test(pointer),
  );
  assert.deepEqual(offenders, []);
});

// ------------------------------------------------- 2. リポジトリ内の実サンプル

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
    const schemaResult = schemaCheckSource(block.source);
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

    // $schema は相対パスで書く。マージ前・フォーク・オフラインでもエディター検証が効くため。
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

// ------------------------------------------------------------- 3. 適合コーパス

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
  // LITERAL_COLORS には /i フラグがあるが JSON Schema の pattern にフラグは無い。
  // そこでスキーマは大小両方の文字クラスを手で展開している。ここでは .source の
  // 文字列比較ではなく「同じ入力に同じ判定を返すか」で等価性を確かめる。
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

// ----------------------------------------------------------- 4. 定数の同期

const enumSyncCases = [
  ["SHAPES", architecture.SHAPES, schema.$defs.nodeBase.properties.shape.enum],
  ["ICONS", architecture.ICONS, schema.$defs.iconName.enum],
  ["ROUTINGS", architecture.ROUTINGS, schema.$defs.connector.properties.routing.enum],
  ["PORTS", architecture.PORTS, schema.$defs.connector.properties.fromPort.enum],
  ["PORTS (toPort)", architecture.PORTS, schema.$defs.connector.properties.toPort.enum],
  ["LAYOUTS (shorthand)", architecture.LAYOUTS, schema.$defs.layout.anyOf[0].enum],
  ["LAYOUTS (object)", architecture.LAYOUTS, schema.$defs.layoutObject.properties.type.enum],
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

test("schema pattern matches ICON_ASSET_PATTERN", () => {
  // `/` は RegExp.prototype.source が必ず `\/` へ正規化するので、スキーマ側は
  // 読みやすい素の `/` で書き、比較の前に同じ正規化を通す。
  assert.equal(
    new RegExp(schema.$defs.iconAsset.pattern).source,
    architecture.ICON_ASSET_PATTERN.source,
  );
  // フラグを付けると `pattern` へ写した瞬間に大小文字の扱いがずれるので固定する。
  assert.equal(architecture.ICON_ASSET_PATTERN.flags, "");
});

test("icon asset pattern is behaviourally equivalent between schema and parser", () => {
  // .source が一致していれば挙動は同じだが、「どの入力を受理する意図なのか」を
  // ここに列挙して固定しておく。拒否側が緩むと即座に落ちる。
  const schemaPattern = new RegExp(schema.$defs.iconAsset.pattern);
  const accepted = [
    "assets/sample.svg",
    "assets/profile.jpg",
    "assets/kazuki-san-post.png",
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
      architecture.ICON_ASSET_PATTERN.test(probe),
      `icon asset verdict differs for ${JSON.stringify(probe)}`,
    );
  }
  for (const probe of accepted) {
    assert.ok(
      architecture.ICON_ASSET_PATTERN.test(probe),
      `${JSON.stringify(probe)} should be an allowed asset reference`,
    );
  }
  for (const probe of rejected) {
    assert.equal(
      architecture.ICON_ASSET_PATTERN.test(probe),
      false,
      `${JSON.stringify(probe)} must not be an allowed asset reference`,
    );
  }
});

test("the corpus exercises every built-in icon", () => {
  // 組み込みアイコンを増やしたのにコーパスへ足し忘れると、そのアイコンは
  // スキーマとパーサーの判定一致を一度も確かめられないまま出荷されてしまう。
  const entry = corpus.find((candidate) => candidate.name === "every icon");
  assert.ok(entry, "corpus must keep an 'every icon' case");
  const used = JSON.parse(entry.source).elements.map((element) => element.icon);
  assert.deepEqual([...used].sort(), [...architecture.ICONS].sort());
});

test("built-in icon names follow the naming convention", () => {
  // 命名規則: 小文字 kebab-case の一般名詞。ベンダー名や大文字混じりを混ぜると
  // DSL の公開語彙が一貫しなくなるので、ここで固定する。
  const convention = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  for (const name of architecture.ICONS) {
    assert.match(name, convention, `built-in icon name ${JSON.stringify(name)}`);
  }
  // 組み込み名がアセットパスとしても解釈できると受理集合が曖昧になる。
  for (const name of architecture.ICONS) {
    assert.equal(architecture.ICON_ASSET_PATTERN.test(name), false);
  }
  // v1 で公開済みの名前は改名・削除しない（schema/README.md のポリシー）。
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
  assert.equal(schema.$defs.iconAsset.maxLength, architecture.MAX_ICON_REFERENCE);
});

test("schema nesting chain matches MAX_DEPTH", () => {
  const depth = architecture.MAX_DEPTH;
  for (let level = 0; level <= depth; level += 1) {
    assert.ok(schema.$defs[`elementFixedL${level}`], `missing elementFixedL${level}`);
  }
  assert.equal(schema.$defs[`elementFixedL${depth + 1}`], undefined);

  // 最下層では group を許可しない（parseArchitecture が depth 超過で落ちるため）。
  const deepest = schema.$defs[`elementFixedL${depth}`].properties.type.enum;
  assert.deepEqual([...deepest].sort(), ["connector", "node"]);
  const deepestFlow = schema.$defs[`elementFlowL${depth}`].properties.type.enum;
  assert.deepEqual([...deepestFlow].sort(), ["connector", "node"]);

  // 1 段上では group を許可する。
  const inner = schema.$defs[`elementFixedL${depth - 1}`].properties.type.enum;
  assert.ok(inner.includes("group"));
});

test("every exported constant is classified as schema-encoded, parser-only, or renderer-only", () => {
  // スキーマが焼き込む定数と、意味検証だけが持つ定数、描画時にしか効かない定数を
  // 明示的に分類する。新しい定数を export したときにここが落ちるので、
  // 同期テストの網から漏れない。
  const schemaEncoded = new Set([
    "DSL_VERSION",
    "ICONS",
    "ICON_ASSET_PATTERN",
    "ID_PATTERN",
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
  // JSON Schema では表現できない（flatten 後の集計・パース前の文字列長）。
  const parserOnly = new Set(["MAX_CONNECTORS", "MAX_SOURCE_LENGTH", "MAX_TOTAL_TEXT"]);
  // DSL の入力を一切制約しない。経路探索の打ち切り予算と、打ち切り理由の語彙、
  // それにラベルのピルを線から逃がす判定に使う描画時の寸法。
  // ソースには現れないのでスキーマ側に対応物が存在しない。
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

  // renderer-only はスキーマに現れてはいけない。現れたなら分類が誤っている。
  const schemaText = JSON.stringify(schema);
  for (const name of rendererOnly) {
    assert.ok(
      !schemaText.includes(name),
      `${name} is classified renderer-only but appears in the schema`,
    );
  }
});
