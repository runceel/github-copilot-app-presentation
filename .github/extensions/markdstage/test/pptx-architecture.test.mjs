import assert from "node:assert/strict";
import test from "node:test";

import {
  architecturePowerPointSnapshot,
  parseArchitecture,
} from "../renderer/architecture.mjs";

test("Architecture PowerPoint snapshot integrates labels into AutoShapes", () => {
  const snapshot = architecturePowerPointSnapshot(
    parseArchitecture(
      JSON.stringify({
        version: 1,
        canvas: { width: 800, height: 400 },
        elements: [
          {
            type: "group",
            id: "services",
            x: 20,
            y: 20,
            width: 500,
            height: 340,
            title: "Services",
            children: [
              {
                type: "node",
                id: "api",
                x: 40,
                y: 100,
                width: 180,
                height: 100,
                text: "API",
                icon: "api",
              },
              {
                type: "node",
                id: "worker",
                x: 280,
                y: 100,
                width: 180,
                height: 100,
                text: "Worker",
              },
            ],
          },
          {
            type: "connector",
            from: "api",
            to: "worker",
            label: "calls",
          },
        ],
      }),
    ),
  );

  const group = snapshot.objects.find(
    (object) => object.type === "shape" && object.architecture.kind === "group",
  );
  const api = snapshot.objects.find(
    (object) =>
      object.type === "shape" &&
      object.architecture.kind === "node" &&
      object.architecture.id === "api",
  );
  const label = snapshot.objects.find(
    (object) =>
      object.type === "shape" &&
      object.architecture.kind === "connector-label",
  );

  assert.equal(group.text.paragraphs[0].runs[0].text, "Services");
  assert.equal(group.verticalAlignment, "top");
  assert.equal(group.textWrap, "none");
  assert.equal(group.textInsets.left, 24);
  assert.ok(group.textInsets.top > 0);
  assert.equal(group.textInsets.right, 24);
  assert.equal(group.textInsets.bottom, 0);
  assert.equal(api.text.paragraphs[0].runs[0].text, "API");
  assert.equal(api.verticalAlignment, "middle");
  assert.equal(api.textWrap, "none");
  assert.ok(api.textInsets.left > 16);
  assert.equal(label.text.paragraphs[0].runs[0].text, "calls");
  assert.equal(label.verticalAlignment, "middle");
  assert.equal(label.textWrap, "none");
  assert.equal(snapshot.objects.at(-1).architecture.kind, "connector-label");
  assert.equal(
    snapshot.objects.some((object) => object.type === "text"),
    false,
  );
  assert.deepEqual(
    snapshot.icons.map(({ id, icon }) => ({ id, icon })),
    [{ id: "api", icon: "api" }],
  );
});

test("Architecture PowerPoint snapshot preserves native node shape presets", () => {
  const shapes = ["diamond", "triangle", "hexagon", "parallelogram"];
  const snapshot = architecturePowerPointSnapshot(
    parseArchitecture(
      JSON.stringify({
        version: 1,
        canvas: { width: 1000, height: 300 },
        elements: shapes.map((shape, index) => ({
          type: "node",
          id: shape,
          shape,
          x: 20 + index * 240,
          y: 40,
          width: 200,
          height: 140,
          text: shape,
          icon: shape === "triangle" ? "api" : undefined,
        })),
      }),
    ),
  );

  assert.deepEqual(
    snapshot.objects.map(({ shape }) => shape),
    shapes,
  );
  assert.ok(snapshot.objects.every((object) => object.textInsets.left > 16));
  assert.ok(
    snapshot.icons.find((icon) => icon.id === "triangle").x >= 300,
    "triangle icons should use the same safe content inset as SVG rendering",
  );
});
