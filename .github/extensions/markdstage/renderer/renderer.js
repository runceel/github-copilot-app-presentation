import { renderArchitectureBlock } from "./architecture.mjs";
import { attachArchitectureEditor } from "./architecture-editor.mjs";
import {
  DEFAULT_THEME,
  normalizeTheme,
  parseFrontMatter,
} from "./theme.mjs";
import {
  extractSpeakerNotes,
  stripSpeakerNotes,
} from "./speaker-notes.mjs";
import { splitImportPath } from "./import-path.mjs";

// Client-side slide renderer for the MarkdStage canvas.
//
// The extension server pushes the *current slide* as a small markdown fragment
// (optional front matter + body). This script parses the front matter, renders
// the body with marked, sanitizes the HTML with DOMPurify, turns ```mermaid
// fences into diagrams, and assembles the themed deck DOM. Logic and styling
// are self-contained in this extension (renderer.js + slides.css).

const PLACEHOLDER = [
  "---",
  "layout: title",
  "title: MarkdStage",
  "kicker: MarkdStage",
  "---",
  "# Markdown, ready for the stage.",
  "",
  "Open Markdown to start presenting immediately.",
].join("\n");

// --- front matter ----------------------------------------------------------
// Split a leading `---` fenced block of `key: value` deck metadata from the
// body; everything after the closing `---` is the body.
function splitFrontMatter(md) {
  const meta = {};
  const text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = text.replace(/^[\n \t\uFEFF]+/, "");
  if (!trimmed.startsWith("---\n") && trimmed !== "---") {
    return { meta, body: md };
  }
  const lines = trimmed.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return { meta, body: md };
  Object.assign(meta, parseFrontMatter(lines.slice(0, end + 1).join("\n")));
  return { meta, body: lines.slice(end + 1).join("\n") };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function localAssetUrl(path, documentRef = document) {
  const normalized = String(path || "").replace(/^\/+/, "");
  try {
    const base = new URL(documentRef.baseURI);
    if (base.protocol === "http:" || base.protocol === "https:") {
      return new URL(normalized, base).pathname;
    }
  } catch (_) {}
  return `/${normalized}`;
}

// --- themes ----------------------------------------------------------------
// The deck theme is chosen by the agent (load_deck `theme`) and delivered via
// /state; slide front matter may override it unless the deck theme was explicit.
// Anything unrecognized falls back to the default so a slide is never unstyled.
const MERMAID_THEME = {
  dark: "dark",
  light: "default",
  microsoft: "neutral",
};
const SIZE_MODES = new Set(["auto", "normal", "large", "xlarge"]);
const DEFAULT_SIZE_MODE = "auto";
let deckTheme = DEFAULT_THEME;
let deckThemeLocked = false;
let customThemeCss = "";
let customThemeMeta = null;
// Bumped on every render so a late mermaid finish from a previous slide can't
// reveal a newer, still-rendering one.
let renderToken = 0;
let lastMermaidTheme = null;
// Editing mode is available only in normal view, not presenter or print mode.
// Print mode returns early in init, so presenterMode is the effective branch here.
let architectureEditMode = false;
let architectureEditAvailable = false;
let architectureDetailedEdit = false;
let architectureDetailedEditTarget = "";
let presenterMode = false;
let previewMode = false;
let previewOffset = 0;
let navigationEnabled = true;
let fixedPreviewMode = false;
// Markdown for the most recently rendered slide, retained for editing-mode rerenders.
let lastMarkdown = "";
// Editing UI attached to the rendered slide; destroyed on every rerender.
let architectureEditors = [];
// Serialize saves from every Architecture block so each request uses the deck
// version returned by the previous save.
let architectureSaveQueue = Promise.resolve();
// `layoutTarget` is the slide currently on screen (cover and back cover
// included); `autoSize` says whether it also takes part in the font auto-fit.
let layoutTarget = null;
let layoutFrame = 0;
// Overflow below this many pixels is treated as "it fits". Fractional line
// heights and display scaling routinely push scrollHeight a fraction of a pixel
// past clientHeight, which is invisible but still enough for `overflow:auto` to
// draw a scrollbar.
const SCROLL_EPSILON = 2;
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;
const LAYOUT_HINT_LIMIT = 5;

function applyCustomThemeCss(css) {
  customThemeCss = typeof css === "string" ? css : "";
  let style = document.getElementById("custom-theme-style");
  if (!customThemeCss) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement("style");
    style.id = "custom-theme-style";
    document.head.appendChild(style);
  }
  style.textContent = `:root[data-theme="custom"], .deck[data-theme="custom"]{${customThemeCss}}`;
}

function themeImage(entry, className, { decorative = false } = {}) {
  if (!entry?.image) return null;
  const image = document.createElement("img");
  image.className = className;
  image.src = entry.image;
  image.alt = decorative ? "" : entry.alt || "";
  if (decorative) image.setAttribute("aria-hidden", "true");
  return image;
}

function normalizeSizeMode(value) {
  const size = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SIZE_MODES.has(size) ? size : DEFAULT_SIZE_MODE;
}

function extractSlideSizeDirective(body) {
  const match = body.match(
    /^\s*<!--\s*slide-size\s*:\s*(auto|normal|large|xlarge)\s*-->\s*/i,
  );
  if (!match) return { body, size: "" };
  return {
    body: body.slice(match[0].length),
    size: match[1].toLowerCase(),
  };
}

function setSizeLevel(deck, level) {
  deck.classList.remove("size-large", "size-xlarge");
  if (level === "large" || level === "xlarge") {
    deck.classList.add(`size-${level}`);
  }
}

function measureBodyContent(bodyEl) {
  const container = bodyEl.getBoundingClientRect();
  if (container.width <= 0 || container.height <= 0) return null;

  const children = [...bodyEl.children].filter((child) => {
    const rect = child.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });
  if (!children.length) return null;

  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const child of children) {
    const rect = child.getBoundingClientRect();
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }

  return {
    contentHeight: bottom - top,
    containerHeight: container.height,
    fits:
      bodyEl.scrollHeight <= bodyEl.clientHeight + SCROLL_EPSILON &&
      bodyEl.scrollWidth <= bodyEl.clientWidth + SCROLL_EPSILON,
  };
}

function canUseSizeLevel(bodyEl) {
  const metrics = measureBodyContent(bodyEl);
  if (!metrics || !metrics.fits) return false;
  return metrics.contentHeight <= metrics.containerHeight * 0.86;
}

function applyAutoSize(deck, bodyEl) {
  setSizeLevel(deck, "normal");
  if (
    !bodyEl.textContent.trim() ||
    bodyEl.querySelector("pre, table, img, .mermaid, svg, video, iframe")
  ) {
    return;
  }

  let accepted = "normal";
  for (const candidate of ["large", "xlarge"]) {
    setSizeLevel(deck, candidate);
    if (!canUseSizeLevel(bodyEl)) {
      setSizeLevel(deck, accepted);
      break;
    }
    accepted = candidate;
  }
}

// Slides that fit must not show a scrollbar, but genuinely tall or wide content
// still has to stay reachable. The body is `overflow:hidden` by default and only
// becomes scrollable once the overflow is larger than SCROLL_EPSILON. Measuring
// while hidden keeps the result stable: scrollHeight/scrollWidth still report the
// full content, and no scrollbar is present to shrink the box and skew the next
// measurement.
function updateBodyScroll(bodyEl) {
  if (!bodyEl || !bodyEl.isConnected) return;
  bodyEl.classList.remove("is-scrollable");
  const overflows =
    bodyEl.scrollHeight - bodyEl.clientHeight > SCROLL_EPSILON ||
    bodyEl.scrollWidth - bodyEl.clientWidth > SCROLL_EPSILON;
  if (overflows) bodyEl.classList.add("is-scrollable");
}

function roundedMetric(value) {
  return Math.round(Math.max(0, Number(value) || 0) * 10) / 10;
}

function elementPath(element, root) {
  const parts = [];
  let current = element;
  while (current && current !== root && current.nodeType === Node.ELEMENT_NODE) {
    let part = current.tagName.toLowerCase();
    const classes = [...current.classList]
      .filter((name) => name !== "is-scrollable")
      .slice(0, 2);
    if (classes.length) part += `.${classes.join(".")}`;
    const parent = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

// The live 16:9 preview scales #stage with a CSS transform, so getBoundingClientRect()
// reports scaled pixels while scrollWidth/clientWidth stay in the untransformed 1280x720
// layout space. Every rect-derived delta is divided by this factor before the two kinds of
// measurement are combined, keeping the preview, PDF, and PNG diagnostics in one coordinate
// system.
function layoutScale(deck) {
  const width = deck.offsetWidth;
  if (!width) return 1;
  const scale = deck.getBoundingClientRect().width / width;
  return scale > 0 ? scale : 1;
}

function elementHint(element, root, bounds, kind, scale = 1) {
  const rect = element.getBoundingClientRect();
  const verticalOverflow = Math.max(
    (rect.bottom - bounds.bottom) / scale,
    element.scrollHeight - element.clientHeight,
    0,
  );
  const horizontalOverflow = Math.max(
    (rect.right - bounds.right) / scale,
    element.scrollWidth - element.clientWidth,
    0,
  );
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  return {
    kind,
    path: elementPath(element, root),
    tag: element.tagName.toLowerCase(),
    classes: [...element.classList].slice(0, 4),
    ...(text ? { text: text.slice(0, 96) } : {}),
    verticalOverflowPx: roundedMetric(verticalOverflow),
    horizontalOverflowPx: roundedMetric(horizontalOverflow),
  };
}

function collectSlideLayout(slide, index) {
  const { deck, bodyEl } = slide;
  const scale = layoutScale(deck);
  const deckRect = deck.getBoundingClientRect();
  const bodyRect = bodyEl.getBoundingClientRect();
  const bodyVertical = Math.max(bodyEl.scrollHeight - bodyEl.clientHeight, 0);
  const bodyHorizontal = Math.max(bodyEl.scrollWidth - bodyEl.clientWidth, 0);

  let deckVertical = 0;
  let deckHorizontal = 0;
  for (const child of deck.children) {
    const rect = child.getBoundingClientRect();
    deckVertical = Math.max(deckVertical, (rect.bottom - deckRect.bottom) / scale);
    deckHorizontal = Math.max(deckHorizontal, (rect.right - deckRect.right) / scale);
  }

  const hints = [];
  const seen = new Set();
  const addHint = (element, bounds, kind) => {
    if (!element || seen.has(element) || hints.length >= LAYOUT_HINT_LIMIT) return;
    seen.add(element);
    hints.push(elementHint(element, deck, bounds, kind, scale));
  };

  for (const child of bodyEl.children) {
    const rect = child.getBoundingClientRect();
    if (
      (rect.bottom - bodyRect.bottom) / scale > SCROLL_EPSILON ||
      (rect.right - bodyRect.right) / scale > SCROLL_EPSILON
    ) {
      addHint(child, bodyRect, "outside-body");
    }
  }

  const scrollContainers = [];
  for (const element of bodyEl.querySelectorAll("*")) {
    if (element.clientWidth <= 0 || element.clientHeight <= 0) continue;
    // Diagram internals (Mermaid foreignObject labels, architecture nodes) live in SVG user
    // space and are clipped by design. Their sub-pixel scroll deltas depend on how the label
    // text was measured while rendering and therefore differ between the scaled live preview
    // and the headless output pass. The diagram box itself is still measured through its HTML
    // container, so genuine clipping is not missed.
    if (element.closest("svg")) continue;
    const style = getComputedStyle(element);
    const clipsVertical = ["auto", "scroll", "hidden", "clip"].includes(style.overflowY);
    const clipsHorizontal = ["auto", "scroll", "hidden", "clip"].includes(style.overflowX);
    const vertical = element.scrollHeight - element.clientHeight;
    const horizontal = element.scrollWidth - element.clientWidth;
    if (
      (!clipsVertical || vertical <= SCROLL_EPSILON) &&
      (!clipsHorizontal || horizontal <= SCROLL_EPSILON)
    ) {
      continue;
    }
    const hint = elementHint(
      element,
      deck,
      element.getBoundingClientRect(),
      "scroll-container",
      scale,
    );
    scrollContainers.push(hint);
    addHint(element, element.getBoundingClientRect(), "scroll-container");
    if (scrollContainers.length >= LAYOUT_HINT_LIMIT) break;
  }

  for (const child of deck.children) {
    if (child === bodyEl) continue;
    const rect = child.getBoundingClientRect();
    if (
      (rect.bottom - deckRect.bottom) / scale > SCROLL_EPSILON ||
      (rect.right - deckRect.right) / scale > SCROLL_EPSILON
    ) {
      addHint(child, deckRect, "outside-slide");
    }
  }

  const nestedVertical = scrollContainers.reduce(
    (max, hint) => Math.max(max, hint.verticalOverflowPx),
    0,
  );
  const nestedHorizontal = scrollContainers.reduce(
    (max, hint) => Math.max(max, hint.horizontalOverflowPx),
    0,
  );
  const verticalOverflow = Math.max(bodyVertical, deckVertical, nestedVertical, 0);
  const horizontalOverflow = Math.max(bodyHorizontal, deckHorizontal, nestedHorizontal, 0);
  const hasIssue =
    verticalOverflow > SCROLL_EPSILON || horizontalOverflow > SCROLL_EPSILON;

  return {
    index,
    page: index + 1,
    title: slide.title,
    status: hasIssue ? "pdf-clipped" : "fits",
    pdfClipped: hasIssue,
    screenScrollable:
      bodyVertical > SCROLL_EPSILON ||
      bodyHorizontal > SCROLL_EPSILON ||
      scrollContainers.length > 0,
    verticalOverflowPx: roundedMetric(verticalOverflow),
    horizontalOverflowPx: roundedMetric(horizontalOverflow),
    availableWidthPx: roundedMetric(bodyEl.clientWidth),
    availableHeightPx: roundedMetric(bodyEl.clientHeight),
    contentWidthPx: roundedMetric(bodyEl.scrollWidth),
    contentHeightPx: roundedMetric(bodyEl.scrollHeight),
    scrollContainers,
    elements: hints,
  };
}

function collectDeckLayout(rendered) {
  const slides = rendered.map((slide, index) => collectSlideLayout(slide, index));
  return {
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    total: slides.length,
    issueCount: slides.filter((slide) => slide.pdfClipped).length,
    slides,
  };
}

function updateFixedPreviewWarning() {
  const warning = document.getElementById("layoutWarning");
  const button = document.getElementById("navFixedPreview");
  if (!fixedPreviewMode || !layoutTarget) {
    document.body.classList.remove("fixed-preview-overflow");
    if (warning) {
      warning.hidden = true;
      warning.textContent = "";
    }
    if (button) button.dataset.state = fixedPreviewMode ? "active" : "";
    return;
  }

  const diagnostic = collectSlideLayout(layoutTarget, navIndex);
  document.body.classList.toggle("fixed-preview-overflow", diagnostic.pdfClipped);
  if (button) button.dataset.state = diagnostic.pdfClipped ? "error" : "active";
  if (!warning) return;
  if (!diagnostic.pdfClipped) {
    warning.hidden = true;
    warning.textContent = "";
    return;
  }
  const details = [];
  if (diagnostic.verticalOverflowPx > SCROLL_EPSILON) {
    details.push(`vertical ${diagnostic.verticalOverflowPx}px`);
  }
  if (diagnostic.horizontalOverflowPx > SCROLL_EPSILON) {
    details.push(`horizontal ${diagnostic.horizontalOverflowPx}px`);
  }
  warning.textContent = `PDF layout clips page ${diagnostic.page}: ${details.join(", ")}.`;
  warning.hidden = false;
}

function updateFixedPreviewScale() {
  if (!fixedPreviewMode) return;
  const availableWidth = Math.max(1, window.innerWidth - 24);
  const availableHeight = Math.max(1, window.innerHeight - 88);
  const scale = Math.min(availableWidth / OUTPUT_WIDTH, availableHeight / OUTPUT_HEIGHT, 1);
  document.body.style.setProperty("--fixed-preview-scale", String(scale));
}

function refreshLayout() {
  const target = layoutTarget;
  if (!target || !target.deck.isConnected) return;
  if (target.autoSize) applyAutoSize(target.deck, target.bodyEl);
  updateBodyScroll(target.bodyEl);
  updateFixedPreviewWarning();
}

// Coalesce the (re)layout into one frame: several triggers — render, resize,
// font load, mermaid, images — can land back to back.
function scheduleLayoutRefresh() {
  if (!layoutTarget) return;
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    refreshLayout();
  });
}

// --- emoji shortcodes ------------------------------------------------------
// Best-effort `:name:` → emoji shortcode support for the shortcodes most
// useful in slides. Applied only to text nodes outside code.
const EMOJI = {
  rocket: "\uD83D\uDE80", sparkles: "\u2728", tada: "\uD83C\uDF89",
  fire: "\uD83D\uDD25", star: "\u2B50", star2: "\uD83C\uDF1F",
  zap: "\u26A1", bulb: "\uD83D\uDCA1", memo: "\uD83D\uDCDD",
  books: "\uD83D\uDCDA", book: "\uD83D\uDCD6", computer: "\uD83D\uDCBB",
  desktop_computer: "\uD83D\uDDA5\uFE0F", mag: "\uD83D\uDD0D",
  wrench: "\uD83D\uDD27", hammer: "\uD83D\uDD28", gear: "\u2699\uFE0F",
  white_check_mark: "\u2705", heavy_check_mark: "\u2714\uFE0F",
  check: "\u2714\uFE0F", x: "\u274C", warning: "\u26A0\uFE0F",
  bell: "\uD83D\uDD14", point_right: "\uD83D\uDC49", point_left: "\uD83D\uDC48",
  point_up: "\u261D\uFE0F", point_down: "\uD83D\uDC47", arrow_right: "\u27A1\uFE0F",
  thumbsup: "\uD83D\uDC4D", "+1": "\uD83D\uDC4D", thumbsdown: "\uD83D\uDC4E",
  clap: "\uD83D\uDC4F", wave: "\uD83D\uDC4B", eyes: "\uD83D\uDC40",
  rocket_ship: "\uD83D\uDE80", bug: "\uD83D\uDC1B", lock: "\uD83D\uDD12",
  key: "\uD83D\uDD11", calendar: "\uD83D\uDCC5", chart_with_upwards_trend: "\uD83D\uDCC8",
  bar_chart: "\uD83D\uDCCA", clipboard: "\uD83D\uDCCB", pushpin: "\uD83D\uDCCC",
  paperclip: "\uD83D\uDCCE", link: "\uD83D\uDD17", question: "\u2753",
  exclamation: "\u2757", heart: "\u2764\uFE0F", globe_with_meridians: "\uD83C\uDF10",
  hourglass: "\u231B", coffee: "\u2615", smile: "\uD83D\uDE04",
  package: "\uD83D\uDCE6", art: "\uD83C\uDFA8", construction: "\uD83D\uDEA7",
  100: "\uD83D\uDCAF", ok_hand: "\uD83D\uDC4C", raised_hands: "\uD83D\uDE4C",
  pray: "\uD83D\uDE4F", muscle: "\uD83D\uDCAA", crown: "\uD83D\uDC51",
  trophy: "\uD83C\uDFC6", dart: "\uD83C\uDFAF", balloon: "\uD83C\uDF88",
};

function applyEmojiShortcodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent && parent.closest("code, pre")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.indexOf(":") === -1
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n);
  for (const node of targets) {
    node.nodeValue = node.nodeValue.replace(
      /:([a-z0-9_+-]+):/gi,
      (m, name) => EMOJI[name.toLowerCase()] || m,
    );
  }
}

// --- syntax highlighting ----------------------------------------------------
// Highlight fenced code blocks after marked + DOMPurify have produced a safe
// DOM. Mermaid fences are converted separately and must not be highlighted.
function hasCodeLanguage(code, language) {
  const expected = `language-${language}`.toLowerCase();
  return [...code.classList].some((name) => name.toLowerCase() === expected);
}

function codeBlocksForLanguage(root, language) {
  return [...root.querySelectorAll("pre code")].filter((code) =>
    hasCodeLanguage(code, language),
  );
}

function applySyntaxHighlighting(root) {
  if (!window.hljs) return;
  root.querySelectorAll("pre code").forEach((code) => {
    if (hasCodeLanguage(code, "mermaid") || hasCodeLanguage(code, "architecture")) {
      return;
    }
    try {
      window.hljs.highlightElement(code);
    } catch (e) {
      console.error("Syntax highlighting failed", e);
    }
  });
}

// --- mermaid ---------------------------------------------------------------
// Render every <pre class="mermaid"> in `scope` to SVG. Resilient: a slide with
// no diagrams, a missing library, or an invalid diagram must never leave the
// slide blank, so the body is always revealed in the end. The mermaid theme is
// matched to the slide theme, re-initialized only when it actually changes.
function runMermaid(scope, theme, token, revealWhenDone = true) {
  // Only the latest render may lift the loading veil; a stale finish is ignored.
  const reveal = () => {
    if (revealWhenDone && token === renderToken) {
      document.body.classList.remove("mermaid-loading");
    }
  };
  const nodes = scope.querySelectorAll("pre.mermaid, .mermaid");
  if (!nodes.length || !window.mermaid) {
    reveal();
    return Promise.resolve();
  }
  try {
    const wanted = MERMAID_THEME[theme] || "neutral";
    if (wanted !== lastMermaidTheme) {
      window.mermaid.initialize({ startOnLoad: false, theme: wanted, securityLevel: "strict" });
      lastMermaidTheme = wanted;
    }
    return Promise.resolve(window.mermaid.run({ nodes }))
      .catch((e) => console.error("Mermaid render failed", e))
      .finally(reveal);
  } catch (e) {
    console.error("Mermaid init failed", e);
    reveal();
    return Promise.resolve();
  }
}

// --- slide rendering -------------------------------------------------------
function moveLeadingSlideTitle(header, bodyEl, specialLayout) {
  if (specialLayout) return null;
  const title = bodyEl.firstElementChild;
  if (!title || (title.tagName !== "H1" && title.tagName !== "H2")) return null;
  title.classList.add("slide-title");
  header.appendChild(title);
  return title;
}

function createSlide(markdown, fallbackTheme, themeLocked = deckThemeLocked) {
  const placeholder = !nonEmpty(markdown);
  const md = placeholder ? PLACEHOLDER : markdown;
  const { meta, body: rawBody } = splitFrontMatter(md);
  const directive = extractSlideSizeDirective(rawBody);
  const body = stripSpeakerNotes(directive.body);

  const layout = (meta.layout || "").toLowerCase();
  const titleSlide = layout === "title";
  const sectionSlide = layout === "section";
  // Back cover, equivalent to the .thmx "Closing logo slide". Treat it as a
  // dedicated layout because its logo and copyright are composed separately from the body.
  const backcoverSlide = layout === "backcover";
  // Standard slides align to the top. Only `layout: center` vertically centers
  // the heading and body as a unit; heading extraction and automatic sizing still apply.
  const centerSlide = layout === "center";
  const sizeMode = normalizeSizeMode(meta.size || directive.size);

  // A slide-level `theme:` overrides the deck theme. Keep it on the deck element
  // as well as <html> so print mode can render differently themed pages together.
  const theme = normalizeTheme(themeLocked ? fallbackTheme : meta.theme || fallbackTheme);
  const themeMetadata = theme === "custom" ? customThemeMeta : null;

  const deck = document.createElement("div");
  deck.className = "deck";
  deck.dataset.theme = theme;
  if (titleSlide) deck.className = "deck title-slide";
  else if (sectionSlide) deck.className = "deck section-slide";
  else if (backcoverSlide) deck.className = "deck backcover-slide";
  else if (centerSlide) deck.className = "deck center-slide";
  if (placeholder) deck.classList.add("markdstage-placeholder");
  if (sizeMode !== "auto") setSizeLevel(deck, sizeMode);

  if (titleSlide) {
    const background = themeImage(
      themeMetadata?.cover?.background,
      "theme-cover-background",
      { decorative: true },
    );
    if (background) deck.appendChild(background);
    const logo = themeImage(themeMetadata?.cover?.logo, "theme-cover-logo");
    if (logo) deck.appendChild(logo);
  }

  if (backcoverSlide) {
    if ("logo" in meta && nonEmpty(meta.logo)) {
      const logo = document.createElement("div");
      logo.className = "theme-backcover-logo theme-backcover-logo-text";
      logo.textContent = meta.logo;
      deck.appendChild(logo);
    } else if (!("logo" in meta)) {
      const logo = themeImage(
        themeMetadata?.backcover?.logo,
        "theme-backcover-logo",
      );
      if (logo) deck.appendChild(logo);
    }
  }

  const header = document.createElement("header");
  if (nonEmpty(meta.kicker)) {
    const kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = meta.kicker;
    header.appendChild(kicker);
  }
  deck.appendChild(header);

  const bodyEl = document.createElement("div");
  bodyEl.className = "body";
  // marked renders the markdown; DOMPurify strips anything dangerous (scripts,
  // event handlers, javascript: URLs) while keeping safe formatting such as the
  // <br> tags the title slide relies on.
  bodyEl.innerHTML = window.DOMPurify.sanitize(window.marked.parse(body));
  bodyEl.querySelectorAll('img[src^="/assets/"]').forEach((image) => {
    image.setAttribute("src", localAssetUrl(image.getAttribute("src")));
  });
  applyEmojiShortcodes(bodyEl);
  const slideTitle = moveLeadingSlideTitle(
    header,
    bodyEl,
    titleSlide || sectionSlide || backcoverSlide,
  );
  if (slideTitle) deck.classList.add("has-slide-title");

  // marked emits ```mermaid fences as <pre><code class="language-mermaid">.
  // Convert them to the <pre class="mermaid"> shape mermaid.run expects.
  codeBlocksForLanguage(bodyEl, "mermaid").forEach((code) => {
    const target = code.closest("pre") || code;
    const graph = document.createElement("pre");
    graph.className = "mermaid";
    graph.textContent = code.textContent;
    target.replaceWith(graph);
  });
  // Architecture fences contain a constrained JSON DSL. The renderer builds its
  // SVG with createElementNS/textContent instead of injecting generated markup.
  codeBlocksForLanguage(bodyEl, "architecture").forEach((code, blockIndex) => {
    const target = code.closest("pre") || code;
    const source = code.textContent;
    const slideIndex = navIndex;
    if (!architectureEditMode) {
      target.replaceWith(renderArchitectureBlock(source, document));
      return;
    }
    // Insert the editing UI only in editing mode. Normal view never takes this path,
    // so the toolbar and tabindex cannot leak into production rendering.
    const host = document.createElement("div");
    host.className = "architecture-edit-host";
    host.setAttribute("data-architecture-block", String(blockIndex));
    target.replaceWith(host);
    const editorRenderToken = renderToken;
    const editor = attachArchitectureEditor(host, {
      source,
      documentRef: document,
      canOpenDetail: architectureDetailedEdit,
      onOpenDetail: () => openDetailedArchitectureEditor(slideIndex, blockIndex),
      // Return the save result to the editor; omitting it makes failures look successful.
      onCommit: (next) =>
        saveArchitectureBlock(slideIndex, blockIndex, next, editorRenderToken),
    });
    if (!editor) {
      // Do not edit invalid DSL; fall back to the standard error display.
      host.replaceWith(renderArchitectureBlock(source, document));
      return;
    }
    architectureEditors.push(editor);
  });
  applySyntaxHighlighting(bodyEl);
  deck.appendChild(bodyEl);

  // Footer: only shown when there's a deck name and/or a page/total pair,
  // matching the C# Render() logic.
  const deckName = nonEmpty(meta.deck) ? meta.deck : "";
  const page = nonEmpty(meta.page) ? meta.page : "";
  const total = nonEmpty(meta.total) ? meta.total : "";
  const showFooter = !(deckName === "" && (page === "" || total === ""));
  if (backcoverSlide) {
    const notice =
      "copyright" in meta
        ? meta.copyright
        : themeMetadata?.backcover?.copyright || "";
    if (nonEmpty(notice)) {
      const small = document.createElement("div");
      small.className = "theme-backcover-copyright";
      small.textContent = notice;
      deck.appendChild(small);
    }
  } else if (showFooter) {
    const footer = document.createElement("footer");
    const left = document.createElement("span");
    left.textContent = deckName;
    footer.appendChild(left);
    if (page && total) {
      const pageEl = document.createElement("span");
      pageEl.className = "page";
      pageEl.textContent = `${page} / ${total}`;
      footer.appendChild(pageEl);
    } else {
      footer.appendChild(document.createElement("span"));
    }
    deck.appendChild(footer);
  }

  return {
    deck,
    bodyEl,
    theme,
    sizeMode,
    titleSlide,
    sectionSlide,
    backcoverSlide,
    title: meta.title || meta.deck || "Slide",
  };
}

function renderSlide(markdown) {
  lastMarkdown = typeof markdown === "string" ? markdown : "";
  document.body.classList.toggle("markdstage-empty", !nonEmpty(markdown));
  // Always detach the previous slide's editing UI because it owns document listeners.
  architectureEditors.forEach((editor) => editor.destroy());
  architectureEditors = [];
  applyCustomThemeCss(customThemeCss);
  const token = ++renderToken;
  const slide = createSlide(markdown, deckTheme);
  document.title = slide.title;
  document.documentElement.setAttribute("data-theme", slide.theme);

  document.body.classList.add("mermaid-loading");
  document.getElementById("stage").replaceChildren(slide.deck);
  if (layoutFrame) {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
  }
  layoutTarget = {
    deck: slide.deck,
    bodyEl: slide.bodyEl,
    title: slide.title,
    autoSize:
      slide.sizeMode === "auto" &&
      !slide.titleSlide &&
      !slide.sectionSlide &&
      !slide.backcoverSlide,
  };
  scheduleLayoutRefresh();
  // Mermaid diagrams and images resolve their size asynchronously, so the
  // scroll decision has to be revisited once they have settled.
  //
  // The loading veil is lifted only once *both* have settled: it is the signal
  // that the slide is fully painted, and PDF export and the visual regression
  // suite rely on it. Revealing while an architecture icon under `assets/` is
  // still loading would capture a half-drawn slide.
  const images = waitForImages(slide.deck).then(() => {
    if (token === renderToken) scheduleLayoutRefresh();
  });
  const mermaid = runMermaid(slide.bodyEl, slide.theme, token, false).finally(() => {
    if (token === renderToken) scheduleLayoutRefresh();
  });
  Promise.all([mermaid, images]).finally(() => {
    if (token === renderToken) document.body.classList.remove("mermaid-loading");
  });
}

function afterLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function waitForImages(root) {
  const pending = [...root.querySelectorAll("img")]
    .filter((image) => !image.complete)
    .map(
      (image) =>
        new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
    );
  // SVG <image> is not an HTMLImageElement and has no complete / load properties.
  // Preload the same URL with an HTMLImageElement and wait for it; the second request
  // uses the HTTP cache. Otherwise PDF or visual-regression capture can run before
  // architecture diagram icons render.
  for (const image of root.querySelectorAll("image")) {
    const href = image.getAttribute("href") || image.getAttribute("xlink:href");
    if (!href) continue;
    pending.push(
      new Promise((resolve) => {
        const probe = new Image();
        probe.addEventListener("load", resolve, { once: true });
        probe.addEventListener("error", resolve, { once: true });
        probe.src = href;
        if (probe.complete) resolve();
      }),
    );
  }
  return Promise.all(pending);
}

async function reportOutputStatus(token, status, error = "", layout = null) {
  const response = await fetch(`./export-status?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error, ...(layout ? { layout } : {}) }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not report output status (${response.status}).`);
}

async function renderPrintDeck(
  slides,
  theme,
  customCss = "",
  themeMetadata = null,
  themeLocked = false,
) {
  deckTheme = normalizeTheme(theme);
  deckThemeLocked = Boolean(themeLocked);
  customThemeMeta = themeMetadata && typeof themeMetadata === "object" ? themeMetadata : null;
  applyCustomThemeCss(customCss);
  document.documentElement.setAttribute("data-theme", deckTheme);
  document.body.classList.add("print-mode", "fixed-output-mode", "mermaid-loading");
  const rendered = slides.map((markdown) => createSlide(markdown, deckTheme));
  const stage = document.getElementById("stage");
  stage.replaceChildren(...rendered.map((slide) => slide.deck));
  document.title = rendered[0]?.title || "MarkdStage";

  if (document.fonts?.ready) await document.fonts.ready;
  await afterLayout();
  for (const slide of rendered) {
    if (
      slide.sizeMode === "auto" &&
      !slide.titleSlide &&
      !slide.sectionSlide &&
      !slide.backcoverSlide
    ) {
      applyAutoSize(slide.deck, slide.bodyEl);
    }
  }
  for (const slide of rendered) {
    await runMermaid(slide.bodyEl, slide.theme, renderToken, false);
  }
  await waitForImages(stage);
  await afterLayout();

  const layout = collectDeckLayout(rendered);
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-print-ready", "true");
  window.__presentationPrintReady = true;
  return layout;
}

async function initPrint(params) {
  const token = params.get("token") || "";
  if (!token) throw new Error("Missing PDF export token.");
  try {
    const response = await fetch(`./export-data?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Could not load PDF export data (${response.status}).`);
    const data = await response.json();
    if (
      !Array.isArray(data.slides) ||
      data.slides.length === 0 ||
      !data.slides.every((slide) => typeof slide === "string")
    ) {
      throw new Error("PDF export data does not contain a valid deck.");
    }
    const layout = await renderPrintDeck(
      data.slides,
      data.theme,
      data.customThemeCss,
      data.customThemeMeta,
      data.themeLocked,
    );
    await reportOutputStatus(token, "ready", "", layout);
  } catch (error) {
    const message = error?.message || "Print rendering failed.";
    console.error(message);
    document.body.classList.remove("mermaid-loading");
    document.documentElement.setAttribute("data-print-error", "true");
    await reportOutputStatus(token, "error", message).catch(() => {});
  }
}

async function renderCaptureSlide(
  markdown,
  index,
  total,
  theme,
  customCss = "",
  themeMetadata = null,
  themeLocked = false,
) {
  deckTheme = normalizeTheme(theme);
  deckThemeLocked = Boolean(themeLocked);
  customThemeMeta = themeMetadata && typeof themeMetadata === "object" ? themeMetadata : null;
  applyCustomThemeCss(customCss);
  document.documentElement.setAttribute("data-theme", deckTheme);
  document.body.classList.add("capture-mode", "fixed-output-mode", "mermaid-loading");

  const slide = createSlide(markdown, deckTheme);
  const stage = document.getElementById("stage");
  stage.replaceChildren(slide.deck);
  document.title = slide.title;
  document.documentElement.setAttribute("data-theme", slide.theme);

  if (document.fonts?.ready) await document.fonts.ready;
  await afterLayout();
  if (
    slide.sizeMode === "auto" &&
    !slide.titleSlide &&
    !slide.sectionSlide &&
    !slide.backcoverSlide
  ) {
    applyAutoSize(slide.deck, slide.bodyEl);
  }

  const token = ++renderToken;
  await runMermaid(slide.bodyEl, slide.theme, token, false);
  await waitForImages(stage);
  await afterLayout();

  const diagnostic = collectSlideLayout(slide, index);
  const layout = {
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    total,
    issueCount: diagnostic.pdfClipped ? 1 : 0,
    slides: [diagnostic],
  };
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-capture-ready", "true");
  window.__presentationCaptureReady = true;
  return layout;
}

async function initCapture(params) {
  const token = params.get("token") || "";
  if (!token) throw new Error("Missing PNG capture token.");
  try {
    const response = await fetch(`./export-data?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Could not load PNG capture data (${response.status}).`);
    const data = await response.json();
    if (
      !Array.isArray(data.slides) ||
      data.slides.length === 0 ||
      !data.slides.every((slide) => typeof slide === "string")
    ) {
      throw new Error("PNG capture data does not contain a valid deck.");
    }
    const index = Number.parseInt(params.get("index") || "", 10);
    if (!Number.isInteger(index) || index < 0 || index >= data.slides.length) {
      throw new Error(`PNG capture index is outside the loaded range 0-${data.slides.length - 1}.`);
    }
    const layout = await renderCaptureSlide(
      data.slides[index],
      index,
      data.slides.length,
      data.theme,
      data.customThemeCss,
      data.customThemeMeta,
      data.themeLocked,
    );
    await reportOutputStatus(token, "ready", "", layout);
  } catch (error) {
    const message = error?.message || "PNG capture rendering failed.";
    console.error(message);
    document.body.classList.remove("mermaid-loading");
    document.documentElement.setAttribute("data-capture-error", "true");
    await reportOutputStatus(token, "error", message).catch(() => {});
  }
}

/**
 * Final fallback when initPrint itself fails (#12).
 *
 * initPrint catches body failures internally and sets data-print-error, but
 * **throws a missing token outside the try block**. Without a caller-side catch,
 * this becomes only an unhandled Promise rejection with no persistent failure signal.
 *
 * A browser given an empty token exits 0 after producing a one-page blank PDF
 * (verified empirically), so data-print-error is the only external signal of failure.
 */
function reportPrintBootstrapFailure(error) {
  const message = error?.message || "Print rendering failed.";
  console.error(message);
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-print-error", "true");
}

function reportCaptureBootstrapFailure(error) {
  const message = error?.message || "PNG capture rendering failed.";
  console.error(message);
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-capture-error", "true");
}

// --- live update -----------------------------------------------------------
// /state is the single source of truth for *what to show* (latest slide markdown
// + a monotonic version + the deck position). SSE is just a low-latency "version
// changed" nudge, and a slow poll is a safety net for missed ticks / SSE drops.
// The full deck (for the overview / titles) is fetched separately from /deck and
// only when deckVersion changes, so the polling /state stays small.
let currentVersion = -1;
let knownDeckVersion = -1;
let deckSlides = [];
let deckTitles = [];
let navIndex = 0;
let navTotal = 0;
let navMode = "deck";
let overviewOpen = false;
let importOpen = false;
let importPending = false;
let importFiles = [];
let sourceBacked = false;
let sourceModeAvailable = false;
let sourceMode = "snapshot";
let sourceWatchStatus = "inactive";
let sourceWatchError = "";
let presenterRequestPending = false;
let presenterRunning = false;
let presenterWindowAvailable = false;
let presenterViewAvailable = false;
let pdfExportAvailable = false;
let markdownImportAvailable = false;
let presenterViewOpen = false;
let pdfExportPending = false;

// Derive a short overview title from a slide fragment: first heading, else first
// non-empty body line, trimmed. Mirrors the skill's title rule.
function deriveTitle(md) {
  const { body } = splitFrontMatter(typeof md === "string" ? md : "");
  const lines = stripSpeakerNotes(body).split("\n");
  let fallback = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*\S)\s*$/);
    if (heading) return trimTitle(heading[1]);
    if (!fallback) fallback = line;
  }
  return fallback ? trimTitle(fallback) : "(Untitled)";
}

function trimTitle(text) {
  const stripped = text
    .replace(/[*_`>#~]/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return stripped.length > 40 ? stripped.slice(0, 40) + "…" : stripped || "(Untitled)";
}

async function fetchDeck() {
  try {
    const res = await fetch("./deck", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.slides)) {
      deckSlides = data.slides;
      deckTitles = deckSlides.map(deriveTitle);
    }
    if (typeof data.deckVersion === "number") knownDeckVersion = data.deckVersion;
    buildOverview();
  } catch (_) {
    /* keep last known deck */
  }
}

/**
 * Toggle editing mode. It is always disabled in presenter view; print mode returns
 * early in init and never reaches this code. Return true only when the state changes.
 */
function setArchitectureEditMode(enabled) {
  const next = Boolean(enabled) && architectureEditAvailable && !presenterMode;
  if (next === architectureEditMode) return false;
  architectureEditMode = next;
  document.body.classList.toggle("architecture-edit-mode", next);
  updateArchitectureEditButton(next);
  return true;
}

function updateArchitectureEditButton(enabled = architectureEditMode) {
  const button = document.getElementById("navEdit");
  if (!button) return;
  button.hidden = presenterMode || !architectureEditAvailable;
  button.dataset.state = enabled && !presenterMode ? "active" : "";
  button.title = enabled ? "Exit shape editing mode" : "Shape editing mode";
  button.setAttribute("aria-label", button.title);
}

function sourceWatchErrorMessage(code) {
  if (code === "empty_markdown") return "Keeping the last display because the Markdown is empty";
  if (code === "source_file_too_large") return "Keeping the last display because the Markdown is too large";
  if (code === "source_file_unavailable") return "Cannot identify the Markdown save location";
  if (code === "watch_failed") return "Could not start monitoring Markdown saves";
  if (code === "source_file_not_found") return "Keeping the last display because the Markdown was not found";
  return "Keeping the last display because the Markdown could not be reloaded";
}

function updateSourceModeButton() {
  const button = document.getElementById("navSourceMode");
  const status = document.getElementById("sourceStatus");
  if (!button) return;
  button.hidden = presenterMode || !sourceBacked || !sourceModeAvailable;
  if (!sourceBacked) {
    button.dataset.state = "";
    if (status) status.textContent = "";
    return;
  }
  if (sourceMode === "live" && sourceWatchStatus === "error") {
    const message = sourceWatchErrorMessage(sourceWatchError);
    button.dataset.state = "error";
    button.title = `${message}. Click to pin the display to the loaded snapshot`;
    button.setAttribute("aria-label", button.title);
    if (status) status.textContent = message;
    return;
  }
  const live = sourceMode === "live";
  button.dataset.state = live ? "active" : "";
  button.title = live
    ? "Stop automatic Markdown refresh and pin the current display"
    : "Automatically refresh when Markdown is saved";
  button.setAttribute("aria-label", button.title);
  if (status) {
    status.textContent = live
      ? "Slides refresh automatically when Markdown is saved"
      : "Markdown retains the display from the loaded snapshot";
  }
}

async function requestSourceMode(mode) {
  try {
    const response = await fetch("./source-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const status = document.getElementById("sourceStatus");
      if (status) status.textContent = data.error || "Could not change the Markdown display mode";
      return;
    }
    await fetchState();
  } catch (_) {
    const status = document.getElementById("sourceStatus");
    if (status) status.textContent = "Could not change the Markdown display mode";
  }
}

async function toggleSourceMode() {
  if (presenterMode || !sourceBacked || !sourceModeAvailable) return;
  await requestSourceMode(sourceMode === "live" ? "snapshot" : "live");
}

/**
 * Request that the server enable or disable editing mode. Server state is
 * authoritative, so do not modify client state directly; /state polling applies it.
 */
async function requestArchitectureEditMode(enabled) {
  try {
    await fetch("./edit-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: Boolean(enabled) }),
    });
  } catch (_) {
    /* Editing cannot start while the server is unavailable; the next poll reconciles state. */
  }
}

async function toggleArchitectureEditMode() {
  if (presenterMode || !architectureEditAvailable) return;
  await requestArchitectureEditMode(!architectureEditMode);
  await fetchState();
}

/**
 * Write an edited diagram back to the server. The server replaces the nth
 * ```architecture fence in the source slide, directly updating the source DSL.
 *
 * Always return save success or failure to the caller. Swallowing it would make
 * an unsaved edit look successful, recreating the silent-ignore behavior fixed in Phase 5.
 */
function saveArchitectureBlock(index, block, source, editorRenderToken) {
  const pending = architectureSaveQueue
    .catch(() => {})
    .then(() => {
      if (editorRenderToken !== renderToken) {
        return {
          ok: false,
          message: "The displayed deck was replaced. Select the diagram again",
        };
      }
      return saveArchitectureBlockNow(index, block, source);
    });
  architectureSaveQueue = pending;
  return pending;
}

async function saveArchitectureBlockNow(index, block, source) {
  let res;
  try {
    res = await fetch("./edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        index,
        block,
        source,
        deckVersion: knownDeckVersion,
      }),
    });
  } catch (e) {
    return { ok: false, message: "Could not connect to the server" };
  }
  if (!res.ok) {
    let error = `HTTP ${res.status}`;
    try {
      const failure = await res.json();
      if (failure?.error === "edit_mode_disabled") error = "Editing mode is disabled";
      else if (failure?.error === "source_changed") {
        error = "The source Markdown was modified externally. Reload it before editing";
      } else if (failure?.error === "deck_changed") {
        error = "The displayed deck was replaced. Select the diagram again";
      } else if (failure?.error === "source_file_not_found") {
        error = "The source Markdown was not found";
      } else if (failure?.error === "source_file_too_large") {
        error = "The source Markdown is too large to save";
      } else if (failure?.error === "source_file_unavailable") {
        error = "Cannot identify the source Markdown save location";
      } else if (failure?.error === "source_write_failed") {
        error = "Could not write to the source Markdown";
      } else if (typeof failure?.error === "string") error = failure.error;
    } catch (_) {
      /* If the body is not JSON, show the HTTP status directly. */
    }
    return { ok: false, message: error };
  }
  const data = await res.json();
  // Advance the version for this self-originated update so the SSE echo does not
  // rerender and lose the current editing selection and focus.
  if (typeof data.version === "number" && data.version > currentVersion) {
    currentVersion = data.version;
  }
  if (typeof data.deckVersion === "number" && data.deckVersion > knownDeckVersion) {
    knownDeckVersion = data.deckVersion;
  }
  if (typeof data.markdown === "string") lastMarkdown = data.markdown;
  return { ok: true, fileSaved: data.fileSaved === true };
}

async function openDetailedArchitectureEditor(index, block) {
  const pendingWindow =
    architectureDetailedEditTarget === "window" ? window.open("", "_blank") : null;
  if (pendingWindow) pendingWindow.opener = null;
  let response;
  try {
    response = await fetch("./architecture-editor/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, block }),
    });
  } catch (_) {
    pendingWindow?.close();
    return { ok: false, message: "Could not connect to the server." };
  }
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.ok === true) {
    if (typeof result.url === "string" && result.url) {
      if (pendingWindow) pendingWindow.location.replace(result.url);
      else if (!window.open(result.url, "_blank", "noopener")) {
        return { ok: false, message: "Allow pop-ups to open the Architecture Editor." };
      }
    } else {
      pendingWindow?.close();
    }
    return result;
  }
  pendingWindow?.close();
  if (result.error === "source_not_available") {
    return {
      ok: false,
      message:
        "Advanced editing requires a source Markdown association. Load Markdown with the canvas file picker.",
    };
  }
  return {
    ok: false,
    message: result.message || "Could not open the dedicated Architecture Editor.",
  };
}

async function fetchState() {
  const stateUrl = previewOffset ? `./state?offset=${previewOffset}` : "./state";
  const res = await fetch(stateUrl, { cache: "no-store" });
  if (!res.ok) return;
  const data = await res.json();
  if (typeof data.theme === "string") deckTheme = normalizeTheme(data.theme);
  if (typeof data.themeLocked === "boolean") deckThemeLocked = data.themeLocked;
  if (typeof data.customThemeCss === "string") applyCustomThemeCss(data.customThemeCss);
  customThemeMeta =
    data.customThemeMeta && typeof data.customThemeMeta === "object"
      ? data.customThemeMeta
      : null;
  if (typeof data.presenterWindowAvailable === "boolean") {
    presenterWindowAvailable = data.presenterWindowAvailable;
  }
  if (typeof data.presenterViewAvailable === "boolean") {
    presenterViewAvailable = data.presenterViewAvailable;
  }
  if (typeof data.pdfExportAvailable === "boolean") {
    pdfExportAvailable = data.pdfExportAvailable;
  }
  if (typeof data.markdownImportAvailable === "boolean") {
    markdownImportAvailable = data.markdownImportAvailable;
  }
  if (typeof data.presenterRunning === "boolean") {
    updatePresenterButton(data.presenterRunning);
  }
  updateHostActionButtons();
  if (typeof data.sourceBacked === "boolean") sourceBacked = data.sourceBacked;
  if (typeof data.sourceModeAvailable === "boolean") {
    sourceModeAvailable = data.sourceModeAvailable;
  }
  sourceMode = data.sourceMode === "live" ? "live" : "snapshot";
  sourceWatchStatus =
    data.sourceWatchStatus === "watching" || data.sourceWatchStatus === "error"
      ? data.sourceWatchStatus
      : "inactive";
  sourceWatchError = typeof data.sourceWatchError === "string" ? data.sourceWatchError : "";
  updateSourceModeButton();
  const editAvailabilityChanged =
    typeof data.architectureEditAvailable === "boolean" &&
    data.architectureEditAvailable !== architectureEditAvailable;
  if (typeof data.architectureEditAvailable === "boolean") {
    architectureEditAvailable = data.architectureEditAvailable;
  }
  architectureDetailedEditTarget =
    data.architectureDetailedEditTarget === "window" ? "window" : "canvas";
  const detailedEditChanged =
    typeof data.architectureDetailedEdit === "boolean" &&
    data.architectureDetailedEdit !== architectureDetailedEdit;
  if (typeof data.architectureDetailedEdit === "boolean") {
    architectureDetailedEdit = data.architectureDetailedEdit;
  }
  // Editing-mode changes do not increment the version, so process them before the version guard.
  let availabilityDisabledEditMode = false;
  if (editAvailabilityChanged) {
    if (!architectureEditAvailable) {
      availabilityDisabledEditMode = setArchitectureEditMode(false);
    }
    updateArchitectureEditButton();
  }
  if (
    availabilityDisabledEditMode ||
    (typeof data.architectureEdit === "boolean" &&
      setArchitectureEditMode(data.architectureEdit)) ||
    (architectureEditMode && detailedEditChanged)
  ) {
    renderSlide(lastMarkdown);
    updateNav();
  }
  // Refresh the deck (titles for the overview) when its content changed.
  if (typeof data.deckVersion === "number" && data.deckVersion !== knownDeckVersion) {
    await fetchDeck();
  }
  // Skip stale or already-applied versions so an out-of-order /state response
  // can't roll the slide backward, and our own POST→fetch + the SSE echo don't
  // double-render (which would re-trigger the mermaid loading veil).
  if (typeof data.version === "number" && data.version <= currentVersion) return;
  currentVersion = typeof data.version === "number" ? data.version : currentVersion;
  if (typeof data.index === "number") navIndex = data.index;
  if (typeof data.total === "number") navTotal = data.total;
  navMode = data.mode === "adhoc" ? "adhoc" : "deck";
  renderSlide(typeof data.markdown === "string" ? data.markdown : "");
  updateNav();
}

// --- navigation ------------------------------------------------------------
// Server-authoritative: every nav action POSTs to /navigate, then immediately
// re-fetches /state for an instant update (without waiting for the SSE nudge).
async function navigate(payload) {
  if (!navigationEnabled) return;
  try {
    const res = await fetch("./navigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) await fetchState();
  } catch (_) {
    /* ignore; the safety poll will resync */
  }
}

function goNext() {
  navigate({ delta: 1 });
}
function goPrev() {
  navigate({ delta: -1 });
}
function goToIndex(i) {
  navigate({ index: i });
  closeOverview();
}

async function setPresenterRunning(running) {
  if (!presenterWindowAvailable || presenterRequestPending) return;
  presenterRequestPending = true;
  const button = document.getElementById("navPresent");
  const status = document.getElementById("presentStatus");
  if (button) button.disabled = true;
  if (status) {
    status.textContent = running
      ? "Opening the external presentation window."
      : "Closing the external presentation window.";
  }

  try {
    const response = await fetch("./present", {
      method: running ? "POST" : "DELETE",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `External presenter failed (${response.status}).`);
    }
    const message = running
      ? data.alreadyRunning
        ? "The external presentation window is already open."
        : "Opened the external presentation window."
      : "Closed the external presentation window.";
    if (status) status.textContent = message;
    updatePresenterButton(running, message);
  } catch (error) {
    const message =
      error?.message ||
      (running
        ? "Could not open the external presentation window."
        : "Could not close the external presentation window.");
    console.error("External presenter update failed", error);
    if (status) status.textContent = message;
    if (button) {
      button.dataset.state = "error";
      button.title = message;
    }
  } finally {
    presenterRequestPending = false;
    if (button) button.disabled = false;
  }
}

function openPresenterWindow() {
  return setPresenterRunning(true);
}

function togglePresenterWindow() {
  return setPresenterRunning(!presenterRunning);
}

function updateHostActionButtons() {
  const present = document.getElementById("navPresent");
  if (present) present.hidden = presenterMode || !presenterWindowAvailable;
  const presenterView = document.getElementById("navPresenterView");
  if (presenterView) presenterView.hidden = presenterMode || !presenterViewAvailable;
  const presenterToggle = document.getElementById("presenterToggleButton");
  if (presenterToggle) presenterToggle.hidden = !presenterWindowAvailable;
  const exportButton = document.getElementById("navExport");
  if (exportButton) exportButton.hidden = presenterMode || !pdfExportAvailable;
  const importButton = document.getElementById("navImport");
  if (importButton) importButton.hidden = presenterMode || !markdownImportAvailable;
  if (!presenterViewAvailable && presenterViewOpen) closePresenterView();
  if (!markdownImportAvailable && importOpen) closeImportPicker();
}

function updatePresenterButton(running, message = "") {
  presenterRunning = running;
  const button = document.getElementById("navPresent");
  if (button) {
    button.dataset.state = running ? "active" : "";
    button.title =
      message ||
      (running ? "External presentation window is open" : "Open in external window (F11 for full screen)");
  }
  const toggle = document.getElementById("presenterToggleButton");
  if (toggle) {
    toggle.textContent = running ? "End presentation" : "Start presentation";
    toggle.dataset.state = running ? "active" : "";
  }
}

async function exportPdfFromCanvas() {
  if (!pdfExportAvailable || pdfExportPending) return;
  pdfExportPending = true;
  const button = document.getElementById("navExport");
  const status = document.getElementById("exportStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "Saving PDF.";

  try {
    const response = await fetch("./export", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `PDF export failed (${response.status}).`);
    }
    const filename = data.path ? data.path.split(/[\\/]/).pop() : "PDF";
    const message = `Saved ${filename}.`;
    if (status) status.textContent = message;
    if (button) {
      button.dataset.state = "active";
      button.title = message;
    }
  } catch (error) {
    const message = error?.message || "Could not save the PDF.";
    console.error("PDF export failed", error);
    if (status) status.textContent = message;
    if (button) {
      button.dataset.state = "error";
      button.title = message;
    }
  } finally {
    pdfExportPending = false;
    if (button) button.disabled = false;
  }
}

function setFixedPreviewMode(enabled) {
  fixedPreviewMode = Boolean(enabled);
  document.body.classList.toggle("fixed-preview-mode", fixedPreviewMode);
  document.body.classList.toggle("fixed-output-mode", fixedPreviewMode);
  const button = document.getElementById("navFixedPreview");
  if (button) {
    button.setAttribute("aria-pressed", fixedPreviewMode ? "true" : "false");
    button.dataset.state = fixedPreviewMode ? "active" : "";
    button.title = fixedPreviewMode
      ? "Return to responsive canvas layout"
      : "Preview PDF layout at 16:9";
  }
  if (fixedPreviewMode) {
    updateFixedPreviewScale();
  } else {
    document.body.style.removeProperty("--fixed-preview-scale");
    document.body.classList.remove("fixed-preview-overflow");
  }
  scheduleLayoutRefresh();
  updateFixedPreviewWarning();
}

function toggleFixedPreviewMode() {
  setFixedPreviewMode(!fixedPreviewMode);
}

function updateNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  // Outside presenter view, show only the load button when the host supports
  // Markdown import before any slide has been loaded.
  const empty = navTotal <= 0;
  nav.hidden = previewMode || (empty && (presenterMode || !markdownImportAvailable));
  nav.classList.toggle("nav-empty", empty);
  const counter = document.getElementById("navCounter");
  if (counter) {
    counter.textContent =
      navMode === "adhoc" ? "—" : navTotal ? `${navIndex + 1} / ${navTotal}` : "";
  }
  const prev = document.getElementById("navPrev");
  const next = document.getElementById("navNext");
  // In ad-hoc mode the buttons stay enabled so the user can resume the deck.
  if (prev) prev.disabled = navMode === "deck" && navIndex <= 0;
  if (next) next.disabled = navMode === "deck" && navIndex >= navTotal - 1;
  highlightOverview();
  updatePresenterView();
}

function openPresenterView() {
  if (presenterMode || !presenterViewAvailable || navTotal <= 0) return;
  presenterViewOpen = true;
  document.body.classList.add("presenter-view-mode");
  const view = document.getElementById("presenterView");
  if (view) view.hidden = false;
  const current = document.getElementById("presenterCurrent");
  const next = document.getElementById("presenterNext");
  if (current && !current.getAttribute("src")) {
    current.setAttribute("src", "./?preview=1&offset=0&navigate=1");
  }
  if (next && !next.getAttribute("src")) {
    next.setAttribute("src", "./?preview=1&offset=1");
  }
  updatePresenterView();
}

function closePresenterView() {
  presenterViewOpen = false;
  document.body.classList.remove("presenter-view-mode");
  const view = document.getElementById("presenterView");
  if (view) view.hidden = true;
  document.getElementById("navPresenterView")?.focus();
}

function updatePresenterView() {
  if (!presenterViewOpen) return;
  const counter = document.getElementById("presenterCounter");
  if (counter) counter.textContent = navTotal ? `${navIndex + 1} / ${navTotal}` : "";
  const prev = document.getElementById("presenterPrevButton");
  const next = document.getElementById("presenterNextButton");
  if (prev) prev.disabled = navMode === "deck" && navIndex <= 0;
  if (next) next.disabled = navMode === "deck" && navIndex >= navTotal - 1;
  const hasNext = navMode !== "deck" || navIndex < navTotal - 1;
  const nextFrame = document.getElementById("presenterNext");
  const nextEmpty = document.getElementById("presenterNextEmpty");
  if (nextFrame) nextFrame.hidden = !hasNext;
  if (nextEmpty) nextEmpty.hidden = hasNext;
  const currentMarkdown =
    navMode === "deck" ? deckSlides[navIndex] ?? lastMarkdown : lastMarkdown;
  renderPresenterNotes(currentMarkdown);
}

function renderPresenterNotes(markdown) {
  const target = document.getElementById("presenterNotes");
  const empty = document.getElementById("presenterNotesEmpty");
  if (!target || !empty) return;

  const { body } = splitFrontMatter(typeof markdown === "string" ? markdown : "");
  const notes = extractSpeakerNotes(body);
  target.replaceChildren();
  empty.hidden = Boolean(notes);
  target.hidden = !notes;
  if (!notes) return;

  target.innerHTML = window.DOMPurify.sanitize(window.marked.parse(notes));
  target.querySelectorAll('img[src^="/assets/"]').forEach((image) => {
    image.setAttribute("src", localAssetUrl(image.getAttribute("src")));
  });
  applyEmojiShortcodes(target);
  applySyntaxHighlighting(target);
}

// --- overview --------------------------------------------------------------
function buildOverview() {
  const list = document.getElementById("overviewList");
  if (!list) return;
  list.replaceChildren();
  deckTitles.forEach((title, i) => {
    const li = document.createElement("li");
    li.className = "overview-item";
    li.dataset.index = String(i);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "overview-link";
    const num = document.createElement("span");
    num.className = "overview-num";
    num.textContent = String(i + 1);
    const label = document.createElement("span");
    label.className = "overview-label";
    label.textContent = title;
    btn.appendChild(num);
    btn.appendChild(label);
    btn.addEventListener("click", () => goToIndex(i));
    li.appendChild(btn);
    list.appendChild(li);
  });
  highlightOverview();
}

function highlightOverview() {
  const list = document.getElementById("overviewList");
  if (!list) return;
  list.querySelectorAll(".overview-item").forEach((li) => {
    const isCurrent = navMode === "deck" && Number(li.dataset.index) === navIndex;
    li.classList.toggle("current", isCurrent);
  });
}

function openOverview() {
  if (!deckTitles.length) return;
  overviewOpen = true;
  const el = document.getElementById("overview");
  if (el) el.hidden = false;
  highlightOverview();
  const current = document.querySelector(".overview-item.current .overview-link");
  if (current) current.focus();
}

function closeOverview() {
  overviewOpen = false;
  const el = document.getElementById("overview");
  if (el) el.hidden = true;
}

function toggleOverview() {
  if (overviewOpen) closeOverview();
  else openOverview();
}

// --- markdown import -------------------------------------------------------
// Ask the extension to list workspace Markdown, then split and display the selected
// file in the extension. This lets users present their own Markdown without the agent.
function setImportMessage(text, state = "") {
  const el = document.getElementById("importMessage");
  if (!el) return;
  el.textContent = text;
  if (state) el.dataset.state = state;
  else delete el.dataset.state;
}

function renderImportList() {
  const list = document.getElementById("importList");
  if (!list) return;
  const filterEl = document.getElementById("importFilter");
  const needle = (filterEl?.value || "").trim().toLowerCase();
  const matches = needle
    ? importFiles.filter((path) => path.toLowerCase().includes(needle))
    : importFiles.slice();
  list.replaceChildren();
  for (const path of matches) {
    const li = document.createElement("li");
    li.className = "overview-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "overview-link import-file";
    btn.title = path;
    btn.setAttribute("aria-label", path);
    const { filename, parentPath } = splitImportPath(path);
    const filenameLabel = document.createElement("span");
    filenameLabel.className = "import-filename";
    filenameLabel.textContent = filename;
    btn.appendChild(filenameLabel);
    if (parentPath) {
      const parentLabel = document.createElement("span");
      parentLabel.className = "import-parent";
      parentLabel.textContent = parentPath;
      btn.appendChild(parentLabel);
    }
    btn.addEventListener("click", () => importMarkdown(path));
    li.appendChild(btn);
    list.appendChild(li);
  }
  if (!matches.length && importFiles.length) {
    setImportMessage("No matching files.");
  }
}

async function loadImportFiles() {
  setImportMessage("Searching for Markdown files.");
  try {
    const res = await fetch("./markdown-files", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.files)) {
      throw new Error(data.error || `Could not retrieve the list (${res.status}).`);
    }
    importFiles = data.files;
    if (!importFiles.length) {
      setImportMessage("No Markdown files were found in the workspace.");
    } else if (data.truncated) {
      setImportMessage(`Showing only the first ${importFiles.length} files because there are too many results.`);
    } else {
      setImportMessage("");
    }
    renderImportList();
  } catch (error) {
    console.error("Markdown file listing failed", error);
    importFiles = [];
    renderImportList();
    setImportMessage(error?.message || "Could not retrieve the list.", "error");
  }
}

async function importMarkdown(path) {
  if (importPending) return;
  importPending = true;
  setImportMessage(`Loading ${path}.`);
  try {
    const selectedMode =
      document.querySelector('input[name="importMode"]:checked')?.value === "live"
        ? "live"
        : "snapshot";
    const res = await fetch("./import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, sourceMode: selectedMode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Could not load the file (${res.status}).`);
    }
    closeImportPicker();
    await fetchState();
  } catch (error) {
    console.error("Markdown import failed", error);
    setImportMessage(error?.message || "Could not load the file.", "error");
  } finally {
    importPending = false;
  }
}

function openImportPicker() {
  if (presenterMode || !markdownImportAvailable) return;
  importOpen = true;
  const el = document.getElementById("importPicker");
  if (el) el.hidden = false;
  const filter = document.getElementById("importFilter");
  const snapshotMode = document.getElementById("importModeSnapshot");
  if (snapshotMode) snapshotMode.checked = true;
  if (filter) {
    filter.value = "";
    filter.focus();
  }
  loadImportFiles();
}

function closeImportPicker() {
  importOpen = false;
  const el = document.getElementById("importPicker");
  if (el) el.hidden = true;
}

function toggleImportPicker() {
  if (importOpen) closeImportPicker();
  else openImportPicker();
}

function isSlideWhitespaceTarget(target) {
  if (!(target instanceof Element)) return false;
  const deck = target.closest(".deck");
  if (!deck || !document.getElementById("stage")?.contains(deck)) return false;
  if (
    target.closest(
      "#nav, #overview, button, a, input, textarea, select, video, iframe, " +
        ".deck > header > *, .deck > footer > *, " +
        ".deck > .theme-cover-logo, " +
        ".deck > .theme-backcover-logo, .deck > .theme-backcover-copyright, " +
        ".body > *",
    )
  ) {
    return false;
  }
  return true;
}

// --- input wiring ----------------------------------------------------------
function wirePointerNavigation() {
  document.addEventListener("click", (e) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.shiftKey ||
      !isSlideWhitespaceTarget(e.target)
    ) {
      return;
    }
    goNext();
  });

  document.addEventListener("contextmenu", (e) => {
    if (
      e.defaultPrevented ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.shiftKey ||
      !isSlideWhitespaceTarget(e.target)
    ) {
      return;
    }
    e.preventDefault();
    goPrev();
  });
}

function handleSlideNavigationKey(e) {
  const target = e.target;
  if (
    target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  ) {
    return false;
  }

  const onButton = !!(
    target &&
    (target.tagName === "BUTTON" || target.getAttribute?.("role") === "button")
  );
  switch (e.key) {
    case " ":
    case "Spacebar":
      if (onButton) return false;
      goNext();
      break;
    case "ArrowRight":
    case "PageDown":
      goNext();
      break;
    case "ArrowLeft":
    case "PageUp":
      goPrev();
      break;
    case "Home":
      navigate({ index: 0 });
      break;
    case "End":
      if (navTotal > 0) navigate({ index: navTotal - 1 });
      break;
    default:
      return false;
  }
  e.preventDefault();
  return true;
}

function wirePreviewKeyboardNavigation() {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    handleSlideNavigationKey(e);
  });
}

function wireControls() {
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", () => {
      fn();
      // Drop focus so a follow-up Space/Enter doesn't re-trigger the button on
      // top of the global keyboard handler.
      el.blur();
    });
  };
  bind("navPrev", goPrev);
  bind("navNext", goNext);
  bind("navEdit", toggleArchitectureEditMode);
  bind("navPresent", openPresenterWindow);
  bind("navPresenterView", openPresenterView);
  bind("navFixedPreview", toggleFixedPreviewMode);
  bind("navExport", exportPdfFromCanvas);
  bind("navImport", toggleImportPicker);
  bind("navSourceMode", toggleSourceMode);
  bind("navList", toggleOverview);
  bind("overviewClose", closeOverview);
  bind("importClose", closeImportPicker);
  bind("presenterPrevButton", goPrev);
  bind("presenterNextButton", goNext);
  bind("presenterListButton", openOverview);
  bind("presenterToggleButton", togglePresenterWindow);
  bind("presenterReturnButton", closePresenterView);

  const importFilter = document.getElementById("importFilter");
  if (importFilter) {
    importFilter.addEventListener("input", renderImportList);
  }
  const importPicker = document.getElementById("importPicker");
  if (importPicker) {
    importPicker.addEventListener("click", (e) => {
      if (e.target === importPicker) closeImportPicker();
    });
  }

  const overview = document.getElementById("overview");
  if (overview) {
    // Click on the dimmed backdrop (outside the panel) closes the overview.
    overview.addEventListener("click", (e) => {
      if (e.target === overview) closeOverview();
    });
  }

  wirePointerNavigation();

  // The iframe must be focused to receive key events; grab focus up front and
  // whenever the user interacts with it.
  const grabFocus = () => {
    try {
      window.focus();
    } catch (_) {}
  };
  grabFocus();
  window.addEventListener("pointerdown", grabFocus);

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    // Keep Esc active while an input has focus; otherwise filtering in the import
    // dialog could leave the user unable to close it.
    if (e.key === "Escape" && importOpen) {
      closeImportPicker();
      e.preventDefault();
      return;
    }
    if (handleSlideNavigationKey(e)) return;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    switch (e.key) {
      case "o":
      case "O":
        toggleOverview();
        e.preventDefault();
        break;
      case "i":
      case "I":
        toggleImportPicker();
        e.preventDefault();
        break;
      case "Escape":
        if (importOpen) {
          closeImportPicker();
          e.preventDefault();
        } else if (overviewOpen) {
          closeOverview();
          e.preventDefault();
        } else if (presenterViewOpen) {
          closePresenterView();
          e.preventDefault();
        }
        break;
      default:
        break;
    }
  });
}

function connectEvents() {
  try {
    const es = new EventSource("./events");
    es.onmessage = () =>
      fetchState().catch((error) => console.error("MarkdStage state refresh failed", error));
    // On error EventSource auto-reconnects; the safety poll covers the gap.
  } catch (_) {
    // EventSource unavailable; the safety poll keeps us in sync.
  }
}

function init() {
  try {
    window.marked.setOptions({ gfm: true, breaks: false });
  } catch (_) {}
  try {
    window.mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
  } catch (_) {}

  const params = new URLSearchParams(window.location.search);
  if (params.get("capture") === "1") {
    initCapture(params).catch(reportCaptureBootstrapFailure);
    return;
  }
  if (params.get("print") === "1") {
    // Print mode never reaches editing-mode branches. Removing this return would
    // bake the editing UI into PDFs, so a regression test protects it.
    //
    // This early return is also **the primary fix for the #12 hang**. Only print
    // mode avoids connectEvents() (an unclosed SSE) and the two-second setInterval,
    // allowing the page to become idle and --print-to-pdf to complete.
    // Removing the return makes printing hang forever.
    initPrint(params).catch(reportPrintBootstrapFailure);
    return;
  }
  if (params.get("preview") === "1") {
    previewMode = true;
    presenterMode = true;
    previewOffset = Math.max(-1, Math.min(1, Number(params.get("offset")) || 0));
    navigationEnabled = params.get("navigate") === "1" && previewOffset === 0;
    document.body.classList.add("presenter-mode", "preview-mode");
  } else if (params.get("present") === "1") {
    presenterMode = true;
    document.body.classList.add("presenter-mode");
  } else if (params.get("architectureEdit") === "1") {
    // Local verification path, mutually exclusive with presenter via else-if.
    // Updating only client state would let the next /state poll overwrite it with
    // the server's false value, disabling editing and causing /edit to return 409.
    // Notify the server first so its state remains authoritative. The enabled state
    // then returns through /state.
    requestArchitectureEditMode(true);
  }

  updateArchitectureEditButton();
  if (!previewMode) wireControls();
  else if (navigationEnabled) {
    wirePointerNavigation();
    wirePreviewKeyboardNavigation();
  }
  window.addEventListener("resize", () => {
    updateFixedPreviewScale();
    scheduleLayoutRefresh();
  });
  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleLayoutRefresh).catch(() => {});
  }

  fetchState()
    .catch((error) => console.error("Initial MarkdStage state load failed", error))
    .finally(() => {
      connectEvents();
      setInterval(
        () =>
          fetchState().catch((error) =>
            console.error("MarkdStage state poll failed", error),
          ),
        2000,
      );
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
