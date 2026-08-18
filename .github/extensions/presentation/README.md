# presentation canvas 拡張機能

Markdown のスライド断片を **ネイティブ Copilot canvas** にテーマ付きで表示するプレゼン用拡張機能です。`presentation` スキルがこの拡張機能を使ってプレゼンを進めます。

## 仕組み

```
エージェント
  │ open_canvas("presentation", { input: { slides: [...] } })   # 開始時は open でデッキごと開く
  │ （発表途中の差し替えは invoke_canvas_action("load_deck", { slides: [...] })）
  ▼
extension.mjs（Node / @github/copilot-sdk）
  │ instance ごとにループバック HTTP サーバーを起動
  │ open 時に input.slides を受け取り、URL を返す前にデッキを適用（プレースホルダーを挟まない）
  │ デッキ（全スライド）と現在 index を保持し、/state に現在スライドを公開
  │ canvas からの POST /navigate でページ送りを受け付ける
  │ Windows では Surface Pen の Win+F20 / Win+F19 / Win+F18 ショートカットを監視
  │ /events(SSE) で更新を通知
  ▼
canvas iframe（renderer/）
  │ marked で本文を HTML 化 → DOMPurify でサニタイズ
  │ highlight.js で言語付きコードフェンスをシンタックスハイライト
  │ ```mermaid を図に変換 → mermaid.run
  │ ```architecture の検証済み JSON DSL を安全な SVG DOM に変換
  │ ◀ ▶ ボタン・余白の左/右クリック・矢印キー・☰ 一覧でページ送り（canvas 内で完結）
  │ ⛶ ボタンで同期された外部全画面ウィンドウを起動
  ▼
テーマ付きスライドを表示（更新は自動反映）
```

- **全スライドはプレゼン開始時に `open_canvas` の `input`（`slides`）で一括登録**します。open ハンドラーが URL を返す前にデッキを適用するため、canvas を開いた瞬間に最初のスライドが表示され、「スライド未読込」のプレースホルダーを挟みません。発表途中の差し替え・テーマ変更は `load_deck` で行います。**ページ送りは canvas 内のボタン（◀ ▶）・スライド面の余白を左クリック/右クリックする操作・矢印キー・スライド一覧（☰）で完結**し、その操作は拡張機能のループバックサーバー（`POST /navigate`）に送られて全クライアントへ反映されます。余白の左クリックは次のスライド、右クリックは前のスライドです。本文、リンク、画像、ナビゲーション UI、スライド一覧では既存の操作を優先し、右クリックのコンテキストメニューも維持します。外部サーバーや `localhost` ポートの手動起動は不要です。
- Windows では、**Surface Pen の末尾ボタンを 1 回押すと次へ、長押しすると前へ**移動し、**2 回押し（ダブルクリック）で外部プレゼン画面を起動 / 終了**します。末尾ボタンが生成する `Win+F20`（1 回押し）・`Win+F19`（2 回押し）・`Win+F18`（長押し）を小さな Windows PowerShell ヘルパーのキーボードフックで受け取り、既存のナビゲーション処理と外部プレゼン画面の制御へ渡します。ジェスチャーの判定は Windows 側が行い、2 回押しのときに 1 回押しの `Win+F20` は送られないため、ページ送りの応答が遅くなることはありません。公式 `PenButtonListener` に必要なアプリのパッケージ ID には依存しません。
- 配色は **dark（既定）/ light / microsoft / ms-modern** の 4 テーマ。`open` の `input` または `load_deck` の `theme` でデッキ全体に適用し、レンダラーが `<html data-theme>` 経由で `slides.css` の配色を切り替えます。`ms-modern` は社内 PowerPoint テンプレート（`2024-07-29-theme.thmx`）由来の配色です。**どのテーマでもデッキ末尾に背表紙（`layout: backcover`）が自動追加**されます（既に背表紙があれば追加しません）。背表紙の背景はテーマごとの濃色で、ロゴと著作権表示は `microsoft` / `ms-modern` のときだけ既定で出ます（他テーマでは front matter の `logo` / `copyright` を明示したときのみ）。
- コンテンツサイズは **auto（既定）/ normal / large / xlarge** の4段階。`auto` はコード・表・画像・Mermaidを含まない通常スライドを計測し、余白が大きい場合だけ安全な範囲で拡大します。
- ナビゲーション UI（操作バー・スライド一覧）と現在位置の管理は **canvas（renderer）側**が担当します。エージェントは開始時に `open_canvas`（`input`）を呼ぶだけで、ページ送りの `ask_user` ループは不要です。余白クリックは通常の canvas/presenter 表示でのみ有効で、PDF 印刷モードでは登録されません。`goto_slide` はチャットから特定ページへ飛びたいときに使えます。
- **PDF Export は Canvas の操作バーにあるプリンターアイコンからも実行できます。** 元 Markdown のファイル名を `open` / `load_deck` の `sourceName` に渡すと、`<元ファイル名>.pdf` として workspace に保存します。AI から `export_pdf` action を呼ぶ場合は従来どおり任意の `outputPath` を指定できます。現在のデッキを hidden print mode で全ページ描画し、headless Edge/Chromeで背景・画像・コード強調・Mermaidを含む16:9 PDFへ変換します。
- **外部プレゼン画面**は canvas の ⛶ ボタン、`open_presenter` action、または **Surface Pen の末尾ボタン 2 回押し**で起動します。Edge / Chrome / Chromium を専用の一時プロファイルで app mode + fullscreen 起動し、同じ `/state`・`/navigate`・SSE を使うため、canvas・キーボード・Surface Pen のページ位置が同期します。外部ウィンドウを閉じるには **もう一度ペンを 2 回押し**、`Alt+F4`、または AI から `close_presenter` を使います。canvas を閉じた場合も自動終了します。
- ローカル画像はリポジトリ直下の `assets/` を `/assets/...` で配信します。
- コードフェンスに `csharp` / `json` / `diff` などの言語名を付けると、highlight.js がシンタックスハイライトします。

## Architecture DSL v1 PoC

`architecture` コードフェンスは、プレゼン資料で位置・サイズ・重なりを再現しやすい
JSON DSL を SVG として描画します。`canvas` は論理座標で、表示時は `viewBox` により
canvas、外部 presenter、PDF のすべてで同じ比率に縮尺されます。

````markdown
```architecture
{
  "version": 1,
  "title": "Web application architecture",
  "description": "A client, application tier, and database.",
  "canvas": { "width": 1600, "height": 900 },
  "elements": [
    {
      "type": "group", "id": "cloud", "x": 480, "y": 90,
      "width": 1040, "height": 700, "title": "Cloud",
      "layout": { "type": "row", "gap": 60, "padding": 70 },
      "children": [
        {
          "type": "node", "id": "api", "shape": "rounded-rect",
          "text": "API", "icon": "api",
          "style": { "fill": "surface", "stroke": "accent" }
        },
        {
          "type": "node", "id": "db", "shape": "ellipse",
          "text": "Database", "icon": "database"
        }
      ]
    },
    {
      "type": "node", "id": "client", "shape": "rect",
      "x": 80, "y": 330, "width": 280, "height": 150, "text": "Client"
    },
    {
      "type": "connector", "from": "client", "to": "api",
      "fromPort": "right", "toPort": "left",
      "routing": "orthogonal", "label": "HTTPS", "arrow": true
    },
    {
      "type": "connector", "from": "api", "to": "db",
      "routing": "polyline", "points": [{ "x": 500, "y": 400 }],
      "label": "SQL", "arrow": true, "z": -10
    }
  ]
}
```
````

- `node` は `rect` / `rounded-rect` / `ellipse`、複数行 `text`、一意な `id` を持てます。
- `icon` は外部資産を読まず、内製 SVG primitive だけで描く `cloud` / `database` /
  `api` / `user` / `server` の allowlist です。線色は theme token に追従します。
- `group` の `children` 座標は group 左上からの相対座標です。境界・タイトルは子要素より
  前に描かれ、視覚的なコンテナになります。`layout` を省略すると従来どおり明示座標、
  `row` / `column` / `grid` を指定すると `gap`（または `rowGap` / `columnGap`）/
  `padding` / `columns` と group の内寸から node/group child の位置と省略サイズを
  決めます。完全な graph auto-layout ではなく、資料向けの決定論的な配置補助です。
- `connector` は `from` / `to` の境界へ接続し、`straight` / `orthogonal` /
  `polyline`、矢印、ラベルをサポートします。`fromPort` / `toPort` は `auto` /
  `top` / `right` / `bottom` / `left`。同一 endpoint の複数辺には安定した lane を
  自動割当し、分岐する辺の出口も分離します。orthogonal は短い辺から経路を確定し、
  他 node に加えて確定済み connector との重なり・交差が少ない corridor を優先します。
  線端と box の間には既定の 14 logical px gap を設けます。完全な graph-wide 最適化では
  ないため、複雑な図では `lane` または `polyline` の中間点を明示します。長い label は
  Unicode 幅を考慮して縮小し、上限内に収まらなければ表示だけを省略します
  （完全な文字列は `aria-label` に保持）。
- `z`（`-100`〜`100`）が小さい要素から描き、同じ `z` では `elements` / `children`
  の宣言順を維持します。省略時は group `-50`、connector `-10`、node `0` となり、
  コンテナ背景 → 接続線 → ノードの順で安定して重なります。
- style は `fill` / `stroke` / `textColor` / `strokeWidth` / `fontSize` /
  `opacity` / `dash` / `cornerRadius`。色は `accent`、`accentStrong`、`accentSoft`、
  `accentLine`、`surface`、`fg`、`muted`、`body`、`border`、`bg` の theme token
  を推奨します。4 テーマへ自動追従し、リテラル色は hex、白、黒、透明だけに制限します。
- 不正 JSON、範囲外の数値、重複 ID、未知の参照、未許可の要素・style・色は図の位置に
  エラーとして表示され、スライドの他の本文は残ります。DSL 値から HTML、script、
  イベント属性、外部 URL は生成しません。
- `version` は現在 `1`（省略時も v1）。source 64 KiB、全要素 200、connector 100、
  入れ子 4 段、polyline 中間点 12、総テキスト 20,000 文字などの上限を設けています。
  診断は `elements[0].children[2].icon` のような JSON path を含みます。
- SVG 自体は `<title>` / `<desc>` と `aria-labelledby` を持ち、group/node/connector
  に意味のある role・`aria-label`・SVG `<title>` を付けます。必要なら root の
  `description` と各要素の `ariaLabel` を明示できます。

### 位置調整モード（編集性 PoC）

renderer URL に `?architectureEdit=1` を付けた通常 canvas だけで、node をクリックまたは
Tab で選択し、矢印キー（10 logical px、Shift+矢印は 1 px）で一時移動できます。
`Copy overrides` は `{ "version": 1, "overrides": [{ "id", "x", "y" }] }` を
clipboard へコピーします。通常表示、`?present=1`、`?print=1` では編集 UI を出しません。
この縦切りは DSL の書き戻し・Undo/Redo・connector の即時再 routing・永続化を行いません。

**使い分け:** Mermaid は自動レイアウト、シーケンス図、クラス図など構造中心の図に向きます。
Architecture DSL は座標、サイズ、コンテナ、重なりを資料ごとに固定したい構成図に向きます。
この PoC は外部依存やアイコン資産を追加しておらず、追加 source はおよそ 40 KiB です。
ドラッグ編集、Undo/Redo、完全な graph auto-layout、交差最小化は対象外です。

## コンテンツサイズ

元 Markdown の各スライド先頭では、コメントでサイズを指定できます。

```markdown
<!-- slide-size: large -->

## 強調したいスライド
```

canvas に直接渡すスライド断片では front matter を使います。

```markdown
---
size: xlarge
---
## 強調したいスライド
```

指定値は `auto` / `normal` / `large` / `xlarge`。front matter とコメントの両方がある場合は front matter が優先されます。`layout: title` / `layout: backcover` は専用レイアウトを維持し、自動拡大の対象外です。

## Surface Pen で操作する

1. Surface Pen を Windows と Bluetooth でペアリングします。
2. presentation canvas を開きます。
3. 末尾ボタンを次のように使います。

| ジェスチャー | Windows のショートカット | 動作 |
| --- | --- | --- |
| 1 回押し | `Win+F20` | 次のスライドへ |
| 長押し | `Win+F18` | 前のスライドへ |
| 2 回押し | `Win+F19` | 外部プレゼン画面を起動 / 終了（トグル） |

2 回押しは、外部プレゼン画面が起動していなければ起動し、起動中であれば終了します。デッキ未ロードや Edge / Chrome / Chromium が見つからない場合は警告ログのみを残し、表示は変わりません。

「アプリによるショートカットボタン動作の上書き」設定はオンのままで構いませんが、この実装は `PenButtonListener` ではなく Windows のペンショートカットを直接受け取ります。3 つのショートカットはフックで抑止するため、Windows Ink 側の既定動作（画面領域切り取りなど）は同時に発火しません。ペン操作を利用できない場合も、canvas の ◀ ▶ ⛶ ボタンとキーボード操作はそのまま使えます。

## アクション

> **開始は `open_canvas`（`canvasId: "presentation"`）の `input` でデッキごと開く**のが基本です: `input: { slides: string[], index?: number, theme?: "dark"｜"light"｜"microsoft"｜"ms-modern", sourceName?: string }`。`sourceName` には元 Markdown ファイル名を渡してください。Canvas のプリンターアイコンは `<sourceName の拡張子を除いた名前>.pdf` を保存します。open ハンドラーが URL を返す前にデッキを適用するので、最初からスライドが表示されます（再フォーカスのみのときは `input` を省略すると現在位置を維持）。下表は開始後に使うアクションです。

| アクション | 入力 | 説明 |
| --- | --- | --- |
| `load_deck` | `{ slides: string[], index?: number, theme?: "dark"｜"light"｜"microsoft"｜"ms-modern" }` | 登録済みデッキを差し替える / 再ロードする（発表途中の内容・テーマ変更用）。`index`（既定 0）のスライドを表示し、`theme` でデッキ全体の配色（既定 `dark`）を指定。各要素はフロントマター＋本文 Markdown。テーマに関わらず末尾に背表紙を自動追加する（再ロードしても増殖しない）。戻り値 `{ ok, version, index, total, theme }`。 |
| `goto_slide` | `{ index: number }` | 登録済みデッキ内で表示スライドを 0 始まりインデックスで切り替える。範囲外は端に丸める。通常のページ送りは canvas 内で行われるため不要だが、チャットからの指定に使う。戻り値 `{ ok, changed, version, index, total }`。 |
| `show_slide` | `{ markdown: string }` | 現在のスライドを1枚だけ差し替える（単発表示・その場限りの差し替え用）。フロントマター（`deck`/`kicker`/`page`/`total`/`title`/`layout`/`size`/`theme`）＋本文 Markdown。`theme` 省略時は現在のデッキテーマを引き継ぐ。 |
| `open_presenter` | なし | 同期された外部プレゼン画面を Edge / Chrome / Chromium の app mode + fullscreen で起動する。既に起動中なら新しいウィンドウは増やさない。Surface Pen の末尾ボタン 2 回押しでも同じトグルができる。戻り値 `{ ok, started, alreadyRunning, browser?, pid? }`。 |
| `close_presenter` | なし | 外部プレゼン画面を終了し、専用の一時ブラウザープロファイルを削除する。Surface Pen の末尾ボタン 2 回押しでも終了できる。戻り値 `{ ok, stopped }`。 |
| `export_pdf` | `{ outputPath?: string, theme?: "dark"｜"light"｜"microsoft"｜"ms-modern" }` | 表示中のデッキを1スライド1ページの16:9 PDFへ書き出すAI用action。相対パスはworkspace基準、省略時は `presentation.pdf`。Canvas のプリンターアイコンは `sourceName` から `<元ファイル名>.pdf` を自動保存する。`theme` はPDFだけに適用し、canvasの表示テーマは変えない（PDF側にも背表紙を補う）。workspace外と `.pdf` 以外は拒否する。`show_slide` による現在ページの一時差し替えも反映する。戻り値 `{ ok, path, total, theme, bytes }`。Microsoft Edge / Google Chrome / Chromiumのいずれかが必要。 |
| `reset` | なし | スライドとデッキをクリアして待機プレースホルダーに戻す。 |

### canvas が内部で使う HTTP エンドポイント（renderer 専用）

| エンドポイント | 用途 |
| --- | --- |
| `GET /state` | 現在のスライド（`markdown`）・`index`・`total`・`theme`・`mode`・`version`/`deckVersion` を返す（ポーリング用に軽量）。 |
| `GET /deck` | デッキ全体（`slides`）と `deckVersion` を返す。一覧（☰）のタイトル生成用に、`deckVersion` が変わったときだけ取得する。 |
| `GET /export-data` | ランダムtokenに対応するPDF Export用デッキスナップショットをprint modeへ返す。 |
| `POST /export-status` | print modeが全ページの描画完了またはエラーを `export_pdf` actionへ通知する。 |
| `POST /navigate` | canvas の操作で呼ぶページ送り。body は `{ index }`（絶対）または `{ delta }`（相対）。サーバーが現在位置を更新し、SSE で全クライアントへ反映する。 |
| `POST /present` | canvas の ⛶ ボタンから外部プレゼン画面を起動する。同一 origin の POST のみ受け付ける。 |
| `POST /export` | canvas のプリンターアイコンから、`sourceName` に基づくPDF保存を開始する。同一 origin の POST のみ受け付ける。 |
| `GET /events` | SSE。`version` 変化を低遅延で通知する nudge。 |

## ファイル構成

```
.github/extensions/presentation/
  extension.mjs            # canvas 宣言・ループバックサーバー・アクション
  copilot-extension.json   # gist 共有用マニフェスト
  windows/
    pen-button-listener.ps1 # Surface Pen の Win+F20 / Win+F19 / Win+F18 を Node へ中継
  renderer/
    index.html             # iframe シェル・操作バー・スライド一覧オーバーレイ
    slides.css             # 4 テーマ（dark/light/microsoft/ms-modern）の配色定義・ナビ UI のスタイル
    renderer.js            # フロントマター解析 / marked / mermaid / architecture / SSE / 操作 UI
    architecture.mjs       # JSON DSL の検証と安全な SVG DOM 生成
  vendor/
    marked.min.js          # Markdown レンダラー
    purify.min.js          # DOMPurify（HTML サニタイズ）
    highlight.min.js       # コードのシンタックスハイライト
    highlight.LICENSE      # highlight.js の MIT ライセンス
    mermaid.min.js.part-*   # 図のレンダリング（1MB制限対応の分割配布）
```

## サードパーティライセンス

`vendor/` には以下の OSS を同梱しています（各ライセンスに従います）。
配布時の著作権表示とライセンス一覧は
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) にも記載しています。

- **marked** — MIT License © 2011-2024 Christopher Jeffrey 他 — https://github.com/markedjs/marked
- **DOMPurify** — Apache-2.0 / MPL-2.0 © Cure53 他 — https://github.com/cure53/DOMPurify
- **highlight.js** — MIT License © 2006 Ivan Sagalaev — https://github.com/highlightjs/highlight.js
- **Mermaid** — MIT License © 2014-2024 Knut Sveidqvist 他 — https://github.com/mermaid-js/mermaid

> 補足: `mermaid.min.js` は約 3MB ありますが、インストーラーの単一ファイル上限に合わせて `mermaid.min.js.part-*` へ分割しています。HTTP 配信時に Extension が順序どおり再構成するため、Gist やリポジトリ導入でも Mermaid は従来どおり利用できます。分割元・各チャンクの SHA-256 は `vendor/vendor-assets.lock.json` で管理し、更新時は `scripts/vendor-assets.mjs` で再生成・検証します。
