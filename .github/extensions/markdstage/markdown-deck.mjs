// Split one Markdown file into an array of Markdown fragments, one per slide.
//
// Splitting was previously the skill's (generative AI's) responsibility. The
// extension now also provides deterministic splitting so the canvas can import
// Markdown directly. It does not summarize prose or decide how to adapt content
// for slides; it only splits content and combines front matter.
//
// Keep this free of runtime npm dependencies because the extension is distributed as a ZIP.

// Opening fence: three or more ` or ~ characters, as in marked; inspect only one info word.
const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/;

// Slide separator: a line containing only `---` (three or more hyphens).
// Do not treat `***` / `___` horizontal rules as separators; only the front-matter marker qualifies.
const SEPARATOR = /^[ \t]{0,3}-{3,}[ \t]*$/;

// One front-matter line: `key: value`. The value may be empty.
const META_LINE = /^([A-Za-z][\w-]*)[ \t]*:(.*)$/;

// Comment syntax allowed in front matter.
const META_COMMENT = /^[ \t]*#/;

// Keys not inherited by each slide from deck front matter.
// - layout: Inheritance would make every page a cover or back cover. The leading
//   front matter is also the first slide's front matter, so it still applies there.
// - page: Sequence numbers are slide-specific; a deck-wide value has no meaning.
const NON_INHERITED_KEYS = new Set(["layout", "page"]);

// Layouts that do not receive automatic page numbers (cover, section divider, and back cover).
const UNNUMBERED_LAYOUTS = new Set(["title", "section", "backcover"]);

function normalizeText(text) {
  return String(text).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
}

/**
 * Read one front-matter block (`---` through `---`).
 *
 * Treat lines[start] as front matter only when it is `---` and all content up to
 * the closing `---` consists of `key: value`, blank lines, or comments. Otherwise
 * return null so the caller treats it as a normal separator or body content.
 *
 * Inspecting the contents before deciding prevents per-slide front matter
 * immediately after a `---` slide separator from becoming an extra slide.
 */
function readFrontMatterAt(lines, start) {
  if (!SEPARATOR.test(lines[start] ?? "")) return null;
  const entries = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (SEPARATOR.test(line)) {
      // Do not treat empty `---` `---` as front matter; it is indistinguishable from two rules.
      if (!entries.length) return null;
      return { meta: entriesToMeta(entries), end: i };
    }
    if (line.trim() === "" || META_COMMENT.test(line)) continue;
    const matched = META_LINE.exec(line);
    if (!matched) return null;
    entries.push([matched[1], matched[2].trim()]);
  }
  return null;
}

function entriesToMeta(entries) {
  const meta = new Map();
  for (const [key, value] of entries) meta.set(key.toLowerCase(), { key, value });
  return meta;
}

function metaLayout(meta) {
  return (meta.get("layout")?.value || "").toLowerCase();
}

/** Convert a front-matter Map back to text enclosed by `---`. */
function formatFrontMatter(meta) {
  if (!meta.size) return "";
  const lines = ["---"];
  for (const { key, value } of meta.values()) {
    lines.push(value === "" ? `${key}:` : `${key}: ${value}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Split a complete Markdown file into shared deck front matter and individual slides.
 *
 * The returned slides value is an array of `{ meta, body }`, where meta maps
 * lowercase keys to `{ key, value }`.
 *
 * Splitting rules:
 * - Do not use `---` inside code fences as a separator.
 * - Extract leading file front matter as shared deck settings.
 * - Associate front matter immediately after a separator (or at the beginning
 *   of an otherwise empty body) with that slide.
 * - Treat `---` after a nonblank line as a setext heading (H2), not a separator.
 */
export function splitMarkdownDeck(text) {
  const lines = normalizeText(text).split("\n");
  let cursor = 0;

  // Skip leading blank lines, then read shared deck front matter.
  while (cursor < lines.length && lines[cursor].trim() === "") cursor += 1;
  let deckMeta = new Map();
  const deckFrontMatter = readFrontMatterAt(lines, cursor);
  if (deckFrontMatter) {
    deckMeta = deckFrontMatter.meta;
    cursor = deckFrontMatter.end + 1;
  }

  const slides = [];
  let meta = new Map();
  let body = [];
  let sawContent = false;
  let fence = null;

  const flush = () => {
    const text = body.join("\n").trim();
    if (text || meta.size) slides.push({ meta, body: text });
    meta = new Map();
    body = [];
    sawContent = false;
  };

  for (let i = cursor; i < lines.length; i += 1) {
    const line = lines[i];

    if (fence) {
      body.push(line);
      if (new RegExp(`^[ \\t]{0,3}[${fence[0]}]{${fence.length},}[ \\t]*$`).test(line)) {
        fence = null;
      }
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open) {
      fence = open[2];
      body.push(line);
      sawContent = true;
      continue;
    }

    if (SEPARATOR.test(line)) {
      // `---` after a nonblank line is a setext heading (H2), not a separator.
      // Check this before front matter so a `key: value`-like paragraph after a
      // heading is not misidentified as front matter.
      const previous = i > 0 ? lines[i - 1] : "";
      if (sawContent && previous.trim() !== "") {
        body.push(line);
        continue;
      }
      // A separator `---` may also open the next slide's front matter
      // (`---` / `key: value` / `---`). Include it only after validating the
      // content as front matter, avoiding an extra blank slide.
      const front = readFrontMatterAt(lines, i);
      if (front) {
        // If nothing has accumulated, this is the current slide's own front matter.
        if (sawContent || meta.size) flush();
        meta = front.meta;
        i = front.end;
        continue;
      }
      flush();
      continue;
    }

    body.push(line);
    if (line.trim() !== "") sawContent = true;
  }
  flush();

  return { deckMeta, slides };
}

/**
 * Convert a Markdown file to slide fragments the extension can render directly.
 *
 * - Inherit shared deck front matter on each slide; slide-level values take precedence.
 * - Do not inherit `layout`. Leading file front matter also belongs to the first
 *   slide, so it still applies there (for example, `layout: title`).
 * - Add `page` / `total` automatically only when neither the deck nor slide
 *   specifies them. Do not display numbers on covers, section dividers, or back
 *   covers, although they still participate in sequence numbering.
 */
export function buildDeckSlides(text) {
  const { deckMeta, slides } = splitMarkdownDeck(text);
  if (!slides.length) return [];

  const merged = slides.map((slide, i) => {
    const meta = new Map();
    for (const [key, entry] of deckMeta) {
      // Leading file front matter also belongs to the first slide, so include its layout.
      if (NON_INHERITED_KEYS.has(key) && !(i === 0 && key === "layout")) continue;
      meta.set(key, entry);
    }
    for (const [key, entry] of slide.meta) meta.set(key, entry);
    return { meta, body: slide.body };
  });

  const total = String(merged.filter((slide) => metaLayout(slide.meta) !== "backcover").length);

  let ordinal = 0;
  return merged.map((slide) => {
    const layout = metaLayout(slide.meta);
    if (layout !== "backcover") ordinal += 1;
    if (!UNNUMBERED_LAYOUTS.has(layout)) {
      if (!slide.meta.has("page")) {
        slide.meta.set("page", { key: "page", value: String(ordinal) });
      }
      if (!slide.meta.has("total")) {
        slide.meta.set("total", { key: "total", value: total });
      }
    }

    const front = formatFrontMatter(slide.meta);
    if (!front) return slide.body;
    return slide.body ? `${front}\n${slide.body}` : front;
  });
}
