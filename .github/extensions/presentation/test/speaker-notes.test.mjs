import test from "node:test";
import assert from "node:assert/strict";

import {
  extractSpeakerNotes,
  stripSpeakerNotes,
} from "../renderer/speaker-notes.mjs";

test("extracts and joins top-level HTML comments as speaker notes", () => {
  const notes = extractSpeakerNotes(
    [
      "## Slide",
      "",
      "<!--",
      "  Start with **why**.",
      "  Then show the demo.",
      "-->",
      "",
      "<!-- End with questions. -->",
    ].join("\n"),
  );

  assert.equal(
    notes,
    "Start with **why**.\nThen show the demo.\n\nEnd with questions.",
  );
});

test("ignores comments in fenced examples and presentation directives", () => {
  const notes = extractSpeakerNotes(
    [
      "<!-- slide-size: large -->",
      "",
      "```markdown",
      "<!-- This is an example, not a note. -->",
      "```",
      "",
      "<!-- Actual note. -->",
    ].join("\n"),
  );

  assert.equal(notes, "Actual note.");
});

test("keeps fenced code written inside a speaker note", () => {
  const notes = extractSpeakerNotes(
    [
      "<!--",
      "Show this code:",
      "",
      "```js",
      'const marker = "---";',
      "```",
      "-->",
    ].join("\n"),
  );

  assert.match(notes, /```js[\s\S]*const marker = "---";[\s\S]*```/);
});

test("strips notes but preserves HTML comment examples in fenced code", () => {
  const markdown = [
    "Intro",
    "<!-- private note -->",
    "```html",
    "<!-- visible example -->",
    "```",
    "Outro",
  ].join("\n");

  assert.equal(
    stripSpeakerNotes(markdown),
    ["Intro", "", "```html", "<!-- visible example -->", "```", "Outro"].join("\n"),
  );
});

test("does not treat inline or indented-code comment markers as notes", () => {
  const markdown = [
    "`<!-- inline code -->`",
    "    <!-- indented code -->",
    "<!-- actual note -->",
  ].join("\n");

  assert.equal(extractSpeakerNotes(markdown), "actual note");
  assert.equal(
    stripSpeakerNotes(markdown),
    ["`<!-- inline code -->`", "    <!-- indented code -->", ""].join("\n"),
  );
});
