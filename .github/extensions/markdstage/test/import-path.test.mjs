import assert from "node:assert/strict";
import test from "node:test";

import { splitImportPath } from "../renderer/import-path.mjs";

test("splits Markdown import paths into filename and parent directory", () => {
  assert.deepEqual(splitImportPath("docs/products/quarterly/slides.md"), {
    filename: "slides.md",
    parentPath: "docs/products/quarterly",
  });
  assert.deepEqual(splitImportPath("slides.md"), {
    filename: "slides.md",
    parentPath: "",
  });
  assert.deepEqual(splitImportPath("docs\\products\\slides.md"), {
    filename: "slides.md",
    parentPath: "docs\\products",
  });
});
