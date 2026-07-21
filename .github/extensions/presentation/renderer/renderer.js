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
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim().replace(/^["']+|["']+$/g, "");
    if (key.length) meta[key] = value;
  }
  return { meta, body: lines.slice(end + 1).join("\n") };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// --- themes ----------------------------------------------------------------
// The deck theme is chosen by the agent (load_deck `theme`) and delivered via
// /state; an individual slide may override it with a `theme:` front-matter key.
// Anything unrecognized falls back to the default so a slide is never unstyled.
const THEMES = new Set(["dark", "light", "microsoft"]);
const DEFAULT_THEME = "dark";
const MERMAID_THEME = { dark: "dark", light: "default", microsoft: "neutral" };
const SIZE_MODES = new Set(["auto", "normal", "large", "xlarge"]);
const DEFAULT_SIZE_MODE = "auto";
let deckTheme = DEFAULT_THEME;
// Bumped on every render so a late mermaid finish from a previous slide can't
// reveal a newer, still-rendering one.
let renderToken = 0;
let lastMermaidTheme = null;
let autoSizeTarget = null;
let autoSizeFrame = 0;

function normalizeTheme(value) {
  const t = typeof value === "string" ? value.trim().toLowerCase() : "";
  return THEMES.has(t) ? t : DEFAULT_THEME;
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
      bodyEl.scrollHeight <= bodyEl.clientHeight + 1 &&
      bodyEl.scrollWidth <= bodyEl.clientWidth + 1,
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

function scheduleAutoSize() {
  if (!autoSizeTarget) return;
  if (autoSizeFrame) cancelAnimationFrame(autoSizeFrame);
  autoSizeFrame = requestAnimationFrame(() => {
    autoSizeFrame = 0;
    const target = autoSizeTarget;
    if (!target || !target.deck.isConnected) return;
    applyAutoSize(target.deck, target.bodyEl);
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
function applySyntaxHighlighting(root) {
  if (!window.hljs) return;
  root.querySelectorAll("pre code").forEach((code) => {
    if (code.classList.contains("language-mermaid")) return;
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
function createSlide(markdown, fallbackTheme) {
  const md = nonEmpty(markdown) ? markdown : PLACEHOLDER;
  const { meta, body: rawBody } = splitFrontMatter(md);
  const directive = extractSlideSizeDirective(rawBody);
  const body = directive.body;

  const layout = (meta.layout || "").toLowerCase();
  const titleSlide = layout === "title";
  const closingSlide = layout === "closing";
  const sizeMode = normalizeSizeMode(meta.size || directive.size);

  // A slide-level `theme:` overrides the deck theme. Keep it on the deck element
  // as well as <html> so print mode can render differently themed pages together.
  const theme = normalizeTheme(meta.theme || fallbackTheme);

  const deck = document.createElement("div");
  deck.className = "deck";
  deck.dataset.theme = theme;
  if (titleSlide) deck.className = "deck title-slide";
  else if (closingSlide) deck.className = "deck closing-slide";
  if (sizeMode !== "auto") setSizeLevel(deck, sizeMode);

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
  applyEmojiShortcodes(bodyEl);

  // marked emits ```mermaid fences as <pre><code class="language-mermaid">.
  // Convert them to the <pre class="mermaid"> shape mermaid.run expects.
  bodyEl.querySelectorAll("code.language-mermaid").forEach((code) => {
    const target = code.closest("pre") || code;
    const graph = document.createElement("pre");
    graph.className = "mermaid";
    graph.textContent = code.textContent;
    target.replaceWith(graph);
  });
  applySyntaxHighlighting(bodyEl);
  deck.appendChild(bodyEl);

  // Footer: only shown when there's a deck name and/or a page/total pair,
  // matching the C# Render() logic.
  const deckName = nonEmpty(meta.deck) ? meta.deck : "";
  const page = nonEmpty(meta.page) ? meta.page : "";
  const total = nonEmpty(meta.total) ? meta.total : "";
  const showFooter = !(deckName === "" && (page === "" || total === ""));
  if (showFooter) {
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
    closingSlide,
    title: meta.title || meta.deck || "Slide",
  };
}

function renderSlide(markdown) {
  const slide = createSlide(markdown, deckTheme);
  document.title = slide.title;
  document.documentElement.setAttribute("data-theme", slide.theme);

  const token = ++renderToken;
  document.body.classList.add("mermaid-loading");
  document.getElementById("stage").replaceChildren(slide.deck);
  if (autoSizeFrame) {
    cancelAnimationFrame(autoSizeFrame);
    autoSizeFrame = 0;
  }
  autoSizeTarget =
    slide.sizeMode === "auto" && !slide.titleSlide && !slide.closingSlide
      ? { deck: slide.deck, bodyEl: slide.bodyEl }
      : null;
  scheduleAutoSize();
  runMermaid(slide.bodyEl, slide.theme, token);
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

async function renderPrintDeck(slides, theme) {
  deckTheme = normalizeTheme(theme);
  document.documentElement.setAttribute("data-theme", deckTheme);
  document.body.classList.add("print-mode", "mermaid-loading");
  const rendered = slides.map((markdown) => createSlide(markdown, deckTheme));
  const stage = document.getElementById("stage");
  stage.replaceChildren(...rendered.map((slide) => slide.deck));
  document.title = rendered[0]?.title || "Presentation";

  if (document.fonts?.ready) await document.fonts.ready;
  await afterLayout();
  for (const slide of rendered) {
    if (slide.sizeMode === "auto" && !slide.titleSlide && !slide.closingSlide) {
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
    await renderPrintDeck(data.slides, data.theme);
    await reportPrintStatus(token, "ready");
  } catch (error) {
    const message = error?.message || "Print rendering failed.";
    console.error(message);
    document.body.classList.remove("mermaid-loading");
    document.documentElement.setAttribute("data-print-error", "true");
    await reportPrintStatus(token, "error", message).catch(() => {});
  }
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

async function fetchState() {
  const res = await fetch("./state", { cache: "no-store" });
  if (!res.ok) return;
  const data = await res.json();
  if (typeof data.theme === "string") deckTheme = normalizeTheme(data.theme);
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

function updateNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  nav.hidden = navTotal <= 0;
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
  bind("navList", toggleOverview);
  bind("overviewClose", closeOverview);

  const overview = document.getElementById("overview");
  if (overview) {
    // Click on the dimmed backdrop (outside the panel) closes the overview.
    overview.addEventListener("click", (e) => {
      if (e.target === overview) closeOverview();
    });
  }

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
      case "Escape":
        if (overviewOpen) {
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
    es.onmessage = () => fetchState().catch(() => {});
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
    initPrint(params);
    return;
  }

  wireControls();
  window.addEventListener("resize", scheduleAutoSize);
  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleAutoSize).catch(() => {});
  }

  fetchState()
    .catch(() => {})
    .finally(() => {
      connectEvents();
      setInterval(() => fetchState().catch(() => {}), 2000);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
