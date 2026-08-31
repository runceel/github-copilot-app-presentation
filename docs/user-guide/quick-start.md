# Quick start

> 日本語版: [日本語](ja/quick-start.md)

This walkthrough uses the included [`examples/quick-start.md`](examples/quick-start.md) deck. Copy
it to your own workspace or use it directly from this repository.

## 1. Create a Markdown deck

A minimal deck contains front matter, a title, and `---` slide separators:

```markdown
---
title: My first deck
theme: dark
layout: title
---

# My first deck

Markdown, ready for the stage.

---

## Next slide

- Write standard Markdown
- Keep one main idea per slide
```

Save the file with a `.md` or `.markdown` extension.

## 2. Open it in the Canvas Extension

Use either method:

- Ask GitHub Copilot: `Present this deck using docs/user-guide/examples/quick-start.md.`
- Open the MarkdStage canvas, select **📂 Load Markdown**, and choose the file.

The complete deck opens immediately. Use **◀**, **▶**, the arrow keys, or **☰** to navigate.

![The Canvas Extension showing a Markdown deck and its presentation controls](images/canvas-main.png)

## 3. Open it in MarkdStage Desktop

1. Download the appropriate portable ZIP from the
   [latest MarkdStage release](https://github.com/runceel/markdstage/releases/latest).
2. Extract the ZIP.
3. Run `MarkdStageApp.exe`.
4. Select **Open Markdown** and choose the same file.

The main window shows the current slide, next slide, and current speaker notes.

![MarkdStage Desktop showing current and next slides with speaker notes](images/desktop-main.png)

## 4. Present

- **Canvas Extension:** Select **⛶** for an external audience window, or open **Presenter view** to
  keep the current slide, next slide, and notes together.
- **Desktop:** Select **Start presentation** to open the synchronized audience window.
- Press `F11` in the audience window for fullscreen and `Esc` to leave fullscreen.

## 5. Export a PDF

PDF export is available in the Canvas Extension:

1. Select **16:9** and correct any clipping warning.
2. Select the printer icon.
3. Use the generated 16:9 PDF from the workspace.

MarkdStage Desktop does not export PDF.

## Next steps

- [Complete the GitHub Copilot hands-on](copilot-hands-on.md)
- [Create slides with GitHub Copilot](ai-assisted-authoring.md)
- [Use the Canvas Extension](canvas-extension.md)
- [Use MarkdStage Desktop](desktop.md)
- [Author Markdown slides](markdown-authoring.md)
