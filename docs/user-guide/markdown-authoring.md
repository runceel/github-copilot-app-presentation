# Markdown authoring

> 日本語版: [日本語](ja/markdown-authoring.md)

MarkdStage keeps Markdown as the source of truth. A deck is a normal Markdown file with optional
front matter and `---` separators.

## Separate slides

Put `---` on its own line after a blank line:

```markdown
## First slide

- First point

---

## Second slide

- Second point
```

A separator inside a fenced code block is treated as code, not as a new slide.

## Configure the deck with front matter

Leading front matter provides shared deck settings:

```markdown
---
title: Quarterly review
deck: Quarterly review
theme: microsoft
layout: title
---

# Quarterly review
```

Each slide can also have its own front matter. Slide values override deck values.

| Key | Purpose |
| --- | --- |
| `title` | Browser or document title |
| `deck` | Deck name shown in the footer |
| `kicker` | Small label above the heading |
| `page` / `total` | Explicit page information |
| `layout` | `title`, `section`, `center`, or `backcover` |
| `size` | `auto`, `normal`, `large`, or `xlarge` |
| `theme` | `dark`, `light`, `microsoft`, or `custom` |
| `theme-file` | Workspace-relative custom theme CSS |
| `logo` / `copyright` | Back-cover metadata |

MarkdStage generates page information when it is omitted. Title, section, and back-cover slides do
not show page numbers. The interface counter includes the back cover, while generated slide-footer
totals exclude it.

## Use layouts intentionally

- Use `layout: title` on the first slide.
- Omit `layout` for normal top-aligned slides.
- Use `layout: section` for chapter dividers with a short heading.
- Use `layout: center` only for short content that should be vertically centered.
- A back cover is added automatically by the Canvas Extension unless one is already present.

See [Themes and layouts](themes-and-layouts.md) for examples.

## Control content size

`size: auto` is the default. It enlarges spacious standard slides but avoids automatic enlargement
for code, tables, images, and diagrams.

Use `normal`, `large`, or `xlarge` when you need an explicit size:

```markdown
---
size: large
---

## One important message
```

Imported Markdown can also use `<!-- slide-size: large -->` at the start of a slide.

## Write standard Markdown

MarkdStage supports:

- Headings, paragraphs, lists, block quotes, emphasis, and links
- Tables and inline code
- Fenced code blocks
- Images
- Mermaid diagrams
- Architecture DSL diagrams
- Emoji

Add a language name to fenced code for syntax highlighting:

````markdown
```csharp
var deck = new Presentation("slides.md");
```
````

## Add speaker notes

Put one or more top-level HTML comments in a slide:

```markdown
## Deployment

- Deploy after validation.

<!--
Explain the rollback plan before showing the command.
-->
```

Notes support Markdown. They appear in the Canvas presenter view, the Desktop main window, and the
CLI presenter view, and PowerPoint export converts them to plain text in each slide's notes pane.
They do not appear on normal slides, in the audience window, or in PDF output.

Comments inside code fences and `slide-size` directives are not treated as notes.

## Add local images

Place images in an `assets/` folder beside the Markdown file or at the workspace root:

```markdown
![Diagram showing the deployment flow](/assets/deployment.png)
```

The Markdown-adjacent `assets/` folder is checked first, allowing a deck to override a
workspace-wide image with the same path. Always write meaningful alternative text.

[Next: Themes and layouts →](themes-and-layouts.md)
