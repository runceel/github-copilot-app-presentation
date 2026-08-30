import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildDeckSlides, splitMarkdownDeck } from "../markdown-deck.mjs";

/** Convert fragment front matter to a plain key-to-value object. */
function frontMatterOf(fragment) {
  const lines = fragment.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const meta = {};
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") break;
    const idx = lines[i].indexOf(":");
    if (idx <= 0) continue;
    meta[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return meta;
}

function bodyOf(fragment) {
  const lines = fragment.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return fragment.trim();
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  return lines.slice(end + 1).join("\n").trim();
}

test("splits slides on top-level --- separators", () => {
  const slides = buildDeckSlides(["# First slide", "", "---", "", "## Second slide"].join("\n"));
  assert.equal(slides.length, 2);
  assert.equal(bodyOf(slides[0]), "# First slide");
  assert.equal(bodyOf(slides[1]), "## Second slide");
});

test("keeps the deck front matter out of the slide list", () => {
  const { deckMeta, slides } = splitMarkdownDeck(
    ["---", "deck: Sample", "theme: microsoft", "---", "# Cover"].join("\n"),
  );
  assert.equal(deckMeta.get("deck").value, "Sample");
  assert.equal(deckMeta.get("theme").value, "microsoft");
  assert.equal(slides.length, 1);
  assert.equal(slides[0].body, "# Cover");
});

test("inherits deck front matter into every slide", () => {
  const slides = buildDeckSlides(
    ["---", "deck: Sample", "theme: light", "---", "# Cover", "", "---", "", "## Second slide"].join("\n"),
  );
  assert.equal(slides.length, 2);
  for (const slide of slides) {
    assert.equal(frontMatterOf(slide).deck, "Sample");
    assert.equal(frontMatterOf(slide).theme, "light");
  }
});

test("reads per-slide front matter placed right after a separator", () => {
  const source = [
    "---",
    "deck: Sample",
    "---",
    "# Cover",
    "",
    "---",
    "kicker: Getting started",
    "layout: section",
    "---",
    "## Second slide heading",
  ].join("\n");
  const slides = buildDeckSlides(source);
  // Front matter must not be split into an extra slide.
  assert.equal(slides.length, 2);
  const second = frontMatterOf(slides[1]);
  assert.equal(second.kicker, "Getting started");
  assert.equal(second.layout, "section");
  assert.equal(second.deck, "Sample");
  assert.equal(bodyOf(slides[1]), "## Second slide heading");
});

test("per-slide front matter wins over the deck front matter", () => {
  const slides = buildDeckSlides(
    [
      "---",
      "deck: Deck name",
      "kicker: Shared",
      "---",
      "# Cover",
      "",
      "---",
      "kicker: Per-slide",
      "---",
      "## Second slide",
    ].join("\n"),
  );
  assert.equal(frontMatterOf(slides[0]).kicker, "Shared");
  assert.equal(frontMatterOf(slides[1]).kicker, "Per-slide");
  assert.equal(frontMatterOf(slides[1]).deck, "Deck name");
});

test("applies the file front matter layout to the first slide only", () => {
  const slides = buildDeckSlides(
    ["---", "layout: title", "deck: D", "---", "# Cover", "", "---", "", "## Second slide"].join("\n"),
  );
  assert.equal(frontMatterOf(slides[0]).layout, "title");
  assert.equal(frontMatterOf(slides[1]).layout, undefined);
  assert.equal(frontMatterOf(slides[1]).deck, "D");
});

test("assigns page/total automatically and keeps handwritten values", () => {
  const slides = buildDeckSlides(
    [
      "---",
      "layout: title",
      "---",
      "# Cover",
      "",
      "---",
      "",
      "## Second slide",
      "",
      "---",
      "page: 99",
      "---",
      "## Third slide",
    ].join("\n"),
  );
  // Do not display a number on the cover, but include it in sequence numbering.
  assert.equal(frontMatterOf(slides[0]).page, undefined);
  assert.equal(frontMatterOf(slides[0]).total, undefined);
  assert.equal(frontMatterOf(slides[1]).page, "2");
  assert.equal(frontMatterOf(slides[1]).total, "3");
  assert.equal(frontMatterOf(slides[2]).page, "99");
  assert.equal(frontMatterOf(slides[2]).total, "3");
});

test("excludes an explicit backcover from the page count", () => {
  const slides = buildDeckSlides(
    ["# Cover", "", "---", "", "## Main content", "", "---", "layout: backcover", "---"].join("\n"),
  );
  assert.equal(slides.length, 3);
  assert.equal(frontMatterOf(slides[1]).total, "2");
  assert.equal(frontMatterOf(slides[2]).page, undefined);
});

test("does not split on --- inside a code fence", () => {
  const source = [
    "# Code",
    "",
    "```markdown",
    "# First slide",
    "",
    "---",
    "",
    "## Second slide",
    "```",
    "",
    "---",
    "",
    "## Next slide",
  ].join("\n");
  const slides = buildDeckSlides(source);
  assert.equal(slides.length, 2);
  assert.match(bodyOf(slides[0]), /```markdown[\s\S]*---[\s\S]*```/);
  assert.equal(bodyOf(slides[1]), "## Next slide");
});

test("does not split on --- inside a tilde fence", () => {
  const slides = buildDeckSlides(
    ["# T", "", "~~~text", "---", "~~~", "", "---", "", "## Next"].join("\n"),
  );
  assert.equal(slides.length, 2);
});

test("treats --- under a paragraph line as a setext heading", () => {
  const slides = buildDeckSlides(["# Heading", "", "Body", "---", "Continuation"].join("\n"));
  assert.equal(slides.length, 1);
  assert.match(bodyOf(slides[0]), /Body\n---\nContinuation/);
});

test("normalizes CRLF input", () => {
  const slides = buildDeckSlides("---\r\ndeck: D\r\n---\r\n# Cover\r\n\r\n---\r\n\r\n## Second slide\r\n");
  assert.equal(slides.length, 2);
  assert.equal(frontMatterOf(slides[0]).deck, "D");
  assert.equal(bodyOf(slides[1]), "## Second slide");
  assert.ok(!slides.some((slide) => slide.includes("\r")));
});

test("drops empty slides", () => {
  const slides = buildDeckSlides(["# First slide", "", "---", "", "---", "", "## Second slide"].join("\n"));
  assert.equal(slides.length, 2);
});

test("handles a plain markdown file without any front matter", () => {
  const slides = buildDeckSlides("# Title only\n\nBody");
  assert.equal(slides.length, 1);
  assert.equal(frontMatterOf(slides[0]).page, "1");
  assert.equal(frontMatterOf(slides[0]).total, "1");
  assert.equal(bodyOf(slides[0]), "# Title only\n\nBody");
});

test("returns an empty deck for blank input", () => {
  assert.deepEqual(buildDeckSlides("   \n\n"), []);
});

test("keeps front matter keys that the deck does not know about", () => {
  const slides = buildDeckSlides(
    ["---", "theme: custom", "theme-file: ./themes/brand/theme.css", "---", "# Cover"].join("\n"),
  );
  assert.equal(frontMatterOf(slides[0])["theme-file"], "./themes/brand/theme.css");
});

test("emits front matter the existing slide parser can read", async () => {
  const slides = buildDeckSlides(
    ["---", "deck: D", "---", "# Cover", "", "---", "layout: section", "---", "## Chapter"].join("\n"),
  );
  // Meet the same assumption as extension.mjs readLayout: input starts with `---\n`.
  assert.ok(slides[1].startsWith("---\n"));
  assert.match(slides[1], /^---\n(?:.*\n)*?layout: section\n/);
});
