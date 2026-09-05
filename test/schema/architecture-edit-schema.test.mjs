// Verify that releasing layouts is safe for all real repository data.
//
// Background: children of a group with a layout silently ignore explicit x/y values.
// About 68% of nodes in real repository data are in this state, so editing first refuses to move
// them and provides an explicit release operation that materializes the layout as coordinates.
//
// Lock down this release behavior with real data rather than a toy fixture.
//   1. Released DSL passes JSON Schema (Flow becomes Fixed, requiring x/y/w/h)
//   2. Released DSL still passes parseArchitecture
//   3. Diagram geometry is identical before and after release (not even a 1px shift)
//
// Run: node --test test/schema/architecture-edit-schema.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  architectureSemanticSnapshot,
  parseArchitecture,
} from "../../.github/extensions/markdstage/renderer/architecture.mjs";
import {
  createArchitectureEditSession,
  describePlacement,
} from "../../.github/extensions/markdstage/renderer/architecture-edit.mjs";
import { extractArchitectureSources } from "../utils/architecture.mjs";
import { schemaCheckSource } from "./validator.mjs";

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
  "_site",
]);

async function collectMarkdownFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...(await collectMarkdownFiles(path.join(directory, entry.name))));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      found.push(path.join(directory, entry.name));
    }
  }
  return found;
}

/** Collect repository architecture sources from Markdown and examples. */
async function collectSources() {
  const collected = [];
  for (const file of await collectMarkdownFiles(repoRoot)) {
    const markdown = await readFile(file, "utf8");
    extractArchitectureSources(markdown).forEach((source, index) => {
      collected.push({ label: `${path.relative(repoRoot, file)}#${index}`, source });
    });
  }
  for (const entry of await readdir(examplesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    collected.push({
      label: path.join("schema/examples", entry.name),
      source: await readFile(path.join(examplesDir, entry.name), "utf8"),
    });
  }
  return collected;
}

const sources = await collectSources();

/** List IDs for groups with layouts in a diagram. */
function layoutGroups(model) {
  return model.elements
    .filter((element) => element.type === "group" && element.layout)
    .map((element) => element.id);
}

/** Geometry comparison data. Include connectors because endpoints derive from node positions. */
function geometry(model) {
  return model.elements.map((element) => ({
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }));
}

// Layout calculations produce binary floating-point values such as 378.79999999999995.
// Because DSL files are human-authored, values are rounded when written back, so coordinates cannot
// match bit-for-bit across a release. Rounding is 1/10000 canvas unit and nesting is at most four
// levels, so use this as the upper bound for an invisible difference (0.001px on a 4000px canvas).
const INVISIBLE = 1e-3;

/** Compare numbers with tolerance and all other values exactly. */
function assertGeometryClose(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: element count changed`);
  for (let i = 0; i < actual.length; i += 1) {
    for (const key of Object.keys(expected[i])) {
      const a = actual[i][key];
      const b = expected[i][key];
      if (typeof a === "number" && typeof b === "number") {
        assert.ok(
          Math.abs(a - b) <= INVISIBLE,
          `${label}: ${expected[i].id ?? expected[i].type}.${key} shifted from ${b} to ${a}`,
        );
      } else {
        assert.deepEqual(a, b, `${label}: ${expected[i].id ?? expected[i].type}.${key}`);
      }
    }
  }
}

/**
 * Remove points that merely lie on the line between their two neighbors.
 *
 * The router collapses duplicate and collinear consecutive points at a 0.001 threshold
 * (architecture.mjs). Layout calculations can produce values such as 696.5999999999999. Although
 * that differs from 696.6 by less than the threshold, it remains a distinct value and survives as
 * a corner. Rounding coordinates removes this ghost corner and one point, but the line shape is
 * unchanged. Normalize both sides with the same rule because only the shape matters here.
 */
function canonicalPoints(points) {
  const kept = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(last.x - point.x) <= INVISIBLE && Math.abs(last.y - point.y) <= INVISIBLE) {
      continue;
    }
    kept.push(point);
  }
  const result = [];
  for (let i = 0; i < kept.length; i += 1) {
    const previous = result[result.length - 1];
    const next = kept[i + 1];
    if (previous && next) {
      const cross =
        (kept[i].x - previous.x) * (next.y - previous.y) -
        (kept[i].y - previous.y) * (next.x - previous.x);
      const span = Math.hypot(next.x - previous.x, next.y - previous.y);
      // This point is unnecessary when its distance from the previous-to-next line is invisible.
      if (span > 0 && Math.abs(cross) / span <= INVISIBLE) continue;
    }
    result.push(kept[i]);
  }
  return result;
}

/** Semantic structure snapshot with normalized connector points. */
function canonicalSnapshot(model) {
  const snapshot = architectureSemanticSnapshot(model);
  return {
    ...snapshot,
    elements: snapshot.elements.map((element) =>
      Array.isArray(element.points)
        ? { ...element, points: canonicalPoints(element.points) }
        : element,
    ),
  };
}

/** Compare semantic structure snapshots, including coordinates, with the same tolerance. */
function assertSnapshotClose(actual, expected, label) {
  const walk = (a, b, at) => {
    if (typeof a === "number" && typeof b === "number") {
      assert.ok(Math.abs(a - b) <= INVISIBLE, `${label}: ${at} shifted from ${b} to ${a}`);
      return;
    }
    if (Array.isArray(b)) {
      assert.ok(Array.isArray(a), `${label}: ${at} is not an array`);
      assert.equal(a.length, b.length, `${label}: ${at} element count changed`);
      b.forEach((value, index) => walk(a[index], value, `${at}[${index}]`));
      return;
    }
    if (b !== null && typeof b === "object") {
      assert.ok(a !== null && typeof a === "object", `${label}: ${at} is not an object`);
      assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${label}: ${at} keys`);
      for (const key of Object.keys(b)) walk(a[key], b[key], `${at}.${key}`);
      return;
    }
    assert.deepEqual(a, b, `${label}: ${at}`);
  };
  walk(actual, expected, "snapshot");
}

test("every real layout manages at least one box, so this test is not vacuous", () => {
  assert.ok(sources.length > 0, "no architecture sources were collected");

  let managed = 0;
  let groups = 0;
  for (const { label, source } of sources) {
    const model = parseArchitecture(source);
    const groupIds = layoutGroups(model);
    const managedOwners = new Set();
    groups += groupIds.length;
    for (const element of model.elements) {
      if (!element.id) continue;
      const placement = describePlacement(model, element.id);
      if (placement.reason !== "layout-managed") continue;
      managed += 1;
      managedOwners.add(placement.layoutOwner);
    }
    for (const groupId of groupIds) {
      assert.ok(
        managedOwners.has(groupId),
        `${label} / ${groupId}: layout does not manage any elements`,
      );
    }
  }

  assert.ok(groups > 0, "no groups have layouts");
  assert.ok(managed > 0, "no elements are layout-managed");
});

test("releasing a layout does not move diagram geometry by even 1px for all real data", () => {
  let released = 0;
  for (const { label, source } of sources) {
    const baseline = parseArchitecture(source);
    for (const groupId of layoutGroups(baseline)) {
      const session = createArchitectureEditSession(source);
      const result = session.releaseLayout(groupId);
      assert.equal(result.ok, true, `${label} / ${groupId}: release failed (${result.reason})`);
      released += 1;

      assertGeometryClose(geometry(session.model), geometry(baseline), `${label} / ${groupId}`);
      assertSnapshotClose(
        canonicalSnapshot(session.model),
        canonicalSnapshot(baseline),
        `${label} / ${groupId}`,
      );
    }
  }
  assert.ok(released > 0, "there were no layouts to release");
});

test("DSL passes JSON Schema after layout release because every Flow-to-Fixed box is populated", () => {
  for (const { label, source } of sources) {
    for (const groupId of layoutGroups(parseArchitecture(source))) {
      const session = createArchitectureEditSession(source);
      assert.equal(session.releaseLayout(groupId).ok, true);
      const verdict = schemaCheckSource(session.source);
      assert.equal(verdict.ok, true, `${label} / ${groupId}: ${verdict.message}`);
    }
  }
});

test("releasing every nested layout from the outside in passes both validators", () => {
  for (const { label, source } of sources) {
    const session = createArchitectureEditSession(source);
    const baseline = parseArchitecture(source);

    // Recount remaining layouts after each release because every release changes the model.
    let guard = 0;
    for (;;) {
      const remaining = layoutGroups(session.model);
      if (remaining.length === 0) break;
      assert.ok((guard += 1) < 64, `${label}: release did not converge`);
      assert.equal(session.releaseLayout(remaining[0]).ok, true);
    }

    if (guard === 0) continue;
    assertGeometryClose(geometry(session.model), geometry(baseline), `${label}: release all`);
    const verdict = schemaCheckSource(session.source);
    assert.equal(verdict.ok, true, `${label}: schema violation after releasing all - ${verdict.message}`);
    // With every layout released, every node can now move freely.
    for (const element of session.model.elements) {
      if (element.type !== "node" && element.type !== "group") continue;
      assert.equal(
        session.describe(element.id).movable,
        true,
        `${label}: ${element.id} remains immovable after release`,
      );
    }
  }
});

test("DSL with written-back moves passes JSON Schema for every movable element in real data", () => {
  for (const { label, source } of sources) {
    const session = createArchitectureEditSession(source);
    let moved = 0;
    for (const element of parseArchitecture(source).elements) {
      if (element.type !== "node" && element.type !== "group") continue;
      if (!describePlacement(session.model, element.id).movable) continue;
      const result = session.move(element.id, 10, -10);
      assert.equal(result.ok, true, `${label}: failed to move ${element.id} (${result.reason})`);
      moved += 1;
    }
    if (moved === 0) continue;
    const verdict = schemaCheckSource(session.source);
    assert.equal(verdict.ok, true, `${label}: schema violation after move - ${verdict.message}`);
  }
});
