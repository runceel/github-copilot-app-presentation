import { renderArchitectureBlock } from "./architecture.mjs";
import { attachArchitectureEditor } from "./architecture-editor.mjs";
import {
  DEFAULT_THEME,
  normalizeTheme,
  parseFrontMatter,
} from "./theme.mjs";

// Client-side slide renderer for the presentation canvas.
//
// The extension server pushes the *current slide* as a small markdown fragment
// (optional front matter + body). This script parses the front matter, renders
// the body with marked, sanitizes the HTML with DOMPurify, turns ```mermaid
// fences into diagrams, and assembles the themed deck DOM. Logic and styling
// are self-contained in this extension (renderer.js + slides.css).

const PLACEHOLDER = [
  "---",
  "layout: title",
  "kicker: Presentation",
  "---",
  "# \uD83D\uDDA5\uFE0F \u30D7\u30EC\u30BC\u30F3\u306E\u6E96\u5099\u304C\u3067\u304D\u307E\u3057\u305F",
  "",
  "\u30B9\u30E9\u30A4\u30C9\u306E\u8868\u793A\u3092\u304A\u5F85\u3061\u3057\u3066\u3044\u307E\u3059\u2026",
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
// 編集モードは「presenter でも印刷でもない通常表示」でだけ有効になる。
// 印刷は init の早期 return でここへ到達しないので、実質の分岐は presenterMode。
let architectureEditMode = false;
let architectureDetailedEdit = false;
let presenterMode = false;
let previewMode = false;
let previewOffset = 0;
// 直近に描画したスライドの Markdown。編集モードの切り替えで描き直すために持つ。
let lastMarkdown = "";
// 描画中のスライドに取り付けた編集 UI。再描画のたびに破棄する。
let architectureEditors = [];
// `layoutTarget` is the slide currently on screen (cover and back cover
// included); `autoSize` says whether it also takes part in the font auto-fit.
let layoutTarget = null;
let layoutFrame = 0;
// Overflow below this many pixels is treated as "it fits". Fractional line
// heights and display scaling routinely push scrollHeight a fraction of a pixel
// past clientHeight, which is invisible but still enough for `overflow:auto` to
// draw a scrollbar.
const SCROLL_EPSILON = 2;

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

function refreshLayout() {
  const target = layoutTarget;
  if (!target || !target.deck.isConnected) return;
  if (target.autoSize) applyAutoSize(target.deck, target.bodyEl);
  updateBodyScroll(target.bodyEl);
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
  const md = nonEmpty(markdown) ? markdown : PLACEHOLDER;
  const { meta, body: rawBody } = splitFrontMatter(md);
  const directive = extractSlideSizeDirective(rawBody);
  const body = directive.body;

  const layout = (meta.layout || "").toLowerCase();
  const titleSlide = layout === "title";
  const sectionSlide = layout === "section";
  // 背表紙 (.thmx の "Closing logo slide" 相当)。ロゴと著作権表示は本文とは別に
  // 組み立てるので、専用レイアウトとして扱う。
  const backcoverSlide = layout === "backcover";
  // 通常スライドは上寄せが既定。`layout: center` のときだけ、見出しと本文を
  // まとめて上下中央に置く（見出しの抽出やサイズ自動調整は通常どおり働く）。
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
    // 編集モードのときだけ編集 UI を差し込む。通常表示はこの経路を通らないので、
    // ツールバーや tabindex が本番の描画へ漏れることがない。
    const host = document.createElement("div");
    host.className = "architecture-edit-host";
    host.setAttribute("data-architecture-block", String(blockIndex));
    target.replaceWith(host);
    const editor = attachArchitectureEditor(host, {
      source,
      documentRef: document,
      canOpenDetail: architectureDetailedEdit,
      onOpenDetail: () => openDetailedArchitectureEditor(slideIndex, blockIndex),
      // 保存結果を editor へ返す（返し忘れると失敗が「成功」に見えてしまう）。
      onCommit: (next) => saveArchitectureBlock(slideIndex, blockIndex, next),
    });
    if (!editor) {
      // DSL が不正なら編集させず、通常のエラー表示へ戻す。
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
  // 前のスライドに取り付けた編集 UI は document 側のリスナーを持つので必ず外す。
  architectureEditors.forEach((editor) => editor.destroy());
  architectureEditors = [];
  applyCustomThemeCss(customThemeCss);
  const slide = createSlide(markdown, deckTheme);
  document.title = slide.title;
  document.documentElement.setAttribute("data-theme", slide.theme);

  const token = ++renderToken;
  document.body.classList.add("mermaid-loading");
  document.getElementById("stage").replaceChildren(slide.deck);
  if (layoutFrame) {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
  }
  layoutTarget = {
    deck: slide.deck,
    bodyEl: slide.bodyEl,
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
  // SVG の <image> は HTMLImageElement ではないので complete / load を持たない。
  // 同じ URL を HTMLImageElement で先読みして解決を待つ（2 回目は HTTP キャッシュに乗る）。
  // これをしないと、アーキテクチャ図のアイコンが描かれる前に PDF 出力や
  // ビジュアル回帰のキャプチャが走ってしまう。
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

async function reportPrintStatus(token, status, error = "") {
  const response = await fetch(`./export-status?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not report print status (${response.status}).`);
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
  document.body.classList.add("print-mode", "mermaid-loading");
  const rendered = slides.map((markdown) => createSlide(markdown, deckTheme));
  const stage = document.getElementById("stage");
  stage.replaceChildren(...rendered.map((slide) => slide.deck));
  document.title = rendered[0]?.title || "Presentation";

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

  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-print-ready", "true");
  window.__presentationPrintReady = true;
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
    await renderPrintDeck(
      data.slides,
      data.theme,
      data.customThemeCss,
      data.customThemeMeta,
      data.themeLocked,
    );
    await reportPrintStatus(token, "ready");
  } catch (error) {
    const message = error?.message || "Print rendering failed.";
    console.error(message);
    document.body.classList.remove("mermaid-loading");
    document.documentElement.setAttribute("data-print-error", "true");
    await reportPrintStatus(token, "error", message).catch(() => {});
  }
}

/**
 * initPrint 自体が失敗したときの最後の受け皿（#12）。
 *
 * initPrint は本文の失敗を内部の catch で拾って data-print-error を立てるが、
 * **トークン欠落だけは try の外側で throw する**。呼び出し側で受けないと未処理の
 * Promise 拒否になるだけで、失敗のシグナルがどこにも残らない。
 *
 * ブラウザーは空トークンでも exit 0 で「白紙 1 ページの PDF」を吐いて正常終了する
 * （実測済み）ので、data-print-error がこの失敗を外から観測できる唯一の手がかりになる。
 */
function reportPrintBootstrapFailure(error) {
  const message = error?.message || "Print rendering failed.";
  console.error(message);
  document.body.classList.remove("mermaid-loading");
  document.documentElement.setAttribute("data-print-error", "true");
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
let sourceMode = "snapshot";
let sourceWatchStatus = "inactive";
let sourceWatchError = "";
let presenterLaunchPending = false;
let pdfExportPending = false;

// Derive a short overview title from a slide fragment: first heading, else first
// non-empty body line, trimmed. Mirrors the skill's title rule.
function deriveTitle(md) {
  const { body } = splitFrontMatter(typeof md === "string" ? md : "");
  const lines = body.split("\n");
  let fallback = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*\S)\s*$/);
    if (heading) return trimTitle(heading[1]);
    if (!fallback) fallback = line;
  }
  return fallback ? trimTitle(fallback) : "（無題）";
}

function trimTitle(text) {
  const stripped = text
    .replace(/[*_`>#~]/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
  return stripped.length > 40 ? stripped.slice(0, 40) + "…" : stripped || "（無題）";
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
 * 編集モードを切り替える。presenter では常に無効（印刷は init で早期 return する
 * ため、そもそもここへ到達しない）。実際に変わったときだけ true を返す。
 */
function setArchitectureEditMode(enabled) {
  const next = Boolean(enabled) && !presenterMode;
  if (next === architectureEditMode) return false;
  architectureEditMode = next;
  document.body.classList.toggle("architecture-edit-mode", next);
  updateArchitectureEditButton(next);
  return true;
}

function updateArchitectureEditButton(enabled = architectureEditMode) {
  const button = document.getElementById("navEdit");
  if (!button) return;
  button.hidden = presenterMode;
  button.dataset.state = enabled && !presenterMode ? "active" : "";
  button.title = enabled ? "図形編集モードを終了" : "図形編集モード";
  button.setAttribute("aria-label", button.title);
}

function sourceWatchErrorMessage(code) {
  if (code === "empty_markdown") return "Markdown が空のため最後の表示を保持しています";
  if (code === "source_file_too_large") return "Markdown が大きすぎるため最後の表示を保持しています";
  if (code === "source_file_unavailable") return "Markdown の保存先を確認できません";
  if (code === "watch_failed") return "Markdown の保存監視を開始できません";
  if (code === "source_file_not_found") return "Markdown が見つからないため最後の表示を保持しています";
  return "Markdown の再読み込みに失敗したため最後の表示を保持しています";
}

function updateSourceModeButton() {
  const button = document.getElementById("navSourceMode");
  const status = document.getElementById("sourceStatus");
  if (!button) return;
  button.hidden = presenterMode || !sourceBacked;
  if (!sourceBacked) {
    button.dataset.state = "";
    if (status) status.textContent = "";
    return;
  }
  if (sourceMode === "live" && sourceWatchStatus === "error") {
    const message = sourceWatchErrorMessage(sourceWatchError);
    button.dataset.state = "error";
    button.title = `${message}。クリックすると読み込み時点の表示へ固定します`;
    button.setAttribute("aria-label", button.title);
    if (status) status.textContent = message;
    return;
  }
  const live = sourceMode === "live";
  button.dataset.state = live ? "active" : "";
  button.title = live
    ? "Markdown の自動更新を停止して現在の表示を固定する"
    : "Markdown の保存時に自動更新する";
  button.setAttribute("aria-label", button.title);
  if (status) {
    status.textContent = live
      ? "Markdown の保存時にスライドを自動更新します"
      : "Markdown は読み込み時点の表示を保持しています";
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
      if (status) status.textContent = data.error || "Markdown の表示モードを変更できませんでした";
      return;
    }
    await fetchState();
  } catch (_) {
    const status = document.getElementById("sourceStatus");
    if (status) status.textContent = "Markdown の表示モードを変更できませんでした";
  }
}

async function toggleSourceMode() {
  if (presenterMode || !sourceBacked) return;
  await requestSourceMode(sourceMode === "live" ? "snapshot" : "live");
}

/**
 * 編集モードの有効・無効をサーバーへ要求する。サーバー状態が唯一の真実なので、
 * ここではクライアント状態を直接いじらない（反映は /state のポーリング経由）。
 */
async function requestArchitectureEditMode(enabled) {
  try {
    await fetch("./edit-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: Boolean(enabled) }),
    });
  } catch (_) {
    /* サーバーが落ちていれば編集モードには入れない。次の poll で整合する。 */
  }
}

async function toggleArchitectureEditMode() {
  if (presenterMode) return;
  await requestArchitectureEditMode(!architectureEditMode);
  await fetchState();
}

/**
 * 編集した図をサーバーへ書き戻す。サーバーは元スライドの n 番目の
 * ```architecture フェンスを差し替えるので、元の DSL がそのまま更新される。
 *
 * 保存の成否は必ず呼び出し元へ返す。ここで握り潰すと、保存されていないのに
 * 保存できたように見える（Phase 5 が潰したかった「黙って無視される」挙動そのもの）。
 */
async function saveArchitectureBlock(index, block, source) {
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
    return { ok: false, message: "サーバーへ接続できませんでした" };
  }
  if (!res.ok) {
    let error = `HTTP ${res.status}`;
    try {
      const failure = await res.json();
      if (failure?.error === "edit_mode_disabled") error = "編集モードが無効です";
      else if (failure?.error === "source_changed") {
        error = "元 Markdown が外部で変更されています。再読み込みしてから編集してください";
      } else if (failure?.error === "deck_changed") {
        error = "表示中のデッキが差し替わりました。図を選び直してください";
      } else if (failure?.error === "source_file_not_found") {
        error = "元 Markdown が見つかりません";
      } else if (failure?.error === "source_file_too_large") {
        error = "元 Markdown が大きすぎるため保存できません";
      } else if (failure?.error === "source_file_unavailable") {
        error = "元 Markdown の保存先を確認できません";
      } else if (failure?.error === "source_write_failed") {
        error = "元 Markdown への書き込みに失敗しました";
      } else if (typeof failure?.error === "string") error = failure.error;
    } catch (_) {
      /* 本文が JSON でなければ HTTP ステータスをそのまま見せる。 */
    }
    return { ok: false, message: error };
  }
  const data = await res.json();
  // 自分が起こした更新なので、SSE のこだまで再描画しないよう版を進めておく
  // （再描画すると編集中の選択とフォーカスが飛ぶ）。
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
  let response;
  try {
    response = await fetch("./architecture-editor/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index, block }),
    });
  } catch (_) {
    return { ok: false, message: "サーバーへ接続できませんでした。" };
  }
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.ok === true) return result;
  if (result.error === "source_not_available") {
    return {
      ok: false,
      message:
        "詳細編集には元 Markdown との対応が必要です。canvas のファイル選択から Markdown を読み込んでください。",
    };
  }
  return {
    ok: false,
    message: result.message || "専用 Architecture Editor を開けませんでした。",
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
  if (typeof data.presenterRunning === "boolean") {
    updatePresenterButton(data.presenterRunning);
  }
  if (typeof data.sourceBacked === "boolean") sourceBacked = data.sourceBacked;
  sourceMode = data.sourceMode === "live" ? "live" : "snapshot";
  sourceWatchStatus =
    data.sourceWatchStatus === "watching" || data.sourceWatchStatus === "error"
      ? data.sourceWatchStatus
      : "inactive";
  sourceWatchError = typeof data.sourceWatchError === "string" ? data.sourceWatchError : "";
  updateSourceModeButton();
  const detailedEditChanged =
    typeof data.architectureDetailedEdit === "boolean" &&
    data.architectureDetailedEdit !== architectureDetailedEdit;
  if (typeof data.architectureDetailedEdit === "boolean") {
    architectureDetailedEdit = data.architectureDetailedEdit;
  }
  // 編集モードの切り替えは版番号を伴わないので、バージョンガードより前に見る。
  if (
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
  if (previewMode) return;
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

async function openPresenterWindow() {
  if (presenterLaunchPending) return;
  presenterLaunchPending = true;
  const button = document.getElementById("navPresent");
  const status = document.getElementById("presentStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "外部プレゼン画面を起動しています。";

  try {
    const response = await fetch("./present", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `External presenter failed (${response.status}).`);
    }
    const message = data.alreadyRunning
      ? "外部プレゼン画面は既に起動しています。"
      : "外部プレゼン画面を起動しました。";
    if (status) status.textContent = message;
    updatePresenterButton(true, message);
  } catch (error) {
    const message = error?.message || "外部プレゼン画面を起動できませんでした。";
    console.error("External presenter launch failed", error);
    if (status) status.textContent = message;
    if (button) {
      button.dataset.state = "error";
      button.title = message;
    }
  } finally {
    presenterLaunchPending = false;
    if (button) button.disabled = false;
  }
}

function updatePresenterButton(running, message = "") {
  const button = document.getElementById("navPresent");
  if (!button) return;
  button.dataset.state = running ? "active" : "";
  button.title =
    message || (running ? "外部プレゼン画面は起動中です" : "外部ウィンドウで表示 (F11 で全画面)");
}

async function exportPdfFromCanvas() {
  if (pdfExportPending) return;
  pdfExportPending = true;
  const button = document.getElementById("navExport");
  const status = document.getElementById("exportStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "PDFを保存しています。";

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
    const message = `${filename} を保存しました。`;
    if (status) status.textContent = message;
    if (button) {
      button.dataset.state = "active";
      button.title = message;
    }
  } catch (error) {
    const message = error?.message || "PDFを保存できませんでした。";
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

function updateNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  // デッキが無いときも、presenter 以外では読み込みボタンだけを残して出す
  // （まだスライドが無い状態から Markdown をインポートできるようにする）。
  const empty = navTotal <= 0;
  nav.hidden = previewMode || (empty && presenterMode);
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
// workspace 内の Markdown を拡張機能に一覧させ、選ばれたファイルを拡張機能側で
// 分割・表示する。agent を介さずにユーザーが自分の Markdown を出せる導線。
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
    btn.className = "overview-link";
    const label = document.createElement("span");
    label.className = "import-path";
    label.textContent = path;
    btn.appendChild(label);
    btn.addEventListener("click", () => importMarkdown(path));
    li.appendChild(btn);
    list.appendChild(li);
  }
  if (!matches.length && importFiles.length) {
    setImportMessage("一致するファイルがありません。");
  }
}

async function loadImportFiles() {
  setImportMessage("Markdown ファイルを探しています。");
  try {
    const res = await fetch("./markdown-files", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.files)) {
      throw new Error(data.error || `一覧を取得できませんでした (${res.status})。`);
    }
    importFiles = data.files;
    if (!importFiles.length) {
      setImportMessage("workspace に Markdown ファイルが見つかりませんでした。");
    } else if (data.truncated) {
      setImportMessage(`件数が多いため先頭 ${importFiles.length} 件のみ表示しています。`);
    } else {
      setImportMessage("");
    }
    renderImportList();
  } catch (error) {
    console.error("Markdown file listing failed", error);
    importFiles = [];
    renderImportList();
    setImportMessage(error?.message || "一覧を取得できませんでした。", "error");
  }
}

async function importMarkdown(path) {
  if (importPending) return;
  importPending = true;
  setImportMessage(`${path} を読み込んでいます。`);
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
      throw new Error(data.error || `読み込みに失敗しました (${res.status})。`);
    }
    closeImportPicker();
    await fetchState();
  } catch (error) {
    console.error("Markdown import failed", error);
    setImportMessage(error?.message || "読み込みに失敗しました。", "error");
  } finally {
    importPending = false;
  }
}

function openImportPicker() {
  if (presenterMode) return;
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
        ".deck > header, .deck > footer, .deck > .backcover-logo, .deck > .backcover-copyright, " +
        ".body > *",
    )
  ) {
    return false;
  }
  return true;
}

// --- input wiring ----------------------------------------------------------
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
  bind("navExport", exportPdfFromCanvas);
  bind("navImport", toggleImportPicker);
  bind("navSourceMode", toggleSourceMode);
  bind("navList", toggleOverview);
  bind("overviewClose", closeOverview);
  bind("importClose", closeImportPicker);

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
    // Esc だけは入力欄にフォーカスがあっても効かせる（インポートの絞り込み中に
    // 閉じられないと行き止まりになるため）。
    if (e.key === "Escape" && importOpen) {
      closeImportPicker();
      e.preventDefault();
      return;
    }
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    // When a button (◀ ▶ ☰ ✕ or an overview link) has focus, let the browser's
    // native Space/Enter activation run instead of hijacking it for "next".
    const onButton = !!(t && (t.tagName === "BUTTON" || t.getAttribute?.("role") === "button"));
    switch (e.key) {
      case " ":
      case "Spacebar":
        if (onButton) break;
        goNext();
        e.preventDefault();
        break;
      case "ArrowRight":
      case "PageDown":
        goNext();
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "PageUp":
        goPrev();
        e.preventDefault();
        break;
      case "Home":
        navigate({ index: 0 });
        e.preventDefault();
        break;
      case "End":
        if (navTotal > 0) navigate({ index: navTotal - 1 });
        e.preventDefault();
        break;
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
      fetchState().catch((error) => console.error("Presentation state refresh failed", error));
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
  if (params.get("print") === "1") {
    // 印刷は編集モードの分岐へ到達しない。ここを return から落とすと
    // PDF に編集 UI が焼き込まれるので、回帰テストで固定してある。
    //
    // またこの早期 return は **#12 のハングを防いでいる本体**でもある。
    // 印刷モードだけが connectEvents()（閉じない SSE）と 2 秒間隔の setInterval を
    // 起動しないので、ページが静止し --print-to-pdf が完了できる。
    // ここを return から落とすと印刷が永久に終わらなくなる。
    initPrint(params).catch(reportPrintBootstrapFailure);
    return;
  }
  if (params.get("preview") === "1") {
    previewMode = true;
    presenterMode = true;
    previewOffset = Math.max(-1, Math.min(1, Number(params.get("offset")) || 0));
    document.body.classList.add("presenter-mode", "preview-mode");
  } else if (params.get("present") === "1") {
    presenterMode = true;
    document.body.classList.add("presenter-mode");
  } else if (params.get("architectureEdit") === "1") {
    // ローカル確認用の導線。presenter とは else-if で排他になっている。
    // ここでクライアント状態だけを立てると、直後の /state ポーリングが
    // サーバーの false で上書きして編集モードが勝手に解除され、/edit も
    // 409 になる。サーバー状態を唯一の真実にするため、まずサーバーへ伝える。
    // 実際の有効化は /state 経由で返ってくる。
    requestArchitectureEditMode(true);
  }

  updateArchitectureEditButton();
  if (!previewMode) wireControls();
  window.addEventListener("resize", scheduleLayoutRefresh);
  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleLayoutRefresh).catch(() => {});
  }

  fetchState()
    .catch((error) => console.error("Initial presentation state load failed", error))
    .finally(() => {
      connectEvents();
      setInterval(
        () =>
          fetchState().catch((error) =>
            console.error("Presentation state poll failed", error),
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
