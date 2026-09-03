> 日本語版: [日本語](ja/cli.md)

# MarkdStage CLI

The MarkdStage CLI presents, validates, inspects, captures, and exports Markdown decks from a
terminal. It runs without the GitHub Copilot canvas, so it also works in Codex, Claude Code, CI
jobs, and remote shells.

The CLI uses the same Markdown parser, renderer, theme handling, Architecture DSL validation, and
PDF/PNG pipeline as the Canvas Extension, so a deck looks identical on every surface.

## Installation

See the [installation guide](installation.md) for requirements, online installation, and offline
tarball installation.

## Commands

```console
markdstage presentation slides.md
markdstage present slides.md --watch
markdstage validate slides.md --json
markdstage inspect slides.md --json
markdstage capture slides.md --pages 2,4
markdstage export slides.md --output slides.pdf
markdstage export slides.md --output slides.pptx
markdstage guide architecture-dsl
markdstage skill install --target codex
```

| Command | Description |
| --- | --- |
| `presentation` | Opens the presenter view with the current slide, next-slide preview, speaker notes, and navigation. Select **Start presentation** to open the synchronized audience-facing window; select **End presentation** to close it. `--watch` reloads on save, and `--no-open` serves the presenter URL without launching a browser. |
| `present` | Serves the deck on loopback and opens the presenter window: navigation, presenter view, next-slide preview, speaker notes, overview, custom themes, Mermaid, Architecture DSL, and local assets. `--watch` reloads the deck when the Markdown file is saved, preserves the current slide, keeps the last valid deck if a save is incomplete, and enables Architecture editing. Without `--watch`, the source is read-only. `--no-open` serves the deck without launching a browser. |
| `validate` | Checks deck structure, Architecture DSL blocks, themes, and theme paths. |
| `inspect` | Reports the same compact 1280x720 clipping diagnostics as the canvas `inspect_layout` action. Use `--slide <n>` for one page, `--all` to include slides that fit, and `--fail-on-issues` to exit with code 5. |
| `capture` | Writes 1280x720 PNG files. Without `--pages` only the slides reported as clipped are captured. |
| `export` | Produces the same 16:9 PDF or hybrid editable PowerPoint as the Canvas Extension. The `--output` extension selects the format; PDF remains the default. |
| `guide` | Prints the canonical MarkdStage authoring guide: `overview`, `slide-format`, `themes`, `custom-themes`, `theme-schema`, `architecture-dsl`, and `architecture-schema`. |
| `skill` | Installs or checks the portable Agent Skills. |
| `help` | Shows the overview, or the help for one command. `markdstage help <command>` prints the same text as `markdstage <command> --help`. |

Global options: `--workspace <dir>`, `--theme <name>`, `--theme-file <path>`, `--json`, `--help`,
and `--version`.

```console
markdstage help
markdstage help capture
markdstage capture --help
```

## Recommended authoring workflow

1. Define the source material, audience, objective, approximate length, theme, required diagrams,
   and final output.
2. Read only the guidance needed for the deck. Start with
   `markdstage guide slide-format`, then retrieve `themes`, `custom-themes`, or
   `architecture-dsl` when necessary.
3. Create the complete Markdown deck as the source of truth and separate slides with `---` after a
   blank line.
4. Run `markdstage validate slides.md --json` and fix structure, theme, and Architecture DSL errors
   before visual review.
5. Run `markdstage present slides.md --watch` while editing. The browser reloads on save, preserves
   the current slide, and keeps the last valid deck if a save is temporarily incomplete.
6. Run `markdstage inspect slides.md --json` to find fixed 16:9 clipping. Use `--slide <n>` after a
   localized change and `--fail-on-issues` in CI or other quality gates.
7. Run `markdstage capture slides.md` only after inspection. It captures clipped slides by default;
   use `--pages 2,4` when specific pages need visual review for balance, spacing, or diagrams.
8. Revise the Markdown and repeat validation plus targeted inspection until the deck is valid,
   unclipped, concise, and visually balanced.
9. Start `markdstage presentation slides.md`, run
   `markdstage export slides.md --output slides.pdf`, or use
   `markdstage export slides.md --output slides.pptx`.

Prefer structured validation and layout diagnostics over capturing every slide. Review every final
export before distribution.

## Architecture editing in watch mode

`markdstage present slides.md --watch` is the live authoring environment. The
browser still starts in normal viewing mode:

1. Select the pencil control on a slide containing Architecture DSL.
2. Drag an element or use the arrow keys. Placement edits are saved atomically
   to the matching `architecture` fence.
3. Select **Advanced edit** for the detailed designer. It can add, update,
   duplicate, reparent, and delete supported elements.
4. Select **Save** in the detailed designer to write its draft to Markdown.

If the source changed outside the editor, the save is rejected instead of
overwriting it. After a successful save, watch mode reloads the deck and keeps
the current slide. A temporarily incomplete Markdown save leaves the last valid
deck on screen.

`markdstage present slides.md` without `--watch` hides the editing control and
cannot change the source. Presenter, capture, inspect, and export output also
contains no editing UI. There is no separate preview command or edit option.

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
