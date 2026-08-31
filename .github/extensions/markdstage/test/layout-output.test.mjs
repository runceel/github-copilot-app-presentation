import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));

test("canvas exposes lightweight layout inspection and bounded PNG capture", async () => {
  const source = await readFile(join(extensionRoot, "extension.mjs"), "utf8");

  assert.match(source, /name: "inspect_layout"/);
  assert.match(source, /name: "capture_slides"/);
  assert.match(source, /maxItems: MAX_CAPTURE_SLIDES/);
  assert.match(source, /never inline image bytes/);
  assert.match(source, /--window-size=1280,720/);
  assert.match(source, /--force-device-scale-factor=1/);
  assert.match(source, /--remote-debugging-port=0/);
  assert.match(source, /Page\.captureScreenshot/);
});

test("print, capture, and fixed preview share one 1280x720 output surface", async () => {
  const renderer = await readFile(join(extensionRoot, "renderer", "renderer.js"), "utf8");
  const css = await readFile(join(extensionRoot, "renderer", "slides.css"), "utf8");
  const html = await readFile(join(extensionRoot, "renderer", "index.html"), "utf8");

  assert.match(renderer, /const OUTPUT_WIDTH = 1280/);
  assert.match(renderer, /const OUTPUT_HEIGHT = 720/);
  assert.match(renderer, /collectDeckLayout/);
  assert.match(renderer, /params\.get\("capture"\) === "1"/);
  assert.match(css, /body\.fixed-output-mode \.deck/);
  assert.match(css, /width:1280px;height:720px/);
  assert.match(html, /id="navFixedPreview"/);
  assert.match(html, /id="layoutWarning"/);
  // The live preview scales #stage with a CSS transform, so rect-based measurements are
  // normalized back to the untransformed 1280x720 space before they are combined with
  // scrollWidth/clientWidth. Without this the preview and the headless pass disagree.
  assert.match(renderer, /function layoutScale\(deck\)/);
  assert.match(renderer, /const scale = layoutScale\(deck\)/);
});
