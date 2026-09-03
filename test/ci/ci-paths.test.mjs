import assert from "node:assert/strict";
import test from "node:test";

import { classifyCiPaths } from "../../scripts/ci-paths.mjs";

const none = { docs: false, test: false, cli: false, desktop: false };
const all = { docs: true, test: true, cli: true, desktop: true };

function expected(overrides) {
  return { ...none, ...overrides };
}

test("published documentation runs only documentation validation", () => {
  assert.deepEqual(
    classifyCiPaths(["docs/user-guide/ja/installation.md"]),
    expected({ docs: true }),
  );
  assert.deepEqual(
    classifyCiPaths(["packages\\markdstage-cli\\README.md"]),
    expected({ docs: true }),
  );
});

test("component-only changes stay within their component", () => {
  assert.deepEqual(
    classifyCiPaths(["packages/markdstage-cli/src/cli.mjs"]),
    expected({ cli: true }),
  );
  assert.deepEqual(
    classifyCiPaths(["apps/MarkdStage.Desktop/src/MarkdStage.App/MainPage.xaml"]),
    expected({ desktop: true }),
  );
  assert.deepEqual(
    classifyCiPaths([".github/extensions/markdstage/extension.mjs"]),
    expected({ test: true }),
  );
});

test("canonical shared files select their real consumers", () => {
  assert.deepEqual(
    classifyCiPaths([".github/extensions/markdstage/renderer/slides.css"]),
    expected({ test: true, cli: true, desktop: true }),
  );
  assert.deepEqual(
    classifyCiPaths([".github/extensions/markdstage/runtime/output.mjs"]),
    expected({ test: true, cli: true }),
  );
  assert.deepEqual(
    classifyCiPaths([".github/extensions/markdstage/windows/pen-button-listener.ps1"]),
    expected({ test: true, desktop: true }),
  );
});

test("canonical documentation can also be executable package input", () => {
  assert.deepEqual(
    classifyCiPaths([".github/extensions/markdstage/README.md"]),
    expected({ docs: true, test: true, cli: true }),
  );
});

test("shared corpus and sample deck keep their executable checks", () => {
  assert.deepEqual(
    classifyCiPaths(["test/fixtures/markdown-deck-corpus.json"]),
    expected({ test: true, desktop: true }),
  );
  assert.deepEqual(
    classifyCiPaths(["slides.md"]),
    expected({ test: true, cli: true }),
  );
});

test("mixed changes combine the selected areas", () => {
  assert.deepEqual(
    classifyCiPaths([
      "docs/user-guide/README.md",
      "packages/markdstage-cli/src/commands/export.mjs",
    ]),
    expected({ docs: true, cli: true }),
  );
});

test("infrastructure, unknown paths, empty diffs, and manual runs fail safe", () => {
  assert.deepEqual(classifyCiPaths([".github/workflows/ci.yml"]), all);
  assert.deepEqual(classifyCiPaths(["future-product/source.ts"]), all);
  assert.deepEqual(classifyCiPaths([]), all);
  assert.deepEqual(classifyCiPaths(["docs/user-guide/README.md"], { forceAll: true }), all);
});
