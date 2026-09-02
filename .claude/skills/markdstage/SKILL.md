---
name: "markdstage"
description: "Turn Markdown into 16:9 slides with the MarkdStage CLI. Use when the user asks to present, preview, validate, screenshot, or export a Markdown deck (\"present slides.md\", \"turn this file into slides\", \"export the deck to PDF\", \"check whether my slides fit\"). Provides deterministic commands for presenting and visually editing Architecture DSL in a browser, validating themes, inspecting 1280x720 clipping, capturing PNGs, and exporting PDF."
license: "MIT"
---

# MarkdStage

Markdown is the single source of truth. MarkdStage renders each Markdown fragment
between `---` separators as one 1280x720 (16:9) slide, and the CLI renders exactly
what the MarkdStage canvas and MarkdStage Desktop render.

## Requirements

- Node.js 24 or later.
- An installed Microsoft Edge, Google Chrome, or Chromium (never downloaded automatically).
- The CLI: `npx @markdstage/markdstage <command>` or `npm install --global @markdstage/markdstage`.

## Workflow

1. Write or edit the deck as one Markdown file (see `references/slide-format.md`).
2. Validate it: `markdstage validate slides.md --json`.
3. Check the fixed 16:9 layout: `markdstage inspect slides.md --json`.
4. Capture clipped slides for review: `markdstage capture slides.md`.
5. Present or export: `markdstage present slides.md --watch` / `markdstage export slides.md`.

Use `present --watch` for live authoring. It starts in viewing mode; the user can
activate the pencil control to move Architecture elements, then choose **Advanced
edit** for the detailed designer. Placement changes save immediately, while the
detailed designer saves only when the user selects **Save**. `present` without
`--watch` is read-only.

Never hand-write HTML or CSS for a slide. Fix layout problems by shortening the
content or by changing the layout in front matter.

## Commands

| Command | Purpose |
| --- | --- |
| `markdstage present <file> [--watch]` | Serve the deck on loopback and open it in a browser window. `--watch` reloads on save, keeps the current slide, and enables Architecture placement and detailed editing. Without it, the source is read-only. |
| `markdstage validate <file> [--json]` | Check deck structure, Architecture DSL blocks, and themes. |
| `markdstage inspect <file> [--json]` | Report 1280x720 clipping diagnostics for the deck or one slide. |
| `markdstage capture <file> [--pages 2,4]` | Write 1280x720 PNG files; without `--pages` only clipped slides are captured. |
| `markdstage export <file> [--output slides.pdf]` | Produce the 16:9 PDF. |
| `markdstage guide <topic>` | Print the canonical MarkdStage authoring guide. |

Exit codes: `0` success, `1` usage error, `2` deck or input error, `3` no
Chromium-based browser, `4` rendering failure, `5` issues found with `--fail-on-issues`.

## References

Read the reference that matches the task before writing Markdown:

- `references/slide-format.md` — slide fragments, front matter, layouts.
- `references/themes.md` — built-in themes.
- `references/custom-themes.md` — custom theme authoring and `theme-file`.
- `references/theme-schema.md` — custom theme properties.
- `references/architecture-dsl.md` — Architecture DSL v1 diagrams.
- `references/architecture-schema.md` — Architecture DSL schema summary.
- `references/overview.md` — how MarkdStage works.

## Notes for Claude Code

Run the CLI through the shell. Presentation servers bind to loopback with an
unguessable per-process URL token, and every generated file stays inside the
workspace.
