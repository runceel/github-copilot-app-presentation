# Custom theme authoring guide

This guide is a reference for people who create `custom` themes for the
MarkdStage canvas and for AI systems that generate themes.

## Minimum setup

Themes can be managed by folder. Put only custom properties in the CSS, and
define optional cover and back-cover assets in `theme.json` in the same folder.

```markdown
---
theme: custom
theme-file: themes/brand/theme.css
---
```

A minimal theme folder has the following structure. `theme.json` is optional;
without it, the theme works as a traditional CSS-only theme.

```text
themes/brand/
  theme.css
  theme.json
  assets/
    cover.svg
    logo.svg
```

`theme-file` resolves the same relative path in this order:

1. The same folder as the source Markdown
2. The repository root

For example, place `themes/brand/theme.css` at the repository root as a shared
theme for every deck. To override only `decks/quarterly/slides.md`, add
`decks/quarterly/themes/brand/theme.css`. Both Markdown files can specify
`theme-file: themes/brand/theme.css`; the file beside the Markdown takes
precedence. When AI registers a deck with `open` / `load_deck`, it passes the
source Markdown's workspace-relative path as `sourceName` for relative resolution.

```css
--bg: #101820;
--fg: #ffffff;
--body: #d7e3ef;
--accent: #00a4ef;
--surface: #182b3a;
--border: #31536b;
```

You may also wrap declarations in `:root { ... }`.

```css
:root {
  --bg: #101820;
  --accent: #00a4ef;
}
```

## Available properties

### Base slide colors

| Property | Purpose |
| --- | --- |
| `--bg` | Standard slide background |
| `--fg` | Headings and primary text |
| `--muted` | Secondary text |
| `--body` | Body text |
| `--accent` | Primary accent |
| `--accent-strong` | Strong accent |
| `--accent-soft` | Subtle accent background |
| `--accent-line` | Accent line |
| `--surface` | Cards and surfaces |
| `--code` | Code block background |
| `--code-fg` | Code block text |
| `--border` | Borders |

### Code syntax

`--syntax-comment`, `--syntax-keyword`, `--syntax-string`,
`--syntax-number`, `--syntax-title`, `--syntax-type`,
`--syntax-meta`, and `--syntax-variable` color corresponding code elements.

For diff rendering, use `--syntax-addition`, `--syntax-addition-bg`,
`--syntax-deletion`, and `--syntax-deletion-bg`.

### Decoration and covers

| Property | Purpose |
| --- | --- |
| `--glow-1` / `--glow-2` | Background glows |
| `--topbar` | Top bar background |
| `--kicker-mark` | Kicker mark |
| `--cover-bg` | Cover background |
| `--cover-topbar` | Top bar background used only on the cover |
| `--cover-text-align` | Cover body text alignment |
| `--cover-content-align` | Horizontal alignment within the cover body |
| `--cover-content-self` | Cover body area alignment |
| `--cover-content-width` | Cover body area width |
| `--cover-logo-width` | Cover logo width |
| `--section-bg` | Section-divider background |
| `--backcover-bg` | Back-cover background |
| `--backcover-logo-width` | Back-cover logo width |
| `--print-slide-bg` | Standard PDF page background |
| `--print-cover-bg` | PDF cover background |
| `--print-section-bg` | PDF section-divider background |
| `--ms-font` | Font for Microsoft-style themes |

`--ms-red`, `--ms-green`, `--ms-blue`, and `--ms-yellow` are also available as
supporting brand colors.

`--section-bg` and `--print-section-bg` are used as CSS `background` values.
They support solid colors and multiple comma-separated gradients. Theme-file
security restrictions prohibit `url()`. Section dividers have no image, logo,
or icon settings in `theme.json`.

## theme.json

A `theme.json` file in the CSS folder is loaded automatically. Specify image
paths relative to `theme.json` using the `assets/...` form.

```json
{
  "$schema": "../../.github/extensions/markdstage/schema/theme-metadata-v1.schema.json",
  "version": 1,
  "cover": {
    "background": { "image": "assets/cover.svg" },
    "logo": { "image": "assets/logo.svg", "alt": "Example" }
  },
  "backcover": {
    "logo": { "image": "assets/logo-light.svg", "alt": "Example" },
    "copyright": "Copyright Example"
  }
}
```

- `cover.background` is decorative, so `alt` is optional.
- Logo `alt` text is required.
- Supported formats are SVG / PNG / WebP / JPEG, with a 2 MiB limit per file.
- Absolute paths, external URLs, `..`, and symbolic links outside the theme
  folder are rejected.
- If an existing `theme.json` is invalid, loading returns an error rather than
  silently falling back to CSS only.
- Slide-front-matter `logo` / `copyright` values override back-cover metadata.

### Sizing and spacing

You may change `--deck-pad-y`, `--deck-pad-x`, `--slide-h1-size`,
`--slide-h2-size`, `--slide-h3-size`, `--slide-body-size`, and
`--slide-code-size`.

Values may use CSS units and functions such as `px`, `rem`, and `clamp(...)`.

## Authoring considerations

- Runtime accepts arbitrary custom properties beginning with `--`, but only the
  names documented here are used by standard layouts.
- Values cannot be empty.
- Selectors, `@import`, `url(...)`, `javascript:`, and `expression(...)` are prohibited.
- Do not put arbitrary CSS rules or JavaScript in a theme file.
- Keep theme files in the workspace and use relative paths that resolve safely
  from the Markdown or repository root.
- The maximum theme file size is 64 KiB.
- The maximum `theme.json` size is 64 KiB.
- When a property appears more than once, the final value wins.
- Gradients are supported in addition to solid colors. Verify contrast for body
  and secondary text.
- The same theme applies to PDF output.

## Example

```css
:root {
  --bg: #0b1320;
  --fg: #f7fbff;
  --muted: #9bb0c6;
  --body: #d9e7f2;
  --accent: #42d3ff;
  --accent-strong: #a6f36b;
  --accent-soft: rgb(66 211 255 / 14%);
  --accent-line: rgb(66 211 255 / 45%);
  --surface: #14263a;
  --code: #101e2e;
  --code-fg: #c6e6ff;
  --border: #2d4d68;
  --topbar: linear-gradient(90deg, #42d3ff, #a6f36b);
  --kicker-mark: linear-gradient(135deg, #42d3ff, #a6f36b);
  --cover-bg: linear-gradient(145deg, #102b48, #101729);
  --cover-text-align: left;
  --cover-content-align: flex-start;
  --cover-content-width: 62%;
  --section-bg:
    linear-gradient(55deg, transparent 76%, #42d3ff 77%, transparent 78%),
    radial-gradient(110% 55% at 60% 115%, #42d3ff, #315b32 42%, transparent 72%),
    #0b1320;
  --print-section-bg: var(--section-bg);
  --backcover-bg: linear-gradient(145deg, #0d6b91, #315b32);
}
```

## Guidance for AI theme selection

- When explicit brand colors are requested, use `custom` with `theme-file`.
- When built-in themes satisfy a request such as "bright" or "dark," use
  `light` or `dark` rather than creating a custom theme.
- Before creating a custom theme, retrieve `theme-schema` from
  `markdstage_guide` and verify property names.
