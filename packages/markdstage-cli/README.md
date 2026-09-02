# MarkdStage CLI

Present, validate, inspect, capture, and export MarkdStage Markdown decks from a terminal — no GitHub Copilot canvas required.

The CLI reuses the very same Markdown parser, renderer, Architecture DSL
validation, theme handling, and PDF/PNG/PowerPoint pipeline as the MarkdStage canvas
Extension, so a deck looks identical in Copilot, MarkdStage Desktop, the CLI, and
exported PDF, or hybrid editable PowerPoint deck.

## Requirements

- Node.js 24 or later.
- An installed Microsoft Edge, Google Chrome, or Chromium. MarkdStage never
  downloads a browser.

## Install

```console
npx @markdstage/markdstage presentation slides.md
npx @markdstage/markdstage present slides.md
npm install --global @markdstage/markdstage
```

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
markdstage skill install --target claude
```

| Command | Description |
| --- | --- |
| `presentation` | Opens the presenter view with the current slide, next-slide preview, speaker notes, and navigation. Select **Start presentation** to open the synchronized audience-facing window; select **End presentation** to close it. `--watch` reloads on save, and `--no-open` serves the presenter URL without launching a browser. |
| `present` | Serves the deck on loopback and opens the MarkdStage presenter window: navigation, presenter view, next-slide preview, speaker notes, overview, custom themes, Mermaid, Architecture DSL, and local assets. `--watch` reloads on save while preserving the current slide, keeps the last valid deck when a save is broken, and enables Architecture editing. Without `--watch`, the source is read-only. `--no-open` serves the deck only. |
| `validate` | Checks deck structure, Architecture DSL blocks, themes, and theme paths. |
| `inspect` | Reports the same compact 1280x720 clipping diagnostics as the canvas `inspect_layout` action. `--slide <n>` limits it to one page, `--all` includes slides that fit, `--fail-on-issues` exits with code 5. |
| `capture` | Writes 1280x720 PNG files. Without `--pages` only the slides reported as clipped are captured. |
| `export` | Produces the same 16:9 PDF or hybrid editable PowerPoint as the canvas Extension. The `--output` extension selects the format; PDF remains the default. |
| `guide` | Prints the canonical `markdstage_guide` topics. |
| `skill` | Installs or checks the portable Agent Skills for Codex (`.agents/skills/markdstage/`), Claude Code (`.claude/skills/markdstage/`), and GitHub Copilot (`.github/skills/markdstage/`). Locally modified files are never overwritten without `--force`. |
| `help` | Shows the overview, or the help for one command. `markdstage help <command>` prints the same text as `markdstage <command> --help`. |

Global options: `--workspace <dir>`, `--theme <name>`, `--theme-file <path>`,
`--json`, `--help`, `--version`.

## Architecture editing

Run `markdstage present slides.md --watch` for the live authoring workflow. The
browser starts in viewing mode. Select the pencil control to move Architecture
elements; those placement changes are saved atomically to the matching
`architecture` fence. Select **Advanced edit** to add, update, duplicate,
reparent, or delete elements in the detailed designer, then select **Save**.

The server rejects a save if the Markdown changed outside the editor. Successful
saves reload the watched deck without changing the current slide. Presenter,
capture, inspect, and export views contain no editing UI.

```console
markdstage help
markdstage help capture
markdstage capture --help
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | usage error |
| 2 | deck or input error |
| 3 | environment error (no Chromium-based browser) |
| 4 | rendering or output failure |
| 5 | layout or validation issues were found |

## Security

- Presentation servers bind to loopback only and serve every route below an
  unguessable per-process URL token.
- Requests must carry a loopback `Host` header, and mutating routes require a
  same-origin `Origin` header. Mutable state is served with `no-store`.
- Deck files, assets, themes, and generated output stay inside the resolved
  workspace (canonical paths, symlink checks, and size limits included).

## Development

The package mirrors the canonical runtime from
`.github/extensions/markdstage/` into `shared/` before packing and testing:

```console
npm run sync    # refresh shared/
npm test        # node --test
npm run skills  # regenerate the repository Agent Skills
```

## License

MIT
