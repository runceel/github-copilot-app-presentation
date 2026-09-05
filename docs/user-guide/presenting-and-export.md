# Presenting and export

> 日本語版: [日本語](ja/presenting-and-export.md)

Canvas, Desktop, and the CLI use the same renderer, so the audience output stays consistent. The
available preparation and export tools differ by surface.

## Compare presentation features

| Feature | Canvas Extension | Desktop | CLI |
| --- | --- | --- | --- |
| Current slide | Yes | Yes | Yes |
| Next-slide preview | Presenter view | Main window | Presenter view |
| Speaker notes | Presenter view | Main window | Presenter view |
| Slide overview | Yes | Yes | Yes |
| External/audience window | Yes | Yes | Yes |
| Synchronized navigation | Yes | Yes | Yes |
| Fullscreen audience view | `F11` | `F11` | `F11` |
| 16:9 clipping preview | Yes | No | `markdstage inspect` |
| PDF export | Yes | No | `markdstage export --output slides.pdf` |
| Editable PowerPoint export | Yes | No | `markdstage export --output slides.pptx` |
| Surface Pen | Supported on Windows | Supported while audience window is open | No |

## Prepare presenter view

Open presenter view in Canvas or use the Desktop main window. Confirm:

- The current slide is correct.
- The next slide preview is useful.
- Speaker notes contain only presenter guidance.
- The slide list has clear titles.

![Canvas presenter view prepared for delivery](images/canvas-presenter-view.png)

## Open the audience window

- **Canvas:** Select **More controls > External window**, or select **Start presentation** in
  presenter view.
- **Desktop:** Select **Start presentation**.

Move the new window to the audience display. Press `F11` for fullscreen and `Esc` to leave
fullscreen. Navigation from the presenter and audience surfaces remains synchronized.

## Check fixed 16:9 output

In the Canvas Extension, select **More controls > Output preview**. The slide is letterboxed with
the exact 1280x720 typography, spacing, and content limits used by PDF output.

If content exceeds the fixed page, MarkdStage shows a clipping warning:

![A 16:9 preview warning that the current slide clips vertically](images/canvas-layout-warning.png)

Resolve the warning by shortening content, splitting the slide, using a more appropriate layout, or
reducing an explicitly enlarged content size.

You can also ask Copilot to inspect the deck's PDF layout and identify pages that need revision.

## Export PDF

1. Reload the source if it changed after the deck opened.
2. Select **More controls > Output preview** and resolve clipping warnings.
3. Select **More controls > Export PDF**.
4. Open the generated PDF from the workspace and review every page.

When the deck was loaded from Markdown, the Canvas Extension derives the PDF name from the source
filename. The exported file contains one 16:9 page per slide, including the back cover, with
backgrounds, images, highlighted code, Mermaid, and Architecture diagrams.

Speaker notes and Architecture editing controls are excluded.

## Export editable PowerPoint

1. Reload the source if it changed after the deck opened.
2. Select **More controls > Output preview** and resolve clipping warnings.
3. Select **More controls > Export PowerPoint**, or run
   `markdstage export slides.md --output slides.pptx`.
4. Open the generated presentation and review every slide.

Native PowerPoint objects stay editable; anything the converter cannot express natively becomes a
fallback picture that is positioned individually rather than flattened into a full-slide image.

| Markdown element | In PowerPoint |
| --- | --- |
| Headings, paragraphs, links | Native editable text |
| Bullet and numbered lists | One editable text box per contiguous list, including nested levels, with bullet colors from the slide theme |
| Simple tables | Native editable table |
| Fenced code blocks | Native text with editable syntax-highlighted runs, indentation, blank lines, monospace typography, backgrounds, borders, and accent edges |
| Architecture DSL nodes, groups, and connector labels | AutoShapes with their labels stored inside the shape |
| Architecture DSL icons | Transparent foreground pictures above those shapes |
| Images, including supported SVG | Individual pictures |
| Speaker notes | Plain text in the slide's notes pane |
| Mermaid diagrams | Fallback picture |
| Decorative backgrounds, gradients, and code-block shadows | Fallback picture |
| Unsupported image effects and HTML/CSS | Fallback picture |

The export report lists every fallback instead of silently omitting it.

The exported presentation creates one slide master for each theme used in the deck, with named
`title`, `default`, `center`, `section`, and `backcover` layouts. Theme-common backgrounds and top
bars live in layout artwork, while supported cover logos are separate layout pictures.
Slide-specific decorations such as footer rules, page-number frames, and kicker marks are cropped to
their painted bounds.

Native Japanese text uses Yu Gothic as its primary East Asian font, while Latin text keeps the font
selected by the rendered slide. Exported native text is marked as not requiring proofing, so
PowerPoint does not add spelling or grammar underlines.

PowerPoint export uses the same 13.333333 x 7.5 inch page size and frozen in-memory deck snapshot as
PDF export, including temporary slide replacements and the automatic back cover. Architecture
editing controls are excluded. The result aims for practical fidelity, not pixel-perfect Chromium
equivalence or general HTML/CSS conversion.

[Next: Troubleshooting →](troubleshooting.md)
