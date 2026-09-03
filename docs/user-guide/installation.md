> 日本語版: [日本語](ja/installation.md)

# Install MarkdStage

Choose the surface that matches how you want to work. The Canvas Extension is for authoring with
GitHub Copilot, the CLI is for terminal and automation workflows, and Desktop is for presenting on
Windows.

## GitHub Copilot Canvas Extension

When this repository is opened as a project, the extension under
`.github/extensions/markdstage/` loads at project scope.

To install it at user scope in another repository, choose a trusted release tag and ask GitHub
Copilot:

> Install MarkdStage at user scope from the following GitHub repository folder.
>
> `https://github.com/runceel/markdstage/tree/<release-tag>/.github/extensions/markdstage`

Review local extension code before installing it. A release tag or commit SHA provides a
reproducible installation.

## MarkdStage CLI

### Requirements

- Node.js 24 or later.
- An installed Microsoft Edge, Google Chrome, or Chromium. MarkdStage never downloads a browser.

### Install

Run directly with `npx`, or install globally:

```console
npx @markdstage/markdstage presentation slides.md
npx @markdstage/markdstage present slides.md
npm install --global @markdstage/markdstage
```

For offline installation, download the versioned `markdstage-markdstage-<version>.tgz` asset and
its `.sha256` checksum from the [GitHub Release](https://github.com/runceel/markdstage/releases),
verify the checksum, then install the tarball locally:

```powershell
Get-FileHash .\markdstage-markdstage-<version>.tgz -Algorithm SHA256
npm install --global .\markdstage-markdstage-<version>.tgz
```

## MarkdStage Desktop

### Requirements

- Windows.
- Microsoft Edge WebView2 Runtime.

The portable package already includes the required .NET and Windows App SDK components.

### Install and start

1. Download the x64 or ARM64 portable ZIP from the
   [latest release](https://github.com/runceel/markdstage/releases/latest).
2. Extract the complete folder.
3. Run `MarkdStageApp.exe`.

See [MarkdStage Desktop](desktop.md) for presenting and navigation instructions.
