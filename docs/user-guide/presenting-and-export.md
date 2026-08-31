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
| Surface Pen | Supported on Windows | Supported while audience window is open |

## Prepare presenter view

Open presenter view in Canvas or use the Desktop main window. Confirm:

- The current slide is correct.
- The next slide preview is useful.
- Speaker notes contain only presenter guidance.
- The slide list has clear titles.

![Canvas presenter view prepared for delivery](images/canvas-presenter-view.png)

## Open the audience window

- **Canvas:** Select **⛶**, or select **Start presentation** in presenter view.
- **Desktop:** Select **Start presentation**.

Move the new window to the audience display. Press `F11` for fullscreen and `Esc` to leave
fullscreen. Navigation from the presenter and audience surfaces remains synchronized.

## Check fixed 16:9 output

In the Canvas Extension, select **16:9**. The slide is letterboxed with the exact 1280x720
typography, spacing, and content limits used by PDF output.

If content exceeds the fixed page, MarkdStage shows a clipping warning:

![A 16:9 preview warning that the current slide clips vertically](images/canvas-layout-warning.png)

Resolve the warning by shortening content, splitting the slide, using a more appropriate layout, or
reducing an explicitly enlarged content size.

You can also ask Copilot to inspect the deck's PDF layout and identify pages that need revision.

## Export PDF

1. Reload the source if it changed after the deck opened.
2. Select **16:9** and resolve clipping warnings.
3. Select the printer icon.
4. Open the generated PDF from the workspace and review every page.

When the deck was loaded from Markdown, the Canvas Extension derives the PDF name from the source
filename. The exported file contains one 16:9 page per slide, including the back cover, with
backgrounds, images, highlighted code, Mermaid, and Architecture diagrams.

Speaker notes and Architecture editing controls are excluded.

[Next: Troubleshooting →](troubleshooting.md)
