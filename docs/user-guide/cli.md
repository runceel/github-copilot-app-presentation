> 日本語版: [日本語](ja/cli.md)

# MarkdStage CLI

The MarkdStage CLI presents, validates, inspects, captures, and exports Markdown decks from a
terminal. It runs without the GitHub Copilot canvas, so it also works in Codex, Claude Code, CI
jobs, and remote shells.

The CLI uses the same Markdown parser, renderer, theme handling, Architecture DSL validation, and
PDF/PNG pipeline as the Canvas Extension, so a deck looks identical on every surface.

## Requirements

- Node.js 20.11 or later.
- An installed Microsoft Edge, Google Chrome, or Chromium. MarkdStage never downloads a browser.

## Install

```console
npx @runceel/markdstage present slides.md
npm install --global @runceel/markdstage
```

## Commands

```console
markdstage present slides.md --watch
markdstage validate slides.md --json
markdstage inspect slides.md --json
markdstage capture slides.md --pages 2,4
markdstage export slides.md --output slides.pdf
markdstage guide architecture-dsl
markdstage skill install --target codex
```

| Command | Description |
| --- | --- |
| `present` | Serves the deck on loopback and opens the presenter window: navigation, presenter view, next-slide preview, speaker notes, overview, custom themes, Mermaid, Architecture DSL, and local assets. `--watch` reloads the deck when the Markdown file is saved, preserving the current slide and keeping the last valid deck if a save is incomplete. `--no-open` serves the deck without launching a browser. |
| `validate` | Checks deck structure, Architecture DSL blocks, themes, and theme paths. |
| `inspect` | Reports the same compact 1280x720 clipping diagnostics as the canvas `inspect_layout` action. Use `--slide <n>` for one page, `--all` to include slides that fit, and `--fail-on-issues` to exit with code 5. |
| `capture` | Writes 1280x720 PNG files. Without `--pages` only the slides reported as clipped are captured. |
| `export` | Produces the same 16:9 PDF as the Canvas Extension. |
| `guide` | Prints the canonical MarkdStage authoring guide: `overview`, `slide-format`, `themes`, `custom-themes`, `theme-schema`, `architecture-dsl`, and `architecture-schema`. |
| `skill` | Installs or checks the portable Agent Skills. |

Global options: `--workspace <dir>`, `--theme <name>`, `--theme-file <path>`, `--json`, `--help`,
and `--version`.

## Typical workflow

1. Write the deck in Markdown and separate slides with `---` after a blank line.
2. `markdstage validate slides.md` — check structure, themes, and Architecture DSL.
3. `markdstage inspect slides.md` — find slides that would be clipped in the 16:9 PDF.
4. `markdstage capture slides.md` — review the clipped slides as PNG files.
5. `markdstage present slides.md --watch` or `markdstage export slides.md`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | usage error |
| 2 | deck or input error |
| 3 | environment error (no Chromium-based browser) |
| 4 | rendering or output failure |
| 5 | layout or validation issues were found |

`--json` prints machine-readable output for every command, including errors, so CI jobs and agents
can act on the result.

## Agent Skills

`markdstage skill install` writes a portable Agent Skill that teaches an AI agent the MarkdStage
Markdown format and the CLI commands. Reference files are generated from the same guide topics as
`markdstage guide`, so they never drift from the product.

| Target | Directory |
| --- | --- |
| `codex` | `.agents/skills/markdstage/` |
| `claude` | `.claude/skills/markdstage/` |
| `copilot` | `.github/skills/markdstage/` (Canvas adapter included) |

```console
markdstage skill install --target codex
markdstage skill install --target claude,codex --root .
markdstage skill check --target all
```

Locally modified files are reported as conflicts and are never overwritten without `--force`.

## Security

- Presentation servers bind to loopback only and serve every route below an unguessable
  per-process URL token.
- Requests must carry a loopback `Host` header, mutating routes require a same-origin `Origin`
  header, and mutable state is served with `no-store`.
- Deck files, assets, themes, and generated output stay inside the resolved workspace. Use
  `--workspace <dir>` to set it explicitly; otherwise the Git repository root, or the folder that
  holds the Markdown file, is used.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `PDF export requires Microsoft Edge, Google Chrome, or Chromium.` (exit code 3) | Install a Chromium-based browser, or run the command on a machine that has one. |
| `... is outside the workspace.` (exit code 2) | Move the file into the workspace, or pass `--workspace` with the directory that contains it. |
| The deck does not reload while presenting | Re-run `present` with `--watch`. |
| Slides are clipped in the PDF | Run `markdstage inspect` and shorten the reported slides, or change their layout. |
