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
  "presentation canvas を使う前に presentation_guide ツールで書式とスキーマを確認すること。";
const PRESENTATION_PROMPT = /プレゼン|スライド|slides?\.md|deck/i;

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
    "同梱の `schema/architecture-v1.schema.json` から実行時に抽出した要点です。",
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
    "同梱の `schema/theme-v1.json` から抽出した、テーマ作成で使用できるカスタムプロパティです。",
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
        section(readme, "## 仕組み"),
        "",
        "詳細は `slide-format` / `themes` / `custom-themes` / `theme-schema` / `architecture-dsl` / `architecture-schema` を指定して取得する。",
      ].join("\n");
    case "slide-format":
      return section(readme, "### スライド断片の書式");
    case "themes":
      return section(readme, "### テーマの選び方");
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
      throw new Error(`unknown presentation guide topic: ${topic}`);
  }
}

export function createPresentationHooks() {
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
      if (toolName === "presentation_guide") primed.add(sessionId);
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
  return { sources, unclosed: Boolean(fence) };
}

export function deckValidationFeedback(slides) {
  const warnings = [];
  slides.forEach((slide, slideIndex) => {
    if (!hasFrontMatter(slide)) {
      warnings.push(
        `slide ${slideIndex + 1}: front matter がありません。必要な deck/layout/page/total/size を先頭の --- ブロックへ追加してください。`,
      );
    }
    const architecture = architectureSources(slide);
    for (const [blockIndex, source] of architecture.sources.entries()) {
      try {
        parseArchitecture(source);
      } catch (error) {
        warnings.push(
          `slide ${slideIndex + 1}, architecture ${blockIndex + 1}: ${error?.message || error}。presentation_guide の architecture-dsl / architecture-schema を確認してください。`,
        );
      }
    }
    if (architecture.unclosed) {
      warnings.push(
        `slide ${slideIndex + 1}: architecture コードフェンスが閉じられていません。末尾に \`\`\` を追加してください。`,
      );
    }
  });
  return warnings.length ? `スライド検証フィードバック:\n- ${warnings.join("\n- ")}` : undefined;
}
