# Canvas Extension

> English version: [English](../canvas-extension.md)

MarkdStage Canvas Extension は、GitHub Copilot の中で Markdown デッキをそのまま開きます。
Markdown の修正を Copilot に頼んだり、ファイルを直接読み込んだり、Architecture 図を編集したり、
固定出力レイアウトを検証して PDF を書き出したりできる、作成作業に向いた画面です。

## Extension をインストールする

このリポジトリをプロジェクトとして開くと、`.github/extensions/markdstage/` の Extension が
プロジェクトスコープで読み込まれます。

別のリポジトリへユーザースコープでインストールする場合は、信頼できるリリースタグを選び、
Copilot に次のように依頼します。

> 次の GitHub リポジトリフォルダーから MarkdStage をユーザースコープへインストールしてください。
>
> `https://github.com/runceel/markdstage/tree/<release-tag>/.github/extensions/markdstage`

インストールする前にローカルの Extension コードを確認してください。リリースタグかコミット SHA を指定すれば、
毎回同じ内容をインストールできます。

## デッキを開く

ワークスペースからの相対パスを添えて、Copilot にプレゼンテーションを頼みます。

```text
docs/user-guide/examples/quick-start.md を使ってこのデッキをプレゼンテーションしてください。
```

AI を使わずに読み込むときは、**More controls > Open Markdown** を選ぶか `I` を押します。

![自動更新を選択した Markdown 読み込み画面](../images/canvas-import.png)

読み込み画面にはワークスペース内の `.md` と `.markdown` ファイルが並び、次の2つのモードを選べます。

| モード | 動作 |
| --- | --- |
| **Keep loaded snapshot** | 読み込み直すかモードを変えるまで、開いたデッキはそのままです |
| **Refresh automatically on save** | 元ファイルを監視し、保存された内容が有効なら読み込み直します。表示中のスライド位置はできるだけ保ちます |

監視中のファイルが空になったり、読み取れなくなったり、内容が壊れたりした場合は、最後に読めたデッキを表示し続けます。
次に有効な内容が保存された時点で自動的に元に戻ります。

## Copilot と作成・修正する

MarkdStage は、スライド形式とテーマの指針、Architecture DSL スキーマ、構造化された検証エラー、
固定 16:9 レイアウトの診断結果、問題があるページの画像を Copilot に渡せます。
これにより、Markdown を書き、デッキを開き、結果を確かめ、元の Markdown を直すという流れを、
同じセッションの中で繰り返せます。

おすすめの進め方と依頼例は
[GitHub Copilot とスライドを作成する](ai-assisted-authoring.md)を参照してください。
プロンプトから PDF までを通しでたどる演習は、
[GitHub Copilot ハンズオン](copilot-hands-on.md)にあります。

## コントロールバーを使う

![現在のスライド下部にある Canvas Extension のコントロールバー](../images/canvas-main.png)

| コントロール | 操作 |
| --- | --- |
| **◀ / ▶** | 前後のスライドへ移動します |
| **ページカウンター** | 現在のページと総ページ数を表示します |
| **☰** | スライド一覧を開きます |
| **⋯** | プレゼンテーション、表示・編集、ファイル操作をまとめた More controls を開きます |

More controls には次の操作があります。

- **Present:** External window、Presenter view
- **View & edit:** Shape editing、Output preview
- **File:** Open Markdown、Automatic refresh、Export PDF、Export PowerPoint

コントロールにポインターを合わせると、ツールチップとキーボードのヒントが出ます。

## スライドを移動する

- **◀** または **▶** を選びます。
- `Left` または `Right` を押します。
- スライドの空白部分を左クリックまたはタップすると次へ進みます。
- スライドの空白部分を右クリックすると前へ戻ります。
- `Home` または `End` で最初または最後のスライドへ移動します。
- **☰** を選ぶか `O` を押すとスライド一覧が開きます。

スライド内のリンク、画像、操作できるコンテンツは、いつもどおりに操作できます。

![ページを直接選択できるスライド一覧](../images/canvas-slide-list.png)

## 発表者ビューを使う

発表者ビューでは、現在のスライドを大きく表示し、その横に次のスライドとスピーカーノートを並べます。
コントロールから、スライドの移動、スライド一覧の表示、別ウィンドウでのプレゼンテーションの開始と終了ができます。

![現在のスライド、次のスライド、スピーカーノートを表示した発表者ビュー](../images/canvas-presenter-view.png)

スピーカーノートは、そのスライドに直接書いた HTML コメント（コードフェンスの外）から読み取ります。
投影されるスライドや書き出した PDF には出ません。

## 投影用ウィンドウを開く

**More controls > External window** を選ぶと、移動やサイズ変更ができる 1280x720 の
投影用ウィンドウが開きます。プレゼンテーション用のディスプレイへ移し、`F11` で全画面にします。
Canvas、発表者ビュー、投影用ウィンドウは同じスライドに揃って動きます。

Canvas を閉じると、投影用ウィンドウも閉じます。

## 検証して書き出す

書き出す前に **More controls > Output preview** で確認します。PDF と同じ固定
1280x720 レイアウトで表示し、内容がはみ出す場合は警告します。手順の詳細は
[プレゼンテーションとエクスポート](presenting-and-export.md)を参照してください。

## Canvas だけでできること

次の機能は MarkdStage Desktop にはありません。

- PDF エクスポートと、PDF と同じ条件でのクリッピング確認
- 手早く行える Architecture の配置編集
- Advanced Architecture Editor
- AI によるデッキの直接作成と修正

[次へ: MarkdStage Desktop →](desktop.md)
