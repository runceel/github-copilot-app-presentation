<p align="center">
  <img src="./assets/brand/markdstage-banner.svg" alt="MarkdStage — Markdown, ready for the stage." width="100%">
</p>

# MarkdStage

**Markdown, ready for the stage.**

MarkdStage is an open-source presentation tool that displays Markdown directly as slides and
supports editing, presenting, external-display synchronization, and PDF export. Its native GitHub
Copilot canvas Extension and standalone Windows desktop app share the same renderer.

## What matters to MarkdStage

- **Markdown is the source**: Keep `.md` as the source of truth instead of moving to a proprietary format
- **Write, then present immediately**: Open a file in the canvas or Desktop and it becomes a slide deck
- **Present technical content directly**: Supports code, Mermaid, Architecture DSL, images, tables, and speaker notes
- **Keep output consistent**: Use the same renderer in the canvas, presentation window, Desktop, and PDF
- **Keep controls focused on presenting**: Navigate with buttons, the keyboard, or Surface Pen in supported environments

## Two ways to use MarkdStage

| Surface | Purpose |
| --- | --- |
| **MarkdStage canvas** | Ask GitHub Copilot to summarize and format Markdown, or load it directly with the canvas 📂 button |
| **MarkdStage Desktop** | Present on Windows while viewing the Markdown, next slide, and speaker notes without opening GitHub Copilot |

## Use the canvas Extension

When you open this repository as a project, `.github/extensions/markdstage/` loads at project
scope. To use it in another repository, ask GitHub Copilot:

> Install MarkdStage at user scope from the following GitHub repository folder.
>
> `https://github.com/runceel/markdstage/tree/main/.github/extensions/markdstage`

The Extension runs local code in the user's environment. Review its contents before installation,
and specify a trusted release tag or commit SHA for a reproducible install.

### Minimal workflow

1. Edit `slides.md` and separate slides with `---` after a blank line.
2. Ask Copilot, "Present this deck using `slides.md`."
3. Navigate with **◀ ▶**, the **arrow keys**, or the **☰ slide list** in the MarkdStage canvas.

You can also open Markdown directly from the workspace with the canvas **📂** button or the `I`
key, without using AI. When calling `open_canvas` directly, use canvas ID **`MarkdStage`**.

```text
canvasId: MarkdStage
```

## Use MarkdStage Desktop

[MarkdStage Desktop](./apps/MarkdStage.Desktop/README.md) is a WinUI 3 app that opens Markdown
from a file picker. It displays the current and next slides with the current slide's speaker notes,
and launches a synchronized native presentation window.

Releases include the following portable artifacts for Windows x64 and ARM64:

```text
MarkdStage-win-x64.zip
MarkdStage-win-arm64.zip
```

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
| `slides.md` | Sample deck that demonstrates the features |

## Breaking changes in v2

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
