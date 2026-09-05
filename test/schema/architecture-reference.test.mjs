import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { architectureSchemaReference } from "../../.github/extensions/markdstage/architecture-reference.mjs";
import { architectureContract } from "../../.github/extensions/markdstage/renderer/architecture-contract.mjs";
import { parseArchitecture } from "../../.github/extensions/markdstage/renderer/architecture.mjs";
import { schemaCheckValue } from "./validator.mjs";

const reference = architectureSchemaReference();
const exampleSource = reference.match(/```architecture\n([\s\S]*?)\n```/)?.[1];
const example = JSON.parse(exampleSource);
// Test-only verification that resolved descriptors retain standard JSON Schema semantics.
const validateProjection = new Ajv2020({ strict: true, strictRequired: false }).compile({
  type: "object",
  additionalProperties: false,
  ...architectureContract.root,
  $defs: architectureContract.definitions,
});

function checkShape(value) {
  const result = schemaCheckValue(value);
  assert.equal(validateProjection(value), result.ok, "generated descriptors agree with the source schema");
  return result;
}

test("the complete bounded authoring-reference example satisfies both JSON Schema and runtime", () => {
  assert.ok(Buffer.byteLength(reference, "utf8") <= 8192);
  const schemaResult = checkShape(example);
  assert.ok(schemaResult.ok, schemaResult.message);
  assert.equal(parseArchitecture(exampleSource).elements.length, 3);
});

test("schema confirms the reference's connector waypoint condition, including empty points", () => {
  for (const routing of [undefined, "straight", "orthogonal", "polyline"]) {
    for (const points of [undefined, [], [{ x: 700, y: 200 }]]) {
      const value = structuredClone(example);
      const connector = value.elements.at(-1);
      if (routing !== undefined) connector.routing = routing;
      if (points !== undefined) connector.points = points;
      assert.equal(checkShape(value).ok, routing === "polyline" || !points?.length, JSON.stringify({ routing, points }));
    }
  }
});

test("schema confirms parent-layout requirements and the layered-only direction condition", () => {
  const group = {
    type: "group", id: "group", x: 100, y: 100, width: 1200, height: 600,
    layout: { type: "row" },
    children: [{ type: "node", id: "child", text: "Managed child" }],
  };
  assert.ok(checkShape({ elements: [group] }).ok);
  assert.equal(parseArchitecture(JSON.stringify({ elements: [group] })).elements.length, 2);
  const noBox = structuredClone(group);
  for (const field of ["x", "y", "width", "height"]) delete noBox[field];
  assert.equal(checkShape({ elements: [noBox] }).ok, false, "own layout cannot waive the group's box");
  const noLayout = structuredClone(group);
  delete noLayout.layout;
  assert.equal(checkShape({ elements: [noLayout] }).ok, false, "children are fixed without parent layout");
  group.layout.direction = "right";
  assert.equal(checkShape({ elements: [group] }).ok, false);
  group.layout.type = "layered";
  assert.ok(checkShape({ elements: [group] }).ok);
});
