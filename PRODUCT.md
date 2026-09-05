# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Developers, technical speakers, and documentation authors who write in Markdown and need to turn the same source into a polished presentation. The primary usage scene is preparing and delivering a technical talk without moving content into a separate slide-authoring format. A second scene is authoring in Markdown under version control while the surrounding organization reviews, approves, or redistributes the result as an editable `.pptx` file.

## Product Purpose

MarkdStage turns Markdown into a presentation that can be previewed, edited, navigated, presented on another screen, and exported to PDF or to editable PowerPoint. Success means the author keeps Markdown as the source of truth while moving from writing to presenting with minimal ceremony, and never has to abandon that source to satisfy a PowerPoint-based review or distribution workflow.

## Positioning

MarkdStage renders one Markdown deck through a single renderer delivered on three first-party surfaces: an AI-addressable GitHub Copilot canvas, a standalone Windows presenter, and a host-independent command-line interface. A single Markdown deck can include code, Mermaid, architecture diagrams, local assets, themes, and speaker notes while remaining directly editable as text. Its most differentiated output is hybrid editable PowerPoint export, in which text, lists, tables, fenced code, and architecture diagrams arrive as native PowerPoint objects rather than flat slide images.

## Operating Context

- A GitHub Copilot canvas Extension renders decks inside a repository workspace.
- An optional Skill converts or summarizes Markdown into slide-sized fragments and opens the canvas.
- A WinUI 3 desktop app hosts the same renderer in a WebView2 shell, opens Markdown independently of GitHub Copilot, and provides current-slide, next-slide, and speaker-note views.
- A Node.js command-line interface presents, validates, inspects, captures, and exports the same decks without any canvas host, so it also runs in Codex, Claude Code, CI jobs, and remote shells, and it installs portable Agent Skills.
- Presentations are controlled through canvas controls, keyboard navigation, and supported Surface Pen actions.
- Decks may be exported as 16:9 PDF files or as hybrid editable PowerPoint presentations.
- The canvas can preview the PDF-equivalent fixed 16:9 surface and warn when
  content will be clipped, and the CLI reports the same diagnostics as machine-readable output.
- A third-party community project provides a native macOS presenter. It is not built, released, or supported from this repository.

## Capabilities and Constraints

- Markdown remains the source format and uses `---` slide separators plus optional front matter.
- The renderer supports GFM content, syntax-highlighted code, Mermaid, Architecture DSL, local images, speaker notes, and custom themes.
- Canvas, desktop, CLI, PDF, and PowerPoint output must preserve equivalent slide rendering.
- PowerPoint export must emit supported content as native PowerPoint objects, keep fenced code editable with its syntax highlighting, place speaker notes in the notes pane, and report every element degraded to a fallback picture instead of omitting it silently.
- AI-facing layout inspection should return compact geometry first and generate
  1280×720 PNGs only for pages that require visual analysis.
- Local Extension distribution must remain self-contained with no runtime npm dependency.
- The CLI is published to npm and must stay usable without the Copilot canvas, with machine-readable output and stable exit codes for agents and CI.
- Workspace path and asset access stay constrained by the existing security model.
- The primary canvas ID is `MarkdStage`; the former `presentation` ID will not remain as an alias.
- Existing action concepts such as loading a deck, navigating, opening a presenter, and exporting PDF or PowerPoint remain stable.

## Brand Commitments

- Product name: **MarkdStage**
- Pronunciation: **marked stage**
- Primary tagline: **Markdown, ready for the stage.**
- Alternate tagline: **Markdown, take the stage.**
- The brand is independent of the GitHub and Copilot names while accurately describing integrations.
- The visual identity combines a Markdown `#` mark with a stage spotlight.
- The confirmed color direction is Midnight Ink with Spotlight Amber.
- The brand voice is creator-first, focused, confident, technical, and approachable.

## Evidence on Hand

- `README.md` documents the current feature set and distribution model.
- `slides.md` is a working demonstration deck.
- `.github/extensions/markdstage/` contains the production canvas Extension and renderer, and is the single source of truth mirrored to the other surfaces.
- `apps/MarkdStage.Desktop/` contains the production Windows desktop application.
- `packages/markdstage-cli/` contains the published `@markdstage/markdstage` command-line interface and the portable Agent Skills it installs.
- Automated unit, schema, editing, visual, accessibility, performance, PDF, PowerPoint, cross-language parser conformance, and .NET tests exist.
- No customer testimonials, usage metrics, or commercial claims are available and none should be invented.

## Product Principles

1. Keep Markdown as the source of truth.
2. Make the transition from writing to presenting immediate.
3. Keep authoring, live presentation, and exported output visually consistent.
4. Support technical content without forcing authors into a proprietary format.
5. Add product branding to the application experience, never as an unsolicited watermark on user decks.

## Accessibility & Inclusion

Keyboard navigation, visible focus, semantic slide output, readable contrast, reduced interface ambiguity, and automated accessibility checks are release requirements. Brand changes must preserve existing canvas and desktop accessibility behavior.
