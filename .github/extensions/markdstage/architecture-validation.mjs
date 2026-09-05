import { validateArchitecture } from "./renderer/architecture.mjs";
import { findArchitectureBlocks } from "./scripts/markdown-blocks.mjs";

export const ARCHITECTURE_VALIDATION_LIMITS = Object.freeze({
  maxSourceChars: 262_144,
  maxSlideChars: 262_144,
  maxTotalChars: 2_097_152,
  maxSlides: 200,
  maxBlocks: 200,
});
export const UNCLOSED_ARCHITECTURE_MESSAGE =
  "The architecture code fence is not closed. Add ``` at the end.";

const STAGES = ["json", "structure", "semantic", "layout"];
const skippedStages = () => Object.fromEntries(STAGES.map((stage) => [stage, "skipped"]));

export class ArchitectureValidationInputError extends TypeError {
  constructor(message) {
    super(message);
    this.name = "ArchitectureValidationInputError";
    this.code = "invalid_input";
  }
}

function checkInput(input) {
  const reject = (message) => {
    throw new ArchitectureValidationInputError(message);
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    reject("Provide an object with an explicit format of 'dsl' or 'slides'.");
  }
  const allowed = new Set(["format", "source", "slides", "maxDiagnostics"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) reject(`Unknown validation input field: ${key}.`);
  }
  if (!Object.hasOwn(input, "format") || (input.format !== "dsl" && input.format !== "slides")) {
    reject("format must be explicitly set to 'dsl' or 'slides'.");
  }
  const hasSource = Object.hasOwn(input, "source");
  const hasSlides = Object.hasOwn(input, "slides");
  if (input.format === "dsl") {
    if (!hasSource || hasSlides || typeof input.source !== "string") {
      reject("format 'dsl' requires a string source and must not include slides.");
    }
  } else {
    if (hasSource || !hasSlides || !Array.isArray(input.slides) || !input.slides.length) {
      reject("format 'slides' requires a non-empty array of one-slide Markdown fragments and must not include source.");
    }
    const inspectableSlides = Math.min(input.slides.length, ARCHITECTURE_VALIDATION_LIMITS.maxSlides);
    for (let index = 0; index < inspectableSlides; index += 1) {
      if (typeof input.slides[index] !== "string") {
        reject(`slides[${index}] must be a one-slide Markdown string.`);
      }
    }
  }
  const maxDiagnostics = Object.hasOwn(input, "maxDiagnostics") ? input.maxDiagnostics : 50;
  if (!Number.isInteger(maxDiagnostics) || maxDiagnostics < 1 || maxDiagnostics > 100) {
    reject("maxDiagnostics must be an integer from 1 to 100.");
  }
  return maxDiagnostics;
}

function blockPosition(slideIndex, block, lineCount) {
  return {
    slideIndex,
    page: slideIndex + 1,
    blockIndex: block.index,
    architecture: block.index + 1,
    openLine: block.open + 1,
    closeLine: block.end < lineCount ? block.end + 1 : null,
    endLine: block.end < lineCount ? block.end + 1 : lineCount,
    closed: block.end < lineCount,
  };
}

/**
 * Validate explicit, unloaded content. Limits bound this inspection only; they
 * do not add restrictions to the Architecture DSL parser or alter any source.
 */
export function validateArchitectureInput(input) {
  const maxDiagnostics = checkInput(input);
  const limits = { ...ARCHITECTURE_VALIDATION_LIMITS, maxDiagnostics };
  const diagnostics = [];
  const blocks = [];
  const skipped = [];
  const budget = {
    inputChars: input.format === "dsl"
      ? input.source.length
      : input.slides.length > limits.maxSlides
        ? null
        : input.slides.reduce((total, slide) => total + slide.length, 0),
    scannedChars: 0,
    scannedSlides: 0,
    processedBlocks: 0,
    skippedSlides: 0,
    skippedBlocks: 0,
    limitsReached: [],
  };
  let truncated = false;

  function reachLimit(reason, position = {}) {
    truncated = true;
    if (budget.limitsReached.includes(reason)) return;
    budget.limitsReached.push(reason);
    if (diagnostics.length < maxDiagnostics) {
      diagnostics.push({
        code: "validation_budget_exceeded",
        category: "structure",
        severity: "warning",
        pointer: "",
        message: `Validation stopped at the ${reason} inspection limit (${limits[reason]}). Unchecked content is not valid or complete.`,
        suggestions: [{
          action: "review",
          message: "Validate smaller explicit inputs separately; no source was changed.",
          automatic: false,
        }],
        ...position,
      });
    }
  }

  function skipSlides(slideIndex, count, reason) {
    if (!count) return;
    reachLimit(reason, { slideIndex, page: slideIndex + 1 });
    skipped.push({
      slideIndex,
      page: slideIndex + 1,
      slideCount: count,
      reason,
      stages: skippedStages(),
    });
    budget.skippedSlides += count;
    // Counting fences would itself inspect slides that were skipped.
    budget.skippedBlocks = null;
  }

  function skipBlocks(position, count, reason) {
    reachLimit(reason, position);
    skipped.push({ ...position, blockCount: count, reason, stages: skippedStages() });
    if (budget.skippedBlocks !== null) budget.skippedBlocks += count;
  }

  function inspect(source, position = {}) {
    const remaining = maxDiagnostics - diagnostics.length;
    const report = validateArchitecture(source, { maxDiagnostics: remaining });
    const diagnosticStart = diagnostics.length;
    diagnostics.push(...report.diagnostics.map((diagnostic) => ({ ...diagnostic, ...position })));
    let blockTruncated = report.truncated;
    const truncationReasons = new Set(report.truncated ? report.truncationReasons : []);
    if (position.closed === false) {
      if (diagnostics.length < maxDiagnostics) {
        diagnostics.push({
          code: "unclosed_architecture_fence",
          category: "structure",
          severity: "error",
          pointer: "",
          message: UNCLOSED_ARCHITECTURE_MESSAGE,
          suggestions: [{
            action: "review",
            message: "Close the architecture fence with the same marker and at least its opening length.",
            automatic: false,
          }],
          ...position,
        });
      } else {
        blockTruncated = true;
        truncationReasons.add("maxDiagnostics");
      }
    }
    if (blockTruncated) {
      truncated = true;
      for (const reason of truncationReasons) {
        // maxDiagnostics here is deck-wide, not this block's remaining allowance.
        if (reason !== "maxDiagnostics" && Object.hasOwn(report.limits ?? {}, reason)) {
          limits[reason] = report.limits[reason];
        }
        reachLimit(reason, position);
      }
    }
    blocks.push({
      ...position,
      valid: report.valid && position.closed !== false && !blockTruncated,
      dslValid: report.valid,
      complete: report.complete && !blockTruncated,
      truncated: blockTruncated,
      ...(blockTruncated ? { truncationReasons: [...truncationReasons] } : {}),
      stages: report.stages,
      diagnosticStart,
      diagnosticCount: diagnostics.length - diagnosticStart,
    });
    budget.processedBlocks += 1;
  }

  if (input.format === "dsl") {
    if (input.source.length > limits.maxSourceChars) {
      skipBlocks({}, 1, "maxSourceChars");
    } else {
      budget.scannedChars = input.source.length;
      inspect(input.source);
    }
  } else {
    for (let slideIndex = 0; slideIndex < input.slides.length; slideIndex += 1) {
      const remainingSlides = input.slides.length - slideIndex;
      if (slideIndex >= limits.maxSlides) {
        skipSlides(slideIndex, remainingSlides, "maxSlides");
        break;
      }
      if (diagnostics.length >= maxDiagnostics) {
        skipSlides(slideIndex, remainingSlides, "maxDiagnostics");
        break;
      }
      if (budget.processedBlocks >= limits.maxBlocks) {
        skipSlides(slideIndex, remainingSlides, "maxBlocks");
        break;
      }
      const slide = input.slides[slideIndex];
      if (slide.length > limits.maxSlideChars) {
        skipSlides(slideIndex, 1, "maxSlideChars");
        continue;
      }
      if (budget.scannedChars + slide.length > limits.maxTotalChars) {
        skipSlides(slideIndex, remainingSlides, "maxTotalChars");
        break;
      }
      budget.scannedChars += slide.length;
      budget.scannedSlides += 1;
      const found = findArchitectureBlocks(slide);
      const lineCount = slide.split(/\r\n?|\n/).length;
      for (let index = 0; index < found.length; index += 1) {
        const position = blockPosition(slideIndex, found[index], lineCount);
        const reason = diagnostics.length >= maxDiagnostics
          ? "maxDiagnostics"
          : budget.processedBlocks >= limits.maxBlocks ? "maxBlocks" : null;
        if (reason) {
          skipBlocks(position, found.length - index, reason);
          break;
        }
        inspect(found[index].body, position);
      }
    }
  }

  const complete = !truncated && blocks.every((block) => block.complete);
  const valid = complete && blocks.every((block) => block.valid);
  const stages = Object.fromEntries(STAGES.map((stage) => {
    const failed = blocks.some((block) => block.stages[stage] === "failed") ||
      diagnostics.some((diagnostic) => diagnostic.category === stage && diagnostic.severity === "error");
    const unchecked = skipped.length > 0 || blocks.some((block) => block.stages[stage] === "skipped");
    return [stage, failed ? "failed" : unchecked ? "skipped" : "passed"];
  }));
  return {
    ok: true,
    format: input.format,
    scope: input.format === "dsl" ? "dsl" : "deck",
    ...(input.format === "slides" ? { total: input.slides.length } : {}),
    valid,
    complete,
    truncated,
    stages,
    diagnostics,
    diagnosticCount: diagnostics.length,
    blocks,
    skipped,
    limits,
    budget,
  };
}

export function createArchitectureValidationTool() {
  return {
    name: "markdstage_validate",
    description:
      "Read-only preflight of explicit, unloaded Architecture DSL or one-slide Markdown fragments. Call markdstage_guide with architecture-schema BEFORE drafting DSL, then call this tool BEFORE display. Requires format 'dsl' with source OR format 'slides' with slides, never both. Does not open, inspect, navigate, or modify a canvas or file. Returns bounded canonical diagnostics; ok describes invocation, while valid/complete/truncated describe the content check.",
    parameters: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["dsl", "slides"] },
        source: { type: "string", description: "Raw Architecture DSL JSON, only with format 'dsl'." },
        slides: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "One-slide Markdown fragments, only with format 'slides'; this does not split whole Markdown files.",
        },
        maxDiagnostics: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      required: ["format"],
      additionalProperties: false,
      oneOf: [
        { properties: { format: { const: "dsl" } }, required: ["source"], not: { required: ["slides"] } },
        { properties: { format: { const: "slides" } }, required: ["slides"], not: { required: ["source"] } },
      ],
    },
    handler: async (input) => {
      try {
        return {
          textResultForLlm: JSON.stringify(validateArchitectureInput(input)),
          resultType: "success",
        };
      } catch (error) {
        if (!(error instanceof ArchitectureValidationInputError)) throw error;
        return {
          textResultForLlm: JSON.stringify({ ok: false, error: error.code, message: error.message }),
          resultType: "failure",
        };
      }
    },
  };
}
