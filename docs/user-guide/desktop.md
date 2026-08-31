# MarkdStage Desktop

> 日本語版: [日本語](ja/desktop.md)

MarkdStage Desktop is a standalone WinUI 3 presenter for Windows. It uses the same renderer as the
Canvas Extension and opens `.md` and `.markdown` files through the Windows file picker.

## Install and start

1. Download the x64 or ARM64 portable ZIP from the
   [latest release](https://github.com/runceel/markdstage/releases/latest).
2. Extract the complete folder.
3. Run `MarkdStageApp.exe`.

Microsoft Edge WebView2 Runtime must be installed. The portable package already includes the
required .NET and Windows App SDK components.

## Open a Markdown file

Select **Open Markdown**, choose a deck, and wait for the previews to appear.

![The Desktop main window with current slide, next slide, and speaker notes](images/desktop-main.png)

The main window contains:

- A large, interactive current-slide preview
- A display-only next-slide preview
- Speaker notes for the current slide
- Previous and next buttons with a page counter
- Commands for opening Markdown, opening the slide overview, and starting the audience window

## Navigate

| Input | Action |
| --- | --- |
| `Left` / `PageUp` | Previous slide |
| `Right` / `PageDown` / `Space` | Next slide |
| `Home` | First slide |
| `End` | Last slide |
| `O` | Open slide overview |
| Left-click or tap an empty margin | Next slide |
| Right-click an empty margin | Previous slide |

Margin navigation applies to the current-slide preview and the audience window. Interactive slide
content is excluded.

## Open the slide overview

Select **Slide overview** or press `O`. Choose a page number and title to jump directly to that
slide.

![The Desktop slide overview dialog](images/desktop-slide-overview.png)

## Use speaker notes

Write notes in a top-level HTML comment:

```markdown
## Demonstration

- The audience sees this content.

<!--
Explain the setup, then run the demo.
-->
```

Desktop renders notes for the current slide only. Notes are never shown in the audience window.

## Present to an audience

Select **Start presentation** to open the synchronized audience window.

![The Desktop audience window showing the current slide](images/desktop-audience.png)

- Move the audience window to the target display.
- Press `F11` for fullscreen.
- Press `Esc` to return to windowed mode.
- Close the audience window or select **End presentation** to stop presenting.

Navigation from either window updates both views.

## Automatic reload

Desktop watches the selected Markdown file. When a valid save is detected, it reloads the deck and
keeps the current slide when possible.

If a save is invalid, Desktop displays an error and keeps the last successfully rendered deck. Fix
and save the file again to recover.

## Surface Pen

While the audience window is open:

| Gesture | Action |
| --- | --- |
| Press the tail button once | Next slide |
| Hold the tail button | Previous slide |

Connecting, removing, or docking the pen does not open MarkdStage or start a presentation.

## Desktop limitations

Desktop focuses on presenting. Markdown editing, PDF export, Architecture editing, and a timer are
not available in the current Desktop app.

[Next: Markdown authoring →](markdown-authoring.md)
