> English version: [English](../installation.md)

# MarkdStage をインストールする

使い方に合う画面を選びます。Canvas Extension は GitHub Copilot と一緒に作成する場合、
CLI はターミナルや自動化で使う場合、Desktop は Windows で発表する場合に向いています。

## GitHub Copilot Canvas Extension

このリポジトリをプロジェクトとして開くと、`.github/extensions/markdstage/` の Extension が
プロジェクトスコープで読み込まれます。

別のリポジトリへユーザースコープでインストールする場合は、信頼できるリリースタグを選び、
GitHub Copilot に次のように依頼します。

> 次の GitHub リポジトリフォルダーから MarkdStage をユーザースコープへインストールしてください。
>
> `https://github.com/runceel/markdstage/tree/<release-tag>/.github/extensions/markdstage`

インストールする前にローカルの Extension コードを確認してください。リリースタグかコミット SHA を
指定すれば、毎回同じ内容をインストールできます。

## MarkdStage CLI

### 必要なもの

- Node.js 24 以降
- インストール済みの Microsoft Edge、Google Chrome、または Chromium。MarkdStage がブラウザーを
  ダウンロードすることはありません。

### インストール

`npx` で直接実行するか、グローバルにインストールします。

```console
npx @markdstage/markdstage presentation slides.md
npx @markdstage/markdstage present slides.md
npm install --global @markdstage/markdstage
```

オフラインでインストールする場合は、[GitHub Release](https://github.com/runceel/markdstage/releases)
からバージョン付きの `markdstage-markdstage-<version>.tgz` と `.sha256` チェックサムをダウンロードし、
チェックサムを確認してからローカルの tarball をインストールします。

```powershell
Get-FileHash .\markdstage-markdstage-<version>.tgz -Algorithm SHA256
npm install --global .\markdstage-markdstage-<version>.tgz
```

## MarkdStage Desktop

### 必要なもの

- Windows
- Microsoft Edge WebView2 Runtime

.NET と Windows App SDK のコンポーネントはポータブルパッケージに同梱しています。

### インストールして起動する

1. [最新リリース](https://github.com/runceel/markdstage/releases/latest)から x64 または ARM64 の
   ポータブル ZIP をダウンロードします。
2. フォルダーごと展開します。
3. `MarkdStageApp.exe` を実行します。

発表と操作方法は [MarkdStage Desktop](desktop.md) を参照してください。
