<p align="center">
  <a href="https://github.com/runceel/markdstage">
    <img src="./assets/brand/markdstage-banner.svg" alt="MarkdStage - Markdown, ready for the stage." width="100%">
  </a>
</p>

<h1 align="center">MarkdStage</h1>

<p align="center">
  <strong>Markdown, ready for the stage.</strong>
</p>

<p align="center">
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/runceel/markdstage/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/runceel/markdstage/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-FFB547?labelColor=0B1020"></a>
  <img alt="Source format: Markdown" src="https://img.shields.io/badge/source-Markdown-F7F4ED?labelColor=0B1020">
  <img alt="Windows: x64 and ARM64" src="https://img.shields.io/badge/Windows-x64%20%7C%20ARM64-F7F4ED?labelColor=0B1020">
</p>

<p align="center">
  <a href="#use-the-canvas-extension">Canvas Extension</a> |
  <a href="#use-markdstage-desktop">Desktop</a> |
  <a href="#see-markdown-on-stage">Examples</a> |
  <a href="#markdown-format">Markdown format</a> |
  <a href="#documentation">Documentation</a> |
  <a href="https://github.com/runceel/markdstage/releases">Releases</a>
</p>

MarkdStage is an open-source presentation tool that turns Markdown directly into polished slides,
with editing, synchronized presenting, speaker notes, and PDF export. Its native GitHub Copilot
canvas Extension and standalone Windows app share one renderer, so authors can keep Markdown as
the source of truth from the first draft to the stage.

## Why MarkdStage

- **Markdown is the source**: Keep `.md` as the source of truth instead of moving to a proprietary format
- **Write, then present immediately**: Open a file in the canvas or Desktop and it becomes a slide deck
- **Present technical content directly**: Supports code, Mermaid, Architecture DSL, images, tables, and speaker notes
- **Keep output consistent**: Use the same renderer in the canvas, presentation window, Desktop, and PDF
- **Validate PDF fit before export**: Preview the fixed 16:9 layout, inspect clipping, and capture only pages that need visual review
- **Keep controls focused on presenting**: Navigate with buttons, the keyboard, or Surface Pen in supported environments

## See Markdown on stage

The same Markdown renderer powers the GitHub Copilot canvas, presenter window, Desktop app, and
PDF export.

<table>
  <tr>
    <td width="50%">
      <img src="./assets/readme/simple-slide.png" alt="A standard Markdown slide rendered by MarkdStage">
    </td>
    <td width="50%">
      <img src="./assets/readme/architecture-dsl.png" alt="An Architecture DSL diagram rendered in a MarkdStage slide">
    </td>
  </tr>
  <tr>
    <td valign="top">
      <strong>Standard Markdown</strong><br>
      Write headings, lists, emphasis, code, tables, and images directly. Mermaid is also available
      when automatic diagram layout is useful.
    </td>
    <td valign="top">
      <strong>Architecture DSL</strong><br>
      Put JSON in an <code>architecture</code> fence for stable groups, icons, placement, and
      connector routing.
    </td>
  </tr>
</table>

Because the MarkdStage canvas contributes the active deck and Architecture DSL to the GitHub
Copilot App context, you can describe the diagram you want and ask Copilot to write or revise the
Markdown for you.

For visual changes, import source Markdown with **📂**, choose **✎ → Advanced editing**, and use the
dedicated Architecture Editor. It can add, remove, arrange, and inspect nodes, groups, images, and
connectors; changes remain a draft until **Save** writes them back to Markdown.

<p align="center">
  <img src="./assets/readme/architecture-editor.png" alt="The MarkdStage Architecture Editor with an API node selected" width="100%">
</p>

## Two ways to use MarkdStage

| Surface | Purpose |
| --- | --- |
| **MarkdStage canvas** | Ask GitHub Copilot to summarize and format Markdown, or load it directly with the canvas 📂 button |
| **MarkdStage Desktop** | Present on Windows while viewing the Markdown, next slide, and speaker notes without opening GitHub Copilot |

## Use the canvas Extension

When you open this repository as a project, `.github/extensions/markdstage/` loads at project
scope. To install the current **[v2.1.2 release](https://github.com/runceel/markdstage/releases/tag/v2.1.2)**
at user scope in another repository, ask GitHub Copilot:

> Install MarkdStage at user scope from the following GitHub repository folder.
>
> `https://github.com/runceel/markdstage/tree/v2.1.2/.github/extensions/markdstage`

The Extension runs local code in the user's environment. Review its contents before installation,
and use a trusted release tag or commit SHA for a reproducible install. The `main` branch tracks
the latest development version.

### Minimal workflow

1. Edit `slides.md` and separate slides with `---` after a blank line.
2. Ask Copilot, "Present this deck using `slides.md`."
3. Navigate with **◀ ▶**, the **arrow keys**, or the **☰ slide list** in the MarkdStage canvas.
4. Use **16:9** before PDF export. Copilot can run `inspect_layout` first and generate selected PNG previews only when needed.

You can also open Markdown directly from the workspace with the canvas **📂** button or the `I`
key, without using AI. In a Git repository, the workspace is the repository root; otherwise it
is the folder opened for the current session. When calling `open_canvas` directly, use canvas ID
**`MarkdStage`**.

```text
canvasId: MarkdStage
```

## Use MarkdStage Desktop

[MarkdStage Desktop](./apps/MarkdStage.Desktop/README.md) is a WinUI 3 app that opens Markdown
from a file picker. It displays the current and next slides with the current slide's speaker notes,
and launches a synchronized native presentation window.

The current **[v2.1.2 release](https://github.com/runceel/markdstage/releases/tag/v2.1.2)**
includes portable builds and SHA-256 checksum files for Windows x64 and ARM64:

- [MarkdStage-win-x64.zip](https://github.com/runceel/markdstage/releases/download/v2.1.2/MarkdStage-win-x64.zip)
- [MarkdStage-win-arm64.zip](https://github.com/runceel/markdstage/releases/download/v2.1.2/MarkdStage-win-arm64.zip)

## Markdown format

```markdown
---
title: Sample
theme: dark
layout: title
---

# Markdown, ready for the stage.

---

## Second slide

- Use standard Markdown
- Write code and Mermaid directly
```

The leading front matter supplies shared deck settings. Per-slide front matter can override values
such as `layout`, `size`, and `theme`. Put speaker notes in a top-level HTML comment on each slide;
they appear only in presenter view.

## Repository structure

| Path | Contents |
| --- | --- |
| `.github/extensions/markdstage/` | Canvas Extension, renderer, bundled open-source software, and schemas |
| `.github/skills/markdstage/SKILL.md` | Skill that formats Markdown into slide fragments and opens MarkdStage |
| `apps/MarkdStage.Desktop/` | WinUI 3 desktop app |
| `assets/brand/` | MarkdStage logo, lockup, and README banner |
| `assets/readme/` | Rendered slide and Architecture Editor images used in this README |
| `slides.md` | Sample deck that demonstrates the features |

## Breaking changes in v2.0.0

The MarkdStage migration does not provide compatibility aliases for the former brand.

| Previous | New |
| --- | --- |
| canvas ID `presentation` | canvas ID `MarkdStage` |
| tool `presentation_guide` | tool `markdstage_guide` |
| `.github/extensions/presentation/` | `.github/extensions/markdstage/` |
| `.github/skills/presentation/` | `.github/skills/markdstage/` |
| `Presentation-win-*.zip` | `MarkdStage-win-*.zip` |

Existing Markdown syntax, themes, Architecture DSL, and action contracts such as `load_deck` and
`goto_slide` remain unchanged.

## Documentation

- [User guide](./docs/user-guide/README.md)
- [Create slides with GitHub Copilot](./docs/user-guide/ai-assisted-authoring.md)
- [GitHub Copilot hands-on](./docs/user-guide/copilot-hands-on.md)
- [MarkdStage Skill](./.github/skills/markdstage/SKILL.md)
- [Canvas Extension specification and actions](./.github/extensions/markdstage/README.md)
- [MarkdStage Desktop](./apps/MarkdStage.Desktop/README.md)
- [Custom theme authoring](./.github/extensions/markdstage/docs/custom-theme-authoring.md)
- [Product principles](./PRODUCT.md)
- [Brand and design system](./DESIGN.md)
- [Release process](./.github/RELEASING.md)
- [Third-party notices](./.github/extensions/markdstage/THIRD-PARTY-NOTICES.md)
- [MIT License](./LICENSE)

## License

The original portions of this repository are released under the MIT License. See
[THIRD-PARTY-NOTICES.md](./.github/extensions/markdstage/THIRD-PARTY-NOTICES.md) for licenses and
copyright notices for bundled open-source software.
