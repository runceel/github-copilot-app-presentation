<p align="center">
  <img src="../../assets/brand/markdstage-banner.svg" alt="MarkdStage — Markdown, ready for the stage." width="100%">
</p>

> 日本語版: [日本語](ja/README.md)

# MarkdStage user guide

MarkdStage turns Markdown into presentation-ready slides. The same Markdown deck can be opened in
the GitHub Copilot Canvas Extension, the standalone Windows Desktop app, or the command-line CLI.

![A Markdown deck open in the MarkdStage Canvas Extension](images/canvas-main.png)

## Choose how you want to work

| Surface | Best for | Main capabilities |
| --- | --- | --- |
| [**Canvas Extension**](canvas-extension.md) | Creating and revising a deck with GitHub Copilot | Markdown import, live refresh, presenter view, Architecture editing, 16:9 validation, and PDF and editable PowerPoint export |
| [**MarkdStage Desktop**](desktop.md) | Presenting on Windows without opening GitHub Copilot | Current/next slide previews, speaker notes, live refresh, slide overview, and a synchronized audience window |
| [**MarkdStage CLI**](cli.md) | Working in a terminal, CI, Codex, or Claude Code | Presenting with live reload, deck validation, 16:9 clipping diagnostics, PNG capture, PDF and editable PowerPoint export, and portable Agent Skills |

All three surfaces support Markdown, syntax-highlighted code, Mermaid, Architecture DSL, local
images, speaker notes, and the built-in dark, light, and Microsoft themes.

## Start here

1. [Install MarkdStage](installation.md) for Canvas Extension, CLI, or Desktop.
2. Follow the [quick start](quick-start.md) to open your first deck.
3. Learn how to [create slides with GitHub Copilot](ai-assisted-authoring.md).
4. Complete the [GitHub Copilot hands-on](copilot-hands-on.md).
5. Learn the [Markdown authoring format](markdown-authoring.md).
6. Review [themes and layouts](themes-and-layouts.md).
7. Add [diagrams and media](diagrams-and-media.md).
8. Prepare the [presentation and PDF or PowerPoint output](presenting-and-export.md).

## Feature guide

| Topic | Guide |
| --- | --- |
| Install the Canvas Extension, CLI, or Desktop app | [Installation](installation.md) |
| AI-assisted creation, schemas, diagnostics, and targeted visual review | [Create slides with GitHub Copilot](ai-assisted-authoring.md) |
| Recorded prompt-to-PDF exercise with generated artifacts | [GitHub Copilot hands-on](copilot-hands-on.md) |
| Canvas toolbar, import, live refresh, slide list, and presenter view | [Canvas Extension](canvas-extension.md) |
| Windows presenter, speaker notes, overview, fullscreen, and Surface Pen | [MarkdStage Desktop](desktop.md) |
| Separators, front matter, content sizes, notes, code, tables, and assets | [Markdown authoring](markdown-authoring.md) |
| Dark, light, Microsoft, custom themes, and slide layouts | [Themes and layouts](themes-and-layouts.md) |
| Mermaid, Architecture DSL, images, and visual Architecture editing | [Diagrams and media](diagrams-and-media.md) |
| Audience windows, synchronized navigation, clipping checks, and PDF and PowerPoint export | [Presenting and export](presenting-and-export.md) |
| Terminal commands, exit codes, JSON output, and Agent Skills | [MarkdStage CLI](cli.md) |
| Common setup, loading, rendering, and editing problems | [Troubleshooting](troubleshooting.md) |

## Requirements

- **Canvas Extension:** GitHub Copilot with the MarkdStage extension installed for the current
  project or user.
- **Desktop:** Windows, Microsoft Edge WebView2 Runtime, and the MarkdStage Desktop portable
  package for your processor architecture.
- **CLI:** Node.js 24 or later and an installed Microsoft Edge, Google Chrome, or Chromium.
- **Deck source:** A `.md` or `.markdown` file inside the current workspace.

[Open the quick start →](quick-start.md)
