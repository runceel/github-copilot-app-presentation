import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildDeckSlides, splitMarkdownDeck } from "../markdown-deck.mjs";

/** 断片の front matter を key -> value のプレーンオブジェクトへ戻す。 */
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
  const slides = buildDeckSlides(["# 1枚目", "", "---", "", "## 2枚目"].join("\n"));
  assert.equal(slides.length, 2);
  assert.equal(bodyOf(slides[0]), "# 1枚目");
  assert.equal(bodyOf(slides[1]), "## 2枚目");
});

test("keeps the deck front matter out of the slide list", () => {
  const { deckMeta, slides } = splitMarkdownDeck(
    ["---", "deck: サンプル", "theme: microsoft", "---", "# 表紙"].join("\n"),
  );
  assert.equal(deckMeta.get("deck").value, "サンプル");
  assert.equal(deckMeta.get("theme").value, "microsoft");
  assert.equal(slides.length, 1);
  assert.equal(slides[0].body, "# 表紙");
});

test("inherits deck front matter into every slide", () => {
  const slides = buildDeckSlides(
    ["---", "deck: サンプル", "theme: light", "---", "# 表紙", "", "---", "", "## 2枚目"].join("\n"),
  );
  assert.equal(slides.length, 2);
  for (const slide of slides) {
    assert.equal(frontMatterOf(slide).deck, "サンプル");
    assert.equal(frontMatterOf(slide).theme, "light");
  }
});

test("reads per-slide front matter placed right after a separator", () => {
  const source = [
    "---",
    "deck: サンプル",
    "---",
    "# 表紙",
    "",
    "---",
    "kicker: Getting started",
    "layout: section",
    "---",
    "## 2枚目の見出し",
  ].join("\n");
  const slides = buildDeckSlides(source);
  // front matter が余分なスライドとして割れていないこと。
  assert.equal(slides.length, 2);
  const second = frontMatterOf(slides[1]);
  assert.equal(second.kicker, "Getting started");
  assert.equal(second.layout, "section");
  assert.equal(second.deck, "サンプル");
  assert.equal(bodyOf(slides[1]), "## 2枚目の見出し");
});

test("per-slide front matter wins over the deck front matter", () => {
  const slides = buildDeckSlides(
    [
      "---",
      "deck: デッキ名",
      "kicker: 共通",
      "---",
      "# 表紙",
      "",
      "---",
      "kicker: 個別",
      "---",
      "## 2枚目",
    ].join("\n"),
  );
  assert.equal(frontMatterOf(slides[0]).kicker, "共通");
  assert.equal(frontMatterOf(slides[1]).kicker, "個別");
  assert.equal(frontMatterOf(slides[1]).deck, "デッキ名");
});

test("applies the file front matter layout to the first slide only", () => {
  const slides = buildDeckSlides(
    ["---", "layout: title", "deck: D", "---", "# 表紙", "", "---", "", "## 2枚目"].join("\n"),
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
      "# 表紙",
      "",
      "---",
      "",
      "## 2枚目",
      "",
      "---",
      "page: 99",
      "---",
      "## 3枚目",
    ].join("\n"),
  );
  // 表紙には番号を振らないが、通し番号の対象にはする。
  assert.equal(frontMatterOf(slides[0]).page, undefined);
  assert.equal(frontMatterOf(slides[0]).total, undefined);
  assert.equal(frontMatterOf(slides[1]).page, "2");
  assert.equal(frontMatterOf(slides[1]).total, "3");
  assert.equal(frontMatterOf(slides[2]).page, "99");
  assert.equal(frontMatterOf(slides[2]).total, "3");
});

test("excludes an explicit backcover from the page count", () => {
  const slides = buildDeckSlides(
    ["# 表紙", "", "---", "", "## 本編", "", "---", "layout: backcover", "---"].join("\n"),
  );
  assert.equal(slides.length, 3);
  assert.equal(frontMatterOf(slides[1]).total, "2");
  assert.equal(frontMatterOf(slides[2]).page, undefined);
});

test("does not split on --- inside a code fence", () => {
  const source = [
    "# コード",
    "",
    "```markdown",
    "# 1枚目",
    "",
    "---",
    "",
    "## 2枚目",
    "```",
    "",
    "---",
    "",
    "## 次のスライド",
  ].join("\n");
  const slides = buildDeckSlides(source);
  assert.equal(slides.length, 2);
  assert.match(bodyOf(slides[0]), /```markdown[\s\S]*---[\s\S]*```/);
  assert.equal(bodyOf(slides[1]), "## 次のスライド");
});

test("does not split on --- inside a tilde fence", () => {
  const slides = buildDeckSlides(
    ["# T", "", "~~~text", "---", "~~~", "", "---", "", "## 次"].join("\n"),
  );
  assert.equal(slides.length, 2);
});

test("treats --- under a paragraph line as a setext heading", () => {
  const slides = buildDeckSlides(["# 見出し", "", "本文", "---", "続き"].join("\n"));
  assert.equal(slides.length, 1);
  assert.match(bodyOf(slides[0]), /本文\n---\n続き/);
});

test("normalizes CRLF input", () => {
  const slides = buildDeckSlides("---\r\ndeck: D\r\n---\r\n# 表紙\r\n\r\n---\r\n\r\n## 2枚目\r\n");
  assert.equal(slides.length, 2);
  assert.equal(frontMatterOf(slides[0]).deck, "D");
  assert.equal(bodyOf(slides[1]), "## 2枚目");
  assert.ok(!slides.some((slide) => slide.includes("\r")));
});

test("drops empty slides", () => {
  const slides = buildDeckSlides(["# 1枚目", "", "---", "", "---", "", "## 2枚目"].join("\n"));
  assert.equal(slides.length, 2);
});

test("handles a plain markdown file without any front matter", () => {
  const slides = buildDeckSlides("# タイトルだけ\n\n本文");
  assert.equal(slides.length, 1);
  assert.equal(frontMatterOf(slides[0]).page, "1");
  assert.equal(frontMatterOf(slides[0]).total, "1");
  assert.equal(bodyOf(slides[0]), "# タイトルだけ\n\n本文");
});

test("returns an empty deck for blank input", () => {
  assert.deepEqual(buildDeckSlides("   \n\n"), []);
});

test("keeps front matter keys that the deck does not know about", () => {
  const slides = buildDeckSlides(
    ["---", "theme: custom", "theme-file: ./themes/brand/theme.css", "---", "# 表紙"].join("\n"),
  );
  assert.equal(frontMatterOf(slides[0])["theme-file"], "./themes/brand/theme.css");
});

test("emits front matter the existing slide parser can read", async () => {
  const slides = buildDeckSlides(
    ["---", "deck: D", "---", "# 表紙", "", "---", "layout: section", "---", "## 章"].join("\n"),
  );
  // extension.mjs の readLayout と同じ前提（先頭が `---\n` で始まる）を満たすこと。
  assert.ok(slides[1].startsWith("---\n"));
  assert.match(slides[1], /^---\n(?:.*\n)*?layout: section\n/);
});
