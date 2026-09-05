import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { architectureSchemaReference } from "./architecture-reference.mjs";
import {
  UNCLOSED_ARCHITECTURE_MESSAGE,
  validateArchitectureInput,
} from "./architecture-validation.mjs";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(EXT_DIR, "README.md");
const THEME_GUIDE_PATH = join(EXT_DIR, "docs", "custom-theme-authoring.md");
const THEME_SCHEMA_PATH = join(EXT_DIR, "schema", "theme-v1.json");

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new Error(`guide section not found: ${heading}`);
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  let end = lines.length;
  let fence = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const fenceMatch = lines[index].match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence) continue;
    const match = lines[index].match(/^(#+)\s/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function themeSchemaSummary(schema) {
  return [
    "# Custom presentation theme v1 schema",
    "",
    "Custom properties available for theme authoring, extracted from the bundled `schema/theme-v1.json`.",
    "",
    "```json",
    JSON.stringify(
      {
        format: schema["x-theme-file-format"],
        allowedValueSyntax: schema["x-value-syntax"],
        metadata: schema["x-theme-metadata"],
        properties: Object.fromEntries(
          Object.entries(schema.properties.variables.properties).map(([name, definition]) => [
            name,
            definition.description,
          ]),
        ),
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

export async function readGuide(topic = "overview") {
  if (topic === "architecture-schema") return architectureSchemaReference();
  const readme = await readFile(README_PATH, "utf8");
  switch (topic) {
    case "overview":
      return [
        section(readme, "## How it works"),
        "",
        "Users can load workspace Markdown directly with **More controls > Open Markdown** (deterministic splitting without AI; natural-language summarization remains the AI's responsibility). The workspace root is the Git repository root when available, otherwise the folder opened for the current session.",
        "Use **More controls > Shape editing** to adjust the placement of an existing Architecture diagram. In the CLI, run `markdstage preview slides.md --watch`; it starts in viewing mode and enables the same placement editor plus the detailed Architecture designer. CLI `preview` without `--watch` is read-only. Comprehensive edits affect the source Markdown only when explicitly saved.",
        "Before drafting Architecture DSL, request `architecture-schema` for the generated authoring contract. Before displaying a diagram, call `markdstage_validate` with explicit `format: \"dsl\"` and `source`, or `format: \"slides\"` and one-slide `slides` fragments. This read-only preflight needs no open canvas and does not read or change files.",
        "",
        "For details, request `slide-format`, `themes`, `custom-themes`, `theme-schema`, `architecture-dsl`, or `architecture-schema`.",
      ].join("\n");
    case "slide-format":
      return [
        section(readme, "### Markdown file syntax"),
        "",
        section(readme, "### Canvas API `slides` array"),
        "",
        section(readme, "### `sourceName` role"),
      ].join("\n");
    case "themes":
      return section(readme, "### Choosing a theme");
    case "custom-themes":
    case "custom-ehemes":
      return readFile(THEME_GUIDE_PATH, "utf8");
    case "theme-schema": {
      const schema = JSON.parse(await readFile(THEME_SCHEMA_PATH, "utf8"));
      return themeSchemaSummary(schema);
    }
    case "architecture-dsl":
      return section(readme, "## Architecture DSL v1");
    default:
      throw new Error(`unknown MarkdStage guide topic: ${topic}`);
  }
}

export function hasFrontMatter(markdown) {
  const normalized = markdown.replace(/\r\n?/g, "\n").replace(/^[\n \t\uFEFF]+/, "");
  if (!normalized.startsWith("---\n")) return false;
  return normalized.split("\n").slice(1).some((line) => line.trim() === "---");
}

function architectureError(slideIndex, blockIndex, code, message) {
  return {
    slideIndex,
    page: slideIndex + 1,
    blockIndex,
    architecture: blockIndex + 1,
    code,
    message,
  };
}

export function architectureValidationReport(slides, { index, maxDiagnostics } = {}) {
  if (index !== undefined &&
      (!Number.isInteger(index) || index < 0 || index >= slides.length)) {
    throw new RangeError("index must identify a slide in the provided array.");
  }
  const report = validateArchitectureInput({
    format: "slides",
    slides: index === undefined ? slides : [slides[index]],
    ...(maxDiagnostics === undefined ? {} : { maxDiagnostics }),
  });
  if (index === undefined) return report;
  const rebase = (item) => typeof item.slideIndex === "number"
    ? { ...item, slideIndex: item.slideIndex + index, page: item.page + index }
    : item;
  return {
    ...report,
    scope: "slide",
    index,
    page: index + 1,
    total: slides.length,
    diagnostics: report.diagnostics.map(rebase),
    blocks: report.blocks.map(rebase),
    skipped: report.skipped.map(rebase),
  };
}

export function architectureValidationErrors(slides, { index, validation } = {}) {
  if (Array.isArray(slides) && slides.length === 0 && index === undefined && !validation) return [];
  const report = validation ?? architectureValidationReport(slides, { index });
  const errors = [];
  for (const block of report.blocks) {
    if (!block.dslValid) {
      const primary = report.diagnostics
        .slice(block.diagnosticStart, block.diagnosticStart + block.diagnosticCount)
        .find((diagnostic) => diagnostic.severity === "error");
      if (primary) {
        errors.push(architectureError(
          block.slideIndex, block.blockIndex, "invalid_architecture", primary.message,
        ));
      }
    }
    if (block.closed === false) {
      errors.push(architectureError(
        block.slideIndex, block.blockIndex, "unclosed_architecture_fence",
        UNCLOSED_ARCHITECTURE_MESSAGE,
      ));
    }
  }
  return errors;
}

export function deckValidationFeedback(slides, { validation } = {}) {
  if (Array.isArray(slides) && slides.length === 0 && !validation) return undefined;
  const warnings = [];
  slides.forEach((slide, slideIndex) => {
    if (!hasFrontMatter(slide)) {
      warnings.push(
        `slide ${slideIndex + 1}: front matter is missing. Add the required deck/layout/page/total/size fields to the leading --- block.`,
      );
    }
  });
  const report = validation ?? architectureValidationReport(slides);
  for (const error of report.diagnostics) {
    if (error.code === "unclosed_architecture_fence") {
      warnings.push(
        `slide ${error.page}: ${error.message}`,
      );
      continue;
    }
    warnings.push(
      `${error.page ? `slide ${error.page}` : "Architecture validation"}${error.architecture ? `, architecture ${error.architecture}` : ""}: ${error.message} [${error.code}${error.pointer ? ` at ${error.pointer}` : ""}]. Review architecture-dsl and architecture-schema in markdstage_guide.`,
    );
  }
  if (!report.complete) {
    warnings.push(
      report.truncated
        ? `Architecture validation is incomplete: inspection limits were reached (${report.budget.limitsReached.join(", ")}). Validate smaller inputs; unchecked blocks are not valid.`
        : "Architecture validation is incomplete: later stages were skipped after earlier errors. Fix the reported issues and validate again.",
    );
  }
  return warnings.length ? `Slide validation feedback:\n- ${warnings.join("\n- ")}` : undefined;
}
