import test from "node:test";
import assert from "node:assert/strict";

import "../vendor/marked.min.js";
import {
  extractSpeakerNotes,
  speakerNotesToPlainText,
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

test("converts speaker-note Markdown to readable plain text", () => {
  const text = speakerNotesToPlainText(
    [
      "## Demo",
      "",
      "Start with **why** and open [the docs](https://example.com/docs).",
      "",
      "- First point",
      "  - Nested *detail*",
      "",
      "```js",
      'const marker = "---";',
      "```",
      "",
      "| Name | Value |",
      "| --- | ---: |",
      "| Alpha | `42` |",
    ].join("\n"),
  );

  assert.equal(
    text,
    [
      "Demo",
      "",
      "Start with why and open the docs (https://example.com/docs).",
      "",
      "• First point",
      "  • Nested detail",
      "",
      'const marker = "---";',
      "",
      "Name | Value",
      "Alpha | 42",
    ].join("\n"),
  );
});

test("decodes entities and preserves escaped Markdown characters", () => {
  assert.equal(
    speakerNotesToPlainText(
      "Use \\*literal\\*, open [docs](https://example.com/_api_), email <speaker@example.com>, keep &#x65E5;&#26412;&#35486;, and replace &#0;.",
    ),
    "Use *literal*, open docs (https://example.com/_api_), email speaker@example.com, keep 日本語, and replace �.",
  );
});

test("preserves valid literal text and complex Markdown destinations", () => {
  assert.equal(
    speakerNotesToPlainText(
      [
        "Compare 2 < 3 and 5 > 4.",
        "",
        "Use \\<tag\\>, [escaped](https://example.com/a\\)b), and [spaced](<https://example.com/a b>).",
        "",
        "Contact <a@b.c> or download <ftp://example.com/file>.",
      ].join("\n"),
    ),
    [
      "Compare 2 < 3 and 5 > 4.",
      "",
      "Use <tag>, escaped (https://example.com/a)b), and spaced (https://example.com/a b).",
      "",
      "Contact a@b.c or download ftp://example.com/file.",
    ].join("\n"),
  );
});

test("keeps nested list and paragraph order", () => {
  assert.equal(
    speakerNotesToPlainText(
      ["- First", "  - Nested", "", "  Second paragraph"].join("\n"),
    ),
    ["• First", "  • Nested", "  Second paragraph"].join("\n"),
  );
});

test("removes HTML tags without leaking quoted attributes", () => {
  assert.equal(
    speakerNotesToPlainText(
      '<span title="1 > 0">visible</span> and <a title="x > y" href="https://example.com">label</a>.',
    ),
    "visible and label.",
  );
});

test("preserves entity syntax inside fenced code", () => {
  assert.equal(
    speakerNotesToPlainText(
      ["```html", "&lt;div&gt; &amp; &#35;", "```"].join("\n"),
    ),
    "&lt;div&gt; &amp; &#35;",
  );
});
