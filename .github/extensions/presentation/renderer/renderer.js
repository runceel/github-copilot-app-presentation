// Client-side slide renderer for the presentation canvas.
//
// The extension server pushes the *current slide* as a small markdown fragment
// (optional front matter + body). This script parses the front matter, renders
// the body with marked, sanitizes the HTML with DOMPurify, turns ```mermaid
// fences into diagrams, and assembles the themed deck DOM. Logic and styling
// are ported from the .NET PresentationApp's SlideState.cs so the look matches.

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
// Mirrors SlideState.SplitFrontMatter: a leading `---` fenced block of
// `key: value` lines is deck metadata, everything after is the body.
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

// --- emoji shortcodes ------------------------------------------------------
// Best-effort `:name:` → emoji, mirroring Markdig's UseEmojiAndSmiley for the
// shortcodes most useful in slides. Applied only to text nodes outside code.
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

// --- mermaid ---------------------------------------------------------------
// Render every <pre class="mermaid"> in `scope` to SVG. Resilient: a slide with
// no diagrams, a missing library, or an invalid diagram must never leave the
// slide blank, so the body is always revealed in the end.
function runMermaid(scope) {
  const reveal = () => document.body.classList.remove("mermaid-loading");
  const nodes = scope.querySelectorAll("pre.mermaid, .mermaid");
  if (!nodes.length || !window.mermaid) {
    reveal();
    return;
  }
  try {
    Promise.resolve(window.mermaid.run({ nodes }))
      .catch((e) => console.error("Mermaid render failed", e))
      .finally(reveal);
  } catch (e) {
    console.error("Mermaid init failed", e);
    reveal();
  }
}

// --- slide rendering -------------------------------------------------------
function renderSlide(markdown) {
  const md = nonEmpty(markdown) ? markdown : PLACEHOLDER;
  const { meta, body } = splitFrontMatter(md);

  const titleSlide = (meta.layout || "").toLowerCase() === "title";
  document.title = meta.title || meta.deck || "Slide";

  const deck = document.createElement("div");
  deck.className = titleSlide ? "deck title-slide" : "deck";

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

  document.body.classList.add("mermaid-loading");
  document.getElementById("stage").replaceChildren(deck);
  runMermaid(bodyEl);
}

// --- live update -----------------------------------------------------------
// /state is the single source of truth (it always returns the latest slide and
// a monotonic version). SSE is just a low-latency "version changed" nudge, and
// a slow poll is a safety net for missed ticks / SSE drops.
let currentVersion = -1;

async function fetchState() {
  const res = await fetch("./state", { cache: "no-store" });
  if (!res.ok) return;
  const data = await res.json();
  if (typeof data.version === "number" && data.version === currentVersion) return;
  currentVersion = typeof data.version === "number" ? data.version : currentVersion;
  renderSlide(typeof data.markdown === "string" ? data.markdown : "");
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
