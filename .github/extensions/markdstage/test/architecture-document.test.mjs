import assert from "node:assert/strict";
import test from "node:test";

import { createArchitectureDocument } from "../renderer/architecture-document.mjs";
import { parseArchitecture } from "../renderer/architecture.mjs";

const FIXTURE = {
  version: 1,
  canvas: { width: 1600, height: 900 },
  title: "Editor fixture",
  elements: [
    {
      type: "node",
      id: "client",
      x: 80,
      y: 120,
      width: 240,
      height: 120,
      text: "Client",
    },
    {
      type: "group",
      id: "zone",
      x: 500,
      y: 100,
      width: 700,
      height: 500,
      layout: { type: "row", gap: 40, padding: 50 },
      children: [
        { type: "node", id: "api", text: "API" },
        { type: "node", id: "db", text: "Database" },
      ],
    },
    {
      type: "connector",
      from: "client",
      to: "api",
      routing: "orthogonal",
      arrow: true,
    },
  ],
};

const source = `${JSON.stringify(FIXTURE, null, 2)}\n`;

function raw(document) {
  return JSON.parse(document.source);
}

test("creates a canonical editable document from an empty block", () => {
  const document = createArchitectureDocument("\n");
  assert.deepEqual(raw(document), { version: 1, elements: [] });
  assert.deepEqual(document.model.elements, []);

  const added = document.addNode({ text: "First node" });
  assert.equal(added.ok, true);
  assert.equal(raw(document).elements[0].text, "First node");
  assert.doesNotThrow(() => parseArchitecture(document.source));
});

test("updates root and element properties and renames while preserving connector references", () => {
  const document = createArchitectureDocument(source);
  assert.equal(document.setRoot("title", "Updated").ok, true);
  assert.equal(document.setElement("client", "text", "Browser").ok, true);
  assert.equal(document.renameElement("client", "web-client").ok, true);

  const result = raw(document);
  assert.equal(result.title, "Updated");
  assert.equal(result.elements[0].id, "web-client");
  assert.equal(result.elements[0].text, "Browser");
  assert.equal(result.elements[2].from, "web-client");
  assert.doesNotThrow(() => parseArchitecture(document.source));
});

test("adding and duplicating nodes, groups, and connectors creates valid DSL with unique IDs", () => {
  const document = createArchitectureDocument(source);
  const node = document.addNode({ parentId: "zone", text: "Worker" });
  assert.equal(node.ok, true);
  assert.equal(document.addGroup().ok, true);
  assert.equal(
    document.addConnector({
      from: "client",
      to: node.id,
      label: "dispatches",
      labelLayer: "behind",
    }).ok,
    true,
  );
  const copy = document.duplicate("zone");
  assert.equal(copy.ok, true);
  assert.notEqual(copy.id, "zone");

  const model = parseArchitecture(document.source);
  const ids = model.elements.filter((element) => element.id).map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(model.elements.some((element) => element.id === node.id));
  assert.ok(model.elements.some((element) => element.id === copy.id));
  const addedConnector = model.elements.find(
    (element) =>
      element.type === "connector" &&
      element.from === "client" &&
      element.to === node.id,
  );
  assert.equal(addedConnector.label, "dispatches");
  assert.equal(addedConnector.labelLayer, "behind");
});

test("duplicating a connector returns an existing source path that can be duplicated again", () => {
  const document = createArchitectureDocument(source);
  const first = document.duplicate("elements[2]");
  assert.equal(first.ok, true);
  assert.equal(first.ref, "elements[3]");
  const second = document.duplicate(first.ref);
  assert.equal(second.ok, true);
  assert.equal(second.ref, "elements[4]");
  assert.equal(
    document.model.elements.filter((element) => element.type === "connector").length,
    3,
  );
});

test("node and group coordinates apply to fixed placement and are omitted under layout management", () => {
  const document = createArchitectureDocument(source);
  const rootNode = document.addNode({ x: 340, y: 260 });
  const layoutNode = document.addNode({ parentId: "zone", x: 30, y: 40 });
  assert.equal(rootNode.ok, true);
  assert.equal(layoutNode.ok, true);

  let result = raw(document);
  assert.deepEqual(
    result.elements.find((element) => element.id === rootNode.id),
    {
      type: "node",
      id: rootNode.id,
      shape: "rounded-rect",
      text: "Node",
      x: 340,
      y: 260,
      width: 260,
      height: 140,
    },
  );
  const zone = result.elements.find((element) => element.id === "zone");
  const managed = zone.children.find((element) => element.id === layoutNode.id);
  assert.equal(managed.x, undefined);
  assert.equal(managed.y, undefined);

  assert.equal(document.releaseLayout("zone").ok, true);
  const childGroup = document.addGroup({ parentId: "zone", x: -5000, y: 5000 });
  assert.equal(childGroup.ok, true);
  result = raw(document);
  const positioned = result.elements
    .find((element) => element.id === "zone")
    .children.find((element) => element.id === childGroup.id);
  assert.equal(positioned.x, -4000);
  assert.equal(positioned.y, 4000);
  assert.doesNotThrow(() => parseArchitecture(document.source));
});

test("images integrate with add, edit, placement, connectors, and undo/redo", () => {
  const document = createArchitectureDocument(source);
  const rootImage = document.addImage({
    src: "assets/hero.png",
    x: 320,
    y: 300,
    fit: "cover",
  });
  const layoutImage = document.addImage({
    parentId: "zone",
    src: "assets/logo.svg",
  });
  assert.equal(rootImage.ok, true);
  assert.equal(layoutImage.ok, true);

  let result = raw(document);
  const image = result.elements.find((element) => element.id === rootImage.id);
  assert.deepEqual(image, {
    type: "image",
    id: rootImage.id,
    src: "assets/hero.png",
    fit: "cover",
    ariaLabel: "hero.png",
    x: 320,
    y: 300,
    width: 340,
    height: 220,
  });
  const zone = result.elements.find((element) => element.id === "zone");
  const managedImage = zone.children.find((element) => element.id === layoutImage.id);
  assert.equal(managedImage.x, undefined);
  assert.equal(managedImage.width, undefined);

  assert.equal(document.addConnector({ from: rootImage.id, to: "client" }).ok, true);
  assert.equal(document.renameElement(rootImage.id, "hero-image").ok, true);
  assert.equal(document.setElement("hero-image", "fit", "stretch").ok, true);
  assert.equal(document.setElement("hero-image", "src", "assets/hero-wide.webp").ok, true);
  assert.equal(document.move("hero-image", 20, -10).ok, true);
  assert.equal(
    document.resize("hero-image", { x: 350, y: 310, width: 500, height: 260 }).ok,
    true,
  );
  const copy = document.duplicate("hero-image");
  assert.equal(copy.ok, true);
  assert.notEqual(copy.id, "hero-image");
  result = raw(document);
  assert.ok(
    result.elements.some(
      (element) =>
        element.type === "connector" &&
        element.from === "hero-image" &&
        element.to === "client",
    ),
  );
  assert.equal(
    result.elements.find((element) => element.id === "hero-image").fit,
    "stretch",
  );

  assert.equal(document.remove("hero-image").ok, true);
  assert.equal(
    raw(document).elements.some(
      (element) => element.type === "connector" && element.from === "hero-image",
    ),
    false,
  );
  assert.equal(document.undo().ok, true);
  assert.ok(document.model.elements.some((element) => element.id === "hero-image"));
  assert.equal(document.redo().ok, true);
  assert.equal(document.model.elements.some((element) => element.id === "hero-image"), false);
  assert.doesNotThrow(() => parseArchitecture(document.source));
});

test("deleting a group cascades to connectors referencing descendants", () => {
  const document = createArchitectureDocument(source);
  assert.equal(document.remove("zone").ok, true);
  const result = raw(document);
  assert.deepEqual(result.elements.map((element) => element.id).filter(Boolean), ["client"]);
  assert.equal(
    result.elements.some((element) => element.type === "connector"),
    false,
  );
  assert.doesNotThrow(() => parseArchitecture(document.source));
});

test("rejects layout-managed geometry instead of silently ignoring it and permits edits after release", () => {
  const document = createArchitectureDocument(source);
  const rejected = document.setElement("api", "x", 100);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "layout-managed");
  assert.equal(document.source, source);

  assert.equal(document.releaseLayout("api").ok, true);
  assert.equal(document.setElement("api", "x", 100).ok, true);
  assert.equal(document.resize("api", { x: 700, y: 240, width: 320, height: 180 }).ok, true);
  assert.doesNotThrow(() => parseArchitecture(document.source));
});

test("reenabling group layout atomically returns child coordinates to layout management", () => {
  const document = createArchitectureDocument(source);
  assert.equal(document.releaseLayout("zone").ok, true);
  const released = raw(document).elements.find((element) => element.id === "zone");
  assert.equal(typeof released.children[0].x, "number");
  assert.equal(typeof released.children[0].y, "number");

  assert.equal(
    document.setGroupLayout("zone", {
      type: "grid",
      gap: 28,
      rowGap: 20,
      columnGap: 32,
      padding: 44,
      columns: 2,
    }).ok,
    true,
  );
  const managed = raw(document).elements.find((element) => element.id === "zone");
  assert.deepEqual(managed.layout, {
    type: "grid",
    gap: 28,
    rowGap: 20,
    columnGap: 32,
    padding: 44,
    columns: 2,
  });
  assert.equal(managed.children[0].x, undefined);
  assert.equal(managed.children[0].y, undefined);
  assert.equal(managed.children[0].width, undefined);
  assert.equal(managed.children[0].height, undefined);
  assert.doesNotThrow(() => parseArchitecture(document.source));

  assert.equal(document.undo().ok, true);
  assert.equal(raw(document).elements.find((element) => element.id === "zone").layout, undefined);
  assert.equal(document.setGroupLayout("client", { type: "row" }).reason, "not-group");
});

test("reparenting preserves visual absolute position and rejects cycles", () => {
  const document = createArchitectureDocument(source);
  const before = document.model.elements.find((element) => element.id === "client");
  assert.equal(document.releaseLayout("zone").ok, true);
  assert.equal(document.reparent("client", "zone").ok, true);
  const after = document.model.elements.find((element) => element.id === "client");
  assert.deepEqual(
    { x: after.x, y: after.y, width: after.width, height: after.height },
    { x: before.x, y: before.y, width: before.width, height: before.height },
  );
  assert.equal(document.reparent("zone", "zone").reason, "cyclic-parent");
});

test("undo and redo traverse additions, deletions, and property changes only within the draft", () => {
  const document = createArchitectureDocument(source);
  document.addNode();
  document.setRoot("description", "Draft");
  document.remove("client");
  assert.equal(document.canUndo, true);

  document.undo();
  assert.ok(document.model.elements.some((element) => element.id === "client"));
  document.undo();
  assert.equal(raw(document).description, undefined);
  document.redo();
  assert.equal(raw(document).description, "Draft");
});
