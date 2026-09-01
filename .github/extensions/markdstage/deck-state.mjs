const DEFAULT_BACKCOVER = ["---", "layout: backcover", "---", ""].join("\n");

export const OPEN_INPUT_REQUIRES_SLIDES_MESSAGE =
  "Non-empty open input must include slides (a non-empty array of strings). " +
  "To refocus the current canvas, call open_canvas with no input. " +
  "To replace the registered snapshot, pass slides or call load_deck. " +
  "sourceName is metadata for asset/theme resolution and output naming; it never reads or watches a Markdown file.";

function readLayout(markdown) {
  if (typeof markdown !== "string") return "";
  const text = markdown
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^[\n \t\uFEFF]+/, "");
  if (!text.startsWith("---\n")) return "";
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") break;
    const separator = lines[i].indexOf(":");
    if (separator <= 0) continue;
    if (lines[i].slice(0, separator).trim().toLowerCase() !== "layout") continue;
    return lines[i]
      .slice(separator + 1)
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .toLowerCase();
  }
  return "";
}

export function ensureBackCover(slides) {
  if (!slides.length) return slides;
  if (readLayout(slides[slides.length - 1]) === "backcover") return slides;
  return [...slides, DEFAULT_BACKCOVER];
}

function sameSlides(left, right) {
  return left.length === right.length && left.every((slide, index) => slide === right[index]);
}

function clampIndex(value, total) {
  const index = Number(value);
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), total - 1));
}

export function classifyOpenInput(input) {
  if (input === undefined || input === null) return { kind: "refocus" };
  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      kind: "invalid",
      message: "MarkdStage open input must be an object when provided.",
    };
  }
  if (Object.keys(input).length === 0) return { kind: "refocus" };
  if (!Object.prototype.hasOwnProperty.call(input, "slides")) {
    return { kind: "invalid", message: OPEN_INPUT_REQUIRES_SLIDES_MESSAGE };
  }
  const slides = input.slides;
  if (
    !Array.isArray(slides) ||
    slides.length === 0 ||
    !slides.every((slide) => typeof slide === "string")
  ) {
    return {
      kind: "invalid",
      message: "slides must be a non-empty array of strings when provided to open",
    };
  }
  return { kind: "deck", slides };
}

export function planDeckOpen(
  currentSlides,
  incomingSlides,
  { hasThemeInput = false, hasSourceInput = false } = {},
) {
  const normalizedCurrent = ensureBackCover(currentSlides.slice());
  const normalizedIncoming = ensureBackCover(incomingSlides.slice());
  const sameDeck = sameSlides(normalizedCurrent, normalizedIncoming);
  return {
    sameDeck,
    shouldApply:
      currentSlides.length === 0 || !sameDeck || hasThemeInput || hasSourceInput,
    preserveCurrentIndex: sameDeck,
  };
}

export function getExportSlides(inst) {
  if (inst.slides.length) {
    const slides = [...inst.slides];
    if (inst.mode === "adhoc" && typeof inst.markdown === "string") {
      slides[clampIndex(inst.index, slides.length)] = inst.markdown;
    }
    return slides;
  }
  if (inst.mode === "adhoc" && typeof inst.markdown === "string") {
    return [inst.markdown];
  }
  return [];
}

export function getOutputSnapshotSlides(inst) {
  return ensureBackCover(getExportSlides(inst));
}
