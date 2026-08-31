<p align="center">
  <img src="../../../assets/brand/markdstage-banner.svg" alt="MarkdStage — Markdown, ready for the stage." width="100%">
</p>

> English version: [English](../README.md)

# MarkdStage ユーザーガイド

MarkdStage は Markdown をプレゼンテーション用スライドへ変換します。同じ Markdown デッキを
GitHub Copilot Canvas Extension とスタンドアロンの Windows Desktop アプリの両方で開けます。

![Markdown デッキを開いた MarkdStage Canvas Extension](../images/canvas-main.png)

## 使い方を選ぶ

| サーフェス | 適した用途 | 主な機能 |
| --- | --- | --- |
| [**Canvas Extension**](canvas-extension.md) | GitHub Copilot を使ったデッキの作成と修正 | Markdown 読み込み、自動更新、発表者ビュー、Architecture 編集、16:9 検証、PDF エクスポート |
| [**MarkdStage Desktop**](desktop.md) | GitHub Copilot を開かずに Windows で発表 | 現在／次のスライドのプレビュー、スピーカーノート、自動更新、スライド一覧、同期されたオーディエンスウィンドウ |

どちらも Markdown、シンタックスハイライト付きコード、Mermaid、Architecture DSL、ローカル画像、
スピーカーノート、組み込みの dark／light／microsoft テーマに対応します。

## はじめに

1. [クイックスタート](quick-start.md)に従って最初のデッキを開きます。
2. [GitHub Copilot とスライドを作成する方法](ai-assisted-authoring.md)を確認します。
3. [GitHub Copilot ハンズオン](copilot-hands-on.md)を実施します。
4. [Markdown の記述形式](markdown-authoring.md)を確認します。
5. [テーマとレイアウト](themes-and-layouts.md)を確認します。
6. [図とメディア](diagrams-and-media.md)を追加します。
7. [プレゼンテーションと PDF 出力](presenting-and-export.md)を準備します。

## 機能ガイド

| トピック | ガイド |
| --- | --- |
| AI を利用した作成、スキーマ、診断、対象ページの視覚確認 | [GitHub Copilot とスライドを作成する](ai-assisted-authoring.md) |
| 記録済みのプロンプトから PDF までを生成物と共に確認する演習 | [GitHub Copilot ハンズオン](copilot-hands-on.md) |
| Canvas のツールバー、読み込み、自動更新、スライド一覧、発表者ビュー | [Canvas Extension](canvas-extension.md) |
| Windows プレゼンター、スピーカーノート、一覧、全画面表示、Surface Pen | [MarkdStage Desktop](desktop.md) |
| 区切り、フロントマター、コンテンツサイズ、ノート、コード、表、アセット | [Markdown の記述](markdown-authoring.md) |
| dark、light、microsoft、custom テーマとスライドレイアウト | [テーマとレイアウト](themes-and-layouts.md) |
| Mermaid、Architecture DSL、画像、Architecture の視覚編集 | [図とメディア](diagrams-and-media.md) |
| オーディエンスウィンドウ、同期ナビゲーション、クリッピング確認、PDF | [プレゼンテーションとエクスポート](presenting-and-export.md) |
| セットアップ、読み込み、表示、編集に関する一般的な問題 | [トラブルシューティング](troubleshooting.md) |

## 動作要件

- **Canvas Extension:** 現在のプロジェクトまたはユーザーに MarkdStage Extension がインストールされた
  GitHub Copilot。
- **Desktop:** Windows、Microsoft Edge WebView2 Runtime、プロセッサーアーキテクチャに対応した
  MarkdStage Desktop のポータブルパッケージ。
- **デッキのソース:** 現在のワークスペース内にある `.md` または `.markdown` ファイル。

[クイックスタートを開く →](quick-start.md)
