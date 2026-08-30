import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArchitecture } from "./renderer/architecture.mjs";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(EXT_DIR, "README.md");
const SCHEMA_PATH = join(EXT_DIR, "schema", "architecture-v1.schema.json");
const THEME_GUIDE_PATH = join(EXT_DIR, "docs", "custom-theme-authoring.md");
const THEME_SCHEMA_PATH = join(EXT_DIR, "schema", "theme-v1.json");
const GUIDE_POINTER =
  "Use the markdstage_guide tool to review the format and schemas before using the MarkdStage canvas.";
const PRESENTATION_PROMPT =
  /\bpresent(?:ation|er|ing)?\b|\bslides?\b|slides?\.md|\bdeck\b/i;

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

function architectureSchemaSummary(schema) {
  const defs = schema.$defs;
  const summary = {
    root: {
      required: schema.required,
      properties: Object.keys(schema.properties),
      elementTypes: [
        defs.nodeBase.properties.type.const,
        defs.groupBase.properties.type.const,
        defs.connector.properties.type.const,
      ],
    },
    shape: defs.nodeBase.properties.shape.enum,
    icon: {
      builtIn: defs.iconName.enum,
      assetPath: defs.iconAsset.description,
    },
    connector: {
      labelLayer: defs.connector.properties.labelLayer,
    },
    style: {
      keys: Object.keys(defs.style.properties),
      colors: defs.color.description,
      themeTokens: defs.themeToken.enum,
      literalColors: defs.literalColor.description,
    },
  };
  return [
    "# Architecture DSL v1 schema summary",
    "",
    "Key details extracted at runtime from the bundled `schema/architecture-v1.schema.json`.",
    "",
    "```json",
    JSON.stringify(summary, null, 2),
    "```",
  ].join("\n");
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
  const readme = await readFile(README_PATH, "utf8");
  switch (topic) {
    case "overview":
      return [
        section(readme, "## How it works"),
        "",
        "Users can load workspace Markdown directly with the canvas 📂 button (deterministic splitting without AI; natural-language summarization remains the AI's responsibility).",
        "Use MarkdStage's ✎ control to adjust the placement of an existing Architecture diagram. For comprehensive editing, including adding or deleting elements, open the architecture-editor canvas with sourcePath and blockIndex. Comprehensive edits affect the source Markdown only when explicitly saved.",
        "",
        "For details, request `slide-format`, `themes`, `custom-themes`, `theme-schema`, `architecture-dsl`, or `architecture-schema`.",
      ].join("\n");
    case "slide-format":
      return section(readme, "### Slide fragment format");
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
    case "architecture-schema": {
      const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
      return architectureSchemaSummary(schema);
    }
    default:
      throw new Error(`unknown MarkdStage guide topic: ${topic}`);
  }
}

export function createMarkdStageHooks() {
  const primed = new Set();
  return {
    onSessionStart: ({ sessionId }) => {
      primed.delete(sessionId);
    },
    onSessionEnd: ({ sessionId }) => {
      primed.delete(sessionId);
    },
    onUserPromptSubmitted: ({ sessionId, prompt }) => {
      if (primed.has(sessionId) || !PRESENTATION_PROMPT.test(prompt ?? "")) return;
      primed.add(sessionId);
      return { additionalContext: GUIDE_POINTER };
    },
    onPostToolUse: ({ sessionId, toolName }) => {
      if (toolName === "markdstage_guide") primed.add(sessionId);
    },
  };
}

function hasFrontMatter(markdown) {
  const normalized = markdown.replace(/\r\n?/g, "\n").replace(/^[\n \t\uFEFF]+/, "");
  if (!normalized.startsWith("---\n")) return false;
  return normalized.split("\n").slice(1).some((line) => line.trim() === "---");
}

function architectureSources(markdown) {
  const sources = [];
  let fence = "";
  let lines = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!fence) {
      const opening = line.match(/^\s*(`{3,}|~{3,})architecture\s*$/i);
      if (opening) {
        fence = opening[1];
        lines = [];
      }
      continue;
    }
    const closing = new RegExp(`^${fence[0]}{${fence.length},}\\s*$`);
    if (closing.test(line.trim())) {
      sources.push(lines.join("\n"));
      fence = "";
      lines = [];
    } else {
      lines.push(line);
    }
  }
  return {
    sources,
    unclosed: Boolean(fence),
    unclosedBlockIndex: sources.length,
    unclosedSource: fence ? lines.join("\n") : "",
  };
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

export function architectureValidationErrors(slides, { index } = {}) {
  const targets = index === undefined
    ? slides.map((slide, slideIndex) => ({ slide, slideIndex }))
    : [{ slide: slides[index], slideIndex: index }];
  const errors = [];

  for (const { slide, slideIndex } of targets) {
    const architecture = architectureSources(slide);
    for (const [blockIndex, source] of architecture.sources.entries()) {
      try {
        parseArchitecture(source);
      } catch (error) {
        errors.push(
          architectureError(
            slideIndex,
            blockIndex,
            "invalid_architecture",
            error?.message || String(error),
          ),
        );
      }
    }
    if (architecture.unclosed) {
      try {
        parseArchitecture(architecture.unclosedSource);
      } catch (error) {
        errors.push(
          architectureError(
            slideIndex,
            architecture.unclosedBlockIndex,
            "invalid_architecture",
            error?.message || String(error),
          ),
        );
      }
      errors.push(
        architectureError(
          slideIndex,
          architecture.unclosedBlockIndex,
          "unclosed_architecture_fence",
          "The architecture code fence is not closed. Add ``` at the end.",
        ),
      );
    }
  }

  return errors;
}

export function deckValidationFeedback(slides) {
  const warnings = [];
  slides.forEach((slide, slideIndex) => {
    if (!hasFrontMatter(slide)) {
      warnings.push(
        `slide ${slideIndex + 1}: front matter is missing. Add the required deck/layout/page/total/size fields to the leading --- block.`,
      );
    }
  });
  for (const error of architectureValidationErrors(slides)) {
    if (error.code === "unclosed_architecture_fence") {
      warnings.push(
        `slide ${error.page}: ${error.message}`,
      );
      continue;
    }
    warnings.push(
      `slide ${error.page}, architecture ${error.architecture}: ${error.message}. Review architecture-dsl and architecture-schema in markdstage_guide.`,
    );
  }
  return warnings.length ? `Slide validation feedback:\n- ${warnings.join("\n- ")}` : undefined;
}
