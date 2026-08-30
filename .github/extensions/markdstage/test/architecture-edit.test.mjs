// Unit tests for the Architecture diagram editing core (architecture-edit.mjs).
//
// Four properties are protected here:
//   1. Layout-managed elements are rejected as immovable with an explanation.
//      About 68% of nodes in repository data meet this condition.
//   2. Movement writes back coordinates relative to the parent group's absolute position.
//   3. releaseLayout materializes layout as coordinates without changing appearance by one pixel.
//   4. undo / redo traverse snapshots of the complete DSL.
//
// These tests never touch the DOM; the Playwright editing project validates the DOM layer.

import test from "node:test";
import assert from "node:assert/strict";

import {
  architectureSemanticSnapshot,
  parseArchitecture,
} from "../renderer/architecture.mjs";
import {
  EDIT_STEP,
  createArchitectureEditSession,
  describePlacement,
  parseSourcePath,
  resolveRawElement,
  serializeArchitecture,
} from "../renderer/architecture-edit.mjs";
import {
  findArchitectureBlocks,
  importedArchitectureBlockIndex,
  replaceArchitectureBlock,
  replaceImportedArchitectureBlock,
} from "../scripts/markdown-blocks.mjs";

// free           ... top-level node without a parent
// shell          ... group without layout
// shell/pinned   ... child with explicit coordinates
// shell/flowbox  ... nested group with layout: row
// flowbox/f1,f2  ... children positioned by layout; explicit x/y values are ignored
const FIXTURE = {
  version: 1,
  canvas: { width: 1600, height: 900 },
  elements: [
    { type: "node", id: "free", x: 100, y: 100, width: 200, height: 100 },
    {
      type: "group",
      id: "shell",
      x: 500,
      y: 120,
      width: 900,
      height: 600,
      children: [
        { type: "node", id: "pinned", x: 40, y: 60, width: 200, height: 100 },
        {
          type: "group",
          id: "flowbox",
          x: 300,
          y: 60,
          width: 520,
          height: 400,
          layout: { type: "row", padding: 40, gap: 30 },
          children: [
            { type: "node", id: "f1" },
            { type: "node", id: "f2" },
          ],
        },
      ],
    },
  ],
};

const source = `${JSON.stringify(FIXTURE, null, 2)}\n`;

function byId(model, id) {
  return model.elements.find((element) => element.id === id);
}

function boxes(model) {
  return model.elements
    .filter((element) => element.type !== "connector")
    .map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
}

test("sourcePath is parsed strictly and unexpected forms abort write-back", () => {
  assert.deepEqual(parseSourcePath("elements[0]"), [{ key: "elements", index: 0 }]);
  assert.deepEqual(parseSourcePath("elements[1].children[2]"), [
    { key: "elements", index: 1 },
    { key: "children", index: 2 },
  ]);
  for (const bad of ["", "elements", "elements[]", "elements[0]x", ".children[0]", "elements[0].", 42]) {
    assert.equal(parseSourcePath(bad), null, `${String(bad)} should be rejected`);
  }

  const raw = JSON.parse(source);
  const located = resolveRawElement(raw, "elements[1].children[0]");
  assert.equal(located.element.id, "pinned");
  assert.equal(located.parent.id, "shell");
  // A top-level element has a null parent, treated as origin 0,0.
  assert.equal(resolveRawElement(raw, "elements[0]").parent, null);
  // Out-of-range and wrong-type values all return null.
  assert.equal(resolveRawElement(raw, "elements[9]"), null);
  assert.equal(resolveRawElement(raw, "elements[0].children[0]"), null);
});

test("children of a group with layout are immovable and identify the group to release", () => {
  const model = parseArchitecture(source);

  // Parentless elements and children of a group without layout can move.
  assert.equal(describePlacement(model, "free").movable, true);
  assert.deepEqual(describePlacement(model, "free").origin, { x: 0, y: 0 });
  assert.equal(describePlacement(model, "pinned").movable, true);
  assert.deepEqual(describePlacement(model, "pinned").origin, { x: 500, y: 120 });
  assert.equal(describePlacement(model, "flowbox").movable, true);

  // Reject layout-managed elements with a reason and the layout owner.
  for (const id of ["f1", "f2"]) {
    const placement = describePlacement(model, id);
    assert.equal(placement.movable, false);
    assert.equal(placement.reason, "layout-managed");
    assert.equal(placement.layoutOwner, "flowbox");
    assert.equal(placement.layoutType, "row");
  }

  assert.deepEqual(describePlacement(model, "missing"), {
    found: false,
    movable: false,
    reason: "unknown",
    id: "missing",
  });
});

test("movement writes back coordinates relative to the parent group's absolute coordinates", () => {
  const session = createArchitectureEditSession(source);

  // Top-level element: origin is 0, so absolute coordinates are stored directly.
  const movedFree = session.move("free", EDIT_STEP, -EDIT_STEP);
  assert.equal(movedFree.ok, true);
  assert.deepEqual([movedFree.x, movedFree.y], [110, 90]);
  assert.equal(JSON.parse(session.source).elements[0].x, 110);

  // Nested element: DSL stores relative coordinates (40+15, 60+25); model stores absolute values.
  const movedChild = session.move("pinned", 15, 25);
  assert.equal(movedChild.ok, true);
  assert.deepEqual([movedChild.x, movedChild.y], [55, 85]);
  const rawChild = JSON.parse(session.source).elements[1].children[0];
  assert.deepEqual([rawChild.x, rawChild.y], [55, 85]);
  const modelChild = byId(session.model, "pinned");
  assert.deepEqual([modelChild.x, modelChild.y], [555, 205]);

  // Zero movement does not add history.
  const before = session.depth;
  const unchanged = session.move("pinned", 0, 0);
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.reason, "unchanged");
  assert.equal(session.depth, before);
});

test("attempting to move a layout-managed element does not change one character of DSL", () => {
  const session = createArchitectureEditSession(source);
  const result = session.move("f1", EDIT_STEP, EDIT_STEP);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "layout-managed");
  assert.equal(result.layoutOwner, "flowbox");
  assert.equal(session.source, source);
  assert.equal(session.depth, 1);
  assert.equal(session.canUndo, false);
});

test("coordinates are clamped to schema bounds and only reparsable DSL enters history", () => {
  const session = createArchitectureEditSession(source);
  const result = session.move("free", 999_999, -999_999);
  assert.equal(result.ok, true);
  assert.deepEqual([result.x, result.y], [4000, -4000]);
  // Normalize -0 to 0 to avoid noisy JSON diffs.
  const zeroed = createArchitectureEditSession(source).move("free", -100, -100);
  assert.equal(Object.is(zeroed.x, 0), true);
  assert.equal(serializeArchitecture(JSON.parse(session.source)).endsWith("\n"), true);
});

test("releaseLayout materializes layout as coordinates without changing appearance", () => {
  const session = createArchitectureEditSession(source);
  const before = boxes(session.model);
  const beforeSnapshot = architectureSemanticSnapshot(session.model);

  const result = session.releaseLayout("flowbox");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "layout-released");
  assert.equal(result.layoutType, "row");
  assert.equal(result.released, 2);

  // Geometry matches exactly; release means removing layout without moving one pixel.
  assert.deepEqual(boxes(session.model), before);
  assert.deepEqual(architectureSemanticSnapshot(session.model), beforeSnapshot);

  // Layout is removed and children have all four box properties required by schema boxRequired.
  const rawGroup = JSON.parse(session.source).elements[1].children[1];
  assert.equal("layout" in rawGroup, false);
  for (const child of rawGroup.children) {
    for (const key of ["x", "y", "width", "height"]) {
      assert.equal(typeof child[key], "number", `${child.id}.${key} is required`);
    }
  }

  // The element can move after release.
  assert.equal(session.describe("f1").movable, true);
  assert.equal(session.move("f1", EDIT_STEP, 0).ok, true);
});

test("releaseLayout rejects nongroup elements and groups without layout", () => {
  const session = createArchitectureEditSession(source);
  assert.equal(session.releaseLayout("free").reason, "not-a-group");
  assert.equal(session.releaseLayout("shell").reason, "not-layout-managed");
  assert.equal(session.releaseLayout("nope").reason, "unknown");
  assert.equal(session.source, source);
});

test("undo and redo traverse complete DSL and a new edit discards the redo branch", () => {
  const session = createArchitectureEditSession(source);
  assert.equal(session.canUndo, false);
  assert.equal(session.canRedo, false);

  session.move("free", EDIT_STEP, 0);
  session.move("free", EDIT_STEP, 0);
  assert.equal(JSON.parse(session.source).elements[0].x, 120);
  assert.equal(session.depth, 3);

  assert.equal(session.undo().reason, "undone");
  assert.equal(JSON.parse(session.source).elements[0].x, 110);
  assert.equal(session.canRedo, true);
  assert.equal(session.redo().reason, "redone");
  assert.equal(JSON.parse(session.source).elements[0].x, 120);

  // Returning to the beginning exactly matches the original string.
  session.undo();
  session.undo();
  assert.equal(session.source, source);
  assert.equal(session.undo().reason, "no-history");

  // Editing after undo discards the redo branch.
  session.move("free", 0, EDIT_STEP);
  assert.equal(session.canRedo, false);
  assert.equal(session.depth, 2);
});

test("history discards oldest entries after reaching its limit", () => {
  const session = createArchitectureEditSession(source, { historyLimit: 3 });
  for (let i = 0; i < 10; i += 1) session.move("free", 1, 0);
  assert.equal(session.depth, 3);
  assert.equal(session.canRedo, false);
  // Undo works up to the limit; no older history remains.
  assert.equal(session.undo().ok, true);
  assert.equal(session.undo().ok, true);
  assert.equal(session.undo().ok, false);
});

test("edited output returns to the nth architecture block in the source Markdown", () => {
  const markdown = [
    "# Slide with two diagrams",
    "",
    "```architecture",
    '{ "version": 1, "elements": [] }',
    "```",
    "",
    "```json",
    '{ "architecture": "This is plain JSON and is not counted" }',
    "```",
    "",
    "```architecture",
    '{ "version": 1, "elements": [] }',
    "```",
    "",
    "End",
  ].join("\n");

  const blocks = findArchitectureBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((block) => block.index),
    [0, 1],
  );

  const next = replaceArchitectureBlock(markdown, 1, source);
  assert.notEqual(next, null);
  const updated = findArchitectureBlocks(next);
  // Leave block 0 unchanged and replace only block 1.
  assert.equal(updated[0].body, '{ "version": 1, "elements": [] }');
  assert.equal(JSON.parse(updated[1].body).elements.length, 2);
  // Preserve surrounding prose and fence lines.
  assert.equal(next.startsWith("# Slide with two diagrams"), true);
  assert.equal(next.endsWith("End"), true);
  assert.equal((next.match(/```architecture/g) ?? []).length, 2);
  assert.equal(next.includes("This is plain JSON and is not counted"), true);

  // A missing block index returns null so the caller can return 404.
  assert.equal(replaceArchitectureBlock(markdown, 5, source), null);
  assert.equal(replaceArchitectureBlock("Body only", 0, source), null);
});

test("indented fences and ~~~ fences retain the same indexing", () => {
  const markdown = [
    "- Diagram in a list",
    "",
    "  ```architecture",
    '  { "version": 1, "elements": [] }',
    "  ```",
    "",
    "~~~architecture",
    '{ "version": 1, "elements": [] }',
    "~~~",
  ].join("\n");
  const blocks = findArchitectureBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].indent, "  ");

  const next = replaceArchitectureBlock(markdown, 0, '{"version":1,"elements":[]}');
  assert.equal(next.includes('  {"version":1,"elements":[]}'), true);
  assert.equal(next.includes("~~~architecture"), true);
});

test("saving CRLF Markdown does not change newlines outside the fence", () => {
  // Converting every line of a CRLF file to LF when saving one diagram produces
  // a full-file diff for Windows users. Preserve prose outside the fence byte-for-byte.
  const markdown = [
    "---",
    "deck: CRLF",
    "---",
    "",
    "## Heading",
    "",
    "```architecture",
    '{ "version": 1, "elements": [] }',
    "```",
    "",
    "Afterword",
  ].join("\r\n");

  const next = replaceArchitectureBlock(markdown, 0, '{"version":1,"elements":[]}');
  assert.notEqual(next, null);
  // No standalone LF outside a CRLF sequence appears.
  assert.equal(/(?<!\r)\n/.test(next), false);
  assert.equal(next.includes("## Heading\r\n"), true);
  assert.equal(next.includes("Afterword"), true);
  assert.equal(next.includes('{"version":1,"elements":[]}'), true);
  // Lines outside the fence remain unchanged, including the line count.
  assert.equal(next.split("\r\n").length, markdown.split("\r\n").length);
});

test("LF Markdown remains LF", () => {
  const markdown = ["## Heading", "", "```architecture", '{ "version": 1, "elements": [] }', "```", ""].join(
    "\n",
  );
  const next = replaceArchitectureBlock(markdown, 0, '{"version":1,"elements":[]}');
  assert.equal(next.includes("\r"), false);
  assert.equal(next.includes("## Heading\n"), true);
});

test("maps a slide-local block index to the complete imported Markdown", () => {
  const slides = [
    ["## 1", "```architecture", '{"version":1,"elements":[]}', "```"].join("\n"),
    [
      "## 2",
      "```architecture",
      '{"version":1,"elements":[]}',
      "```",
      "```architecture",
      '{"version":1,"elements":[]}',
      "```",
    ].join("\n"),
    "## Back cover",
  ];

  assert.equal(importedArchitectureBlockIndex(slides, 0, 0), 0);
  assert.equal(importedArchitectureBlockIndex(slides, 1, 0), 1);
  assert.equal(importedArchitectureBlockIndex(slides, 1, 1), 2);
  assert.equal(importedArchitectureBlockIndex(slides, 2, 0), null);
  assert.equal(importedArchitectureBlockIndex(slides, 9, 0), null);
});

test("counts Architecture fences case-insensitively like the renderer", () => {
  const slides = [
    ["```Architecture", '{"version":1,"elements":[]}', "```"].join("\n"),
    ["```ARCHITECTURE", '{"version":1,"elements":[]}', "```"].join("\n"),
  ];

  assert.equal(findArchitectureBlocks(slides[0]).length, 1);
  assert.equal(importedArchitectureBlockIndex(slides, 1, 0), 1);
});

test("imported source rewrites only the expected fence and rejects external changes", () => {
  const markdown = [
    "## 1",
    "```architecture",
    '{"version":1,"elements":[]}',
    "```",
    "",
    "---",
    "",
    "## 2",
    "```architecture",
    '{"version":1,"elements":[{"type":"node","id":"target","x":1,"y":2,"width":3,"height":4}]}',
    "```",
  ].join("\r\n");
  const slides = [
    ["## 1", "```architecture", '{"version":1,"elements":[]}', "```"].join("\n"),
    [
      "---",
      "page: 2",
      "total: 2",
      "---",
      "## 2",
      "```architecture",
      '{"version":1,"elements":[{"type":"node","id":"target","x":1,"y":2,"width":3,"height":4}]}',
      "```",
    ].join("\n"),
  ];
  const edited =
    '{"version":1,"elements":[{"type":"node","id":"target","x":11,"y":12,"width":3,"height":4}]}';

  const result = replaceImportedArchitectureBlock(markdown, slides, 1, 0, edited, markdown);
  assert.equal(result.ok, true);
  assert.equal(result.globalIndex, 1);
  assert.equal(findArchitectureBlocks(result.markdown)[0].body, '{"version":1,"elements":[]}');
  assert.equal(JSON.parse(findArchitectureBlocks(result.markdown)[1].body).elements[0].x, 11);
  assert.equal(/(?<!\r)\n/.test(result.markdown), false);

  const externallyChanged = markdown.replace('"x":1', '"x":99');
  assert.deepEqual(
    replaceImportedArchitectureBlock(externallyChanged, slides, 1, 0, edited, markdown),
    { ok: false, reason: "source_changed" },
  );

  const identicalInserted = markdown.replace(
    "## 1\r\n",
    [
      "## inserted",
      "```architecture",
      '{"version":1,"elements":[]}',
      "```",
      "",
      "## 1",
      "",
    ].join("\r\n"),
  );
  assert.deepEqual(
    replaceImportedArchitectureBlock(identicalInserted, slides, 1, 0, edited, markdown),
    { ok: false, reason: "source_changed" },
  );
});
