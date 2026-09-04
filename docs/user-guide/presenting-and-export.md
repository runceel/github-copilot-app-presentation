# Presenting and export

> 日本語版: [日本語](ja/presenting-and-export.md)

Canvas and Desktop use the same renderer, so the audience output stays consistent. The available
preparation and export tools differ by surface.

## Compare presentation features

| Feature | Canvas Extension | Desktop |
| --- | --- | --- |
| Current slide | Yes | Yes |
| Next-slide preview | Presenter view | Main window |
| Speaker notes | Presenter view | Main window |
| Slide overview | Yes | Yes |
| External/audience window | Yes | Yes |
| Synchronized navigation | Yes | Yes |
| Fullscreen audience view | `F11` | `F11` |
| 16:9 clipping preview | Yes | No |
| PDF export | Yes | No |
| Editable PowerPoint export | Yes | No |
| Surface Pen | Supported on Windows | Supported while audience window is open |

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

Headings, paragraphs, lists, links, simple tables, fenced code blocks, supported images, and
Architecture DSL objects are native PowerPoint content. Code blocks retain editable
syntax-highlighted runs, indentation, blank lines, monospace typography, backgrounds, borders, and
accent edges. Each contiguous list is one editable PowerPoint text box, including nested levels, and
its bullet colors follow the rendered slide theme. Architecture nodes, groups, and connector-label pills are visible AutoShapes with
their labels stored inside the shape; diagram icons are transparent foreground pictures above those
shapes. Supported SVG files remain individual pictures. Decorative backgrounds, gradients,
code-block shadows, Mermaid, unsupported image effects, and unsupported HTML/CSS are preserved as
individually positioned fallback pictures instead of a full-slide transparent image. The exported
presentation creates one slide master for each theme used in the deck, with named `title`, `default`,
`center`, `section`, and `backcover` layouts. Theme-common backgrounds and top bars live in layout
artwork, while supported cover logos are separate layout pictures. Slide-specific decorations such
as footer rules, page-number frames, and kicker marks are cropped to their painted bounds. The
export report lists these fallbacks instead of silently omitting them.

Native Japanese text uses Yu Gothic as its primary East Asian font, while Latin text keeps the font
selected by the rendered slide. Exported native text is marked as not requiring proofing, so
PowerPoint does not add spelling or grammar underlines.

PowerPoint export uses the same 13.333333 x 7.5 inch page size and frozen in-memory deck snapshot as
PDF export, including temporary slide replacements and the automatic back cover. Speaker-note
Markdown is converted to readable plain text in the corresponding PowerPoint notes pane.
Architecture editing controls are excluded. The result aims for practical fidelity, not
pixel-perfect Chromium equivalence or general HTML/CSS conversion.

[Next: Troubleshooting →](troubleshooting.md)
