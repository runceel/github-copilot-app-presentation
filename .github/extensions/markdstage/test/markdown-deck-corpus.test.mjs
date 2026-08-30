import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeckSlides } from "../markdown-deck.mjs";

const extensionRoot = fileURLToPath(new URL("..", import.meta.url));
const corpusPath = join(extensionRoot, "..", "..", "..", "test", "fixtures", "markdown-deck-corpus.json");

test("shared Markdown deck corpus matches the JavaScript parser", async () => {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8"));

  for (const entry of corpus) {
    assert.deepEqual(buildDeckSlides(entry.markdown), entry.slides, entry.name);
  }
});
