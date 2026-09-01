<p align="center">
  <img src="../../../assets/brand/markdstage-banner.svg" alt="MarkdStage — Markdown, ready for the stage." width="100%">
</p>

> English version: [English](../README.md)

# MarkdStage ユーザーガイド

MarkdStage は Markdown をそのままプレゼンテーション用のスライドにします。同じ Markdown デッキを
GitHub Copilot Canvas Extension でもスタンドアロンの Windows Desktop アプリでも開けます。

![Markdown デッキを開いた MarkdStage Canvas Extension](../images/canvas-main.png)

## 使い方を選ぶ

| 利用環境 | 向いている場面 | 主な機能 |
| --- | --- | --- |
| [**Canvas Extension**](canvas-extension.md) | GitHub Copilot と一緒にデッキを作り込む | Markdown 読み込み、自動更新、発表者ビュー、Architecture 編集、16:9 の確認、PDF エクスポート |
| [**MarkdStage Desktop**](desktop.md) | GitHub Copilot を開かずに Windows で発表する | 現在／次のスライドのプレビュー、スピーカーノート、自動更新、スライド一覧、操作が同期する投影用ウィンドウ |
| [**MarkdStage CLI**](cli.md) | ターミナル、CI、Codex、Claude Code で作業する | 自動更新付きの発表、デッキ検証、16:9 のクリッピング診断、PNG 取得、PDF エクスポート、持ち運べる Agent Skills |

どちらでも、Markdown、シンタックスハイライト付きコード、Mermaid、Architecture DSL、ローカル画像、
スピーカーノート、組み込みの dark／light／microsoft テーマを利用できます。

## はじめに

1. [クイックスタート](quick-start.md)に沿って最初のデッキを開きます。
2. [GitHub Copilot とスライドを作成する方法](ai-assisted-authoring.md)を読みます。
3. [GitHub Copilot ハンズオン](copilot-hands-on.md)を実際に試します。
4. [Markdown の書き方](markdown-authoring.md)を覚えます。
5. [テーマとレイアウト](themes-and-layouts.md)を確認します。
6. [図とメディア](diagrams-and-media.md)を追加します。
7. [プレゼンテーションと PDF 出力](presenting-and-export.md)に備えます。

## 機能ガイド

| トピック | ガイド |
| --- | --- |
| AI を使った作成、スキーマ、診断、必要なページだけの目視確認 | [GitHub Copilot とスライドを作成する](ai-assisted-authoring.md) |
| プロンプトから PDF までの流れを、実際の出力を見ながらたどる演習 | [GitHub Copilot ハンズオン](copilot-hands-on.md) |
| Canvas のツールバー、読み込み、自動更新、スライド一覧、発表者ビュー | [Canvas Extension](canvas-extension.md) |
| Windows での発表、スピーカーノート、一覧、全画面表示、Surface Pen | [MarkdStage Desktop](desktop.md) |
| 区切り、フロントマター、コンテンツサイズ、ノート、コード、表、アセット | [Markdown の記述](markdown-authoring.md) |
| dark、light、microsoft、custom テーマとスライドレイアウト | [テーマとレイアウト](themes-and-layouts.md) |
| Mermaid、Architecture DSL、画像、画面上での Architecture 編集 | [図とメディア](diagrams-and-media.md) |
| 投影用ウィンドウ、操作の同期、クリッピングの確認、PDF | [プレゼンテーションとエクスポート](presenting-and-export.md) |
| ターミナルのコマンド、終了コード、JSON 出力、Agent Skills | [MarkdStage CLI](cli.md) |
| セットアップ、読み込み、表示、編集でよくある問題 | [トラブルシューティング](troubleshooting.md) |

## 動作要件

- **Canvas Extension:** MarkdStage Extension を現在のプロジェクトまたはユーザーにインストールした
  GitHub Copilot。
- **Desktop:** Windows、Microsoft Edge WebView2 Runtime、そして CPU アーキテクチャに合った
  MarkdStage Desktop のポータブルパッケージ。
- **CLI:** Node.js 20.11 以降と、インストール済みの Microsoft Edge、Google Chrome、または Chromium。
- **デッキのソース:** 現在のワークスペース内にある `.md` または `.markdown` ファイル。

[クイックスタートを開く →](quick-start.md)
