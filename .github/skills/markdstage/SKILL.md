---
name: markdstage
description: 'Turn Markdown files into slides and present them in the MarkdStage canvas. Use for requests such as "present slides.md," "present this Markdown," "present @name.md," "use a Microsoft style," or "turn this file into slides." When the source is prose-heavy, summarize and restructure each page as a heading with bullets. Generate the complete deck once at startup and pass every slide to the open input of canvas ID MarkdStage. Navigation then stays inside the canvas through buttons, arrow keys, the slide list, and Surface Pen on supported Windows systems. Use when the user wants to turn a Markdown file into a presentation and present it with MarkdStage.'
---

# MarkdStage skill

Create all small Markdown slide fragments at presentation startup and pass them
together in the `slides` field of the canvas `open` input. The first slide is
therefore visible immediately, without a "deck not loaded" placeholder.
After registration, navigation is handled entirely by the canvas controls,
keyboard, and Surface Pen on supported systems. Do not run an `ask_user`
navigation loop. Call `load_deck` only when content or theme changes during a
presentation.

## Distribution and installation

This file is an optional skill. The presentation runtime is the extension in
`.github/extensions/markdstage/`, which must be installed first. To install it
from the public repository at user scope, ask Copilot:

> Install the MarkdStage canvas Extension from
> `https://github.com/runceel/markdstage/tree/main/.github/extensions/markdstage`
> at user scope.

For reproducible installation, replace `main` with a release tag such as
`v1.0.0` or a verified commit SHA. The extension executes local code, so review
the diff and tag before installation. Put this skill at
`.github/skills/markdstage/SKILL.md` in a project or copy it to the user's skill
scope. See the repository README and `THIRD-PARTY-NOTICES.md` for ZIP
distribution, Gist single-file limits, and split Mermaid assets.

When only the extension is installed, its bundled `markdstage_guide` tool
provides equivalent slide-format, theme, and Architecture DSL guidance.
Retrieve the required topic before authoring Markdown for the MarkdStage canvas.

## Core principles ⚡

1. **Generate only a small Markdown fragment for each slide.** The extension
   handles HTML, CSS, theme, layout, page numbers, and animation through
   `marked`. Never generate a complete HTML document.
2. **Generate the full deck once, when presentation is requested,** and pass it
   through the `slides` field of `open_canvas` input. Use `load_deck` only for
   changes during the presentation. Do not regenerate Markdown on every page.
3. **Leave navigation to the canvas and input devices.** Users navigate with
   **◀ / ▶**, arrow keys, the slide list (**☰**), and the Surface Pen tail
   button on supported Windows systems. Do not use `ask_user` as a page loop.

A slide should be no larger than this:

```markdown
---
deck: Presentation title
kicker: Section name
page: 2
total: 6
---
## Slide heading

- Bullet **one**
- Bullet two
```

Build an array containing every fragment and pass it to `open_canvas`. The
first slide appears as soon as the canvas opens; canvas controls handle the rest.

### AI-generated decks versus 📂 import

The extension also lets users import workspace Markdown directly with the
canvas 📂 button. This deterministic split does not involve AI.

- **Use 📂 import** when the source already uses slide syntax: pages separated
  by `---` after a blank line, with any required front matter. Per-page Slidev
  front matter is supported, and initial file front matter is inherited while
  `layout: title` applies only to slide one. At import time, users choose
  **Keep imported snapshot** (default) or **Update automatically on save**.
  Source-backed decks can switch modes from the toolbar and retain the last
  valid deck if watching fails.
- **Use this skill to build the deck** when source pages are prose-heavy and
  require summarization into headings and bullets, when page division is
  unsuitable, or when the requested theme and layout must be applied.

When a user asks AI to present a file, follow this skill and generate the deck.
The 📂 button is a separate user workflow, not an AI shortcut.

## Processing model

```text
Presentation startup (once)
  AI -> generate an array of small Markdown fragments for all slides
          | open_canvas("MarkdStage", { input: { slides: [...] } })
          v
  The extension stores the deck during open and displays slide one immediately

Navigation (entirely inside the canvas)
  User -> ◀ / ▶, arrow keys, or ☰ slide list
          | canvas posts the index to POST /navigate
          v
  Extension renders the stored fragment with marked, sanitizes it, and applies the theme
          | SSE
          v
  Native canvas iframe updates without agent involvement
```

- Generate and register the complete deck only once; use `load_deck` for
  mid-presentation replacement.
- The extension owns rendering, decoration, page numbers, Mermaid, emoji, and
  navigation UI. No external server or manually started `localhost` port is
  required.
- One deck is displayed at a time and is intended for a single presenter.
- The project-scoped extension lives at `.github/extensions/markdstage/`.

## Main actions

Start by opening the complete deck through `open_canvas` with
`canvasId: "MarkdStage"`. Pass `slides` and optional `index`, `theme`, and
`sourceName` in `input`. `sourceName` must be the source Markdown's
workspace-relative path; it anchors adjacent `assets/`, Markdown-relative
`theme-file` lookup, and the canvas printer's `<source-name>.pdf` output.

| Action | Purpose |
| --- | --- |
| `load_deck` | Replace or reload the registered deck. Pass `slides`, optional zero-based `index` (default `0`), and optional deck theme (`dark`, `light`, `microsoft`, or `custom`; default `dark`). Use only for content or theme changes after startup. |
| `goto_slide` | Select a zero-based `index` in the registered deck. Out-of-range values are clamped. Normal navigation does not need this action; use it only for explicit chat requests such as "go to page 3." |
| `show_slide` | Temporarily replace one slide. Use for a one-off display or when no deck is registered, not for normal presentations. |
| `get_architecture_errors` | Return Architecture DSL errors for the whole deck or one zero-based `index`. Each error includes `slideIndex`, one-based `page`, `blockIndex`, `architecture`, `code`, and `message`; temporary `show_slide` content is included. |
| `open_presenter` | Open the current deck in a synchronized, movable, resizable 1280×720 Edge / Chrome / Chromium app-mode window. Use browser or OS controls (`F11` on Windows) for full screen. Surface Pen never launches it. |
| `close_presenter` | Close the external presenter window. |
| `inspect_layout` | Check the PDF-equivalent fixed 1280×720 layout before export. It returns only clipped pages by default, with overflow dimensions and bounded element hints. Pass a zero-based `index` for one page or `includeFits: true` when complete measurements are required. Prefer this action over image analysis. |
| `capture_slides` | Create 1280×720 PNG files only when visual inspection is required. Pass zero-based `indexes`, or omit them to capture only pages found by `inspect_layout`. Optional `outputDirectory` is workspace-relative. The result contains file paths rather than inline image data. |
| `export_pdf` | Export the current deck as a 16:9 PDF. Optional `outputPath` is a workspace-relative `.pdf` path; default is `markdstage.pdf`. Optional `theme` applies only to PDF. The canvas printer derives a name from `sourceName`. |
| `edit_architecture` | Toggle the lightweight Architecture placement mode for node dragging, keyboard movement, layout detachment, Undo, and Redo. Each operation is saved immediately under the stable placement contract. |
| `reset` | Clear slide and deck state and return to the waiting view. |

`load_deck` and `goto_slide` return `{ ok, version, index, total }`;
`goto_slide` also returns `changed`. For non-scrolling/PDF decks, call
`inspect_layout` after loading or revising slides. Use `capture_slides` only for
pages whose appearance cannot be judged from the layout diagnostics. `export_pdf` returns
`{ ok, path, total, theme, bytes }`. Before PDF export, reload the complete deck
if its source Markdown changed.

### Full Architecture editing

Keep `✎` / `edit_architecture` for position adjustments. Use the separate
`architecture-editor` canvas to add or delete nodes, groups, images, or
connectors and to edit sizing, parentage, layout, style, ports, and routing.

- Users open it from **Advanced editing** inside `✎` after importing Markdown
  through 📂.
- Agents open canvas ID `"architecture-editor"` with
  `input: { sourcePath, blockIndex, theme? }`. `sourcePath` is
  workspace-relative and `blockIndex` is zero-based across the Markdown file.
- Changes remain in a draft until the canvas **Save** control or `save` action.
- Context menus on diagram elements, empty space, and the tree support add,
  connect, duplicate, delete, front/back ordering, Undo/Redo, and Save.
  Group menus provide `none`, `row`, `column`, `grid`, and `layered` layouts.
  A child never offers an action that detaches its parent group's layout.
  Nodes, groups, and images added from empty space are centered at the context
  menu position.
- Keyboard users open the same menu with `Shift+F10` or the Context Menu key,
  move with arrows, open a submenu with `ArrowRight`, return with `ArrowLeft`,
  execute with Enter/Space, and close with Escape.
- Add a standalone image from the toolbar or an empty-space/group menu. The
  inspector's **Select image from assets/** uses the same picker for node icons.
  The picker searches Markdown-adjacent then workspace-root `assets/`.
  Imported SVG / PNG / WebP / JPG / JPEG files of at most 10 MB are copied to
  workspace-root `assets/`. Name collisions become `name-2.ext`. Removing or
  undoing a diagram image never deletes the shared asset file.
- External-change conflicts never overwrite the source. To restart from the
  file, call `reload` with `{ discard: true }`.
- The editor modifies only existing `architecture` blocks; it does not create
  new blocks.
- **Advanced editing** is disabled for non-source-backed decks created directly
  by `open` / `load_deck`, because they have no safe write-back target.

These workflows do not alter the Architecture DSL v1 grammar or the stable save
contract of the placement editor.

## Slide fragment format

Each `slides` element contains optional YAML-like front matter delimited by
`---`, followed by GFM-compatible Markdown.

| Key | Role |
| --- | --- |
| `deck` | Deck name in the left footer |
| `kicker` | Small label above the heading |
| `page` | One-based current page; shown only together with `total` |
| `total` | Total page count |
| `title` | Browser-tab title; defaults to `deck` |
| `layout` | `title` for the cover, `section` for a section divider, `backcover` for the back cover, or `center` to vertically center heading and body together. Omit for top-aligned standard slides. |
| `size` | `auto` (default), `normal`, `large`, or `xlarge`. `auto` safely enlarges only spacious standard slides. |
| `theme` | Per-slide override: `dark`, `light`, `microsoft`, or `custom`. An explicit canvas theme has precedence. |
| `theme-file` | CSS custom-property file for `custom`, resolved first beside the source Markdown and then from the workspace root. A sibling `theme.json` loads automatically. |
| `logo` | Back-cover text at top left. Overrides the `theme.json` logo; empty hides it. |
| `copyright` | Back-cover copyright text at bottom left. Overrides `theme.json`; empty hides it. |

Use normal Markdown: headings, lists, emphasis, inline and fenced code, block
quotes, tables, links, images, `mermaid`, `architecture`, and emoji. Write raw
Markdown; do not generate HTML or pre-escape it.

Put Slidev / Marp-style speaker notes in a top-level HTML comment at the end of
the slide. Notes support Markdown and appear only in the canvas and MarkdStage
Desktop presenter view, not on standard slides, the external presenter, or PDF.

```markdown
## Demo

- Key point shown on screen

<!--
Explain the **operation sequence** here.
-->
```

The first H1/H2 in a standard slide is fixed in the top title region. Later
headings stay in the body. Cover, section, and back-cover layouts retain their
specialized positioning. Add a language such as `csharp`, `json`, or `diff` to
a code fence for highlight.js syntax coloring.

## Themes

Choose `dark`, `light`, `microsoft`, or `custom`. Precedence is:
**explicit canvas `theme` > Markdown front matter > `dark`**.

| Theme | Appearance |
| --- | --- |
| `dark` | Default dark navy background with bright accents |
| `light` | Neutral, bright, white-based theme |
| `microsoft` | Built-in Microsoft / Fluent color preset |
| `custom` | Brand or organizational template defined by CSS custom properties loaded through `themeFile` or `theme-file` |

A custom theme can be a self-contained folder:

```markdown
---
theme: custom
theme-file: themes/brand/theme.css
---
## Brand theme
```

`theme.css` contains declarations such as `--bg: #101820;` only. Selectors and
`url()` are prohibited. Optional cover/background logos and copyright metadata
go in a sibling `theme.json`, with assets under that folder's `assets/`.

Theme lookup tries the source Markdown folder before the workspace root. Always
pass `sourceName` to `open` / `load_deck`. Every theme receives one automatic
`layout: backcover` slide unless the deck already ends with one. Logo and
copyright are shown only when explicitly provided.

### Choosing a theme from the request

- **custom**: explicit brand colors or an internal template.
- **microsoft**: Microsoft, Fluent, Office, or the Microsoft four-color style.
- **light**: bright, light, white-based, or clean.
- **dark**: dark, black-based, cool, or striking.
- **No theme language**: use `dark`.

Ask the user to select among the four themes only when the request is ambiguous
or mixes styles. For a mid-presentation theme change, call `load_deck` with the
same slides and current index plus the new theme.

## Diagrams and images

Use a `mermaid` fence for automatically laid-out flowcharts, sequence diagrams,
class diagrams, pie charts, and related diagrams. Mermaid is bundled and works
offline. Syntax errors render an error while preserving other slide content.

Use an `architecture` fence when positions, dimensions, containers, and overlap
must be stable. Architecture DSL v1 is stable. See
`.github/extensions/markdstage/README.md` and
`.github/extensions/markdstage/schema/architecture-v1.schema.json` for the
complete contract. An empty fence is a valid empty diagram that the Architecture
Editor can populate. Non-empty invalid JSON remains an error.

Groups support `row`, `column`, `grid`, and `layered`; layered direction is
`down` (default) or `right`. Built-in icons are `cloud`, `database`, `api`,
`user`, `server`, `analytics`, `browser`, `mobile`, `network`, `queue`, and
`shield`. Connector ports are `auto`, `top`, `right`, `bottom`, and `left`.
Connector labels default to `labelLayer: "front"`; use `"behind"` only for
legacy behind-box placement.

For custom Architecture icons, place SVG / PNG / WebP / JPG / JPEG files in
Markdown-adjacent or workspace-root `assets/` and use
`icon: "assets/foo.svg"` without a leading slash. External URLs, data URIs,
`..`, and non-ASCII filenames are rejected. Standalone images use:

```json
{
  "type": "image",
  "id": "map",
  "src": "assets/map.svg",
  "fit": "contain",
  "ariaLabel": "System overview",
  "x": 80,
  "y": 80,
  "width": 720,
  "height": 420
}
```

`fit` is `contain` (default), `cover`, or `stretch`. Images participate in group
layout, z-order, connector endpoints, and orthogonal-routing obstacles.

For standard Markdown images, remote URLs are accepted directly. Local images
use `![Alternative text](/assets/foo.png)`. Lookup tries an `assets/` folder
beside the source Markdown before workspace-root `assets/`.

## Presentation startup procedure

### 1. Identify the source Markdown

Derive the path from the request. If none is specified, use workspace-root
`slides.md`. Ask for a path only when that file does not exist.

### 2. Parse the Markdown into pages

- A line containing only `---` is a slide separator.
- Ignore `---` inside fenced code.
- Treat an initial `---` YAML block as deck configuration, not a slide.
- Convert a leading `<!-- slide-size: large -->` directive into front-matter
  `size: large`; accepted values are `auto`, `normal`, `large`, and `xlarge`.
- Trim pages and discard empty pages.
- Derive each slide-list title from its first heading, or the first 40
  characters of its first non-empty line.
- Derive the deck title from initial front matter `title`, then the first slide
  heading.

### 3. Generate every slide fragment

Generate the complete ordered `slides` array. Fill correct one-based `page` and
`total` values. Carry over a slide-size directive; otherwise omit `size` and
allow canvas auto-sizing. Select the requested theme once for the deck, not in
every slide's front matter. This generation happens only at startup.

### 4. Open the complete deck

Call `open_canvas` once:

- `canvasId`: `"MarkdStage"`
- `instanceId`: `"markdstage"`
- `input`:
  `{ "slides": ["<slide 1>", "<slide 2>"], "index": 0, "theme": "dark", "sourceName": "path/to/slides.md" }`

`index` and `theme` are optional with defaults `0` and `dark`. `sourceName` is
the workspace-relative source path and is required for adjacent assets,
relative theme lookup, and source-based PDF naming. No URL, external server, or
health check is needed.

To bring an existing canvas to the front without changing it, call
`open_canvas` without `input`.

### JSON input safety

Canvas input is JSON. Escape double quotes as `\"`, backslashes as `\\`, and
newlines as `\n` inside serialized slide strings. A malformed string often
appears as:

```text
CanvasInputInvalidError: Invalid input for action "load_deck" ... (root): must be object
```

Prefer typographic quotation marks such as `“ ”` where appropriate to avoid
accidental JSON termination. If uncertain, first verify communication with a
one-slide input such as `{ "slides": ["# Test"] }`.

### 5. Leave navigation to the user

- **◀ / ▶**: previous / next.
- **⛶**: open a synchronized 1280×720 external presenter. Move it to the
  desired monitor and use `F11` on Windows if needed.
- **Keyboard**: `Right`, `PageDown`, or Space for next; `Left` or `PageUp` for
  previous; Home/End for first/last; `O` or Escape toggles the slide list.
- **Surface Pen on Windows**: tail single press (`Win+F20`) for next and long
  press (`Win+F18`) for previous. Double press and pen connection/removal do
  not open the presenter.
- **☰**: open the title list and jump to a slide.

Keyboard operation requires iframe focus. Use `goto_slide` only when the user
explicitly asks through chat for a page. Use `load_deck` only to change content
or theme.

### 6. Finish

No special termination is required. Leave the canvas open, or call `reset` to
return it to the waiting view. There is no external process or temporary file
to stop.

## Generating slide fragments

Classify each source page before adding front matter:

- **Slide-like pages** dominated by headings, lists, code, tables, Mermaid, or
  images should retain their body almost unchanged.
- **Prose pages** should be summarized into a concise heading plus bullets.

Put the standard slide's H1/H2 first so the renderer moves it into the fixed
title region. Add `layout: title` to the cover and `layout: section` to an
intermediate chapter-heading-only slide. Keep standard slides concise.

Sizing:

- `auto`: default; safely enlarge spacious standard slides without code, tables,
  images, or Mermaid.
- `normal`: disable enlargement.
- `large`: one step larger.
- `xlarge`: two steps larger.

Explicit front matter has precedence over `<!-- slide-size: ... -->`.

Layout rules:

- Use `layout: title` when the first slide is a cover.
- Use `layout: section` for intermediate chapter dividers containing only an
  H1/H2. Do not add images or icons.
- Preserve any explicit source `layout`.
- Standard slides align heading and body to the top. Use `layout: center` only
  when both should be vertically centered together.
- The extension automatically appends `layout: backcover` for every theme.
  Do not generate it. Treat closing, thanks, Q&A, and contact pages as standard
  slides. Never use the retired `layout: closing`.

### Converting prose to slides

For each prose-heavy page:

- Preserve intent and facts. Do not invent claims, numbers, or proper nouns.
- Create a short heading and approximately three to six concise bullets.
- Use bold sparingly for important terms.
- Keep one source page as one slide whenever possible; summarize rather than
  splitting a long page.
- Reuse an existing heading or derive a short one from the content.
- Preserve the source paragraph's order and argument.

Example:

```markdown
Our team shares progress every Monday. Each member describes last week's work,
this week's plan, and blockers. This helps identify problems early, align the
team, and reduce rework.
```

Becomes:

```markdown
---
deck: Team operations
kicker: Weekly meeting
page: 3
total: 8
---
## Goals of the weekly meeting

- Share progress every **Monday**
- Cover last week, this week, and blockers
- Identify problems early and align the team
- Reduce **rework**
```

## Troubleshooting

- If `open`, `load_deck`, or `show_slide` returns `(root): must be object`,
  inspect JSON for unescaped `"` or `\`; use typographic quotes or proper JSON
  escapes. Test a minimal one-slide deck before resending the full deck.
- If the canvas does not update, confirm the action returned success. Navigate
  away and back to force redraw, then reopen canvas ID `"MarkdStage"` with
  instance ID `"markdstage"` if necessary.
- If buttons or keys do not work, click the canvas to focus the iframe. Controls
  are intentionally disabled at deck boundaries.
- For `no_deck`, register `slides` with `open` input or `load_deck` first.
- If the extension/action is missing, confirm
  `.github/extensions/markdstage/` exists and reload extensions.
- If a local image is missing, verify an adjacent or workspace-root `assets/`
  file, an `/assets/...` URL, and a correct workspace-relative `sourceName`.
- If a custom theme is missing, verify `theme-file` beside the Markdown or at
  workspace root and verify `sourceName`. The Markdown-adjacent file wins.
- Mermaid errors preserve the rest of the slide. Correct the syntax and reload.
