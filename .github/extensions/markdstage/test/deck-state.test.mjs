import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyOpenInput,
  ensureBackCover,
  getOutputSnapshotSlides,
  OPEN_INPUT_REQUIRES_SLIDES_MESSAGE,
  planDeckOpen,
} from "../deck-state.mjs";

test("classifies omitted input as refocus and rejects source or theme metadata without slides", () => {
  assert.deepEqual(classifyOpenInput(undefined), { kind: "refocus" });
  assert.deepEqual(classifyOpenInput({}), { kind: "refocus" });

  for (const input of [{ sourceName: "slides.md" }, { theme: "dark" }]) {
    assert.deepEqual(classifyOpenInput(input), {
      kind: "invalid",
      message: OPEN_INPUT_REQUIRES_SLIDES_MESSAGE,
    });
  }

  assert.match(OPEN_INPUT_REQUIRES_SLIDES_MESSAGE, /open_canvas with no input/);
  assert.match(OPEN_INPUT_REQUIRES_SLIDES_MESSAGE, /pass slides or call load_deck/);
  assert.match(OPEN_INPUT_REQUIRES_SLIDES_MESSAGE, /never reads or watches a Markdown file/);
});

test("treats an automatically appended back cover as the same deck", () => {
  const incoming = ["# Cover", "## Details"];
  const stored = ensureBackCover(incoming);

  assert.deepEqual(planDeckOpen(stored, incoming), {
    sameDeck: true,
    shouldApply: false,
    preserveCurrentIndex: true,
  });
  assert.deepEqual(planDeckOpen(stored, incoming, { hasThemeInput: true }), {
    sameDeck: true,
    shouldApply: true,
    preserveCurrentIndex: true,
  });
});

test("replaces a changed deck instead of preserving its current index", () => {
  assert.deepEqual(planDeckOpen(ensureBackCover(["# Old"]), ["# New"]), {
    sameDeck: false,
    shouldApply: true,
    preserveCurrentIndex: false,
  });
});

test("includes a temporary show_slide replacement in the output snapshot", () => {
  const registered = ensureBackCover(["# Cover", "## Details"]);
  const slides = getOutputSnapshotSlides({
    slides: registered,
    index: 1,
    mode: "adhoc",
    markdown: "## Temporary replacement",
  });

  assert.equal(slides.length, registered.length);
  assert.equal(slides[0], "# Cover");
  assert.equal(slides[1], "## Temporary replacement");
  assert.match(slides.at(-1), /layout: backcover/);
});
