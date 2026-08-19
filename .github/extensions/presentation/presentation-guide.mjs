import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArchitecture } from "./renderer/architecture.mjs";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(EXT_DIR, "README.md");
const SCHEMA_PATH = join(EXT_DIR, "schema", "architecture-v1.schema.json");
const GUIDE_POINTER =
  "presentation canvas を使う前に presentation_guide ツールで書式とスキーマを確認すること。";
const PRESENTATION_PROMPT = /プレゼン|スライド|slides?\.md|deck/i;

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) throw new Error(`guide section not found: ${heading}`);
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
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

export async function readGuide(topic = "overview") {
  const readme = await readFile(README_PATH, "utf8");
  switch (topic) {
    case "overview":
      return [
        section(readme, "## 仕組み"),
        "",
        "詳細は `slide-format` / `themes` / `architecture-dsl` / `architecture-schema` を指定して取得する。",
      ].join("\n");
    case "slide-format":
      return section(readme, "### スライド断片の書式");
    case "themes":
      return section(readme, "### テーマの選び方");
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

export function deckValidationFeedback(slides) {
  const warnings = [];
  slides.forEach((slide, slideIndex) => {
    if (!hasFrontMatter(slide)) {
      warnings.push(
        `slide ${slideIndex + 1}: front matter がありません。必要な deck/layout/page/total/size を先頭の --- ブロックへ追加してください。`,
      );
    }
    const architectureBlocks = slide.matchAll(/```architecture[^\n]*\n([\s\S]*?)```/g);
    for (const [blockIndex, match] of [...architectureBlocks].entries()) {
      try {
        parseArchitecture(match[1]);
      } catch (error) {
        warnings.push(
          `slide ${slideIndex + 1}, architecture ${blockIndex + 1}: ${error?.message || error}。presentation_guide の architecture-dsl / architecture-schema を確認してください。`,
        );
      }
    }
    const openings = (slide.match(/```architecture(?:[^\n]*)\n/g) || []).length;
    const closings = [...slide.matchAll(/```architecture[^\n]*\n[\s\S]*?```/g)].length;
    if (openings > closings) {
      warnings.push(
        `slide ${slideIndex + 1}: architecture コードフェンスが閉じられていません。末尾に \`\`\` を追加してください。`,
      );
    }
  });
  return warnings.length ? `スライド検証フィードバック:\n- ${warnings.join("\n- ")}` : undefined;
}
