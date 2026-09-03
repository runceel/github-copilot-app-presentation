> English version: [English](../cli.md)

# MarkdStage CLI

MarkdStage CLI は、ターミナルから Markdown デッキの発表、検証、レイアウト診断、PNG 取得、PDF
エクスポートを行います。GitHub Copilot の Canvas を必要としないため、Codex、Claude Code、CI、
リモートシェルでも同じように使えます。

CLI は Canvas Extension と同じ Markdown パーサー、レンダラー、テーマ処理、Architecture DSL
検証、PDF／PNG 出力を利用します。どの環境でも見た目は同じです。

## 必要なもの

- Node.js 24 以降
- インストール済みの Microsoft Edge、Google Chrome、または Chromium。MarkdStage がブラウザーを
  ダウンロードすることはありません。

## インストール

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

## コマンド

```console
markdstage presentation slides.md
markdstage present slides.md --watch
markdstage validate slides.md --json
markdstage inspect slides.md --json
markdstage capture slides.md --pages 2,4
markdstage export slides.md --output slides.pdf
markdstage export slides.md --output slides.pptx
markdstage guide architecture-dsl
markdstage skill install --target codex
```

| コマンド | 説明 |
| --- | --- |
| `presentation` | 現在のスライド、次のスライドのプレビュー、スピーカーノート、ナビゲーションを備えた発表者ビューを開きます。**Start presentation** を選ぶと同期された観客向けウィンドウを開き、**End presentation** で閉じます。`--watch` は保存時に再読み込みし、`--no-open` はブラウザーを起動せずに発表者ビューを配信します。 |
| `present` | ループバックでデッキを配信し、発表用ウィンドウを開きます。ページ送り、発表者ビュー、次スライドのプレビュー、スピーカーノート、一覧、カスタムテーマ、Mermaid、Architecture DSL、ローカルアセットに対応します。`--watch` は Markdown の保存時に再読み込みし、表示中のページと直前の正常なデッキを保持しながら Architecture 編集を有効にします。`--watch` がない場合、ソースは読み取り専用です。`--no-open` はブラウザーを起動せずに配信だけ行います。 |
| `validate` | デッキ構造、Architecture DSL ブロック、テーマ、テーマのパスを検証します。 |
| `inspect` | Canvas の `inspect_layout` と同じ 1280x720 のクリッピング診断を返します。`--slide <n>` で 1 ページだけ、`--all` で収まっているスライドも含め、`--fail-on-issues` で終了コード 5 を返します。 |
| `capture` | 1280x720 の PNG を書き出します。`--pages` を指定しない場合はクリッピングが報告されたスライドだけを取得します。 |
| `export` | Canvas Extension と同じ 16:9 の PDF、または編集可能な要素を残したハイブリッド PowerPoint を生成します。`--output` の拡張子で形式を選び、省略時は PDF です。 |
| `guide` | MarkdStage の公式ガイド（`overview`、`slide-format`、`themes`、`custom-themes`、`theme-schema`、`architecture-dsl`、`architecture-schema`）を表示します。 |
| `skill` | 持ち運べる Agent Skills を導入・確認します。 |
| `help` | 全体の使い方、または 1 つのコマンドのヘルプを表示します。`markdstage help <command>` は `markdstage <command> --help` と同じ内容です。 |

共通オプションは `--workspace <dir>`、`--theme <name>`、`--theme-file <path>`、`--json`、
`--help`、`--version` です。

```console
markdstage help
markdstage help capture
markdstage capture --help
```

## 推奨する資料作成フロー

1. 元資料、対象者、目的、おおよその枚数または発表時間、テーマ、必要な図、最終出力を決めます。
2. デッキに必要なガイドだけを確認します。最初に `markdstage guide slide-format` を実行し、
   必要に応じて `themes`、`custom-themes`、`architecture-dsl` を参照します。
3. Markdown を唯一の正本としてデッキ全体を作成し、空行の後の `---` でスライドを区切ります。
4. 見た目を確認する前に `markdstage validate slides.md --json` を実行し、構造、テーマ、
   Architecture DSL のエラーを修正します。
5. 編集中は `markdstage present slides.md --watch` を実行します。保存時に再読み込みし、表示中の
   スライドを維持しながら、一時的に不完全な保存では直前の正常なデッキを表示し続けます。
6. `markdstage inspect slides.md --json` で固定 16:9 出力のクリッピングを確認します。局所的な
   修正後は `--slide <n>`、CI などの品質ゲートでは `--fail-on-issues` を使います。
7. `inspect` の後で必要な場合だけ `markdstage capture slides.md` を実行します。既定では
   クリッピングされたスライドだけを取得し、バランス、余白、図の見た目を確認したいページには
   `--pages 2,4` を使います。
8. Markdown を修正し、検証と対象ページの診断を繰り返して、エラーやクリッピングがなく、簡潔で
   視覚的なバランスが取れた状態にします。
9. `markdstage presentation slides.md` で発表するか、
   `markdstage export slides.md --output slides.pdf` で PDF を出力するか、
   `markdstage export slides.md --output slides.pptx` で PowerPoint を出力します。

全スライドを最初から画像化するのではなく、構造化された検証とレイアウト診断を優先します。
配布前には最終出力の全ページを確認します。

## watch モードで Architecture を編集する

`markdstage present slides.md --watch` はライブ編集用の環境です。ブラウザーは通常の表示モードで
開始します。

1. Architecture DSL を含むスライドで鉛筆ボタンを選びます。
2. 要素をドラッグするか矢印キーで移動します。配置の変更は、対応する `architecture` フェンスへ
   アトミックに保存されます。
3. **Advanced edit** を選ぶと詳細デザイナーが開きます。対応する要素の追加、更新、複製、
   親の変更、削除ができます。
4. 詳細デザイナーの **Save** を選び、下書きを Markdown へ書き戻します。

エディターの外でソースが変更された場合、上書きせず保存を拒否します。保存に成功すると、表示中の
ページを保ったままデッキを再読み込みします。Markdown が一時的に不完全な状態で保存されても、
直前の正常なデッキを表示し続けます。

`--watch` のない `markdstage present slides.md` は編集ボタンを表示せず、ソースを変更できません。
発表者、capture、inspect、export の出力にも編集 UI は含まれません。別の preview コマンドや
edit オプションはありません。

## 終了コード

| コード | 意味 |
| --- | --- |
| 0 | 成功 |
| 1 | コマンドの使い方の誤り |
| 2 | デッキまたは入力のエラー |
| 3 | 実行環境のエラー（Chromium 系ブラウザーがない） |
| 4 | 描画または出力の失敗 |
| 5 | レイアウトまたは検証で問題が見つかった |

`--json` はエラーを含め、すべてのコマンドで機械可読な出力を返します。CI やエージェントは結果を
そのまま利用できます。

## Agent Skills

`markdstage skill install` は、MarkdStage の Markdown 形式と CLI コマンドを AI エージェントに
伝える Agent Skill を書き出します。参照ファイルは `markdstage guide` と同じガイドから生成される
ため、内容がずれることはありません。

| ターゲット | ディレクトリ |
| --- | --- |
| `codex` | `.agents/skills/markdstage/` |
| `claude` | `.claude/skills/markdstage/` |
| `copilot` | `.github/skills/markdstage/`（Canvas 用の説明を含む） |

```console
markdstage skill install --target codex
markdstage skill install --target claude,codex --root .
markdstage skill check --target all
```

利用者が編集したファイルは競合として報告し、`--force` を指定しない限り上書きしません。

## セキュリティ

- 発表用サーバーはループバックにのみバインドし、すべての経路をプロセスごとの推測できない
  URL トークンの下で配信します。
- リクエストにはループバックの `Host` ヘッダーが必要です。状態を変更する経路は同一オリジンの
  `Origin` ヘッダーを要求し、可変な状態は `no-store` で配信します。
- デッキ、アセット、テーマ、生成物はワークスペースの外に出ません。`--workspace <dir>` で明示的に
  指定できます。指定しない場合は Git リポジトリのルート、なければ Markdown があるフォルダーを
  使います。

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `PDF export requires Microsoft Edge, Google Chrome, or Chromium.`（終了コード 3） | Chromium 系ブラウザーをインストールするか、導入済みの環境で実行します。 |
| `... is outside the workspace.`（終了コード 2） | ファイルをワークスペース内に移すか、`--workspace` でそのフォルダーを指定します。 |
| 発表中にデッキが更新されない | `present` を `--watch` 付きで実行し直します。 |
| PDF でスライドが切れる | `markdstage inspect` を実行し、報告されたスライドを短くするかレイアウトを変更します。 |
