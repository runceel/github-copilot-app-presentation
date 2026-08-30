# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Developers, technical speakers, and documentation authors who write in Markdown and need to turn the same source into a polished presentation. The primary usage scene is preparing and delivering a technical talk without moving content into a separate slide-authoring format.

## Product Purpose

MarkdStage turns Markdown into a presentation that can be previewed, edited, navigated, presented on another screen, and exported to PDF. Success means the author keeps Markdown as the source of truth while moving from writing to presenting with minimal ceremony.

## Positioning

MarkdStage combines an AI-addressable GitHub Copilot canvas with a standalone Windows presenter built on the same renderer. A single Markdown deck can include code, Mermaid, architecture diagrams, local assets, themes, and speaker notes while remaining directly editable as text.

## Operating Context

- A GitHub Copilot canvas Extension renders decks inside a repository workspace.
- An optional Skill converts or summarizes Markdown into slide-sized fragments and opens the canvas.
- A WinUI 3 desktop app opens Markdown independently of GitHub Copilot and provides current-slide, next-slide, and speaker-note views.
- Presentations are controlled through canvas controls, keyboard navigation, and supported Surface Pen actions.
- Decks may be exported as 16:9 PDF files.

## Capabilities and Constraints

- Markdown remains the source format and uses `---` slide separators plus optional front matter.
- The renderer supports GFM content, syntax-highlighted code, Mermaid, Architecture DSL, local images, speaker notes, and custom themes.
- Canvas, presenter, and PDF output must preserve equivalent slide rendering.
- Local Extension distribution must remain self-contained with no runtime npm dependency.
- Workspace path and asset access stay constrained by the existing security model.
- The primary canvas ID is `MarkdStage`; the former `presentation` ID will not remain as an alias.
- Existing action concepts such as loading a deck, navigating, opening a presenter, and exporting PDF remain stable.

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
- `.github/extensions/markdstage/` contains the production canvas Extension and renderer.
- `apps/MarkdStage.Desktop/` contains the production Windows desktop application.
- Automated unit, schema, editing, visual, accessibility, performance, PDF, and .NET tests exist.
- No customer testimonials, usage metrics, or commercial claims are available and none should be invented.

## Product Principles

1. Keep Markdown as the source of truth.
2. Make the transition from writing to presenting immediate.
3. Keep authoring, live presentation, and exported output visually consistent.
4. Support technical content without forcing authors into a proprietary format.
5. Add product branding to the application experience, never as an unsolicited watermark on user decks.

## Accessibility & Inclusion

Keyboard navigation, visible focus, semantic slide output, readable contrast, reduced interface ambiguity, and automated accessibility checks are release requirements. Brand changes must preserve existing canvas and desktop accessibility behavior.
