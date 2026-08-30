import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));

test("Surface Pen listener emits navigation only", async () => {
  const source = await readFile(
    join(extensionRoot, "windows", "pen-button-listener.ps1"),
    "utf8",
  );

  assert.match(source, /VkF20[\s\S]*"navigate", "next"/);
  assert.match(source, /VkF18[\s\S]*"navigate", "previous"/);
  assert.doesNotMatch(source, /VkF19/);
  assert.doesNotMatch(source, /toggle-presenter/);
});

test("Surface Pen messages cannot open or close the presenter", async () => {
  const source = await readFile(join(extensionRoot, "extension.mjs"), "utf8");

  assert.match(source, /message\.type === "navigate"/);
  assert.doesNotMatch(source, /queuePenPresenterToggle/);
  assert.doesNotMatch(source, /message\.action === "toggle-presenter"/);
  assert.match(source, /name: "open_presenter"/);
  assert.match(source, /name: "close_presenter"/);
});
