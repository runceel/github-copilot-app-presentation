<p align="center">
  <a href="https://github.com/runceel/markdstage">
    <img src="./assets/brand/markdstage-banner.svg" alt="MarkdStage - Markdown, ready for the stage." width="100%">
  </a>
</p>

<h1 align="center">MarkdStage</h1>

<p align="center">
  <strong>Markdown, ready for the stage.</strong>
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/runceel/markdstage/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/runceel/markdstage/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-FFB547?labelColor=0B1020"></a>
  <img alt="Source format: Markdown" src="https://img.shields.io/badge/source-Markdown-F7F4ED?labelColor=0B1020">
  <img alt="Windows: x64 and ARM64" src="https://img.shields.io/badge/Windows-x64%20%7C%20ARM64-F7F4ED?labelColor=0B1020">
</p>

<p align="center">
  <a href="#canvas-extension">Canvas Extension</a> |
  <a href="#desktop">Desktop</a> |
  <a href="#examples">表示例</a> |
  <a href="#markdown-format">Markdown 形式</a> |
  <a href="#documentation">ドキュメント</a> |
  <a href="https://github.com/runceel/markdstage/releases">リリース</a>
</p>

MarkdStage は、Markdown を直接洗練されたスライドに変換するオープンソースのプレゼンテーションツールです。
編集、同期されたプレゼンテーション、スピーカーノート、PDF エクスポートに対応しています。
GitHub Copilot ネイティブの Canvas Extension とスタンドアロンの Windows アプリは同じレンダラーを共有するため、
最初の下書きから登壇まで Markdown を信頼できる唯一の情報源として維持できます。

## MarkdStage を選ぶ理由

- **Markdown がソース**: 独自形式へ移行せず、`.md` を信頼できる唯一の情報源として維持できます
- **書いたらすぐに発表**: Canvas または Desktop でファイルを開くだけでスライドデッキになります
- **技術コンテンツをそのまま表示**: コード、Mermaid、Architecture DSL、画像、表、スピーカーノートに対応します
- **出力の一貫性を維持**: Canvas、プレゼンテーションウィンドウ、Desktop、PDF で同じレンダラーを使用します
- **エクスポート前に PDF への収まりを確認**: 固定 16:9 レイアウトをプレビューし、クリッピングを検出して、必要なページだけを画像で確認できます
- **発表に集中できる操作**: ボタン、キーボード、対応環境の Surface Pen で移動できます

<a id="examples"></a>

## Markdown をステージへ

GitHub Copilot Canvas、プレゼンテーションウィンドウ、Desktop アプリ、PDF エクスポートは、
すべて同じ Markdown レンダラーを使用します。

<table>
  <tr>
    <td width="50%">
      <img src="./assets/readme/simple-slide.png" alt="MarkdStage で表示した標準 Markdown スライド">
    </td>
    <td width="50%">
      <img src="./assets/readme/architecture-dsl.png" alt="MarkdStage スライドで表示した Architecture DSL 図">
    </td>
  </tr>
  <tr>
    <td valign="top">
      <strong>標準 Markdown</strong><br>
      見出し、リスト、強調、コード、表、画像を直接記述できます。自動レイアウトが便利な場合は
      Mermaid も使用できます。
    </td>
    <td valign="top">
      <strong>Architecture DSL</strong><br>
      安定したグループ、アイコン、配置、コネクタールーティングが必要な場合は、
      <code>architecture</code> フェンス内に JSON を記述します。
    </td>
  </tr>
</table>

MarkdStage Canvas はアクティブなデッキと Architecture DSL を GitHub Copilot App のコンテキストへ提供します。
そのため、作成したい図を自然言語で説明し、Copilot に Markdown の作成や修正を依頼できます。

視覚的に編集する場合は、**📂** でソース Markdown を読み込み、
**✎ → Advanced editing** を選択して専用の Architecture Editor を使用します。
ノード、グループ、画像、コネクターの追加、削除、配置、確認が可能です。
変更は **Save** で Markdown に書き戻すまでドラフトとして保持されます。

<p align="center">
  <img src="./assets/readme/architecture-editor.png" alt="API ノードを選択した MarkdStage Architecture Editor" width="100%">
</p>

## MarkdStage の2つの使い方

| サーフェス | 用途 |
| --- | --- |
| **MarkdStage Canvas** | GitHub Copilot に Markdown の要約やスライド化を依頼するか、Canvas の 📂 ボタンから直接読み込みます |
| **MarkdStage Desktop** | GitHub Copilot を開かずに、Markdown、次のスライド、スピーカーノートを確認しながら Windows で発表します |

<a id="canvas-extension"></a>

## Canvas Extension を使う

このリポジトリをプロジェクトとして開くと、`.github/extensions/markdstage/` がプロジェクトスコープで
読み込まれます。別のリポジトリへユーザースコープでインストールする場合は、現在の
**[v2.1.2 リリース](https://github.com/runceel/markdstage/releases/tag/v2.1.2)** を指定して
GitHub Copilot に依頼します。

> 次の GitHub リポジトリフォルダーから MarkdStage をユーザースコープへインストールしてください。
>
> `https://github.com/runceel/markdstage/tree/v2.1.2/.github/extensions/markdstage`

Extension はユーザー環境でローカルコードを実行します。インストール前に内容を確認し、
再現可能なインストールには信頼できるリリースタグまたはコミット SHA を使用してください。
`main` ブランチは最新の開発版です。

### 最小ワークフロー

1. `slides.md` を編集し、空行の後の `---` でスライドを区切ります。
2. Copilot に「`slides.md` を使ってこのデッキをプレゼンテーションしてください」と依頼します。
3. MarkdStage Canvas の **◀ ▶**、**矢印キー**、または **☰ スライド一覧**で移動します。
4. PDF エクスポート前に **16:9** を使用します。Copilot は先に `inspect_layout` を実行し、必要なページだけを PNG プレビューとして生成できます。

Canvas の **📂** ボタンまたは `I` キーを使用すると、AI を介さずにワークスペースから Markdown を
直接開くこともできます。Git リポジトリではリポジトリルート、それ以外では現在のセッションで開いている
フォルダーがワークスペースになります。`open_canvas` を直接呼び出す場合の Canvas ID は
**`MarkdStage`** です。

```text
canvasId: MarkdStage
```

<a id="desktop"></a>

## MarkdStage Desktop を使う

[MarkdStage Desktop](./apps/MarkdStage.Desktop/README.md) は、ファイルピッカーから Markdown を開く
WinUI 3 アプリです。現在のスライド、次のスライド、現在のスピーカーノートを表示し、
同期されたネイティブのプレゼンテーションウィンドウを起動します。

現在の **[v2.1.2 リリース](https://github.com/runceel/markdstage/releases/tag/v2.1.2)** には、
Windows x64 / ARM64 向けのポータブルビルドと SHA-256 チェックサムファイルが含まれます。

- [MarkdStage-win-x64.zip](https://github.com/runceel/markdstage/releases/download/v2.1.2/MarkdStage-win-x64.zip)
- [MarkdStage-win-arm64.zip](https://github.com/runceel/markdstage/releases/download/v2.1.2/MarkdStage-win-arm64.zip)

<a id="markdown-format"></a>

## Markdown 形式

```markdown
---
title: Sample
theme: dark
layout: title
---

# Markdown, ready for the stage.

---

## Second slide

- Use standard Markdown
- Write code and Mermaid directly
```

先頭のフロントマターはデッキ全体の設定を提供します。各スライドのフロントマターでは、
`layout`、`size`、`theme` などを上書きできます。スピーカーノートは各スライドのトップレベル
HTML コメントに記述し、発表者ビューだけに表示されます。

## リポジトリ構成

| パス | 内容 |
| --- | --- |
| `.github/extensions/markdstage/` | Canvas Extension、レンダラー、同梱オープンソースソフトウェア、スキーマ |
| `.github/skills/markdstage/SKILL.md` | Markdown をスライド断片へ整形して MarkdStage を開く Skill |
| `apps/MarkdStage.Desktop/` | WinUI 3 Desktop アプリ |
| `assets/brand/` | MarkdStage のロゴ、ロックアップ、README バナー |
| `assets/readme/` | この README で使用するスライドと Architecture Editor の画像 |
| `slides.md` | 機能を紹介するサンプルデッキ |

## v2.0.0 の破壊的変更

MarkdStage への移行では、以前のブランド名に対する互換エイリアスは提供されません。

| 変更前 | 変更後 |
| --- | --- |
| Canvas ID `presentation` | Canvas ID `MarkdStage` |
| ツール `presentation_guide` | ツール `markdstage_guide` |
| `.github/extensions/presentation/` | `.github/extensions/markdstage/` |
| `.github/skills/presentation/` | `.github/skills/markdstage/` |
| `Presentation-win-*.zip` | `MarkdStage-win-*.zip` |

既存の Markdown 構文、テーマ、Architecture DSL、`load_deck` や `goto_slide` などの
アクションコントラクトは変更されません。

<a id="documentation"></a>

## ドキュメント

- [ユーザーガイド](./docs/user-guide/ja/README.md)
- [GitHub Copilot とスライドを作成する](./docs/user-guide/ja/ai-assisted-authoring.md)
- [GitHub Copilot ハンズオン](./docs/user-guide/ja/copilot-hands-on.md)
- [MarkdStage Skill](./.github/skills/markdstage/SKILL.md)
- [Canvas Extension の仕様とアクション](./.github/extensions/markdstage/README.md)
- [MarkdStage Desktop](./apps/MarkdStage.Desktop/README.md)
- [カスタムテーマ作成](./.github/extensions/markdstage/docs/custom-theme-authoring.md)
- [プロダクト原則](./PRODUCT.md)
- [ブランドとデザインシステム](./DESIGN.md)
- [リリース手順](./.github/RELEASING.md)
- [サードパーティ通知](./.github/extensions/markdstage/THIRD-PARTY-NOTICES.md)
- [MIT ライセンス](./LICENSE)

## ライセンス

このリポジトリのオリジナル部分は MIT License で公開されています。同梱されるオープンソースソフトウェアの
ライセンスと著作権表示については、
[THIRD-PARTY-NOTICES.md](./.github/extensions/markdstage/THIRD-PARTY-NOTICES.md) を参照してください。
