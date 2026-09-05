import { powerPointDashStyle, renderArchitectureBlock } from "./architecture.mjs";
import { attachArchitectureEditor } from "./architecture-editor.mjs";
import {
  DEFAULT_THEME,
  normalizeTheme,
  parseFrontMatter,
} from "./theme.mjs";
import {
  extractSpeakerNotes,
  speakerNotesToPlainText,
  splitSpeakerNotes,
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
let pptxFallbackSequence = 0;
const pptxFallbackCaptureElements = new Map();
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
let moreControlsOpen = false;
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
const PPTX_LAYOUT_NAMES = ["title", "default", "center", "section", "backcover"];
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
    syncMoreControls();
    return;
  }

  const diagnostic = collectSlideLayout(layoutTarget, navIndex);
  document.body.classList.toggle("fixed-preview-overflow", diagnostic.pdfClipped);
  if (button) button.dataset.state = diagnostic.pdfClipped ? "error" : "active";
  syncMoreControls();
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
  const speakerNotes = splitSpeakerNotes(directive.body);
  const body = speakerNotes.markdown;

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
      const wrapper = renderArchitectureBlock(source, document);
      wrapper.dataset.architectureBlock = String(blockIndex);
      const title = wrapper.__presentationPptxSnapshot?.title;
      if (title) wrapper.dataset.architectureTitle = title;
      target.replaceWith(wrapper);
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
    centerSlide,
    backcoverSlide,
    speakerNotes: speakerNotes.notes,
    title: meta.title || meta.deck || "Slide",
  };
}

function renderSlide(markdown) {
  closeArchitecturePicker();
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

const PPTX_DIRECT_IMAGE = /\.(?:png|jpe?g|gif|svg)(?:$|[?#])/i;

function normalizeCssColor(value) {
  const text = String(value || "").trim();
  if (!text || text === "none" || text === "transparent") return null;
  const shortHex = text.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  if (shortHex) {
    return `#${shortHex.slice(1).map((part) => part.repeat(2)).join("")}`.toUpperCase();
  }
  const hex = text.match(/^#([\da-f]{6})(?:[\da-f]{2})?$/i);
  if (hex) return `#${text.slice(1).toUpperCase()}`;
  const rgb = text.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i,
  );
  if (!rgb) return text;
  if (rgb[4] === "0" || rgb[4] === "0%") return null;
  const channels = rgb
    .slice(1, 4)
    .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))));
  if (rgb[4] !== undefined) {
    const alpha = rgb[4].endsWith("%") ? Number.parseFloat(rgb[4]) / 100 : Number(rgb[4]);
    if (Number.isFinite(alpha) && alpha < 1) {
      return `rgba(${channels.join(", ")}, ${Math.max(0, alpha)})`;
    }
  }
  return `#${channels
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function resolveModelColor(value, context) {
  if (!value || value === "none" || value === "transparent") return null;
  const probe = document.createElement("span");
  probe.style.color = String(value);
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  context.appendChild(probe);
  const resolved = normalizeCssColor(getComputedStyle(probe).color);
  probe.remove();
  return resolved;
}

function relativeBounds(element, deck) {
  const rect = element.getBoundingClientRect();
  const slide = deck.getBoundingClientRect();
  return {
    x: roundedMetric(rect.left - slide.left),
    y: roundedMetric(rect.top - slide.top),
    width: roundedMetric(rect.width),
    height: roundedMetric(rect.height),
  };
}

function textContentBounds(element, deck) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rect = range.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return relativeBounds(element, deck);
  const slide = deck.getBoundingClientRect();
  return {
    x: roundedMetric(rect.left - slide.left),
    y: roundedMetric(rect.top - slide.top),
    width: roundedMetric(rect.width),
    height: roundedMetric(rect.height),
  };
}

function listItemTextBounds(element, deck) {
  const rects = [];
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(
        ...[...range.getClientRects()].filter(
          (rect) => rect.width > 0 && rect.height > 0,
        ),
      );
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node !== element && node.matches("ul, ol")) return;
    node.childNodes.forEach(visit);
  };
  element.childNodes.forEach(visit);
  if (rects.length === 0) return relativeBounds(element, deck);
  const slide = deck.getBoundingClientRect();
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return {
    x: roundedMetric(left - slide.left),
    y: roundedMetric(top - slide.top),
    width: roundedMetric(right - left),
    height: roundedMetric(bottom - top),
  };
}

function textInsetsFor(element) {
  const style = getComputedStyle(element);
  const metric = (padding, border) => {
    const paddingValue = Number.parseFloat(style[padding]);
    const borderValue = Number.parseFloat(style[border]);
    return roundedMetric(
      Math.max(0, Number.isFinite(paddingValue) ? paddingValue : 0) +
        Math.max(0, Number.isFinite(borderValue) ? borderValue : 0),
    );
  };
  const insets = {
    left: metric("paddingLeft", "borderLeftWidth"),
    top: metric("paddingTop", "borderTopWidth"),
    right: metric("paddingRight", "borderRightWidth"),
    bottom: metric("paddingBottom", "borderBottomWidth"),
  };
  return Object.values(insets).some((value) => value > 0) ? insets : null;
}

function singleLineTextLayout(element, deck, bounds, textInsets, alignment) {
  const content = textContentBounds(element, deck);
  const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
  const widthBuffer = Math.max(2, (Number.isFinite(fontSize) ? fontSize : 0) * 0.5);
  const fittedInsets = textInsets ? { ...textInsets } : null;
  const requiredWidth = () =>
    content.width +
    (fittedInsets?.left || 0) +
    (fittedInsets?.right || 0) +
    widthBuffer;
  const resolvedAlignment =
    alignment || pptxAlignment(getComputedStyle(element).textAlign);
  // Keep the leading CSS inset, but release a trailing inset when browser and
  // PowerPoint font metrics would otherwise force a visually single line to wrap.
  if (fittedInsets && requiredWidth() > bounds.width) {
    if (resolvedAlignment === "right") fittedInsets.left = 0;
    if (resolvedAlignment === "left") fittedInsets.right = 0;
  }
  const extraWidth = Math.max(0, requiredWidth() - bounds.width);
  const offset =
    resolvedAlignment === "right"
      ? extraWidth
      : resolvedAlignment === "center"
        ? extraWidth / 2
        : 0;
  return {
    bounds: {
      ...bounds,
      x: roundedMetric(bounds.x - offset),
      width: roundedMetric(bounds.width + extraWidth),
    },
    textInsets: fittedInsets,
  };
}

function directImageSupported(image) {
  const source = image.currentSrc || image.getAttribute("src") || "";
  if (["cover", "none"].includes(getComputedStyle(image).objectFit)) return false;
  if (/^data:image\/(?:png|jpeg|gif|svg\+xml)[;,]/i.test(source)) return true;
  try {
    const url = new URL(source, window.location.href);
    return url.origin === window.location.origin && PPTX_DIRECT_IMAGE.test(url.href);
  } catch (_) {
    return false;
  }
}

function runStyle(element) {
  const style = getComputedStyle(element);
  const numericWeight = Number.parseInt(style.fontWeight, 10);
  return {
    fontFace: style.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, ""),
    fontSize: roundedMetric(parseFloat(style.fontSize)),
    bold: Number.isFinite(numericWeight) ? numericWeight >= 600 : style.fontWeight === "bold",
    italic: style.fontStyle !== "normal",
    underline: style.textDecorationLine.includes("underline"),
    color: normalizeCssColor(style.color),
  };
}

function collectTextRuns(root, { omitNestedLists = false } = {}) {
  const runs = [];
  const append = (text, element) => {
    if (!text) return;
    const anchor = element.closest("a[href]");
    const run = {
      text,
      ...runStyle(element),
      ...(anchor ? { href: anchor.getAttribute("href") || anchor.href } : {}),
    };
    const previous = runs.at(-1);
    const previousStyle = previous && { ...previous, text: undefined };
    const nextStyle = { ...run, text: undefined };
    if (previous && JSON.stringify(previousStyle) === JSON.stringify(nextStyle)) {
      previous.text += text;
    } else {
      runs.push(run);
    }
  };
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.nodeValue || "", node.parentElement || root);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "BR") {
      append("\n", node.parentElement || root);
      return;
    }
    if (
      node !== root &&
      (node.matches("pre, table, .architecture-diagram, .architecture-error, .mermaid") ||
        (omitNestedLists && node.matches("ul, ol")))
    ) {
      return;
    }
    node.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return runs;
}

function pptxAlignment(value) {
  if (value === "center" || value === "right" || value === "justify") return value;
  if (value === "end") return "right";
  return "left";
}

function paragraphFor(element, options = {}) {
  const style = getComputedStyle(element);
  const runs = collectTextRuns(element, options);
  return {
    alignment: pptxAlignment(style.textAlign),
    lineHeight: roundedMetric(parseFloat(style.lineHeight)),
    runs,
    ...(options.level !== undefined ? { level: options.level } : {}),
    ...(options.bullet ? { bullet: options.bullet } : {}),
  };
}

function listBulletFor(element) {
  const parentList = element.parentElement;
  const ordered = parentList?.tagName === "OL";
  const start = Number(parentList?.getAttribute("start") || 1);
  const itemIndex = parentList
    ? [...parentList.children].filter((child) => child.tagName === "LI").indexOf(element)
    : 0;
  const number = start + Math.max(0, itemIndex);
  return {
    type: ordered ? "number" : "bullet",
    character: ordered ? `${number}.` : "•",
    color: normalizeCssColor(getComputedStyle(element, "::marker").color),
    ...(ordered ? { start: number } : {}),
  };
}

function outermostListFor(element) {
  let list = element.parentElement;
  while (list?.matches("ul, ol")) {
    const parentItem = list.parentElement?.closest("li");
    const parentList = parentItem?.parentElement;
    if (!parentItem || !parentList?.matches("ul, ol")) return list;
    list = parentList;
  }
  return null;
}

function trimListItemRuns(runs) {
  const trimmed = runs.map((run) => ({ ...run }));
  while (trimmed.length > 0 && /^[ \t\r\n]*$/.test(trimmed[0].text)) {
    trimmed.shift();
  }
  while (trimmed.length > 0 && /^[ \t\r\n]*$/.test(trimmed.at(-1).text)) {
    trimmed.pop();
  }
  if (trimmed.length > 0) {
    trimmed[0].text = trimmed[0].text.replace(/^[ \t\r\n]+/, "");
    trimmed.at(-1).text = trimmed.at(-1).text.replace(/[ \t\r\n]+$/, "");
  }
  return trimmed.filter((run) => run.text);
}

function nativeListTextElement(list, deck, eligibleItems) {
  const items = [...list.querySelectorAll("li")].filter((item) =>
    eligibleItems.has(item),
  );
  if (items.length === 0) return null;
  const entries = items
    .map((item) => {
      const paragraph = paragraphFor(item, {
        omitNestedLists: true,
        level: Math.max(
          0,
          [...item.closest(".body").querySelectorAll("ul, ol")].filter((candidate) =>
            candidate.contains(item),
          ).length - 1,
        ),
        bullet: listBulletFor(item),
      });
      paragraph.runs = trimListItemRuns(paragraph.runs);
      return {
        item,
        paragraph,
        bounds: listItemTextBounds(item, deck),
        availableBounds: relativeBounds(item, deck),
      };
    })
    .filter(({ paragraph }) => paragraph.runs.length > 0);
  if (entries.length === 0) return null;
  const x = Math.min(...entries.map(({ bounds }) => bounds.x));
  const y = Math.min(...entries.map(({ bounds }) => bounds.y));
  const right = Math.max(
    ...entries.map(({ availableBounds }) => availableBounds.x + availableBounds.width),
  );
  const bottom = Math.max(
    ...entries.map(({ bounds }) => bounds.y + bounds.height),
  );
  const paragraphs = entries.map(({ item, paragraph, bounds }, index) => {
    const style = getComputedStyle(item);
    const lineSpacing = roundedMetric(Number.parseFloat(style.lineHeight));
    const nextBounds = entries[index + 1]?.bounds;
    const leftMargin = roundedMetric(Math.max(0, bounds.x - x));
    const spaceAfter = roundedMetric(
      Math.max(0, nextBounds ? nextBounds.y - (bounds.y + bounds.height) : 0),
    );
    return {
      ...paragraph,
      ...(lineSpacing > 0 ? { lineSpacing } : {}),
      ...(leftMargin > 0 ? { leftMargin } : {}),
      spaceBefore: 0,
      spaceAfter,
    };
  });
  for (const { item } of entries) item.setAttribute("data-pptx-native", "text");
  list.setAttribute("data-pptx-native", "text");
  return {
    type: "text",
    path: elementPath(list, deck),
    x,
    y,
    width: roundedMetric(right - x),
    height: roundedMetric(bottom - y),
    zOrder: Math.max(
      Number(list.dataset.pptxZOrder) || 0,
      ...items.map((item) => Number(item.dataset.pptxZOrder) || 0),
    ),
    paragraphs,
    opacity: Number(getComputedStyle(list).opacity) || 1,
  };
}

function codeParagraphsFor(element) {
  const style = getComputedStyle(element);
  const baseRun = { text: "", ...runStyle(element) };
  const lines = [[]];
  for (const run of collectTextRuns(element)) {
    const segments = run.text.replace(/\r\n?/g, "\n").split("\n");
    segments.forEach((text, index) => {
      if (text) lines.at(-1).push({ ...run, text });
      if (index < segments.length - 1) lines.push([]);
    });
  }
  // marked terminates fenced code with one newline. Remove that synthetic line
  // while retaining deliberate blank lines before the closing fence.
  if (lines.length > 1 && lines.at(-1).length === 0) lines.pop();
  const lineSpacing = roundedMetric(Number.parseFloat(style.lineHeight));
  return lines.map((runs) => ({
    alignment: "left",
    runs: runs.length ? runs : [{ ...baseRun }],
    ...(lineSpacing > 0 ? { lineSpacing } : {}),
    spaceBefore: 0,
    spaceAfter: 0,
  }));
}

function renderedTextLineCount(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const lines = [];
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const line = lines.find(
      (candidate) =>
        rect.top < candidate.bottom - 1 &&
        rect.bottom > candidate.top + 1,
    );
    if (line) {
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else {
      lines.push({ top: rect.top, bottom: rect.bottom });
    }
  }
  return Math.max(1, lines.length);
}

function unsupportedEffects(element) {
  const style = getComputedStyle(element);
  const effects = [];
  if (style.textShadow && style.textShadow !== "none") effects.push("text-shadow");
  if (style.boxShadow && style.boxShadow !== "none") effects.push("box-shadow");
  if (style.filter && style.filter !== "none") effects.push("filter");
  if (style.backdropFilter && style.backdropFilter !== "none") effects.push("backdrop-filter");
  if (style.mixBlendMode && style.mixBlendMode !== "normal") effects.push("mix-blend-mode");
  if (style.transform && style.transform !== "none") effects.push("transform");
  if (Number(style.opacity) < 1) effects.push("opacity");
  return effects;
}

function effectPaintPadding(element, effects) {
  if (
    !effects.some((effect) =>
      ["text-shadow", "box-shadow", "filter", "backdrop-filter"].includes(effect),
    )
  ) {
    return 0;
  }
  const style = getComputedStyle(element);
  const values = [
    effects.includes("text-shadow") ? style.textShadow : "",
    effects.includes("box-shadow") ? style.boxShadow : "",
    effects.includes("filter") ? style.filter : "",
    effects.includes("backdrop-filter") ? style.backdropFilter : "",
  ];
  const lengths = values.flatMap((value) =>
    [...String(value).matchAll(/-?\d+(?:\.\d+)?px/g)].map((match) =>
      Math.abs(Number.parseFloat(match[0])),
    ),
  );
  return Math.min(
    256,
    Math.max(32, Math.ceil(lengths.reduce((sum, value) => sum + value, 0) * 2)),
  );
}

function subtreeEffectPaintPadding(element) {
  return Math.max(
    0,
    ...[element, ...element.querySelectorAll("*")].map((candidate) => {
      const effects = unsupportedEffects(candidate);
      return effectPaintPadding(candidate, effects);
    }),
  );
}

function assignPptxPaintOrder(deck) {
  const elements = [...deck.querySelectorAll("*")];
  const entries = elements.map((element, domOrder) => {
    const stacking = [];
    const ancestors = [];
    for (let current = element; current && current !== deck; current = current.parentElement) {
      ancestors.push(current);
    }
    for (const current of ancestors.reverse()) {
      const zIndex = getComputedStyle(current).zIndex;
      if (zIndex !== "auto" && Number.isFinite(Number(zIndex))) {
        stacking.push(Number(zIndex));
      }
    }
    return { element, domOrder, stacking };
  });
  entries.sort((left, right) => {
    const length = Math.max(left.stacking.length, right.stacking.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (left.stacking[index] || 0) - (right.stacking[index] || 0);
      if (difference) return difference;
    }
    return left.domOrder - right.domOrder;
  });
  entries.forEach(({ element }, zOrder) => {
    element.dataset.pptxZOrder = String(zOrder);
  });
}

function effectFallbackRoot(element) {
  return element.closest(
    "p, li, blockquote, table, img, h1, h2, h3, h4, h5, h6, div, section, article, aside, details, video, audio, iframe, canvas, object, embed, .kicker, .slide-title, .theme-backcover-logo-text, .theme-backcover-copyright, .body, header, footer",
  );
}

function fallbackBounds(element, deck, padding = 0, includeDescendants = false) {
  const candidates = (
    includeDescendants ? [element, ...element.querySelectorAll("*")] : [element]
  ).filter((candidate) => {
    const style = getComputedStyle(candidate);
    return style.display !== "none";
  });
  const slide = deck.getBoundingClientRect();
  const relativeRect = (rect) => ({
    x: rect.left - slide.left,
    y: rect.top - slide.top,
    width: rect.width,
    height: rect.height,
  });
  const bounds = candidates.map((candidate) =>
    relativeRect(candidate.getBoundingClientRect()),
  );
  for (const candidate of candidates) {
    for (const node of candidate.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      bounds.push(
        ...[...range.getClientRects()]
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map(relativeRect),
      );
    }
  }
  const left = Math.min(
    OUTPUT_WIDTH,
    Math.max(0, Math.min(...bounds.map((candidate) => candidate.x)) - padding),
  );
  const top = Math.min(
    OUTPUT_HEIGHT,
    Math.max(0, Math.min(...bounds.map((candidate) => candidate.y)) - padding),
  );
  const right = Math.min(
    OUTPUT_WIDTH,
    Math.max(
      0,
      Math.max(...bounds.map((candidate) => candidate.x + candidate.width)) + padding,
    ),
  );
  const bottom = Math.min(
    OUTPUT_HEIGHT,
    Math.max(
      0,
      Math.max(...bounds.map((candidate) => candidate.y + candidate.height)) + padding,
    ),
  );
  return {
    x: roundedMetric(left),
    y: roundedMetric(top),
    width: roundedMetric(Math.max(0, right - left)),
    height: roundedMetric(Math.max(0, bottom - top)),
  };
}

function pptxFallback(type, element, deck, reason, options = {}) {
  const bounds = fallbackBounds(
    element,
    deck,
    options.padding,
    options.includeDescendants,
  );
  const artwork = options.artwork !== false && bounds.width > 0 && bounds.height > 0;
  const captureElement = options.captureElement || element;
  let captureId;
  if (artwork) {
    captureId = `pptx-fallback-${++pptxFallbackSequence}`;
    const ids = new Set(
      (captureElement.getAttribute("data-pptx-fallback-ids") || "")
        .split(/\s+/)
        .filter(Boolean),
    );
    ids.add(captureId);
    captureElement.setAttribute("data-pptx-fallback-ids", [...ids].join(" "));
    pptxFallbackCaptureElements.set(captureId, captureElement);
  }
  const sourceOrder = Number(element.dataset.pptxZOrder);
  const zOrder = Number.isFinite(sourceOrder)
    ? sourceOrder - (options.behindNative ? 0.25 : 0)
    : undefined;
  return {
    type,
    path: elementPath(element, deck),
    reason,
    ...bounds,
    ...(captureId ? { captureId } : {}),
    ...(zOrder !== undefined ? { zOrder } : {}),
    ...(!artwork ? { artwork: false } : {}),
  };
}

function styleHasVisualDecoration(style) {
  const backgroundVisible =
    style.backgroundImage !== "none" ||
    !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor);
  const borderVisible = ["Top", "Right", "Bottom", "Left"].some(
    (side) =>
      Number.parseFloat(style[`border${side}Width`]) > 0 &&
      style[`border${side}Style`] !== "none" &&
      !["transparent", "rgba(0, 0, 0, 0)"].includes(style[`border${side}Color`]),
  );
  return backgroundVisible || borderVisible;
}

function hasVisualDecoration(element) {
  return styleHasVisualDecoration(getComputedStyle(element));
}

function hasVisiblePseudoElement(element) {
  return ["::before", "::after"].some((pseudo) => {
    const style = getComputedStyle(element, pseudo);
    const contentVisible = !["none", "normal", '""', "''"].includes(style.content);
    const paintedEmptyContent =
      styleHasVisualDecoration(style) &&
      Number.parseFloat(style.width) > 0 &&
      Number.parseFloat(style.height) > 0;
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      (contentVisible || paintedEmptyContent)
    );
  });
}

function collectPptxLayoutElements(deck) {
  const elements = [];
  for (const image of deck.querySelectorAll(":scope > .theme-cover-logo")) {
    const style = getComputedStyle(image);
    if (
      !directImageSupported(image) ||
      unsupportedEffects(image).length > 0 ||
      Number.parseFloat(style.borderRadius) > 0
    ) {
      continue;
    }
    const opacity = Number(style.opacity);
    elements.push({
      type: "image",
      path: elementPath(image, deck),
      ...relativeBounds(image, deck),
      src: image.currentSrc || image.src,
      alt: image.alt || "",
      fit: style.objectFit || "contain",
      opacity: Number.isFinite(opacity) ? opacity : 1,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
    image.setAttribute("data-pptx-native", "image");
  }
  return elements;
}

function preserveBoxShadow(element, deck) {
  const style = getComputedStyle(element);
  if (!style.boxShadow || style.boxShadow === "none") return null;
  element.setAttribute("data-pptx-shadow-fallback", "true");
  const bounds = relativeBounds(element, deck);
  const decoration = document.createElement("div");
  decoration.className = "pptx-effect-fallback";
  Object.assign(decoration.style, {
    position: "absolute",
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    pointerEvents: "none",
  });
  decoration.setAttribute("aria-hidden", "true");
  deck.appendChild(decoration);
  return decoration;
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), {
      once: true,
    });
    reader.addEventListener(
      "error",
      () => reject(reader.error || new Error("Could not encode Architecture artwork.")),
      { once: true },
    );
    reader.readAsDataURL(blob);
  });
}

function freezeSvgPaint(source, clone) {
  const sourceNodes = [source, ...source.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  sourceNodes.forEach((node, index) => {
    const target = cloneNodes[index];
    if (!target) return;
    const style = getComputedStyle(node);
    for (const property of ["fill", "stroke", "color"]) {
      if (style[property]) target.setAttribute(property, style[property]);
    }
  });
}

async function inlineSvgImageSources(root) {
  for (const image of root.querySelectorAll("image")) {
    const href = image.getAttribute("href") || image.getAttribute("xlink:href");
    if (!href || href.startsWith("data:")) continue;
    const response = await fetch(new URL(href, window.location.href), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load Architecture image artwork (${response.status}).`);
    }
    const dataUrl = await blobDataUrl(await response.blob());
    image.setAttribute("href", dataUrl);
    image.removeAttribute("xlink:href");
  }
}

async function architectureForegroundPng(svg, sources, width, height, crop) {
  if (!sources.length) return "";
  const clone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg.viewBox?.baseVal;
  clone.setAttribute("viewBox", svg.getAttribute("viewBox") || "0 0 1 1");
  clone.setAttribute("width", String(viewBox?.width || 1));
  clone.setAttribute("height", String(viewBox?.height || 1));
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const defs = svg.querySelector(":scope > defs");
  if (defs) clone.appendChild(defs.cloneNode(true));
  for (const source of sources) {
    const copy = source.cloneNode(true);
    freezeSvgPaint(source, copy);
    const ownOpacityValue = Number(getComputedStyle(source).opacity);
    const ownOpacity = Number.isFinite(ownOpacityValue) ? ownOpacityValue : 1;
    const node = source.closest('[data-architecture-type="node"]');
    const parentOpacityAttribute =
      node && node !== source ? node.getAttribute("opacity") : null;
    const parentOpacityValue =
      parentOpacityAttribute === null ? 1 : Number(parentOpacityAttribute);
    const parentOpacity = Number.isFinite(parentOpacityValue) ? parentOpacityValue : 1;
    copy.setAttribute("opacity", String(ownOpacity * parentOpacity));
    clone.appendChild(copy);
  }
  await inlineSvgImageSources(clone);
  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create Architecture artwork canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (!crop) return canvas.toDataURL("image/png");
    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.ceil(crop.width));
    cropped.height = Math.max(1, Math.ceil(crop.height));
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) throw new Error("Could not crop Architecture artwork.");
    croppedContext.drawImage(
      canvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      cropped.width,
      cropped.height,
    );
    return cropped.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function collectArchitectureObjects(wrapper, deck, blockIndex) {
  const snapshot = wrapper.__presentationPptxSnapshot;
  const svg = wrapper.querySelector("svg.architecture-svg");
  if (!snapshot || !svg) {
    return {
      elements: [],
      fallbacks: [pptxFallback("architecture", wrapper, deck, "architecture-model-unavailable")],
    };
  }
  const svgRect = svg.getBoundingClientRect();
  const deckRect = deck.getBoundingClientRect();
  const scale = Math.min(
    svgRect.width / snapshot.canvas.width,
    svgRect.height / snapshot.canvas.height,
  );
  const usedWidth = snapshot.canvas.width * scale;
  const usedHeight = snapshot.canvas.height * scale;
  const originX = svgRect.left - deckRect.left + (svgRect.width - usedWidth) / 2;
  const originY = svgRect.top - deckRect.top + (svgRect.height - usedHeight) / 2;
  const mapBounds = (object) => ({
    x: roundedMetric(originX + object.x * scale),
    y: roundedMetric(originY + object.y * scale),
    width: roundedMetric(object.width * scale),
    height: roundedMetric(object.height * scale),
  });
  const mapColorFields = (object) => {
    const mapped = { ...object };
    const mapParagraphs = (paragraphs) =>
      paragraphs.map((paragraph) => ({
        ...paragraph,
        runs: paragraph.runs.map((run) => ({
          ...run,
          color: resolveModelColor(run.color, deck),
          fontFace: getComputedStyle(svg).fontFamily
            .split(",")[0]
            .trim()
            .replace(/^["']|["']$/g, ""),
          fontSize: roundedMetric(run.fontSize * scale),
          bold: Number(run.fontWeight) >= 600,
        })),
      }));
    if (mapped.dash !== undefined) mapped.dash = powerPointDashStyle(mapped.dash);
    for (const key of ["fill", "stroke", "color"]) {
      if (key in mapped) mapped[key] = resolveModelColor(mapped[key], deck);
    }
    if (Array.isArray(mapped.paragraphs)) {
      mapped.paragraphs = mapParagraphs(mapped.paragraphs);
    }
    if (mapped.text?.paragraphs) {
      mapped.text = {
        ...mapped.text,
        paragraphs: mapParagraphs(mapped.text.paragraphs),
      };
    }
    if (mapped.textInsets) {
      mapped.textInsets = Object.fromEntries(
        Object.entries(mapped.textInsets).map(([key, value]) => [
          key,
          roundedMetric(value * scale),
        ]),
      );
    }
    return mapped;
  };
  const fallbacks = snapshot.fallbacks.map((fallback) => ({
    ...fallback,
    path: `architecture[${blockIndex}].${fallback.path}`,
    ...mapBounds(fallback),
  }));
  const elements = [];
  const architectureGroups = [...wrapper.querySelectorAll("[data-architecture-type]")];
  const findById = (id) =>
    architectureGroups.find((element) => element.getAttribute("data-architecture-id") === id);
  const foregroundCandidates = [];
  for (const icon of snapshot.icons || []) {
    const group = findById(icon.id);
    const source = group?.querySelector("[data-architecture-icon]");
    if (source) {
      const rawBounds = mapBounds(icon);
      const padding = Math.max(
        0,
        Math.min(2, rawBounds.x - originX, rawBounds.y - originY),
      );
      const bounds = {
        x: rawBounds.x - padding,
        y: rawBounds.y - padding,
        width: rawBounds.width + padding * 2,
        height: rawBounds.height + padding * 2,
      };
      foregroundCandidates.push({
        key: `icon:${icon.id}`,
        source,
        alt: `${icon.icon} icon`,
        bounds,
        crop: {
          x: bounds.x - originX,
          y: bounds.y - originY,
          width: bounds.width,
          height: bounds.height,
        },
        architecture: {
          kind: "icon-picture",
          id: icon.id,
          sourcePath: icon.sourcePath,
          order: icon.order,
          z: icon.z,
        },
      });
    }
  }
  for (const object of snapshot.objects.filter((entry) => entry.type === "image")) {
    const source = findById(object.architecture.id);
    if (source) {
      const rawBounds = mapBounds(object);
      const padding = Math.max(
        0,
        Math.min(2, rawBounds.x - originX, rawBounds.y - originY),
      );
      const bounds = {
        x: rawBounds.x - padding,
        y: rawBounds.y - padding,
        width: rawBounds.width + padding * 2,
        height: rawBounds.height + padding * 2,
      };
      foregroundCandidates.push({
        key: `image:${object.architecture.id}`,
        source,
        alt: `${object.architecture.id} image`,
        bounds,
        crop: {
          x: bounds.x - originX,
          y: bounds.y - originY,
          width: bounds.width,
          height: bounds.height,
        },
        architecture: {
          ...object.architecture,
          kind: "image-picture",
        },
      });
    }
  }
  const foregroundLayers = new Map();
  const expectedForegrounds =
    (snapshot.icons?.length || 0) +
    snapshot.objects.filter((object) => object.type === "image").length;
  let foregroundReady = foregroundCandidates.length === expectedForegrounds;
  try {
    if (foregroundReady) {
      const generated = await Promise.all(
        foregroundCandidates.map(async (candidate) => ({
          ...candidate,
          src: await architectureForegroundPng(
            svg,
            [candidate.source],
            usedWidth,
            usedHeight,
            candidate.crop,
          ),
        })),
      );
      generated.forEach((layer) => foregroundLayers.set(layer.key, layer));
    } else {
      throw new Error("Architecture foreground source was not found.");
    }
  } catch (error) {
    foregroundReady = false;
    foregroundLayers.clear();
    fallbacks.push(
      pptxFallback(
        "architecture-foreground",
        wrapper,
        deck,
        `foreground-picture-failed: ${error?.message || "unknown error"}`,
        { artwork: false },
      ),
    );
  }
  const foregroundElement = (layer) => ({
    type: "image",
    src: layer.src,
    alt: layer.alt,
    fit: "fill",
    opacity: 1,
    ...layer.bounds,
    architecture: layer.architecture,
  });
  if (!foregroundReady) {
    fallbacks.push(
      pptxFallback(
        "architecture",
        wrapper,
        deck,
        "architecture-rendered-as-artwork-after-foreground-failure",
      ),
    );
    return { elements: [], fallbacks };
  }

  for (const sourceObject of snapshot.objects) {
    const object = mapColorFields({
      ...sourceObject,
      ...mapBounds(sourceObject),
      ...(sourceObject.points
        ? {
            points: sourceObject.points.map((point) => ({
              x: roundedMetric(originX + point.x * scale),
              y: roundedMetric(originY + point.y * scale),
            })),
          }
        : {}),
      ...(sourceObject.strokeWidth !== undefined
        ? { strokeWidth: roundedMetric(sourceObject.strokeWidth * scale) }
        : {}),
      ...(sourceObject.cornerRadius !== undefined
        ? { cornerRadius: roundedMetric(sourceObject.cornerRadius * scale) }
        : {}),
    });
    if (object.type === "shape") {
      const opacity = Number.isFinite(object.opacity) ? object.opacity : 1;
      if (object.text?.paragraphs) {
        object.text = {
          ...object.text,
          paragraphs: object.text.paragraphs.map((paragraph) => ({
            ...paragraph,
            runs: paragraph.runs.map((run) => ({
              ...run,
              opacity: (Number.isFinite(run.opacity) ? run.opacity : 1) * opacity,
            })),
          })),
        };
      }
    }
    if (object.type === "image") {
      const layer = foregroundLayers.get(`image:${object.architecture.id}`);
      fallbacks.push({
        type: "architecture-image",
        path: `architecture[${blockIndex}].${object.architecture.sourcePath}`,
        reason: foregroundReady && layer
          ? "architecture-image-rendered-as-foreground-picture"
          : "architecture-image-rendered-as-artwork",
        ...mapBounds(sourceObject),
        ...(foregroundReady && layer ? { artwork: false } : {}),
      });
      if (foregroundReady && layer) elements.push(foregroundElement(layer));
      continue;
    }
    elements.push(object);
    if (object.type === "shape" && object.architecture?.kind === "node" && sourceObject.icon) {
      const layer = foregroundLayers.get(`icon:${object.architecture.id}`);
      if (foregroundReady && layer) elements.push(foregroundElement(layer));
    }
  }
  for (const icon of snapshot.icons || []) {
    const layer = foregroundLayers.get(`icon:${icon.id}`);
    fallbacks.push({
      type: "architecture-icon",
      path: `architecture[${blockIndex}].${icon.sourcePath}`,
      reason: foregroundReady && layer
        ? "icon-rendered-as-foreground-picture"
        : "icon-rendered-as-artwork",
      icon: icon.icon,
      ...mapBounds(icon),
      ...(foregroundReady && layer ? { artwork: false } : {}),
    });
  }
  for (const sourceObject of snapshot.objects) {
    const architecture = sourceObject.architecture;
    if (!architecture) continue;
    if (architecture.kind === "group" || architecture.kind === "node") {
      const group = findById(architecture.id);
      if (!group) continue;
      [...group.children]
        .filter((child) =>
          foregroundReady
            ? child.matches("rect, ellipse, text")
            : child.matches("text"),
        )
        .forEach((child) => child.setAttribute("data-pptx-native", sourceObject.type));
    } else if (architecture.kind === "connector") {
      architectureGroups
        .filter(
          (element) =>
            element.getAttribute("data-architecture-type") === "connector" &&
            element.getAttribute("data-architecture-order") === String(architecture.order),
        )
        .forEach((group) =>
          [...group.children]
            .filter((child) => child.matches("path"))
            .forEach((child) => child.setAttribute("data-pptx-native", "connector")),
        );
    } else if (architecture.kind.startsWith("connector-label")) {
      wrapper
        .querySelectorAll(
          `[data-architecture-connector-label][data-architecture-label-layer]`,
        )
        .forEach((label) => label.setAttribute("data-pptx-native", sourceObject.type));
    }
  }
  if (foregroundReady) {
    foregroundCandidates.forEach((candidate) => {
      if (foregroundLayers.has(candidate.key)) {
        candidate.source.setAttribute("data-pptx-native", "image");
      }
    });
  }
  if (snapshot.routing.degraded) {
    fallbacks.push(
      pptxFallback(
        "architecture-routing",
        wrapper,
        deck,
        "routing-warning-rendered-as-artwork",
      ),
    );
  }
  return { elements, fallbacks };
}

async function collectPptxSlide(slide, index) {
  const { deck } = slide;
  assignPptxPaintOrder(deck);
  const elements = [];
  const fallbacks = [];
  const fallbackRoots = new Set();
  const fallbackByRoot = new Map();
  const removeFallback = (root) => {
    const fallback = fallbackByRoot.get(root);
    if (!fallback) return;
    fallbackByRoot.delete(root);
    fallbackRoots.delete(root);
    const index = fallbacks.indexOf(fallback);
    if (index >= 0) fallbacks.splice(index, 1);
    if (!fallback.captureId) return;
    const captureElement = pptxFallbackCaptureElements.get(fallback.captureId);
    pptxFallbackCaptureElements.delete(fallback.captureId);
    if (!captureElement) return;
    const ids = (captureElement.getAttribute("data-pptx-fallback-ids") || "")
      .split(/\s+/)
      .filter((id) => id && id !== fallback.captureId);
    if (ids.length) captureElement.setAttribute("data-pptx-fallback-ids", ids.join(" "));
    else captureElement.removeAttribute("data-pptx-fallback-ids");
  };
  const addFallback = (type, element, reason, options) => {
    if (fallbackRoots.has(element)) return;
    if ([...fallbackRoots].some((root) => root.contains(element))) return;
    [...fallbackRoots]
      .filter((root) => element.contains(root))
      .forEach(removeFallback);
    fallbackRoots.add(element);
    const fallback = pptxFallback(type, element, deck, reason, options);
    fallbackByRoot.set(element, fallback);
    fallbacks.push(fallback);
  };

  const effectFallbacks = new Map();
  const genericShadowElements = new Map();
  for (const element of deck.querySelectorAll("header *, .body, .body *, footer *")) {
    if (element.closest("pre, .architecture-diagram, .architecture-error")) continue;
    const allEffects = unsupportedEffects(element);
    if (
      allEffects.includes("box-shadow") &&
      !element.closest("table, img")
    ) {
      genericShadowElements.set(
        element,
        effectPaintPadding(element, ["box-shadow"]),
      );
    }
    const effects = allEffects.filter((effect) => effect !== "box-shadow");
    if (!effects.length) continue;
    const root = effectFallbackRoot(element);
    if (root) {
      const pending = effectFallbacks.get(root) || { effects: new Set(), padding: 0 };
      effects.forEach((effect) => pending.effects.add(effect));
      pending.padding = Math.max(pending.padding, effectPaintPadding(element, allEffects));
      effectFallbacks.set(root, pending);
    }
  }
  for (const [root, pending] of effectFallbacks) {
    addFallback(
      "effect",
      root,
      `element-rendered-as-artwork: ${[...pending.effects].join(", ")}`,
      { padding: pending.padding, includeDescendants: true },
    );
  }

  deck.querySelectorAll("pre:not(.mermaid)").forEach((element) => {
    const effects = unsupportedEffects(element);
    const artworkEffects = effects.filter(
      (effect) => effect !== "box-shadow",
    );
    if (artworkEffects.length) {
      addFallback(
        "code",
        element,
        `code-block-rendered-as-artwork: ${artworkEffects.join(", ")}`,
        {
          padding: effectPaintPadding(element, effects),
          includeDescendants: true,
        },
      );
    }
  });
  deck.querySelectorAll(".architecture-error").forEach((element) =>
    addFallback("architecture", element, "architecture-error-rendered-as-artwork"),
  );
  deck
    .querySelectorAll(
      ".body div:not(.architecture-diagram):not(.architecture-error):not(.architecture-routing-warning), .body section, .body article, .body aside, .body details, .body video, .body audio, .body iframe, .body canvas, .body object, .body embed",
    )
    .forEach((element) => {
      const covered = [...fallbackRoots].some(
        (root) => root === element || root.contains(element),
      );
      if (!element.closest("pre, .architecture-diagram") && !covered) {
        addFallback("html", element, "arbitrary-html-rendered-as-artwork", {
          includeDescendants: true,
          padding: subtreeEffectPaintPadding(element),
        });
      }
    });
  deck.querySelectorAll("pre.mermaid").forEach((element) => {
    const covered = [...fallbackRoots].some((root) => root === element || root.contains(element));
    if (!covered) addFallback("mermaid", element, "mermaid-rendered-as-artwork");
  });

  const insideFallback = (element) =>
    [...fallbackRoots].some((root) => root === element || root.contains(element));
  const textCandidates = [
    ...deck.querySelectorAll(
      ".kicker, .slide-title, .body h1, .body h2, .body h3, .body h4, .body h5, .body h6, .body p, .body blockquote, .body li, footer > span, .theme-backcover-logo-text, .theme-backcover-copyright",
    ),
  ].filter(
    (element) =>
      !insideFallback(element) &&
      !element.closest(".architecture-diagram") &&
      !element.closest("table") &&
      !(element.matches("p") && element.closest("blockquote, li")),
  );
  const listItems = textCandidates.filter((element) => element.matches("li"));
  const eligibleListItems = new Set(listItems);
  const listRoots = [
    ...new Set(listItems.map(outermostListFor).filter(Boolean)),
  ];
  for (const list of listRoots) {
    const textElement = nativeListTextElement(list, deck, eligibleListItems);
    if (textElement) elements.push(textElement);
  }
  for (const element of textCandidates.filter((candidate) => !candidate.matches("li"))) {
    const paragraph = paragraphFor(element, {
      omitNestedLists: false,
    });
    if (!paragraph.runs.some((run) => run.text.trim())) continue;
    const disableTextWrap = renderedTextLineCount(element) === 1;
    const textInsets = textInsetsFor(element);
    const baseBounds = element.classList.contains("kicker")
      ? textContentBounds(element, deck)
      : relativeBounds(element, deck);
    const singleLineLayout = disableTextWrap
      ? singleLineTextLayout(
          element,
          deck,
          baseBounds,
          textInsets,
          element.classList.contains("kicker") ? "left" : undefined,
        )
      : null;
    const bounds = singleLineLayout?.bounds || baseBounds;
    const fittedTextInsets = singleLineLayout?.textInsets || textInsets;
    elements.push({
      type: "text",
      path: elementPath(element, deck),
      ...bounds,
      zOrder: Number(element.dataset.pptxZOrder),
      paragraphs: [paragraph],
      opacity: Number(getComputedStyle(element).opacity) || 1,
      ...(fittedTextInsets ? { textInsets: fittedTextInsets } : {}),
      ...(disableTextWrap ? { textWrap: "none" } : {}),
    });
    element.setAttribute("data-pptx-native", "text");
  }
  for (const element of textCandidates) {
    const pseudoElementVisible = hasVisiblePseudoElement(element);
    if (
      element.closest("footer") ||
      element.classList.contains("kicker") ||
      (!hasVisualDecoration(element) && !pseudoElementVisible)
    ) {
      continue;
    }
    fallbacks.push(
      pptxFallback(
        "decoration",
        element,
        deck,
        "native-text-decoration-rendered-as-artwork",
        { behindNative: true, padding: pseudoElementVisible ? 32 : 0 },
      ),
    );
  }
  deck.querySelectorAll(".kicker").forEach((element) => {
    if (insideFallback(element)) return;
    fallbacks.push(
      pptxFallback("decoration", element, deck, "kicker-mark-rendered-as-artwork", {
        behindNative: true,
      }),
    );
  });
  deck.querySelectorAll("footer").forEach((element) => {
    if (insideFallback(element)) return;
    fallbacks.push(
      pptxFallback("decoration", element, deck, "footer-decoration-rendered-as-artwork", {
        behindNative: true,
      }),
    );
  });
  deck.querySelectorAll(".body hr").forEach((element) => {
    if (insideFallback(element)) return;
    fallbacks.push(
      pptxFallback("decoration", element, deck, "horizontal-rule-rendered-as-artwork"),
    );
  });
  for (const [element, padding] of genericShadowElements) {
    if (insideFallback(element)) continue;
    const decoration = preserveBoxShadow(element, deck);
    fallbacks.push(
      pptxFallback("effect", element, deck, "native-element-approximates: box-shadow", {
        padding,
        behindNative: true,
        captureElement: decoration || element,
      }),
    );
  }

  for (const pre of deck.querySelectorAll("pre:not(.mermaid)")) {
    if (insideFallback(pre)) continue;
    const code = pre.querySelector("code") || pre;
    const style = getComputedStyle(pre);
    const bounds = relativeBounds(pre, deck);
    const borderRadius = roundedMetric(Number.parseFloat(style.borderRadius));
    const borderWidth = roundedMetric(Number.parseFloat(style.borderTopWidth));
    const textInsets = textInsetsFor(pre);
    elements.push({
      type: "shape",
      path: elementPath(pre, deck),
      shape: borderRadius > 0 ? "roundedRect" : "rect",
      ...bounds,
      zOrder: Number(pre.dataset.pptxZOrder),
      fill: normalizeCssColor(style.backgroundColor),
      stroke: normalizeCssColor(style.borderTopColor),
      strokeWidth: borderWidth || 1,
      opacity: Number(style.opacity) || 1,
      paragraphs: codeParagraphsFor(code),
      verticalAlignment: "top",
      ...(textInsets ? { textInsets } : {}),
      textWrap: "none",
    });
    const accentWidth = roundedMetric(Number.parseFloat(style.borderLeftWidth));
    const accentColor = normalizeCssColor(style.borderLeftColor);
    if (accentWidth > borderWidth && accentColor) {
      const accentInset = Math.min(borderRadius, Math.max(0, (bounds.height - accentWidth) / 2));
      elements.push({
        type: "shape",
        path: `${elementPath(pre, deck)}.accent`,
        shape: borderRadius > 0 ? "roundedRect" : "rect",
        x: bounds.x,
        y: bounds.y + accentInset,
        width: accentWidth,
        height: bounds.height - accentInset * 2,
        fill: accentColor,
        stroke: null,
        zOrder: Number(pre.dataset.pptxZOrder) + 0.01,
      });
    }
    if (style.boxShadow && style.boxShadow !== "none") {
      const decoration = preserveBoxShadow(pre, deck);
      fallbacks.push(
        pptxFallback(
          "effect",
          pre,
          deck,
          "native-code-approximates: box-shadow",
          {
            padding: effectPaintPadding(pre, ["box-shadow"]),
            behindNative: true,
            captureElement: decoration || pre,
          },
        ),
      );
    }
    pre.setAttribute("data-pptx-native", "code");
  }

  for (const table of deck.querySelectorAll(".body table")) {
    if (insideFallback(table)) continue;
    const descendantEffects = new Set();
    for (const descendant of table.querySelectorAll("*")) {
      for (const effect of unsupportedEffects(descendant)) descendantEffects.add(effect);
    }
    if (descendantEffects.size) {
      addFallback(
        "effect",
        table,
        `element-rendered-as-artwork: ${[...descendantEffects].join(", ")}`,
      );
      continue;
    }
    const effects = unsupportedEffects(table);
    if (parseFloat(getComputedStyle(table).borderRadius) > 0) effects.push("border-radius");
    const artworkEffects = effects.filter(
      (effect) => effect !== "box-shadow" && effect !== "border-radius",
    );
    if (artworkEffects.length) {
      addFallback(
        "effect",
        table,
        `element-rendered-as-artwork: ${effects.join(", ")}`,
      );
      continue;
    }
    const domRows = [...table.rows];
    const columnCount = domRows[0]?.cells.length || 0;
    if (
      !columnCount ||
      domRows.some(
        (row) =>
          row.cells.length !== columnCount ||
          [...row.cells].some((cell) => cell.colSpan !== 1 || cell.rowSpan !== 1),
      )
    ) {
      addFallback("table", table, "merged-table-rendered-as-artwork");
      continue;
    }
    const rows = domRows.map((row) => ({
      height: roundedMetric(row.getBoundingClientRect().height),
      cells: [...row.cells].map((cell) => {
        const style = getComputedStyle(cell);
        return {
          ...relativeBounds(cell, deck),
          header: cell.tagName === "TH",
          colspan: cell.colSpan,
          rowspan: cell.rowSpan,
          fill: normalizeCssColor(style.backgroundColor),
          color: normalizeCssColor(style.color),
          stroke: normalizeCssColor(style.borderColor),
          strokeWidth: roundedMetric(parseFloat(style.borderWidth)) || 1,
          alignment: pptxAlignment(style.textAlign),
          paragraphs: [paragraphFor(cell)],
        };
      }),
    }));
    elements.push({
      type: "table",
      path: elementPath(table, deck),
      ...relativeBounds(table, deck),
      zOrder: Number(table.dataset.pptxZOrder),
      rows,
    });
    if (effects.length) {
      const decoration = effects.includes("box-shadow") ? preserveBoxShadow(table, deck) : null;
      fallbacks.push(
        pptxFallback(
          "effect",
          table,
          deck,
          `native-table-approximates: ${effects.join(", ")}`,
          {
            padding: effectPaintPadding(table, effects),
            behindNative: true,
            captureElement: decoration || table,
          },
        ),
      );
    }
    table.setAttribute("data-pptx-native", "table");
  }

  for (const image of deck.querySelectorAll("img")) {
    if (
      image.closest(".architecture-diagram") ||
      image.classList.contains("theme-cover-background") ||
      image.classList.contains("theme-cover-logo") ||
      insideFallback(image)
    ) {
      continue;
    }
    if (!directImageSupported(image)) {
      const fit = getComputedStyle(image).objectFit;
      const effects = unsupportedEffects(image);
      addFallback(
        "image",
        image,
        ["cover", "none"].includes(fit) ? "unsupported-image-fit" : "unsupported-image-format",
        {
          padding: effectPaintPadding(image, effects),
          includeDescendants: true,
        },
      );
      continue;
    }
    const style = getComputedStyle(image);
    const effects = unsupportedEffects(image);
    const borderRadius = parseFloat(style.borderRadius);
    const artworkEffects = effects.filter((effect) => effect !== "box-shadow");
    if (artworkEffects.length) {
      addFallback(
        "effect",
        image,
        `element-rendered-as-artwork: ${effects.join(", ")}`,
      );
      continue;
    }
    elements.push({
      type: "image",
      path: elementPath(image, deck),
      ...relativeBounds(image, deck),
      zOrder: Number(image.dataset.pptxZOrder),
      src: image.currentSrc || image.src,
      alt: image.alt || "",
      fit: style.objectFit || "contain",
      opacity: Number(style.opacity) || 1,
      shape: borderRadius > 0 ? "roundedRect" : "rect",
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
    image.setAttribute("data-pptx-native", "image");
    if (effects.length) {
      fallbacks.push(
        pptxFallback(
          "effect",
          image,
          deck,
          `native-image-approximates: ${effects.join(", ")}`,
          {
            padding: effectPaintPadding(image, effects),
            behindNative: true,
          },
        ),
      );
    }
  }

  const architectureWrappers = [...deck.querySelectorAll(".architecture-diagram")];
  for (const [blockIndex, wrapper] of architectureWrappers.entries()) {
    if (insideFallback(wrapper)) continue;
    const architecture = await collectArchitectureObjects(wrapper, deck, blockIndex);
    const zOrder = Number(wrapper.dataset.pptxZOrder);
    elements.push(
      ...architecture.elements.map((element, elementIndex) => ({
        ...element,
        zOrder: zOrder + elementIndex / 1000,
      })),
    );
    fallbacks.push(...architecture.fallbacks);
  }

  const layout = slide.titleSlide
    ? "title"
    : slide.sectionSlide
      ? "section"
      : slide.centerSlide
        ? "center"
        : slide.backcoverSlide
          ? "backcover"
          : "default";
  const visibleTitle = deck.querySelector("h1, h2")?.textContent?.trim();
  const notes = speakerNotesToPlainText(slide.speakerNotes, window.marked, document);
  return {
    index,
    layout,
    layoutId: `${slide.theme}:${layout}`,
    theme: slide.theme,
    title: visibleTitle || slide.title,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    ...(notes ? { notes } : {}),
    elements,
    fallbacks,
  };
}

function createPptxLayoutTemplate(theme, layout) {
  const markdown = `---
layout: ${layout}
theme: ${theme}
---
`;
  const slide = createSlide(markdown, theme, true);
  if (layout === "backcover") {
    slide.deck
      .querySelectorAll(".theme-backcover-logo, .theme-backcover-copyright")
      .forEach((element) => element.remove());
  }
  slide.deck.classList.add("pptx-layout-template");
  slide.deck.dataset.pptxLayoutId = `${theme}:${layout}`;
  return slide;
}

async function renderPptxDeck(
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
  document.body.classList.add("pptx-mode", "fixed-output-mode", "mermaid-loading");
  pptxFallbackSequence = 0;
  pptxFallbackCaptureElements.clear();
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
  const token = ++renderToken;
  for (const slide of rendered) {
    await runMermaid(slide.bodyEl, slide.theme, token, false);
  }
  await waitForImages(stage);
  await afterLayout();

  const pptxSlides = [];
  for (const [index, slide] of rendered.entries()) {
    pptxSlides.push(await collectPptxSlide(slide, index));
  }
  const themes = [...new Set(rendered.map((slide) => slide.theme))];
  const layoutTemplates = themes.flatMap((slideTheme) =>
    PPTX_LAYOUT_NAMES.map((layout) => ({
      id: `${slideTheme}:${layout}`,
      name: layout,
      theme: slideTheme,
      slide: createPptxLayoutTemplate(slideTheme, layout),
    })),
  );
  stage.append(...layoutTemplates.map((layout) => layout.slide.deck));
  await waitForImages(stage);
  await afterLayout();
  const pptxLayouts = layoutTemplates.map(({ id, name, theme: slideTheme, slide }, index) => ({
    id,
    name,
    theme: slideTheme,
    captureIndex: rendered.length + index,
    elements: collectPptxLayoutElements(slide.deck),
  }));
  const model = {
    version: 1,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    masters: themes.map((slideTheme) => ({
      id: slideTheme,
      theme: slideTheme,
      layoutIds: PPTX_LAYOUT_NAMES.map((layout) => `${slideTheme}:${layout}`),
    })),
    layouts: pptxLayouts,
    slides: pptxSlides,
  };
  window.__presentationPptxModel = JSON.parse(JSON.stringify(model));
  document.body.classList.add("pptx-artwork-mode", "pptx-layout-artwork-mode");
  document.body.setAttribute("data-pptx-artwork", "ready");
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-pptx-ready", "true");
  return {
    model: window.__presentationPptxModel,
    layout: collectDeckLayout(rendered),
  };
}

async function initPptx(params) {
  const token = params.get("token") || "";
  if (!token) throw new Error("Missing PowerPoint export token.");
  try {
    const response = await fetch(`./export-data?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Could not load PowerPoint export data (${response.status}).`);
    const data = await response.json();
    if (
      !Array.isArray(data.slides) ||
      data.slides.length === 0 ||
      !data.slides.every((slide) => typeof slide === "string")
    ) {
      throw new Error("PowerPoint export data does not contain a valid deck.");
    }
    const output = await renderPptxDeck(
      data.slides,
      data.theme,
      data.customThemeCss,
      data.customThemeMeta,
      data.themeLocked,
    );
    await reportOutputStatus(token, "ready", "", output.layout);
  } catch (error) {
    const message = error?.message || "PowerPoint rendering failed.";
    console.error(message);
    document.body.classList.remove("mermaid-loading");
    document.documentElement.setAttribute("data-pptx-error", "true");
    await reportOutputStatus(token, "error", message).catch(() => {});
  }
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

function reportPptxBootstrapFailure(error) {
  const message = error?.message || "PowerPoint rendering failed.";
  console.error(message);
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-pptx-error", "true");
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
let deckLayouts = [];
let navIndex = 0;
let navTotal = 0;
let navMode = "deck";
let overviewOpen = false;
let importOpen = false;
let architecturePickerOpen = false;
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
let pptxExportAvailable = false;
let markdownImportAvailable = false;
let presenterViewOpen = false;
let presenterViewRequested = false;
let exportPending = false;
let exportNotificationTimer = null;
let exportNotificationRemaining = 0;
let exportNotificationStarted = 0;

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

function deriveLayout(md) {
  const { meta } = splitFrontMatter(typeof md === "string" ? md : "");
  return typeof meta.layout === "string" ? meta.layout.trim().toLowerCase() : "";
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
      deckLayouts = deckSlides.map(deriveLayout);
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
  button.title = architectureDetailedEdit
    ? "Open Architecture Designer"
    : enabled
      ? "Exit shape editing mode"
      : "Shape editing mode";
  button.setAttribute("aria-label", button.title);
  syncMoreControls();
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
    syncMoreControls();
    return;
  }
  if (sourceMode === "live" && sourceWatchStatus === "error") {
    const message = sourceWatchErrorMessage(sourceWatchError);
    button.dataset.state = "error";
    button.title = `${message}. Click to pin the display to the loaded snapshot`;
    button.setAttribute("aria-label", button.title);
    if (status) status.textContent = message;
    syncMoreControls();
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
  syncMoreControls();
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

function architectureDiagramOptions() {
  return [...document.querySelectorAll(".architecture-diagram[data-architecture-block]")].map(
    (wrapper, index) => ({
      block: Number(wrapper.dataset.architectureBlock),
      title: wrapper.dataset.architectureTitle || `Diagram ${index + 1}`,
    }),
  );
}

function closeArchitecturePicker({ restoreFocus = false } = {}) {
  architecturePickerOpen = false;
  const picker = document.getElementById("architecturePicker");
  if (picker) picker.hidden = true;
  if (restoreFocus) document.getElementById("navEdit")?.focus();
}

async function openArchitectureDesigner(block) {
  const status = document.getElementById("sourceStatus");
  if (status) status.textContent = "Opening the Architecture Designer.";
  const result = await openDetailedArchitectureEditor(navIndex, block);
  if (!result?.ok && status) {
    status.textContent = result?.message || "Could not open the Architecture Designer.";
  }
  return result;
}

function openArchitecturePicker(options) {
  const picker = document.getElementById("architecturePicker");
  const list = document.getElementById("architecturePickerList");
  if (!picker || !list) return;
  list.replaceChildren();
  for (const [index, option] of options.entries()) {
    const item = document.createElement("li");
    item.className = "overview-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "overview-link";
    const number = document.createElement("span");
    number.className = "overview-num";
    number.textContent = String(index + 1);
    const label = document.createElement("span");
    label.className = "overview-label";
    label.textContent = option.title;
    button.append(number, label);
    button.addEventListener("click", () => {
      closeArchitecturePicker();
      void openArchitectureDesigner(option.block);
    });
    item.appendChild(button);
    list.appendChild(item);
  }
  architecturePickerOpen = true;
  picker.hidden = false;
  list.querySelector("button")?.focus();
}

function handleArchitecturePickerKey(event) {
  const picker = document.getElementById("architecturePicker");
  const list = document.getElementById("architecturePickerList");
  if (!picker || !list) return;
  const focusable = [...picker.querySelectorAll("button:not([disabled])")];
  const options = [...list.querySelectorAll("button:not([disabled])")];
  if (event.key === "Tab") {
    const current = focusable.indexOf(document.activeElement);
    if (current < 0 || (!event.shiftKey && current === focusable.length - 1)) {
      event.preventDefault();
      focusable[0]?.focus();
    } else if (event.shiftKey && current === 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    }
    return;
  }
  const current = options.indexOf(document.activeElement);
  let next = null;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    next = options[(Math.max(current, -1) + 1) % options.length];
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    next = options[(current <= 0 ? options.length : current) - 1];
  } else if (event.key === "Home") {
    next = options[0];
  } else if (event.key === "End") {
    next = options.at(-1);
  } else if (event.key === "PageDown" || event.key === "PageUp") {
    event.preventDefault();
    return;
  }
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

async function toggleArchitectureEditMode() {
  if (presenterMode || !architectureEditAvailable) return;
  if (architectureDetailedEdit) {
    const options = architectureDiagramOptions();
    if (options.length === 1) {
      await openArchitectureDesigner(options[0].block);
    } else if (options.length > 1) {
      openArchitecturePicker(options);
    } else {
      const status = document.getElementById("sourceStatus");
      if (status) status.textContent = "The current slide has no Architecture diagram to edit.";
    }
    return;
  }
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
  if (typeof data.pptxExportAvailable === "boolean") {
    pptxExportAvailable = data.pptxExportAvailable;
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
  }
  if (editAvailabilityChanged || detailedEditChanged) {
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
  if (presenterViewRequested) {
    presenterViewRequested = false;
    openPresenterView();
  }
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
    syncMoreControls();
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

function visibleMoreControlButtons() {
  const panel = document.getElementById("navMorePanel");
  if (!panel) return [];
  return [...panel.querySelectorAll(".nav-more-item")].filter((button) => !button.hidden);
}

function setMoreControlsOpen(enabled, { focusFirst = false, restoreFocus = false } = {}) {
  const nav = document.getElementById("nav");
  const trigger = document.getElementById("navMore");
  const panel = document.getElementById("navMorePanel");
  if (!nav || !trigger || !panel) return;

  const next = Boolean(enabled) && !nav.classList.contains("nav-empty") && !trigger.hidden;
  moreControlsOpen = next;
  trigger.setAttribute("aria-expanded", next ? "true" : "false");
  panel.hidden = nav.classList.contains("nav-empty") ? !markdownImportAvailable : !next;

  if (next && focusFirst) {
    requestAnimationFrame(() => visibleMoreControlButtons()[0]?.focus());
  } else if (!next && restoreFocus) {
    trigger.focus();
  }
}

function toggleMoreControls() {
  setMoreControlsOpen(!moreControlsOpen, { focusFirst: !moreControlsOpen });
}

function syncMoreControls() {
  const nav = document.getElementById("nav");
  const trigger = document.getElementById("navMore");
  const panel = document.getElementById("navMorePanel");
  if (!nav || !trigger || !panel) return;

  panel.querySelectorAll(".nav-more-group").forEach((group) => {
    group.hidden = ![...group.querySelectorAll(".nav-more-item")].some(
      (button) => !button.hidden,
    );
  });

  const buttons = visibleMoreControlButtons();
  const hasError = buttons.some((button) => button.dataset.state === "error");
  const hasActive = buttons.some((button) => button.dataset.state === "active");
  trigger.dataset.state = hasError ? "error" : hasActive ? "active" : "";
  trigger.title = hasError
    ? "More controls (attention required)"
    : hasActive
      ? "More controls (an option is active)"
      : "More controls";
  trigger.setAttribute("aria-label", trigger.title);

  const empty = nav.classList.contains("nav-empty");
  trigger.hidden = empty || buttons.length === 0;
  if (trigger.hidden) moreControlsOpen = false;
  trigger.setAttribute("aria-expanded", moreControlsOpen ? "true" : "false");
  panel.hidden = empty ? !markdownImportAvailable : !moreControlsOpen;
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
  const pptxButton = document.getElementById("navExportPptx");
  if (pptxButton) pptxButton.hidden = presenterMode || !pptxExportAvailable;
  const importButton = document.getElementById("navImport");
  if (importButton) importButton.hidden = presenterMode || !markdownImportAvailable;
  if (!presenterViewAvailable && presenterViewOpen) closePresenterView();
  if (!markdownImportAvailable && importOpen) closeImportPicker();
  if (!architectureDetailedEdit && architecturePickerOpen) closeArchitecturePicker();
  syncMoreControls();
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
  syncMoreControls();
}

function pauseExportNotification() {
  if (exportNotificationTimer === null) return;
  clearTimeout(exportNotificationTimer);
  exportNotificationTimer = null;
  exportNotificationRemaining = Math.max(
    0,
    exportNotificationRemaining - (performance.now() - exportNotificationStarted),
  );
}

function dismissExportNotification() {
  const notification = document.getElementById("exportNotification");
  const restoreFocus = notification.contains(document.activeElement);
  pauseExportNotification();
  exportNotificationRemaining = 0;
  notification.hidden = true;
  document.getElementById("exportStatus").textContent = "";
  document.getElementById("exportErrorStatus").textContent = "";
  if (restoreFocus) {
    const more = document.getElementById("navMore");
    (more.getClientRects().length ? more : document.body).focus();
  }
}

function resumeExportNotification() {
  const notification = document.getElementById("exportNotification");
  if (
    notification.hidden ||
    notification.dataset.state !== "success" ||
    notification.matches(":hover, :focus-within") ||
    exportNotificationTimer !== null
  ) {
    return;
  }
  exportNotificationStarted = performance.now();
  exportNotificationTimer = setTimeout(dismissExportNotification, exportNotificationRemaining);
}

function showExportNotification(state, message, path = "") {
  pauseExportNotification();
  const notification = document.getElementById("exportNotification");
  const location = document.getElementById("exportNotificationPath");
  notification.dataset.state = state;
  document.getElementById("exportNotificationMessage").textContent = message;
  location.textContent = path ? `Saved to: ${path}` : "";
  location.hidden = !path;
  document.getElementById("exportNotificationClose").hidden = state === "pending";
  notification.hidden = false;
  const announcement = path ? `${message} Saved to: ${path}` : message;
  document.getElementById("exportStatus").textContent = state === "error" ? "" : announcement;
  document.getElementById("exportErrorStatus").textContent = state === "error" ? announcement : "";
  exportNotificationRemaining = state === "success" ? 8000 : 0;
  resumeExportNotification();
}

async function exportFromCanvas(format) {
  const isPdf = format === "pdf";
  if (exportPending || !(isPdf ? pdfExportAvailable : pptxExportAvailable)) return;
  exportPending = true;
  const label = isPdf ? "PDF" : "PowerPoint";
  const pdfButton = document.getElementById("navExport");
  const pptxButton = document.getElementById("navExportPptx");
  const button = isPdf ? pdfButton : pptxButton;
  const idleTitle = button.title;
  pdfButton.disabled = true;
  pptxButton.disabled = true;
  delete button.dataset.state;
  button.title = `Saving ${label}.`;
  showExportNotification("pending", `Saving ${label}...`);
  syncMoreControls();

  try {
    const response = await fetch(isPdf ? "./export" : "./export-pptx", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      throw new Error(
        (typeof data?.message === "string" && data.message) ||
        `${label} export failed (${response.status}).`,
      );
    }
    if (typeof data.path !== "string" || !data.path.trim() || !data.path.split(/[\\/]/).pop()) {
      throw new Error(`${label} export returned an invalid save location.`);
    }
    const filename = data.path.split(/[\\/]/).pop();
    const fallback =
      !isPdf && data.fallbackCount > 0 ? ` ${data.fallbackCount} fallback item(s) preserved.` : "";
    const message = `${label} saved: ${filename}.${fallback}`;
    showExportNotification("success", message, data.path);
  } catch (error) {
    const message = `Could not save ${label}. ${error?.message || "Export failed."}`;
    console.error(`${label} export failed`, error);
    showExportNotification("error", message);
  } finally {
    exportPending = false;
    pdfButton.disabled = false;
    pptxButton.disabled = false;
    delete button.dataset.state;
    button.title = idleTitle;
    syncMoreControls();
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
  syncMoreControls();
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
  syncMoreControls();
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
  document.getElementById("navMore")?.focus();
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
  let insideSection = false;
  deckTitles.forEach((title, i) => {
    const layout = deckLayouts[i] || "";
    if (layout === "title" || layout === "backcover") insideSection = false;
    const sectionChild =
      insideSection && layout !== "title" && layout !== "section" && layout !== "backcover";

    const li = document.createElement("li");
    li.className = "overview-item";
    if (layout === "title" || layout === "section") {
      li.classList.add(`overview-item-${layout}`);
    }
    if (sectionChild) li.classList.add("overview-item-section-child");
    li.dataset.index = String(i);
    if (layout) li.dataset.layout = layout;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "overview-link";
    btn.setAttribute(
      "aria-label",
      `${i + 1} ${title}${layout === "title" || layout === "section" ? `, ${layout} slide` : ""}`,
    );

    const num = document.createElement("span");
    num.className = "overview-num";
    num.textContent = String(i + 1);
    const label = document.createElement("span");
    label.className = "overview-label";
    label.textContent = title;

    btn.appendChild(num);
    if (layout === "title" || layout === "section") {
      const kind = document.createElement("span");
      kind.className = "overview-kind";
      kind.textContent = layout === "title" ? "Title" : "Section";
      kind.setAttribute("aria-hidden", "true");
      btn.appendChild(kind);
    }
    btn.appendChild(label);
    btn.addEventListener("click", () => goToIndex(i));
    li.appendChild(btn);
    list.appendChild(li);

    if (layout === "section") insideSection = true;
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
  const bind = (id, fn, { closeMore = false } = {}) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", () => {
      if (closeMore) setMoreControlsOpen(false);
      fn();
      // Drop focus so a follow-up Space/Enter doesn't re-trigger the button on
      // top of the global keyboard handler.
      el.blur();
    });
  };
  bind("navPrev", goPrev);
  bind("navNext", goNext);
  bind("navList", toggleOverview);
  bind("navMore", toggleMoreControls);
  bind("navEdit", toggleArchitectureEditMode, { closeMore: true });
  bind("navPresent", openPresenterWindow, { closeMore: true });
  bind("navPresenterView", openPresenterView, { closeMore: true });
  bind("navFixedPreview", toggleFixedPreviewMode, { closeMore: true });
  bind("navExport", () => exportFromCanvas("pdf"), { closeMore: true });
  bind("navExportPptx", () => exportFromCanvas("pptx"), { closeMore: true });
  bind("navImport", toggleImportPicker, { closeMore: true });
  bind("navSourceMode", toggleSourceMode, { closeMore: true });
  bind("overviewClose", closeOverview);
  bind("importClose", closeImportPicker);
  bind("architecturePickerClose", () => closeArchitecturePicker({ restoreFocus: true }));
  bind("presenterPrevButton", goPrev);
  bind("presenterNextButton", goNext);
  bind("presenterListButton", openOverview);
  bind("presenterToggleButton", togglePresenterWindow);
  bind("presenterReturnButton", closePresenterView);

  const exportNotification = document.getElementById("exportNotification");
  document.getElementById("exportNotificationClose").addEventListener("click", dismissExportNotification);
  exportNotification.addEventListener("pointerenter", pauseExportNotification);
  exportNotification.addEventListener("pointerleave", resumeExportNotification);
  exportNotification.addEventListener("focusin", pauseExportNotification);
  exportNotification.addEventListener("focusout", () => queueMicrotask(resumeExportNotification));

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

  const architecturePicker = document.getElementById("architecturePicker");
  if (architecturePicker) {
    architecturePicker.addEventListener("click", (e) => {
      if (e.target === architecturePicker) closeArchitecturePicker({ restoreFocus: true });
    });
  }

  document.addEventListener("pointerdown", (e) => {
    if (!moreControlsOpen) return;
    const tools = document.getElementById("navTools");
    const panel = document.getElementById("navMorePanel");
    if (tools?.contains(e.target) || panel?.contains(e.target)) return;
    setMoreControlsOpen(false);
  });

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
    if (e.key === "Escape" && architecturePickerOpen) {
      closeArchitecturePicker({ restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (architecturePickerOpen) {
      handleArchitecturePickerKey(e);
      return;
    }
    if (e.key === "Escape" && moreControlsOpen) {
      setMoreControlsOpen(false, { restoreFocus: true });
      e.preventDefault();
      return;
    }
    if (handleSlideNavigationKey(e)) return;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    switch (e.key) {
      case "o":
      case "O":
        setMoreControlsOpen(false);
        toggleOverview();
        e.preventDefault();
        break;
      case "i":
      case "I":
        setMoreControlsOpen(false);
        toggleImportPicker();
        e.preventDefault();
        break;
      case "Escape":
        if (importOpen) {
          closeImportPicker();
          e.preventDefault();
        } else if (architecturePickerOpen) {
          closeArchitecturePicker({ restoreFocus: true });
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
  presenterViewRequested = params.get("presenter") === "1";
  if (params.get("pptx") === "1") {
    initPptx(params).catch(reportPptxBootstrapFailure);
    return;
  }
  if (params.get("capture") === "1") {
    initCapture(params).catch(reportCaptureBootstrapFailure);
    return;
  }
  if (params.get("print") === "1") {
    // Print mode renders one immutable output snapshot and never reaches editing,
    // SSE, or polling branches. The output runtime waits for its ready report
    // before asking Chromium to create the PDF.
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
