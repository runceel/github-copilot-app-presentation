// Portable Agent Skill generation.
//
// Every reference file is generated from readGuide(topic) so the skills cannot
// drift from the canonical MarkdStage documentation. The generated tree follows
// the Agent Skills specification: a SKILL.md with YAML front matter (name +
// description) plus progressive-disclosure reference files.

import { GUIDE_TOPICS } from "./commands/guide.mjs";
import { readGuide } from "./runtime.mjs";

export const SKILL_TARGETS = {
  codex: {
    label: "Codex",
    directory: [".agents", "skills", "markdstage"],
  },
  claude: {
    label: "Claude Code",
    directory: [".claude", "skills", "markdstage"],
  },
  copilot: {
    label: "GitHub Copilot",
    directory: [".github", "skills", "markdstage"],
  },
};

const DESCRIPTION =
  "Turn Markdown into 16:9 slides with the MarkdStage CLI. Use when the user " +
  'asks to present, preview, validate, screenshot, or export a Markdown deck ("present slides.md", ' +
  '"turn this file into slides", "export the deck to PDF", "check whether my slides fit"). ' +
  "Provides deterministic commands for presenting in a browser, validating Architecture DSL and " +
  "themes, inspecting 1280x720 clipping, capturing PNGs, and exporting PDF.";

function frontMatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function canvasNote(target) {
  if (target !== "copilot") return "";
  return [
    "",
    "## Canvas adapter",
    "",
    "Inside GitHub Copilot with the MarkdStage canvas Extension installed, prefer the",
    "canvas: pass every slide to the `open` input of canvas ID `MarkdStage` and let the",
    "canvas controls handle navigation. Use the CLI commands below when the canvas is not",
    "available, or for validation, PNG capture, and PDF export in a terminal or CI job.",
  ].join("\n");
}

function skillBody(target) {
  const label = SKILL_TARGETS[target].label;
  return `# MarkdStage

Markdown is the single source of truth. MarkdStage renders each Markdown fragment
between \`---\` separators as one 1280x720 (16:9) slide, and the CLI renders exactly
what the MarkdStage canvas and MarkdStage Desktop render.

## Requirements

- Node.js 20.11 or later.
- An installed Microsoft Edge, Google Chrome, or Chromium (never downloaded automatically).
- The CLI: \`npx @runceel/markdstage <command>\` or \`npm install --global @runceel/markdstage\`.

## Workflow

1. Write or edit the deck as one Markdown file (see \`references/slide-format.md\`).
2. Validate it: \`markdstage validate slides.md --json\`.
3. Check the fixed 16:9 layout: \`markdstage inspect slides.md --json\`.
4. Capture clipped slides for review: \`markdstage capture slides.md\`.
5. Present or export: \`markdstage present slides.md --watch\` / \`markdstage export slides.md\`.

Never hand-write HTML or CSS for a slide. Fix layout problems by shortening the
content or by changing the layout in front matter.

## Commands

| Command | Purpose |
| --- | --- |
| \`markdstage present <file> [--watch]\` | Serve the deck on loopback and open it in a browser window. \`--watch\` reloads on save and keeps the current slide. |
| \`markdstage validate <file> [--json]\` | Check deck structure, Architecture DSL blocks, and themes. |
| \`markdstage inspect <file> [--json]\` | Report 1280x720 clipping diagnostics for the deck or one slide. |
| \`markdstage capture <file> [--pages 2,4]\` | Write 1280x720 PNG files; without \`--pages\` only clipped slides are captured. |
| \`markdstage export <file> [--output slides.pdf]\` | Produce the 16:9 PDF. |
| \`markdstage guide <topic>\` | Print the canonical MarkdStage authoring guide. |

Exit codes: \`0\` success, \`1\` usage error, \`2\` deck or input error, \`3\` no
Chromium-based browser, \`4\` rendering failure, \`5\` issues found with \`--fail-on-issues\`.

## References

Read the reference that matches the task before writing Markdown:

- \`references/slide-format.md\` — slide fragments, front matter, layouts.
- \`references/themes.md\` — built-in themes.
- \`references/custom-themes.md\` — custom theme authoring and \`theme-file\`.
- \`references/theme-schema.md\` — custom theme properties.
- \`references/architecture-dsl.md\` — Architecture DSL v1 diagrams.
- \`references/architecture-schema.md\` — Architecture DSL schema summary.
- \`references/overview.md\` — how MarkdStage works.

## Notes for ${label}

Run the CLI through the shell. Presentation servers bind to loopback with an
unguessable per-process URL token, and every generated file stays inside the
workspace.${canvasNote(target)}
`;
}

const REFERENCE_HEADERS = {
  overview: "MarkdStage overview",
  "slide-format": "Slide fragment format",
  themes: "Built-in themes",
  "custom-themes": "Custom theme authoring",
  "theme-schema": "Custom theme schema",
  "architecture-dsl": "Architecture DSL v1",
  "architecture-schema": "Architecture DSL schema summary",
};

/**
 * Build every file of the generated skill as a `path -> contents` map.
 * Paths use POSIX separators and are relative to the skill directory.
 */
export async function buildSkillFiles(target) {
  if (!SKILL_TARGETS[target]) {
    throw new Error(`Unknown skill target: ${target}`);
  }
  const files = new Map();
  files.set(
    "SKILL.md",
    `${frontMatter({
      name: "markdstage",
      description: DESCRIPTION,
      license: "MIT",
    })}\n\n${skillBody(target)}`,
  );
  for (const topic of GUIDE_TOPICS) {
    const content = (await readGuide(topic)).trim();
    const parts = [
      "<!-- Generated by `markdstage skill install`. Do not edit by hand. -->",
      `<!-- Source: markdstage_guide topic "${topic}" -->`,
      "",
    ];
    if (!content.startsWith("#")) {
      parts.push(`# ${REFERENCE_HEADERS[topic]}`, "");
    }
    parts.push(content, "");
    files.set(`references/${topic}.md`, parts.join("\n"));
  }
  return files;
}
