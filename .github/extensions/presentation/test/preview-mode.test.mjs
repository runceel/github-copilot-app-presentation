import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));

test("preview mode reads an offset state without wiring navigation controls", async () => {
  const source = await readFile(join(extensionRoot, "renderer", "renderer.js"), "utf8");

  assert.match(source, /params\.get\("preview"\) === "1"/);
  assert.match(source, /\.\/state\?offset=\$\{previewOffset\}/);
  assert.match(source, /if \(!previewMode\) wireControls\(\)/);
  assert.match(source, /nav\.hidden = previewMode \|\|/);
  assert.match(source, /img\[src\^="\/assets\/"\]/);
});
