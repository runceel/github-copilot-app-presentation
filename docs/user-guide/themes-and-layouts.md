# Themes and layouts

> 日本語版: [日本語](ja/themes-and-layouts.md)

Themes define colors and typography. Layouts define how an individual slide positions its content.

## Built-in themes

Set the deck-wide theme in front matter:

```markdown
---
theme: dark
---
```

| Theme | Use it for |
| --- | --- |
| `dark` | The default dark navy presentation style |
| `light` | Bright, neutral presentations |
| `microsoft` | Microsoft, Fluent, or Office-inspired presentations |
| `custom` | Organizational colors and cover assets |

The Canvas Extension can apply an explicit theme when opening a deck. That choice takes precedence
over Markdown front matter; otherwise `dark` is the default.

## Slide layouts

### Title

Use a title layout for the first slide:

```markdown
---
layout: title
---

# Product launch

Technical briefing
```

### Standard

Omit `layout` for a normal slide. The first H1 or H2 stays in the title region and the body starts
below it.

### Section

Use a section divider between chapters:

```markdown
---
layout: section
---

## Architecture
```

Keep section slides short.

### Center

Use `layout: center` for a small amount of content that should be vertically centered:

```markdown
---
layout: center
---

## One decision

Adopt the shared platform.
```

### Back cover

The Canvas Extension appends a back cover automatically. Add `logo` or `copyright` in front matter
or custom-theme metadata when you want those values displayed.

## Create a custom theme

Use a folder containing `theme.css` and optional metadata:

```text
themes/brand/
  theme.css
  theme.json
  assets/
    cover.svg
    logo.svg
```

Reference it from Markdown:

```markdown
---
theme: custom
theme-file: themes/brand/theme.css
---
```

`theme.css` contains CSS custom-property declarations only:

```css
:root {
  --bg: #101820;
  --fg: #ffffff;
  --body: #d7e3ef;
  --accent: #00a4ef;
  --surface: #182b3a;
  --border: #31536b;
}
```

Selectors, `@import`, `url()`, JavaScript, and paths outside the workspace are rejected. A sibling
`theme.json` can define cover and back-cover images, logos, and copyright.

For the complete property reference, see
[Custom theme authoring](../../.github/extensions/markdstage/docs/custom-theme-authoring.md).

## Check layout before presenting

Content can look acceptable in a flexible canvas but clip in fixed 16:9 output. In the Canvas
Extension, select **16:9** and resolve every warning before exporting.

[Next: Diagrams and media →](diagrams-and-media.md)
