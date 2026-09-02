# Troubleshooting

> 日本語版: [日本語](ja/troubleshooting.md)

## The Canvas Extension is unavailable

- Confirm the repository contains `.github/extensions/markdstage/`, or install the extension at
  user scope from a trusted release tag.
- Reopen the project after installation.
- Use canvas ID `MarkdStage` if you are opening it through a direct canvas workflow.

## Desktop cannot initialize the preview

Install or repair Microsoft Edge WebView2 Runtime, then restart MarkdStage Desktop. Also confirm the
user profile can write to its local application data folder.

## A Markdown file does not appear in the Canvas picker

- Confirm the file ends in `.md` or `.markdown`.
- Confirm it is inside the current workspace.
- In a Git repository, the workspace root is the repository root.

The picker does not allow paths outside the workspace.

## Slides split in the wrong place

- Put a blank line before a `---` separator.
- Keep the separator on its own line.
- Close fenced code blocks correctly.
- Remember that `---` directly below text can be interpreted as a Setext heading.

## A saved file does not update

- In Canvas, confirm **Refresh automatically on save** is active.
- In Desktop, confirm the same file is still selected.
- Fix empty, unreadable, or invalid Markdown. MarkdStage retains the last valid deck and recovers on
  the next valid save.

## Images do not load

- For Markdown, use `/assets/file.png`.
- For Architecture DSL, use `assets/file.png`.
- Put the file in `assets/` beside the Markdown or at the workspace root.
- Do not use `..` to escape the workspace.
- Check capitalization and the file extension.

## A custom theme does not load

- Set `theme: custom` and a relative `theme-file`.
- Put the theme beside the Markdown or at the workspace root.
- Use custom-property declarations only.
- Remove selectors, `@import`, `url()`, JavaScript, and external paths.
- Validate `theme.json`; an invalid metadata file is reported instead of ignored.

## A slide clips in PDF

Select **More controls > Output preview** in Canvas and use the warning to find the affected page.
Shorten or split the content. `layout: center` changes alignment, not available space, and is not a
clipping fix.

## Mermaid or Architecture shows an error

- Check the fenced block name and closing fence.
- Validate Mermaid syntax.
- Validate Architecture JSON, unique element IDs, references, positions, and supported values.
- Keep other slide content visible while correcting the diagram error.

## Architecture changes cannot be saved

- Advanced editing requires Markdown imported through **More controls > Open Markdown**.
- The source must already contain an `architecture` block.
- If the source changed externally, reload it instead of overwriting the newer file.
- Layout-managed children must be released from their group layout before manual movement.

## The audience window does not enter fullscreen

Focus the audience window, then press `F11`. Press `Esc` to return to windowed mode. If another
application intercepts the key, use the operating system's window controls.

[Back to the user guide](README.md)
