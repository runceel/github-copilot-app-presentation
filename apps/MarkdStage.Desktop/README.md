# MarkdStage Desktop

**Markdown, ready for the stage.**

MarkdStage (pronounced "marked stage") is a WinUI 3 app that displays Markdown with the same
renderer as the MarkdStage canvas, independently of the GitHub Copilot App.

## Features

- Open `.md` and `.markdown` files with the Windows file picker.
- Preview the current and next slides in 16:9.
- Show Slidev/Marp-style HTML comments as speaker notes for the current slide.
- Open the slide overview from the toolbar or with O, then jump to any slide.
- Navigate with the arrow keys, PageUp/PageDown, Space, Home, and End.
- On the current slide in the audience and presenter views, left-click or tap a margin to move
  forward and right-click a margin to move back.
- Reload automatically when the Markdown file is saved while preserving the current slide.
- Preserve the last valid deck when a reload fails.
- Open the audience view as a native WinUI 3 window with a full-bleed WebView2 in the same process.
- Support dark, light, Microsoft, and custom themes; Mermaid; code highlighting; Architecture DSL;
  and local images.

The audience window opens at 1280x720 with a standard title bar in the default Windows position.
Press F11 to enter full screen and Esc to return to windowed mode. Esc in windowed mode does not
interfere with the slide's existing behavior. State stays synchronized whether the presentation is
started or ended from the main window, the audience window is closed directly, or the app exits.

Surface Pen controls are active only while the audience window opened from the main window is
running. Press the tail button once to move forward and hold it to move back. Removing, connecting,
or docking the pen never launches the app or audience window, and pen input never opens or closes
the audience window.

Margin clicks exclude interactive areas such as slide content, links, and images. The next-slide
preview in the presenter view is display-only.

## Development environment

1. Install the Copilot CLI plugin.

   ```powershell
   copilot plugin marketplace add microsoft/win-dev-skills
   copilot plugin install winui@win-dev-skills
   ```

2. Install .NET SDK 10.x and WinApp CLI 0.6.0 or later, and enable Developer Mode.
3. Run `scripts\BuildAndRun.ps1 --arch arm64` or
   `scripts\BuildAndRun.ps1 --arch x64`.

`BuildAndRun.ps1` uses the analyzer bundled with the WinUI plugin and
`winapp run --debug-output`. CI runs `dotnet build` and `dotnet test` without depending on the
plugin.

## Testing

```powershell
dotnet test tests\MarkdStage.Core.Tests\MarkdStage.Core.Tests.csproj
npm run test:unit
```

Run the UI Automation tests while the app is running.

```powershell
tests\MarkdStage.UiTests\ui-tests.ps1 -AppPid <PID>
```

## Portable build

Create an unpackaged folder containing the Windows App SDK and .NET runtime, then package it as a
ZIP file.

```powershell
scripts\Publish.ps1 -Architecture x64
scripts\Publish.ps1 -Architecture arm64
```

The output is `artifacts\MarkdStage-win-<architecture>.zip`, and the entry point is
`MarkdStageApp.exe`. This is a folder-based distribution rather than a single executable; it
includes the renderer, native DLLs, and third-party notices.

Microsoft Edge WebView2 Runtime is required on the target system. The audience view uses a native
window built into the app, so a separate Edge, Chrome, or Chromium installation is not required.

## Markdown and assets

- Separate slides with `---` after a blank line.
- Resolve the `assets\` folder next to the Markdown file first, then the `assets\` folder at the
  nearest Git root.
- For Markdown files outside Git, treat the file's directory as the workspace root.
- Resolve `theme-file` from the Markdown directory first, then the Git root.
- Write speaker notes in top-level HTML comments on each slide. Comments inside code fences and
  `slide-size` directives are excluded from speaker notes.
- Reject paths outside the workspace, junction or symlink escapes, and oversized files.

Markdown editing, PDF export, the Architecture editor, and a timer are outside the scope of the
initial release.
