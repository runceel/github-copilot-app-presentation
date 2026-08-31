# MarkdStage canvas Extension

**Markdown, ready for the stage.**

MarkdStage renders Markdown slide fragments with themes in a **native Copilot
canvas**. The `markdstage` skill uses this extension to run presentations.

## How it works

```text
Agent
  | open_canvas("MarkdStage", { input: { slides: [...] } })
  |   opens and registers the complete deck at startup
  | invoke_canvas_action("load_deck", { slides: [...] })
  |   replaces the deck during a presentation
  v
extension.mjs (Node / @github/copilot-sdk)
  | starts one loopback HTTP server per instance
  | applies input.slides before open returns its URL, avoiding a placeholder
  | stores the complete deck and current index and exposes the current slide at /state
  | accepts canvas navigation through POST /navigate
  | monitors Surface Pen Win+F20 / Win+F18 shortcuts on Windows
  | publishes updates through /events (SSE)
  v
Canvas iframe (renderer/)
  | renders Markdown with marked and sanitizes HTML with DOMPurify
  | highlights language-tagged code fences with highlight.js
  | converts ```mermaid blocks with mermaid.run
  | converts validated ```architecture JSON DSL into a safe SVG DOM
  | provides ◀ ▶, ✎, 16:9 PDF preview, margin clicks, arrow keys, and the ☰ slide list
  | opens a synchronized external window with ⛶
  v
The themed slide is displayed and updates automatically
```

- **Register every slide at startup** in the `slides` field of `open_canvas`
  `input`. The open handler applies the deck before returning the URL, so the
  first slide appears immediately without a "deck not loaded" placeholder.
  Use `load_deck` only to replace content or theme during the presentation.
  Users navigate through ◀ ▶, left-click/right-click on empty slide margins,
  arrow keys, or ☰. The canvas posts navigation to `POST /navigate`, and every
  client stays synchronized. Left-click advances; right-click goes back.
  Content, links, images, navigation controls, and the slide list retain their
  normal interactions and context menus. No external server or manually
  started `localhost` port is required.
- On Windows, **one press of the Surface Pen tail button advances, and a long
  press goes back**. A small PowerShell keyboard-hook helper receives
  `Win+F20` and `Win+F18` and forwards them to the existing navigation path.
  `Win+F19` double press, pen connection, removal, or docking never launches
  the external presenter. The implementation does not depend on the packaged
  app identity required by the official `PenButtonListener`.
- Themes are **dark (default), light, microsoft, and custom**. Set a deck theme
  through open input or `load_deck`. The renderer sets `<html data-theme>` and
  `slides.css` supplies the palette. `microsoft` is built in. `custom` loads a
  custom-property-only CSS file from `themeFile` or front matter `theme-file`.
  Precedence is **explicit canvas theme > Markdown front matter > dark**.
  Theme-file lookup tries the source Markdown folder before the repository
  root, allowing a deck-local file to override a shared file with the same
  path. Files outside the workspace and arbitrary selectors are rejected.
  A sibling `theme.json` may define cover background, cover/back-cover logos,
  and copyright. **Every theme automatically receives a final
  `layout: backcover` slide** unless one already exists. Logo and copyright
  appear only when supplied by metadata or front matter.
- See [`docs/custom-theme-authoring.md`](docs/custom-theme-authoring.md) for
  custom themes. AI can retrieve the same guidance through `markdstage_guide`
  topics `custom-themes` and `theme-schema`. `schema/theme-v1.json` describes
  standard custom properties, and `schema/theme-metadata-v1.schema.json`
  describes `theme.json`.
- Content size has four levels: **auto (default), normal, large, and xlarge**.
  `auto` measures standard slides without code, tables, images, or Mermaid and
  enlarges only when ample space remains.
- Put **speaker notes** in top-level HTML comments on each slide. Presenter view
  renders notes as Markdown and follows navigation. Notes are absent from
  regular slides, the external presenter, and PDF output.
- The **canvas renderer** owns navigation controls, ✎ editing, the slide list,
  and current position. ✎ toggles the same placement mode as
  `edit_architecture`. For Markdown loaded with 📂, **Advanced editing** opens
  the dedicated `architecture-editor` canvas. The agent only opens the deck and
  does not run an `ask_user` loop. Margin clicks are installed only in normal
  canvas and presenter modes, never print mode. `goto_slide` remains available
  for an explicit page request from chat.
- **PDF Export is available from the printer icon.** When `sourceName` is passed
  to open / `load_deck`, the printer saves `<source-name>.pdf` in the workspace.
  AI may call `export_pdf` with another `outputPath`. Hidden print mode renders
  every page, then headless Edge/Chrome produces a 16:9 PDF with backgrounds,
  images, highlighted code, and Mermaid.
- Use the **16:9 control** to letterbox the current slide inside the canvas with
  the same fixed 1280×720 typography, spacing, diagram limits, and clipping used
  by PDF output. This preview is local to the canvas and does not change deck
  state. A visible and accessible warning identifies content that would be
  clipped.
- AI should call **`inspect_layout` before exporting a non-scrolling deck**. It
  renders the PDF snapshot in headless Chromium and returns compact JSON for
  clipped pages, including vertical/horizontal overflow and bounded element
  hints. Call `capture_slides` only when visual inspection is needed; PNGs are
  fixed 1280×720 files and the action returns paths instead of inline image data.
- Open the **external presenter** with ⛶ or `open_presenter`. Edge / Chrome /
  Chromium starts in a dedicated temporary profile as a movable, resizable
  1280×720 app-mode window. It shares `/state`, `/navigate`, and SSE with the
  canvas, so keyboard and Surface Pen position remain synchronized. Move it to
  the target monitor and use standard browser/OS full-screen controls (`F11`
  on Windows). Close it with `Alt+F4` or `close_presenter`. Closing the canvas
  also stops it.
- Local image lookup for `/assets/...` tries `assets/` beside the source
  Markdown, then workspace-root `assets/`. `sourceName` determines the source
  folder. This lets deck-local images override workspace-wide images.
- In other words, lookup checks `assets/` beside the Markdown before
  `assets/` at the workspace root, using `sourceName` as the resolution base.
- Add language names such as `csharp`, `json`, or `diff` to code fences for
  highlight.js syntax highlighting.

## Markdown import (📂)

Users can load Markdown directly from the canvas without AI. Press 📂 or `I` to
open a filtered list of workspace `*.md` / `*.markdown` files. Selecting one
loads it, splits it into slides, and replaces the deck. Import also works from
the initial waiting view. The control is not shown in presenter or print mode.
The workspace root is the Git repository root when available, otherwise the
folder opened for the current session.

Import offers two update modes:

- **Keep imported snapshot (default):** retain the deck exactly as imported and
  ignore later saves.
- **Update automatically on save:** watch the Markdown and reload deck and
  front-matter theme while preserving the current page when possible.

For a source-backed deck, the toolbar update button can switch modes at any
time. Switching to live mode loads the latest file immediately. Switching to
snapshot preserves the current display. If the watched file becomes empty,
deleted, or unreadable, MarkdStage retains the last valid deck and marks the
button as an error. The next valid save recovers automatically.

Splitting follows **Slidev / Marp syntax** mechanically. Summarizing prose into
slides remains the AI's responsibility.

- A `---` line immediately after a blank line separates slides. Setext heading
  underlines and separators inside code fences do not split.
- **Initial front matter is deck configuration** inherited by all slides
  (`theme`, `theme-file`, `deck`, `kicker`, `size`, `logo`, `copyright`, and
  related keys). It is also slide one's own front matter, so
  `layout: title` affects slide one only.
- **Each page may have front matter.** When the block after the separator
  contains only `key: value` entries and is closed by `---`, it is treated as
  that page's front matter; the separator line also opens the block.
- Precedence is **page front matter > deck front matter > generated values**.
- `page` and `total` are generated only when absent and are not generated for
  `title`, `section`, or `backcover` layouts. Explicit values are preserved.

```markdown
---
title: Sample
theme: microsoft
layout: title
---

# Cover

---
kicker: Getting started
layout: section
---

## Slide two
```

The imported filename is retained as `sourceName`, enabling source-based PDF
naming, adjacent `assets/`, and Markdown-relative `theme-file` lookup with
workspace-root fallback. Files outside the workspace cannot be selected; no
OS file dialog is used.

## AI authoring guide

The extension provides `markdstage_guide`. Before authoring Markdown for the
MarkdStage canvas, AI should request the required `overview`, `slide-format`,
`themes`, `custom-themes`, `theme-schema`, `architecture-dsl`, or
`architecture-schema` topic. Runtime guidance is generated from this README and
`schema/architecture-v1.schema.json`, so user-scoped extension installs expose
the same contract.

When the extension detects a presentation-related prompt, it adds a short hint
to use `markdstage_guide` at most once per session. No hint is added after the
tool has already been called, and session-end cleanup removes the state.

### Slide fragment format

Each element in open / `load_deck` `slides` is one Markdown string. It may start
with front matter delimited by `---`, followed by GFM-compatible content.

| Front matter | Purpose |
| --- | --- |
| `deck` / `kicker` | Footer deck name / label above the heading |
| `page` / `total` | One-based current page / total page count |
| `title` | Browser-tab title |
| `layout` | `title` for a cover, `section` for a section divider, `backcover` for the back cover, or `center` to vertically center heading and body together. Standard slides omit it and align heading and body to the top. |
| `size` | `auto` (default), `normal`, `large`, or `xlarge` |
| `theme` | Per-slide override; normally use the deck theme |
| `theme-file` | CSS for `custom`, resolved beside the Markdown before workspace root |
| `logo` / `copyright` | Override `backcover` metadata |

Make the first slide a `layout: title` cover. The extension appends a final
`layout: backcover`. Content may contain headings, lists, tables, images, code,
`mermaid`, and `architecture`.

Put speaker notes in top-level HTML comments, as in Slidev / Marp. Comments may
contain Markdown, and multiple comments are displayed with a blank line between
them. Comments inside code fences and `<!-- slide-size: ... -->` directives are
not notes.

```markdown
## Demo

- Only this content appears on the slide

<!--
First explain the **prerequisites**.

1. Demonstrate the operation
2. Take questions
-->
```

Write local images as `![Alternative text](/assets/foo.png)` and pass the source
Markdown's workspace-relative path as `sourceName`. Lookup tries adjacent
`assets/` before workspace-root `assets/`. Architecture `icon` and `image.src`
use `assets/foo.svg` without a leading slash and follow the same lookup order.
Specifically, lookup checks `assets/` beside the Markdown before `assets/` at the workspace root.

On a standard slide, the first H1/H2 is fixed in the top title area, so its
position does not move with body length. Later headings remain in the body.
Specialized `title`, `section`, and `backcover` layouts retain their own
positioning.

The standard body begins **top-aligned** below the title. Use `layout: center`
only when a short slide should center heading and body together. The footer
remains fixed to the bottom.

```markdown
---
layout: center
deck: Presentation
page: 3
total: 8
---

## Center only this slide vertically

- The heading and body are centered as one block
```

For an intermediate chapter divider, use `layout: section`, normally with one
H1/H2. Add `kicker` or footer data only when needed. The background follows the
theme and contains no image, logo, or icon.

```markdown
---
layout: section
---

## Key GitHub Copilot features
```

### Choosing a theme

Set the deck-wide `theme`; use `dark` when omitted.

For `custom`, resolve `theme-file` first from the same folder as the source Markdown
and then from the workspace root. A shared `themes/brand/theme.css` may therefore be
overridden by `<Markdown folder>/themes/brand/theme.css`. AI must pass the
workspace-relative source path as `sourceName`.

| Theme | Selection guidance |
| --- | --- |
| `dark` | Dark, black-based, cool, or striking |
| `light` | Bright, white-based, clean, and neutral |
| `microsoft` | Microsoft, Fluent, Office, or the Microsoft four-color style |
| `custom` | Reproduce brand colors or an organizational template with CSS custom properties |

## Architecture DSL v1

An `architecture` code fence renders a position-stable JSON DSL as SVG. Canvas
dimensions use logical coordinates and a `viewBox`, so canvas, external
presenter, and PDF preserve the same proportions.

An empty fence is valid shorthand for a diagram with zero elements. The
dedicated Architecture Editor replaces it with canonical JSON based on
`{ "version": 1, "elements": [] }`. Non-empty invalid JSON remains an error.
Its changes affect source Markdown only when explicitly saved.

````markdown
```architecture
```
````

When writing explicit JSON, `elements` is required by the JSON Schema.

> **Architecture DSL v1 is stable.** The [placement editor](#placement-editing)
> is part of v1, not an experimental feature. A document accepted as v1 will
> continue to be accepted as v1, and diagram meaning—element placement and
> connections—is preserved. Compatibility guarantees and migration policy are
> documented in [`schema/README.md`](./schema/README.md).
>
> The guarantee excludes pixel-identical rendering, which can change with font
> metrics, theme tokens, or routing improvements, and excludes exact diagnostic
> wording. Continue to use Mermaid for complex automatic layout.

````markdown
```architecture
{
  "version": 1,
  "title": "Web application architecture",
  "description": "A client, application tier, and database.",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    {
      "type": "group", "id": "cloud", "x": 480, "y": 90,
      "width": 1040, "height": 700, "title": "Cloud",
      "layout": { "type": "row", "gap": 60, "padding": 70 },
      "children": [
        {
          "type": "node", "id": "api", "shape": "rounded-rect",
          "text": "API", "icon": "api",
          "style": { "fill": "surface", "stroke": "accent" }
        },
        {
          "type": "node", "id": "db", "shape": "ellipse",
          "text": "Database", "icon": "database"
        }
      ]
    },
    {
      "type": "node", "id": "client", "shape": "rect",
      "x": 80, "y": 330, "width": 280, "height": 150, "text": "Client"
    },
    {
      "type": "connector", "from": "client", "to": "api",
      "fromPort": "right", "toPort": "left",
      "routing": "orthogonal", "label": "HTTPS", "arrow": true
    },
    {
      "type": "connector", "from": "api", "to": "db",
      "routing": "polyline", "points": [{ "x": 500, "y": 400 }],
      "label": "SQL", "arrow": true, "z": -10
    }
  ]
}
```
````

- A `node` has a unique `id`, multiline `text`, and shape `rect`,
  `rounded-rect`, or `ellipse`.
- `icon` is a built-in name or a path under an adjacent or workspace-root
  `assets/` folder. See [Icons](#icons).
- An `image` places an `assets/` image as an independent element. `fit` is
  `contain` (default), `cover`, or `stretch`; use `ariaLabel` for its accessible
  name. Images participate in group layout, z-order, connector endpoints, and
  orthogonal-routing obstacles like nodes.
- Group-child coordinates are relative to the group's top left. Group border
  and title render before children. Without `layout`, explicit coordinates are
  used. `row`, `column`, and `grid` calculate positions and omitted dimensions
  from group interior size plus `gap` or `rowGap` / `columnGap`, `padding`, and
  `columns`. `layered` uses dependency direction. These are deterministic
  presentation helpers, not general graph auto-layout.
- A `connector` attaches to `from` / `to` boundaries and supports `straight`,
  `orthogonal`, and `polyline`, arrows, and labels. Ports are `auto`, `top`,
  `right`, `bottom`, or `left`. Parallel edges receive stable lanes, and
  branching exits separate. Orthogonal routing resolves short edges first and
  favors corridors that reduce overlap and crossings with nodes, images, and
  already routed connectors. A default 14-logical-pixel gap separates line
  endpoints from boxes. For complex diagrams, specify `lane` or polyline
  `points`. Long labels shrink based on Unicode display width and are visually
  omitted when they cannot fit, while the full value remains in `aria-label`.
  A label that would hide its own line is moved perpendicular to it.
  `labelLayer: "front"` (default) draws labels in front of boxes; `"behind"`
  leaves them in connector z-order.
- Elements render from smaller `z` (`-100` to `100`) to larger, preserving
  declaration order for equal values. Defaults are group `-50`, connector
  `-10`, and node/image `0`, giving container → line → box order. Connector `z`
  applies to its line and `"behind"` label; `"front"` labels use a final layer.
- `style` supports `fill`, `stroke`, `textColor`, `strokeWidth`, `fontSize`,
  `opacity`, `dash`, and `cornerRadius`. Prefer theme tokens `accent`,
  `accentStrong`, `accentSoft`, `accentLine`, `surface`, `fg`, `muted`, `body`,
  `border`, and `bg`. Literal colors are limited to hex, white, black, and
  transparent.
- Invalid JSON, out-of-range numbers, duplicate IDs, unknown references, and
  unsupported elements, styles, or colors render an inline diagram error while
  preserving other slide content. DSL values never generate HTML, script, or
  event attributes. Generated asset URLs stay on same-origin `/assets/...`.
- `version` is currently `1` and defaults to v1. Limits include 64 KiB source,
  200 total elements, 100 connectors, four nesting levels, 12 polyline
  intermediate points, 20,000 total text characters, and 200-character icon/src
  references.
- Diagnostics include a JSON path and remediation after `;`, for example:
  `elements[0].icon: must be a built-in icon name (cloud, database, ...) or a
  path under assets/; replace 'rocket' with a built-in name, or with a
  repository asset such as 'assets/icons/logo.svg' (...)`.
- A draft 2020-12 JSON Schema is provided at
  [`schema/architecture-v1.schema.json`](./schema/architecture-v1.schema.json).
  A relative `$schema` in a standalone `.architecture.json` enables editor
  completion and validation; the same JSON can be pasted into a fence. The
  parser accepts and ignores root `$schema`. The schema validates structure;
  the parser still validates references, ID uniqueness, flattened limits, and
  layout fit. See [`schema/README.md`](./schema/README.md).
- The SVG root has `<title>`, `<desc>`, and `aria-labelledby`. Group, node,
  image, and connector elements receive meaningful roles, `aria-label`, and SVG
  `<title>`. Use root `description` and element `ariaLabel` when needed.

### Accessibility

Automated checks in `test/a11y/` use axe-core and inspect Chromium's
accessibility tree through CDP.

**Exposed content**

- The diagram root exposes `<title>` and `<desc>` through `aria-labelledby`.
  `description` should summarize the diagram for readers who cannot see it.
- Groups, nodes, and connectors each have `aria-label`. A connector defaults to
  `<visible from label> to <visible to label>: <label>`. Endpoints use visible
  node `text` / group `title`, falling back to ID only when no visible label
  exists. Explicit `ariaLabel` overrides the complete name.
- Visible diagram text uses `aria-hidden="true"` to prevent duplicate reading
  as both accessible name and child text. This does not affect rendering.

**Reading order**

- Reading order is **DOM order = z-order rendering order**, not declaration
  order.
- With default z values, groups are read first, then connectors, then nodes.
- Declaration order is exposed as `data-architecture-order` for tooling but
  does not control assistive-technology order.
- **Use `z` for visual stacking, not reading or traversal order.**
- The implementation does not use `aria-flowto` or `aria-owns` because support
  varies across Windows WebView2, macOS WKWebView, and Linux WebKitGTK.

**Keyboard**

- In regular, presenter, and print modes, each diagram is exactly one tab stop.
  Individual diagram elements are not tab stops.
- Element-level traversal belongs to edit mode, where nodes and groups become
  tab stops and arrow keys move the selected element. The root tab stop is then
  removed.
- Edit-mode tab order still follows DOM/render order.

**Edit-mode announcements**

- The toolbar contains two `role="status"` / `aria-live="polite"` regions:
  one for operation results and one for save results.
- **Do not combine them.** An operation may replace the operation message, but
  a save failure means an edit may be lost and must remain until a later save
  succeeds. A combined region would let the next operation erase that warning.
- Both regions may update nearly simultaneously; some assistive technologies
  might overlap announcements. Preserve the independent failure lifetime when
  improving this behavior.

**Known limits**

- Real screen-reader speech has not been validated with NVDA, JAWS, VoiceOver,
  or Narrator. Evidence comes from Chromium's accessibility tree. Do not change
  role choices, such as `role="group"` for connectors, without device testing.
- Nested groups render visually but are flattened in the accessibility tree.
  Membership is not conveyed automatically; include it in `ariaLabel` when
  necessary.
- Automated WCAG 2.1 A/AA and diagram best-practice checks do not prove that a
  result is accessible.

**Rendering cost**

- A `MAX_ELEMENTS` (200-element) diagram takes approximately 10–12 ms from
  parse through layout, routing, and SVG generation on the development machine.
  `test/perf/` locks absolute time and scaling below 24× cost for 8× elements.

### Browser support

| Feature | Supported environment |
| --- | --- |
| Canvas slide rendering and placement editing | Tauri WebView: Windows WebView2 / Chromium, macOS WKWebView / WebKit, Linux WebKitGTK |
| External presenter | Edge / Chrome / Chromium only, because it starts with `--app` |
| PDF export | Edge / Chrome / Chromium only, because it uses headless `--print-to-pdf` |
| Automated tests | Playwright Chromium; visual baselines are separate for Linux and Windows |

Standalone Firefox and Safari are untested. Presenter and PDF workflows directly
depend on Chromium launch options.

### Icons

`node.icon` accepts a **built-in icon name** or an **image path under
Markdown-adjacent or workspace-root `assets/`**.

#### Built-in icons

Built-ins read no external asset. They use bundled 24×24 SVG primitives.

| Name | Intended concept |
| --- | --- |
| `cloud` | Cloud or managed service |
| `database` | Relational database or persistent store |
| `api` | API, endpoint, or contract |
| `user` | User, person, or actor |
| `server` | Server, host, or worker |
| `analytics` | Analytics, metrics, or dashboard |
| `browser` | Browser or web front end |
| `mobile` | Mobile application or device |
| `network` | Network, connection, or distributed system |
| `queue` | Queue, messaging, or asynchronous processing |
| `shield` | Authentication, authorization, security, or guardrail |

- Names use lowercase kebab-case
  (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) and generic concepts rather than product
  or vendor names. Unit tests enforce this rule.
- Built-ins are unfilled line drawings whose stroke uses node `textColor`
  (theme token `fg` by default), so all themes recolor them automatically.
  Tests enforce at least 3:1 contrast against each theme background under WCAG
  2.1 SC 1.4.11.
- Existing names and drawings are public v1 vocabulary. Additions are
  compatible; renaming or redrawing is breaking.

#### Using an `assets/` icon

Place an image under `assets/` beside the source Markdown or at workspace root,
and use an `assets/`-relative path. Adjacent assets take precedence. The
extension serves them on same-origin `/assets/...`, so canvas, presenter, and
PDF resolve them consistently.

````markdown
```architecture
{
  "elements": [
    {
      "type": "node", "id": "brand",
      "x": 80, "y": 80, "width": 260, "height": 140,
      "text": "Our service", "icon": "assets/sample.svg"
    }
  ]
}
```
````

Allowed extensions are `.svg`, `.png`, `.webp`, `.jpg`, and `.jpeg`,
case-insensitively.

Accepted paths:

- Start with `assets/`; no leading slash.
- Each segment starts with an alphanumeric character and then uses only
  alphanumeric characters, `_`, `-`, or `.`.
- Subfolders such as `assets/icons/brand/logo.svg` are allowed.
- Total length is at most 200 characters.

Rejected references:

```text
https://example.com/logo.svg   external URLs are prohibited
//example.com/logo.svg         protocol-relative URLs are prohibited
data:image/svg+xml;base64,...  data URIs are prohibited
assets/../secret.svg           .. is prohibited
/assets/logo.svg               absolute paths are prohibited
images/logo.svg                paths outside assets/ are prohibited
assets/logo.gif                unsupported extensions are prohibited
assets\logo.svg                backslashes are prohibited
assets/logo.svg?v=2            query strings are prohibited
```

The parser and JSON Schema enforce the same path shape. Rejection renders an
inline diagnostic with remediation.

#### User-provided icon limits

- User assets **do not follow theme colors**. They render as `<image>`, so the
  extension cannot replace internal colors, including in SVG. All themes show
  the same asset.
- The asset author must ensure readability on dark and light/microsoft
  backgrounds. Use colors with sufficient contrast, give the icon an opaque
  background, or present with one fixed theme.
- Secure static browser mode is expected to disable script in SVG, but only
  trusted assets should be stored.
- The parser does not inspect the filesystem. A missing file leaves the icon
  region empty rather than producing a DSL error; verify spelling.
- Icons are `aria-hidden="true"`, and asset paths are not part of accessible
  names. Put meaning in `text` or `ariaLabel`.

#### Licensing and attribution

Users are responsible for licenses of images and icons committed to `assets/`.

- Commit only assets whose licenses permit redistribution.
- For assets requiring attribution, such as CC BY or some Apache-2.0-derived
  icon sets, provide credit on a slide or in `assets/README.md`, including
  source, author, license, and URL.
- Follow owner brand guidelines for third-party trademarks and logos. MarkdStage
  only fits them into a 24×24 box with
  `preserveAspectRatio="xMidYMid meet"` and does not recolor or modify them.
- The 11 built-in icons were created for this repository, follow its license,
  and require no attribution.

### Standalone image

Use `type: "image"` when an image is an independent diagram element rather
than node decoration. `src` shares the safety rules and formats of `node.icon`.

````markdown
```architecture
{
  "elements": [
    {
      "type": "image", "id": "system-map",
      "src": "assets/system-map.svg",
      "fit": "contain", "ariaLabel": "Complete system diagram",
      "x": 80, "y": 80, "width": 720, "height": 420
    },
    {
      "type": "node", "id": "details",
      "text": "Details", "x": 980, "y": 230, "width": 260, "height": 120
    },
    {
      "type": "connector", "from": "system-map", "to": "details",
      "routing": "orthogonal", "arrow": true
    }
  ]
}
```
````

| `fit` | Behavior |
| --- | --- |
| `contain` | Preserve aspect ratio and show the complete image (default) |
| `cover` | Preserve aspect ratio and crop overflow to fill the region |
| `stretch` | Change aspect ratio to fill the region |

Without `ariaLabel`, the accessible name is the asset filename, then `id`.
Images are clipped and participate in row / column / grid / layered layout,
z-order, connector endpoints, and orthogonal-routing obstacles. Themes do not
recolor images.

### Automatic connector routing

`routing: "orthogonal"` routes without manual polyline points. `labelLayer`
offers only two stacking choices:

| `labelLayer` | Display |
| --- | --- |
| `front` (default) | Draw the label after boxes, in front of nodes and images |
| `behind` | Keep the label in connector z-order, where boxes may cover it |

1. **Candidate enumeration and cost minimization:** evaluate straight, L-shaped,
   and related candidates. In descending penalty order, cost includes node
   intersection, labels covering nodes, intersection/overlap with routes,
   label overlap, turns, and length. Label occupancy uses the same pill size as
   rendering.
2. **Escalation to grid search:** when the selected route hits a node or
   conflicts with another route, try Dijkstra search over a sparse coordinate
   grid. Adopt it only when cost strictly improves.
3. **Global rip-up and reroute:** sequential placement can favor the first edge,
   so reroute each edge over several complete passes. Replace only when total
   cost decreases, and reject replacements that increase crossings unless they
   fix an obscured node or label.

The same input always yields the same route. Connectors are stably sorted by
distance and declaration order; routing uses no randomness.

#### Routing-budget fallback contract

Grid search stops at 120 coordinates per axis, 10,000 grid points, or 20,000
expansions. When a budget is reached, rendering continues with the best
available route rather than changing a previously renderable diagram into an
error.

Degradation is not silent. Only a route crossing a node or a label covering an
unrelated node produces:

| Notification | Content |
| --- | --- |
| Warning banner below the diagram | Amber `role="status"` / `aria-live="polite"` block listing connector and reason |
| `data-architecture-routing="degraded"` | Wrapper attribute available to automated tests |
| `console.warn` | Development notification; never `console.error` |

Crossings alone do not notify because they may be unavoidable. Explicit
`straight` and `polyline` routes do not produce automatic-routing diagnostics.
Resolve degradation by moving nodes or supplying `polyline` points.

#### Preventing a label from hiding its own line

Labels normally sit at the route midpoint. Because pills have a minimum width
of 70 logical pixels, nearby nodes can let a pill cover its entire line and
arrow. For example, a row layout `gap: 60` leaves only 32 visible pixels after
the default 14-pixel gap at both ends.

When midpoint placement would leave less than 50 logical pixels visible, the
pill moves **perpendicular to its own segment**:

- Above a horizontal segment and to the right of a vertical segment.
- Eight logical pixels between the pill edge and line.
- Direction-independent: `a → b` and `b → a` choose the same side.
- Routing costs use the displaced position.
- Applies equally to `straight`, `orthogonal`, and `polyline`.

This is a v1 rendering contract. Exact label coordinates are not guaranteed,
but a label will not completely hide its own line and arrow. Increase node
distance or layout `gap` to return the label to its midpoint.

### Layered layout

`layout: { "type": "layered" }` arranges group children along connector
direction. `direction` is `down` (default) or `right`. `up` and `left` are
rejected; reverse connector `from` / `to` instead. `direction` is rejected for
non-layered layouts.

Cycles terminate safely by ignoring back edges encountered later in declaration
order while assigning layers. Use this mode when dependency relationships
should determine placement without writing every coordinate.

### Placement editing

Architecture diagrams can be moved directly over the rendered result. For decks
imported through 📂, edits write back to the source `architecture` fence and
survive re-import. Decks supplied directly through open / `load_deck` cannot be
reversibly mapped to a source file, so they save only to canvas deck state.

**Placement editing is a stable part of Architecture DSL v1.**

- Write-back changes only the original `architecture` fence. Prose, front
  matter, and line endings outside it remain unchanged.
- If the fence changed externally after import, saving refuses the conflict
  rather than overwriting the source. Re-import before editing again.
- Save success or failure is always visible.
- `?present=1` and `?print=1` never create edit UI.
- Edit mode is server state and is not persisted with the deck.

These intentional v1 tradeoffs follow the compatibility policy in
[`schema/README.md`](./schema/README.md).

Enter mode with:

| Method | Purpose |
| --- | --- |
| Canvas action `edit_architecture` with `{ "enabled": true }` | Normal agent-controlled operation |
| Renderer URL `?architectureEdit=1` | Local debugging |

`reset` disables editing. The query parameter also updates server state through
`POST /edit-mode`; server state is the sole source of truth, preventing polling
from disabling a client-only mode or `POST /edit` returning an unexpected 409.

| Operation | Mouse | Keyboard |
| --- | --- | --- |
| Select | Click a node | Tab / Shift+Tab |
| Move | Drag | Arrow keys (10 logical px) |
| Fine adjustment | — | Shift+Arrow (1 px) |
| Detach layout | Toolbar **Detach layout** | `L` |
| Undo | Toolbar **Undo** | Ctrl+Z |
| Redo | Toolbar **Redo** | Ctrl+Shift+Z / Ctrl+Y |
| Clear selection | Click outside the diagram | Escape |
| Full editing | Toolbar **Advanced editing** | — |

Every move redraws the complete diagram and reroutes connectors. A live status
region announces results.

#### Dedicated Architecture Editor

`architecture-editor` is a separate canvas for comprehensive editing of an
**existing** Markdown `architecture` block. It does not insert new blocks.

- Add, delete, duplicate, reorder, and reparent nodes, groups, images, and
  connectors.
- Drag, resize, snap to grid, zoom, and pan. Scroll horizontally/vertically
  when the diagram exceeds the workspace, or pan with middle-drag / Space-drag.
- Context menus on elements, empty space, and tree items provide appropriate
  add, connect, duplicate, delete, front/back order, Undo/Redo, and Save
  commands. Group **Layout** menus offer `none`, `row`, `column`, `grid`, and
  `layered`, with the current value checked. Children do not offer an action to
  detach the parent layout. Items added from empty canvas space are centered at
  the context-menu point.
- Open the same menu from a focused diagram/tree item with `Shift+F10` or the
  Context Menu key. Navigate with arrows, open submenus with `ArrowRight`,
  return with `ArrowLeft`, execute with Enter/Space, and close with Escape.
- A typed inspector edits geometry, layout, style, icon, ports, routing,
  polyline points, canvas metadata, and other editable v1 fields.
- Add a standalone **Image** from the toolbar or context menu. Node inspector
  **Select image from assets/** uses the same picker. It searches
  Markdown-adjacent and workspace-root `assets/` in that order. Import SVG,
  PNG, WebP, JPG, or JPEG up to 10 MB into workspace-root `assets/`; collisions
  are numbered as `name-2.ext`.
- The picker selects/imports only; it does not rename, move, or delete shared
  assets. Removing or undoing an image does not delete its file.
- Changes remain in an in-memory draft until explicit **Save** or `save`.
- External file changes produce a conflict. Call `reload` with
  `{ "discard": true }` to discard the draft explicitly.
- Saving reloads any MarkdStage canvas showing the same Markdown while
  preserving page and theme.

Only source-backed decks imported through 📂 enable **Advanced editing**.
Agents can open the editor directly:

```json
{
  "canvasId": "architecture-editor",
  "instanceId": "architecture-editor-main",
  "input": {
    "sourcePath": "slides.md",
    "blockIndex": 0,
    "theme": "dark"
  }
}
```

`sourcePath` is a workspace-relative `.md` / `.markdown` path. `blockIndex` is
zero-based across all Architecture blocks. Paths outside the workspace,
symlinks, oversized files, missing blocks, and invalid DSL fail closed.

#### Save results are always visible

Placement mode writes each operation immediately. Imported decks target source
Markdown; other decks target canvas state. The toolbar always reports success
or failure through `data-architecture-save-state` values `saving`, `saved`, and
`failed`.

Because the visual diagram already moved, a hidden save failure could cause a
user to lose an edit they believed was stored. A failure therefore remains
prominent until a later save succeeds. Messages distinguish 409 after edit mode
was disabled, 404 after deck replacement, and network failure; the result is
never console-only.

#### Layout-managed nodes do not move

For a child of a group with `layout`, the layout engine recalculates position
and silently ignores explicit `x` / `y`. Approximately 68% of nodes in this
repository's real data are layout-managed.

Placement mode therefore refuses to move such a node and announces which group
controls it. Press `L` to detach layout. This removes group `layout` and writes
calculated `x`, `y`, `width`, and `height` to all children without changing
appearance. Children can then move freely. Undo restores the operation, but the
serialized conversion is otherwise irreversible; restoring layout after save
requires authoring it again.

#### Presenter and print never include edit UI

For `?present=1` and `?print=1`, edit UI is not constructed in the DOM. When
mode is disabled, the server also rejects `POST /edit` with
`409 edit_mode_disabled`. `npm run test:editing` locks both behaviors.

#### Known editing tradeoff

Write-back formats fence JSON with `JSON.stringify(..., null, 2)`, normalizing
indentation and wrapping inside the fence without changing values. Prose, front
matter, and CRLF/LF line endings outside the fence remain byte-for-byte
unchanged; saving a CRLF file does not convert the complete file to LF.

Use Mermaid for automatic layout, sequence diagrams, and class diagrams. Use
Architecture DSL for presentation-specific coordinates, dimensions, containers,
and overlap. Built-in icons use only inline SVG path data. Connector crossing
minimization is heuristic and does not guarantee the global optimum. Automatic
node placement is limited to `layered`; no force-directed graph layout exists.

## Content size

Source Markdown can specify a page size with a leading comment:

```markdown
<!-- slide-size: large -->

## Emphasized slide
```

Direct slide fragments use front matter:

```markdown
---
size: xlarge
---
## Emphasized slide
```

Accepted values are `auto`, `normal`, `large`, and `xlarge`. Front matter wins
over the comment. `title`, `section`, and `backcover` layouts retain their
special layout and are never auto-enlarged.

## Surface Pen controls

1. Pair Surface Pen with Windows over Bluetooth.
2. Open the MarkdStage canvas.
3. Use the tail button:

| Gesture | Windows shortcut | Action |
| --- | --- | --- |
| Single press | `Win+F20` | Next slide |
| Long press | `Win+F18` | Previous slide |

`Win+F19` double press and pen connection/removal/docking do not launch
MarkdStage. Start the presenter through ⛶ or explicit `open_presenter`.

The Windows setting that lets apps override shortcut-button behavior may remain
enabled. This implementation listens directly for Windows pen shortcuts rather
than using `PenButtonListener`. The hook suppresses `Win+F20` and `Win+F18`, so
Windows Ink defaults do not run simultaneously. `Win+F19` remains with Windows.
Canvas buttons and keyboard continue to work when pen input is unavailable.

## Actions

Start with `open_canvas` (`canvasId: "MarkdStage"`) and complete-deck input:
`{ slides: string[], index?: number, theme?: "dark" | "light" | "microsoft" |
"custom", sourceName?: string }`. Pass the source Markdown filename in
`sourceName`; the printer saves `<source-name-without-extension>.pdf`. The open
handler applies the deck before returning its URL. Omit input when only
refocusing an existing canvas.

| Action | Input and behavior |
| --- | --- |
| `load_deck` | `{ slides: string[], index?: number, theme?: "dark" | "light" | "microsoft" | "custom" }`. Replace/reload the deck for mid-presentation content or theme changes. `index` defaults to `0`; theme defaults to `dark`. Appends one back cover without duplication. Returns `{ ok, version, index, total, theme, validationFeedback? }`. Missing front matter or Architecture errors do not prevent display; remediation is returned in `validationFeedback` and logged for open. |
| `goto_slide` | `{ index: number }`. Select a clamped zero-based index. Intended for explicit chat requests, not normal navigation. Returns `{ ok, changed, version, index, total }`. |
| `show_slide` | `{ markdown: string }`. Temporarily replace the current slide. Supports front matter keys `deck`, `kicker`, `page`, `total`, `title`, `layout`, `size`, and `theme`. Omitted theme inherits the deck theme. |
| `get_architecture_errors` | `{ index?: number }`. Validate the complete deck or one zero-based slide, including temporary content. Returns `{ ok, scope, index?, page?, total, errorCount, errors }`; errors contain `{ slideIndex, page, blockIndex, architecture, code, message }`. No deck and out-of-range indexes are errors. |
| `open_presenter` | No input. Start one synchronized movable/resizable 1280×720 Chromium app-mode window. Use `F11` on Windows for full screen. Returns `{ ok, started, alreadyRunning, browser?, pid? }`. |
| `close_presenter` | No input. Stop presenter and remove its temporary profile. Returns `{ ok, stopped }`. |
| `inspect_layout` | `{ index?: number, includeFits?: boolean }`. Render the current PDF snapshot with the fixed 1280×720 output layout. Omit `index` for the complete deck. By default, return only clipped pages; `includeFits` includes successful pages. Returns dimensions, issue counts, overflow measurements, nested scroll containers, and a bounded list of element hints. Requires Edge, Chrome, or Chromium. |
| `capture_slides` | `{ indexes?: number[], outputDirectory?: string, theme?: "dark" | "light" | "microsoft" | "custom" }`. Generate PDF-equivalent 1280×720 PNGs for at most 10 zero-based indexes. When `indexes` is omitted, inspect the deck and capture only clipped pages. Paths stay inside the workspace; results contain paths and layout summaries, not image bytes. Requires Edge, Chrome, or Chromium. |
| `export_pdf` | `{ outputPath?: string, theme?: "dark" | "light" | "microsoft" | "custom" }`. Export one 16:9 page per slide. Relative paths use workspace root; default is `markdstage.pdf`. Theme affects PDF only. Reject paths outside workspace and non-`.pdf` files. Temporary slide replacement and the automatic back cover are included. Returns `{ ok, path, total, theme, bytes }`. Requires Edge, Chrome, or Chromium. |
| `edit_architecture` | `{ enabled: boolean }`. Toggle placement editing. Imported decks also write to the source fence; direct decks write to canvas state. Presenter/print omit UI. Mode is not persisted and `reset` disables it. Returns `{ ok, enabled, version }`. |
| `reset` | No input. Clear deck/slide state, disable editing, and return to the waiting view. |

`architecture-editor` is a separate canvas. Its open input is
`{ sourcePath: string, blockIndex: number, theme?: "dark" | "light" |
"microsoft" }`. Its actions are `save` (no input) and `reload`
(`{ discard?: boolean }`).

### Internal HTTP endpoints for the renderer

| Endpoint | Purpose |
| --- | --- |
| `GET /state` | Return current `markdown`, `index`, `total`, `theme`, `mode`, `architectureEdit`, source/watch state, `version`, and `deckVersion`. |
| `GET /deck` | Return all `slides` and `deckVersion`; the ☰ list fetches only when the version changes. |
| `GET /export-data` | Return the token-bound deck snapshot to print, inspection, or capture mode. |
| `POST /export-status` | Let print/capture mode report rendering status and fixed-layout diagnostics to PDF export, `inspect_layout`, or `capture_slides`. |
| `POST /navigate` | Accept absolute `{ index }` or relative `{ delta }`, update position, and notify all clients through SSE. |
| `POST /present` | Start the presenter from ⛶; accepts same-origin POST only. |
| `POST /export` | Start source-named PDF export from the printer icon; accepts same-origin POST only. |
| `POST /edit` | Write an edited fence with `{ index, block, source }`; returns `409 edit_mode_disabled` when editing is off. |
| `POST /edit-mode` | Set `{ enabled }`, including for `?architectureEdit=1`; same-origin POST only. |
| `POST /architecture-editor/open` | Convert source-backed slide/block indexes to a file-wide block index and open Architecture Editor. |
| `GET /events` | SSE nudge for low-latency `version` changes. |
| `GET /markdown-files` | Return bounded workspace-relative `*.md` / `*.markdown` paths for 📂, excluding `.git`, `node_modules`, and dot-prefixed entries. |
| `POST /import` | Load and split `{ path, sourceMode?: "snapshot" | "live" }`; reject paths outside workspace, wrong extensions, and oversized files. Same-origin POST only. |
| `POST /source-mode` | Switch a source-backed deck with `{ mode: "snapshot" | "live" }`; entering live mode loads the latest source. |

## File layout

```text
.github/extensions/markdstage/
  extension.mjs             # Canvas declaration, loopback server, and actions
  architecture-canvas.mjs   # Architecture Editor state, validation, save, conflicts
  architecture-editor/
    index.html               # Full diagram-editor canvas shell
    editor.css               # Workspace, tree, and inspector styles
    editor.js                # Diagram commands, draft, and explicit-save UI
  copilot-extension.json     # Manifest for Gist sharing
  markdown-deck.mjs         # Raw Markdown splitting for 📂 import
  scripts/
    markdown-blocks.mjs     # Scan and replace architecture fences
    markdown-files.mjs      # Scan workspace Markdown
    markdown-watcher.mjs    # Watch and debounce source-backed Markdown
  windows/
    pen-button-listener.ps1 # Relay Surface Pen Win+F20 / Win+F18 to Node
  renderer/
    index.html              # Iframe shell, toolbar, slide/import overlays
    slides.css              # Built-in dark/light/microsoft themes and navigation UI
    renderer.js             # Front matter, marked, Mermaid, Architecture, SSE, controls
    architecture.mjs        # Validate JSON DSL and create safe SVG DOM
    architecture-edit.mjs   # DOM-independent move/detach/Undo/Redo/serialization
    architecture-editor.mjs # Placement UI and Advanced editing entry point
    architecture-document.mjs # Full-editor command/session API
  schema/
    architecture-v1.schema.json # Architecture DSL v1 JSON Schema (draft 2020-12)
    README.md               # Schema use, versioning, and migration policy
    examples/               # Samples with relative $schema references
  vendor/
    marked.min.js           # Markdown renderer
    purify.min.js           # DOMPurify HTML sanitizer
    highlight.min.js        # Code syntax highlighting
    highlight.LICENSE       # highlight.js MIT license
    mermaid.min.js.part-*   # Split Mermaid bundle for the 1 MB file limit
```

## Third-party licenses

`vendor/` contains the following open-source software under their respective
licenses. See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for copyright
and license notices.

- **marked** — MIT License © 2011-2024 Christopher Jeffrey and contributors —
  https://github.com/markedjs/marked
- **DOMPurify** — Apache-2.0 / MPL-2.0 © Cure53 and contributors —
  https://github.com/cure53/DOMPurify
- **highlight.js** — MIT License © 2006 Ivan Sagalaev —
  https://github.com/highlightjs/highlight.js
- **Mermaid** — MIT License © 2014-2024 Knut Sveidqvist and contributors —
  https://github.com/mermaid-js/mermaid

`mermaid.min.js` is approximately 3 MB and is split into
`mermaid.min.js.part-*` to satisfy installer single-file limits. The extension
reassembles the parts in order when serving HTTP, so Gist and repository
installs retain Mermaid support. Source/chunk SHA-256 values are tracked in
`vendor/vendor-assets.lock.json`; regenerate and verify them with
`scripts/vendor-assets.mjs`.
