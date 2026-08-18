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

## Architecture DSL v1

`architecture` コードフェンスは、プレゼン資料で位置・サイズ・重なりを再現しやすい
JSON DSL を SVG として描画します。`canvas` は論理座標で、表示時は `viewBox` により
canvas、外部 presenter、PDF のすべてで同じ比率に縮尺されます。

> **Architecture DSL v1 は安定版（stable）です。** 後述の
> [編集モード](#編集モード位置調整)も v1 の一部で、実験的な別機能ではありません。
> v1 として受理された文書は以後も v1 として受理され、図の**意味**（どの要素がどこに
> あり、何がどこへつながるか）は保たれます。保証の範囲・互換とみなす変更・破壊的変更が
> 必要になったときの手順は [`schema/README.md`](./schema/README.md) に記載しています。
>
> **保証に含まないもの**: ピクセル単位の描画結果（フォント指標・テーマトークン・
> connector の経路探索の改善で見た目は変わり得ます）と、診断メッセージの文言。
> 複雑な自動配置が必要な図には引き続き Mermaid を使ってください。

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
- `icon` は組み込みアイコン名か、リポジトリ直下 `assets/` に置いた画像へのパスです。
  詳細は後述の「アイコン」を参照してください。
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
  （完全な文字列は `aria-label` に保持）。label のピルが自分の線を隠してしまう
  ときは、線に対して垂直方向へ逃がします（後述）。
- `z`（`-100`〜`100`）が小さい要素から描き、同じ `z` では `elements` / `children`
  の宣言順を維持します。省略時は group `-50`、connector `-10`、node `0` となり、
  コンテナ背景 → 接続線 → ノードの順で安定して重なります。
- style は `fill` / `stroke` / `textColor` / `strokeWidth` / `fontSize` /
  `opacity` / `dash` / `cornerRadius`。色は `accent`、`accentStrong`、`accentSoft`、
  `accentLine`、`surface`、`fg`、`muted`、`body`、`border`、`bg` の theme token
  を推奨します。4 テーマへ自動追従し、リテラル色は hex、白、黒、透明だけに制限します。
- 不正 JSON、範囲外の数値、重複 ID、未知の参照、未許可の要素・style・色は図の位置に
  エラーとして表示され、スライドの他の本文は残ります。DSL 値から HTML、script、
  イベント属性は生成しません。外部 origin への参照も生成しません（`icon` から出る
  唯一の URL は同一 origin の `/assets/...` だけです）。
- `version` は現在 `1`（省略時も v1）。source 64 KiB、全要素 200、connector 100、
  入れ子 4 段、polyline 中間点 12、総テキスト 20,000 文字、`icon` 参照 200 文字
  などの上限を設けています。
  診断は `elements[0].children[2].icon` のような JSON path と、`;` 以降に修正指針を
  含みます（例: `elements[0].icon: must be a built-in icon name (cloud, database, ...)
  or a path under assets/; replace 'rocket' with a built-in name, or with a repository
  asset such as 'assets/icons/logo.svg' (...)`）。
- 機械可読な **JSON Schema**（draft 2020-12）を
  [`schema/architecture-v1.schema.json`](./schema/architecture-v1.schema.json)
  に用意しています。`.architecture.json` ファイルに相対パスの `$schema` を書くと
  エディターで補完と検証が効き、そのまま `architecture` フェンスへ貼り付けられます
  （ルートの `$schema` はパーサーが受理して無視します）。スキーマは**形状**だけを検証し、
  参照整合性・ID の一意性・平坦化後の上限・layout の収まりは引き続きパーサーが判定します。
  詳細とバージョニング / 移行ポリシーは [`schema/README.md`](./schema/README.md) を参照。
- SVG 自体は `<title>` / `<desc>` と `aria-labelledby` を持ち、group/node/connector
  に意味のある role・`aria-label`・SVG `<title>` を付けます。必要なら root の
  `description` と各要素の `ariaLabel` を明示できます。詳細と既知の限界は
  [アクセシビリティ](#アクセシビリティ) を参照してください。

### アクセシビリティ

図が支援技術（スクリーンリーダーなど）へ何を渡すかと、**どこまで保証していないか**を
明記します。ここに書いた内容は `test/a11y/` で自動検証しています（axe-core による
自動チェックと、Chromium のアクセシビリティツリーを CDP で読み取る検証）。

**読み上げられる内容**

- 図全体が `<title>`（`title`）と `<desc>`（`description`）を持ち、`aria-labelledby`
  で図のルートに結び付きます。`description` を書いておくと、図を見られない読者が
  最初に受け取る要約になります。
- group / node / connector はそれぞれ `aria-label` を持ちます。connector の既定文言は
  `<from の可視ラベル> to <to の可視ラベル>: <label>` です。端点の呼び名には
  node の `text` / group の `title`、つまり**画面に見えているのと同じ文字列**を使います
  （可視ラベルが無い端点だけ ID にフォールバックします）。`ariaLabel` を書けば全体を上書きできます。
- 図の中の**可視テキストは `aria-hidden="true"`** です。これが無いと、同じ文字列が
  「要素のアクセシブル名」と「その中の文字列」の 2 回読み上げられます（実測で確認）。
  見た目には一切影響しません（ビジュアル回帰は 0px 差で通過）。

**読み上げ順**

- 読み上げ順は **DOM 順 = 描画順（z 順）** です。宣言順ではありません。
- 既定の z は group `-50` / connector `-10` / node `0` です。したがって
  「まず group、次に connector、最後に node」の順に読み上げられ、
  **Markdown に書いた順とは一致しません**。これは作者の書き方の問題ではなく製品の既定動作です。
- 宣言順は `data-architecture-order` 属性として DOM に出しています。ツールから
  「書いた順」を復元することはできますが、支援技術がこの順で読むわけではありません。
- **`z` は見た目のための指定です。読み上げ順や走査順を `z` で調整しないでください。**
  重なりを直したつもりで読み上げ順が変わります。
- 読み上げ順だけを DOM 順から切り離す手段（`aria-flowto` / `aria-owns`）は採用していません。
  これらは対応が実装ごとに大きく異なり、この拡張機能が動く範囲（Windows の WebView2、
  macOS の WKWebView、Linux の WebKitGTK）全体で検証できないためです。

**キーボード**

- 通常表示・presenter・印刷では、図全体が**ちょうど 1 つのタブストップ**です
  （1 図 = 1 停止）。図の中の要素を個別にタブで巡ることはしません。図が数十要素ある
  スライドで Tab を数十回押させないための判断です。
- 要素単位の走査は**編集モードの役割**です。編集モードでは node と group がタブストップに
  なり、矢印キーで選択中の要素を移動できます。編集モードでは図ルートのタブストップは
  外します（押しても何も起きない停止を作らないため）。
- Tab の順序は編集モードでも DOM 順、つまり描画順です。

**編集モードの通知**

- 編集ツールバーには `role="status"` `aria-live="polite"` の領域が **2 つ**あります。
  1 つは操作結果（移動・元に戻す など）、もう 1 つは保存結果（保存中 / 保存済み / 失敗）。
- **この 2 つを 1 つにまとめないでください。** 操作結果は次の操作で上書きしてよいのに対し、
  **保存失敗は「編集が実際に失われた」ことを意味する**ため、次の保存が成功するまで
  消してはいけません。統合すると次の操作の通知が保存失敗の告知を消します。
- 1 回の操作で両方がほぼ同時に更新されるため、支援技術によっては読み上げが重なる
  可能性があります（実機未検証）。改善する場合は上の性質を壊さないでください。

**既知の限界（保証していないこと）**

- **実機のスクリーンリーダーでの読み上げは検証していません。** 検証の根拠は Chromium が
  公開するアクセシビリティツリーで、NVDA / JAWS / VoiceOver / ナレーターの実際の発話は
  確認していません。role の選択（connector に `role="group"` を使っている点など）は、
  実機での確認が取れるまで変更しない方針です。
- group の入れ子は、視覚的には枠として描かれますが、アクセシビリティツリー上では
  **入れ子になりません**（描画時に平坦化しているため）。「この node がどの group に
  属するか」は読み上げから分かりません。必要なら `ariaLabel` に含めてください。
- ページ全体には WCAG 2.1 A / AA 相当の自動チェックを掛けています。図そのものには
  best-practice を含む全ルールを掛けています。自動チェックが通ることは
  「アクセシブルである」ことの証明ではありません。

**描画コスト**

- `MAX_ELEMENTS`（200 要素）の図で、パースからレイアウト・配線・SVG 生成までが
  1 枚あたり 10〜12 ms 程度です（開発機での実測）。`test/perf/` で
  絶対時間とスケーリング（要素数 8 倍でコスト 24 倍未満）の両方を固定しています。

### ブラウザー対応

| 機能 | 対応範囲 |
| --- | --- |
| canvas 内のスライド表示・編集モード | Tauri の WebView（Windows = WebView2 / Chromium、macOS = WKWebView / WebKit、Linux = WebKitGTK） |
| 外部 presenter ウィンドウ | Edge / Chrome / Chromium 系のみ（`--app` で起動するため） |
| PDF 書き出し（`export_pdf`） | Edge / Chrome / Chromium 系のみ（headless の `--print-to-pdf` を使うため） |
| 自動テスト | Chromium（Playwright）。ビジュアル回帰のベースラインは Linux / Windows で別管理 |

Firefox と Safari 単体では動作確認していません。外部 presenter と PDF 書き出しは
Chromium 系の起動オプションに直接依存しているため、他ブラウザーでは動作しません。

### アイコン

`node` の `icon` には **組み込みアイコン名** か、**リポジトリ直下 `assets/` に置いた
画像へのパス** のどちらかを書けます。

#### 組み込みアイコン

外部資産を一切読まず、拡張機能に同梱した 24×24 の SVG primitive だけで描きます。

| 名前 | 意図している概念 |
| --- | --- |
| `cloud` | クラウド、マネージドサービス全般 |
| `database` | リレーショナル DB、永続ストア |
| `api` | API、エンドポイント、契約 |
| `user` | 利用者、人、アクター |
| `server` | サーバー、ホスト、ワーカー |
| `analytics` | 分析、メトリクス、ダッシュボード |
| `browser` | ブラウザー、Web フロントエンド |
| `mobile` | モバイルアプリ、端末 |
| `network` | ネットワーク、接続、分散構成 |
| `queue` | キュー、メッセージング、非同期処理 |
| `shield` | 認証・認可、セキュリティ、ガードレール |

- **命名規則**: 小文字の kebab-case（`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`）で、
  製品名やベンダー名ではなく**一般的な概念を表す名詞**を使います。
  この規則は単体テストで強制しています。
- **テーマ追従**: `fill: none` の線画で、`stroke` にノードの `textColor`
  （既定は theme token `fg`）がそのまま入ります。結果として 4 テーマすべてで
  配色が自動的に切り替わります。テーマごとの `--fg` が背景に対して
  **3:1 以上**（WCAG 2.1 SC 1.4.11）であることもテストで固定しています。
- 既存の名前と絵柄は **v1 の公開語彙**なので、改名・再描画は行いません
  （追加は互換変更、変更は破壊的変更）。

#### `assets/` のアイコンを使う

リポジトリ直下の `assets/` フォルダーに画像を置き、`assets/` から始まる相対パスで
参照します。拡張機能はこれを同一 origin の `/assets/...` として配信するので、
canvas・外部プレゼン画面・PDF 出力のいずれでも同じように解決されます。

````markdown
```architecture
{
  "elements": [
    {
      "type": "node", "id": "brand",
      "x": 80, "y": 80, "width": 260, "height": 140,
      "text": "Our service", "icon": "assets/sample.svg"
    }
  ]
}
```
````

**許可される拡張子**: `.svg` / `.png` / `.webp` / `.jpg` / `.jpeg`（大文字も可）。

**受理されるパスの形**:

- 必ず `assets/` から始まる（先頭の `/` は不可）。
- 各セグメントは英数字で始まり、以降は英数字・`_`・`-`・`.` のみ。
- サブフォルダー可（`assets/icons/brand/logo.svg`）。
- 全体で 200 文字以内。

**拒否される参照**（いずれもパーサーと JSON Schema の両方が同じ判定をします）:

```text
https://example.com/logo.svg   外部 URL は不可
//example.com/logo.svg         protocol-relative URL も不可
data:image/svg+xml;base64,...  data: URI は不可
assets/../secret.svg           .. を含むパスは不可
/assets/logo.svg               絶対パスは不可
images/logo.svg                assets/ の外は不可
assets/logo.gif                許可外の拡張子は不可
assets\logo.svg                バックスラッシュは不可
assets/logo.svg?v=2            クエリ文字列は不可
```

拒否された場合は図の位置にエラーが表示され、`elements[0].icon: must be a built-in
icon name (...) or a path under assets/; ...` のように修正指針まで示します。

#### ユーザー提供アイコンの制限（仕様であってバグではありません）

- **テーマ色に追従しません。** `<image>` として読み込むため、拡張機能側から中身の色を
  差し替えられません。PNG / JPEG / WebP はもちろん、**SVG でも同じ**です。
  4 テーマすべてで**同じ見た目のまま**描画されます。
- したがって **4 テーマの背景（濃色の `dark` と、淡色の `light` / `microsoft` /
  `ms-modern`）で判読できるかは素材の作者の責任**です。次のいずれかを推奨します。
  - どちらの背景でも十分なコントラストを持つ配色にする。
  - アイコン自身が不透明な背景（円形の下地など）を持つ形にする。
  - テーマを 1 つに固定して発表する。
- SVG 内のスクリプトはブラウザーの secure static mode で無効化される前提です。
  それでも**信頼できる素材だけを置いてください**。
- ファイルが存在しない場合、パーサーはファイルシステムを見ないためエラーにはならず、
  **アイコン領域が空のまま**描画されます。パスの綴りは自分で確認してください。
- `aria-hidden="true"` は組み込みと同じで、アイコンは支援技術から隠されます。
  さらに**アセットのパスはアクセシブル名に含めません**（読み上げても意味を成さないため）。
  意味は `text` / `ariaLabel` に書いてください。

#### ライセンスと帰属表示

`assets/` に置いたアイコンのライセンス順守は**利用者の責任**です。

- **再配布可能なライセンスの素材だけを `assets/` にコミットしてください。**
  リポジトリは公開される可能性があり、コミットは再配布に当たります。
- 帰属表示（attribution）が必要なライセンス（CC BY、一部の Apache-2.0 派生アイコン
  セットなど）の素材を使う場合は、次のどちらかで**必ずクレジットを表示**してください。
  - スライド内（クレジットページ、または当該スライドの脚注）。
  - リポジトリ内の `assets/README.md` などに出典・作者・ライセンス・入手元 URL を記録。
- **第三者の商標・ロゴ**（クラウドベンダーのロゴなど）は、その所有者のブランドガイド
  ラインに従ってください。多くの場合、改変・着色変更・比率変更が禁止されています。
  本拡張機能はアイコンを縦横比を保って（`preserveAspectRatio="xMidYMid meet"`）
  24×24 の枠に収めるだけで、着色も改変も行いません。
- 組み込みアイコン（前掲の 11 種）は本リポジトリのために描き起こしたもので、
  リポジトリのライセンスに従います。**帰属表示は不要**です。

### connector の自動ルーティング

`routing: "orthogonal"` の connector は、手動 polyline なしで配線されます。

1. **候補列挙とコスト最小化** — 直線・L 字などの候補を作り、コスト関数で最良を選びます。
   コストは重い順に「ノード貫通」「ラベルがノードを覆う」「他の経路との交差・重なり」
   「ラベル同士の重なり」「曲がり」「長さ」です。ラベルの占有領域は実際に描かれる
   ピルと同じ寸法で計算するので、「避けたつもりのラベル」と「見えているラベル」が
   ずれません。
2. **格子探索へのエスカレーション** — 選ばれた経路がノードに当たる、または他の経路と
   干渉する場合だけ、疎な座標グリッド上の Dijkstra を追加で試します。
   コストが厳密に改善したときだけ採用します。
3. **全体の再配線（rip-up and reroute）** — 逐次配置は最初の 1 本が「まだ何も
   置かれていない」状態で決まってしまうため、全体を数回走査して 1 本ずつ引き直します。
   総コストが下がるときだけ差し替え、さらに**交差が増える差し替えは棄却**します。
   例外は「ノードやラベルが隠れている状態を解消する」場合だけで、読めない図より
   交差が 1 本増えた図のほうがましだ、という優先順位です。

同じ入力は必ず同じ経路になります（connector は距離・宣言順で安定ソートし、乱数を
使いません）。ビジュアル回帰はこの決定性に依存しています。

#### 予算が尽きたときの挙動（フォールバック契約）

格子探索は図が大きすぎるときに打ち切られます（軸あたり座標数 120 / 格子点 10,000 /
展開 20,000 の各上限）。打ち切られた場合でも**描画は続行**し、そのとき手元にある
最良の経路をそのまま描きます。**エラーにはしません** — これまで描けていた図が
突然エラーブロックに変わるのを避けるためです。

ただし**黙って劣化させることはしません**。経路がノードを貫いた、またはラベルが
無関係なノードを覆った場合に限り、次の 3 箇所で作者に通知します。

| 通知先 | 内容 |
| --- | --- |
| 図の下の警告バナー | `role="status"` / `aria-live="polite"` の琥珀色のブロック。該当 connector と理由を列挙 |
| `data-architecture-routing="degraded"` | 図のラッパー要素の属性。自動テストから拾える |
| `console.warn` | 開発時に気づけるように（`console.error` は使いません） |

交差そのものは通知しません。平面グラフでない限り避けようがなく、通知しても
作者にできることが無いためです。通知は「**情報が隠れた**」ときだけに絞っています。

`routing: "straight"` と `"polyline"` は作者が形を決めた経路なので、診断を出しません。

対処は、ノードの配置を見直すか、その connector だけ `routing: "polyline"` で
中間点を明示することです。

#### ラベルが自分の線を隠さないこと

connector の label は既定で経路の中点に置きます。ただしピルには最小幅
（70 logical px）があるため、**ノード同士が近いと、ピルが自分の線と矢印を
丸ごと覆い隠します**。線端と box の間には既定 14 logical px の gap が両側に入るので、
たとえば `gap: 60` の `row` layout では見えている線は 32 px しかなく、
70 px のピルが完全に上書きします。

そこで、ピルを中点に置いたときに**線の見えている長さが 50 logical px を下回る**
場合に限り、ピルを**自分の線分に対して垂直方向**へ逃がします。

- 逃がす向きは線分の向きだけで決まります。水平な線分なら上、垂直な線分なら右です。
- ピルの端から線までは 8 logical px の間隔を空けます。
- **経路の向きに依存しません。** `a → b` と `b → a` は同じ側にラベルが出ます。
- ルーティングのコスト計算は逃がしたあとの位置を見るので、
  「ラベルがノードを覆う」判定と実際の描画がずれません。
- `straight` / `orthogonal` / `polyline` のすべてに等しく適用されます。

これは v1 の描画契約です。**ラベルの座標そのものは保証しません**（ピクセル単位の
描画結果は保証対象外です）が、「ラベルが自分の線と矢印を完全に隠したまま描かれる」
ことはありません。

逃がされたラベルの位置が好みでない場合は、ノード間の距離を広げてください
（`layout` の `gap` を大きくする、あるいは `x` / `y` を離す）。線が十分に見える
配置になれば、ラベルは自動的に中点へ戻ります。

### layered レイアウト

`layout: { "type": "layered" }` は、group の子を connector の向きに沿って階層に
積みます。`direction` で流れる向きを選べます（`down` 既定 = 上から下 / `right` = 左から右）。
受け付けるのはこの 2 つだけで、`up` と `left` は拒否されます（逆向きに流したいときは
connector の `from` / `to` を入れ替えます）。`direction` は `layered` 以外のレイアウトでも
拒否されます。

閉路があっても停止します（宣言順で後から現れる後戻り辺を無視して階層を決めます）。
座標を 1 つずつ書かずに、依存関係だけから構成図を作りたいときに使います。

### 編集モード（位置調整）

Architecture 図はレンダリング結果の上で直接動かせます。編集した内容は**元の Markdown の
```architecture フェンスへ書き戻り**、再描画・再読み込み後も残ります。

**編集モードは Architecture DSL v1 の一部で、stable です。** 実験的な付属機能ではなく、
以下は v1 の契約として維持します。

- 書き戻し先は**元の ```architecture フェンスだけ**で、フェンス外の地の文・front matter・
  改行コードは変更しません。
- 保存の成否は**必ず画面に出ます**（後述）。黙って失敗することはありません。
- `?present=1` と `?print=1` では編集 UI を**生成しません**。
- 編集モードはサーバー側の状態で、デッキと一緒には永続化しません。

下の「layout 管理下のノードは動きません」「既知のトレードオフ」も、**将来直す予定の
暫定仕様ではなく、v1 で意図してこう決めた挙動**です。変えるときは
[`schema/README.md`](./schema/README.md) の互換ポリシーに従います。

**入り方**は 2 通りです。

| 方法 | 用途 |
| --- | --- |
| canvas action `edit_architecture` (`{ "enabled": true }`) | 通常運用。agent 側から切り替える |
| renderer URL に `?architectureEdit=1` | 手元でのデバッグ |

編集モードはサーバー側の状態です。`reset` で解除され、デッキと一緒には永続化しません。
発表の途中で意図せず編集可能なまま残らないようにするためです。

`?architectureEdit=1` もサーバー状態を切り替えます（`POST /edit-mode`）。
**サーバー状態を唯一の真実にする**ためで、「クライアントだけ編集モード、サーバーは無効」
という状態を作らせません。これを分けると `/state` のポーリングが編集モードを勝手に
解除し、`POST /edit` も `409` で弾かれます。

**操作**（マウスとキーボードで同じことができます）。

| 操作 | マウス | キーボード |
| --- | --- | --- |
| 選択 | node をクリック | Tab / Shift+Tab |
| 移動 | ドラッグ | 矢印キー（10 logical px） |
| 微調整 | — | Shift+矢印（1 px） |
| layout 解除 | ツールバーの `layout 解除` | `L` |
| Undo | ツールバーの `元に戻す` | Ctrl+Z |
| Redo | ツールバーの `やり直す` | Ctrl+Shift+Z / Ctrl+Y |
| 選択解除 | 図の外をクリック | Escape |

移動のたびに図全体を再描画するので、**connector は毎回引き直されます**。
結果はツールバーの `role="status"` / `aria-live="polite"` な領域で読み上げます。

#### 保存の成否は必ず表示されます

編集は 1 操作ごとにサーバーへ書き戻します。**その結果は成功・失敗ともツールバーに
出ます**（`data-architecture-save-state` = `saving` / `saved` / `failed`）。

図は画面上で動いてしまうので、保存できなかったことを表示しないと、利用者は保存
されたと信じたまま編集を失います。そのため失敗は目立つ表示で、**次に保存が成功する
まで消えません**。`409`（編集モードが解除された直後）、`404`（保存中にデッキが
差し替わった）、通信断のいずれも区別して表示します。`console` にだけ出す扱いはしません。

#### layout 管理下のノードは動きません

`layout` を持つ group の子は、座標を書いてもレイアウトエンジンが位置を計算し直すため、
`x` / `y` は**黙って無視されます**。
このリポジトリの実データではノードの約 68% がこれに当たります。

そのため編集モードは、layout 管理下のノードを掴んでも**動かさず**、理由と
どの group が位置を決めているかを読み上げます。動かしたい場合は `L`（layout 解除）を
使います。これは group から `layout` を取り除き、計算済みの `x` / `y` / `width` / `height` を
全ての子へ書き出す操作です。**見た目は変わりません**。以後その group の子は自由に動きます。

解除は元に戻せます（Undo）。ただし DSL としては不可逆な変換なので、
`layout` の再指定は手で書き戻すことになります。

#### 発表・印刷では編集 UI が出ません

`?present=1` と `?print=1` では編集 UI を **DOM ごと生成しません**（CSS で隠すのではなく、
そもそも組み立てません）。さらにサーバーは編集モードが無効なとき `POST /edit` を
`409 edit_mode_disabled` で拒否します。この 2 つは `npm run test:editing` で固定しています。

#### 既知のトレードオフ

書き戻しは `JSON.stringify(..., null, 2)` で整形するため、**元のフェンス内の
インデントや改行位置は正規化されます**（値は変わりません）。フェンスの外側の
地の文と front matter は、**改行コード（CRLF / LF）も含めてそのまま**です。
CRLF の Markdown を保存してもファイル全体が LF に変わることはありません。

**使い分け:** Mermaid は自動レイアウト、シーケンス図、クラス図など構造中心の図に向きます。
Architecture DSL は座標、サイズ、コンテナ、重なりを資料ごとに固定したい構成図に向きます。
外部依存は追加しておらず、アイコンもインライン SVG のパスデータだけで
（画像ファイルを同梱せずに）持っています。connector の交差最小化は
ヒューリスティック（局所探索）であり、最小解を保証するものではありません。
ノードの自動配置は `layout: "layered"` の範囲にとどまり、力学モデルなどの
完全な graph auto-layout は行いません。

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
| `edit_architecture` | `{ enabled: boolean }` | Architecture 図の編集モードを切り替える。有効にすると canvas 上で node をドラッグ／キーボード操作でき、結果は元 Markdown の ```architecture フェンスへ書き戻る。presenter と印刷では編集 UI を出さない。デッキと一緒には永続化せず、`reset` で解除する。戻り値 `{ ok, enabled, version }`。 |
| `reset` | なし | スライドとデッキをクリアして待機プレースホルダーに戻す。編集モードも解除する。 |

### canvas が内部で使う HTTP エンドポイント（renderer 専用）

| エンドポイント | 用途 |
| --- | --- |
| `GET /state` | 現在のスライド（`markdown`）・`index`・`total`・`theme`・`mode`・`architectureEdit`・`version`/`deckVersion` を返す（ポーリング用に軽量）。 |
| `GET /deck` | デッキ全体（`slides`）と `deckVersion` を返す。一覧（☰）のタイトル生成用に、`deckVersion` が変わったときだけ取得する。 |
| `GET /export-data` | ランダムtokenに対応するPDF Export用デッキスナップショットをprint modeへ返す。 |
| `POST /export-status` | print modeが全ページの描画完了またはエラーを `export_pdf` actionへ通知する。 |
| `POST /navigate` | canvas の操作で呼ぶページ送り。body は `{ index }`（絶対）または `{ delta }`（相対）。サーバーが現在位置を更新し、SSE で全クライアントへ反映する。 |
| `POST /present` | canvas の ⛶ ボタンから外部プレゼン画面を起動する。同一 origin の POST のみ受け付ける。 |
| `POST /export` | canvas のプリンターアイコンから、`sourceName` に基づくPDF保存を開始する。同一 origin の POST のみ受け付ける。 |
| `POST /edit` | 編集モードの canvas が、書き換えた ```architecture フェンスをデッキへ書き戻す。body は `{ index, block, source }`。編集モードが無効なら `409 edit_mode_disabled` で拒否する。 |
| `POST /edit-mode` | 編集モードの有効・無効を切り替える。body は `{ enabled }`。`?architectureEdit=1` で開いた renderer もここを叩き、サーバー状態を唯一の真実にする。同一 origin の POST のみ受け付ける。 |
| `GET /events` | SSE。`version` 変化を低遅延で通知する nudge。 |

## ファイル構成

```
.github/extensions/presentation/
  extension.mjs            # canvas 宣言・ループバックサーバー・アクション
  copilot-extension.json   # gist 共有用マニフェスト
  scripts/
    markdown-blocks.mjs    # ```architecture フェンスの走査と差し替え（extension とテストで共有）
  windows/
    pen-button-listener.ps1 # Surface Pen の Win+F20 / Win+F19 / Win+F18 を Node へ中継
  renderer/
    index.html             # iframe シェル・操作バー・スライド一覧オーバーレイ
    slides.css             # 4 テーマ（dark/light/microsoft/ms-modern）の配色定義・ナビ UI のスタイル
    renderer.js            # フロントマター解析 / marked / mermaid / architecture / SSE / 操作 UI
    architecture.mjs       # JSON DSL の検証と安全な SVG DOM 生成
    architecture-edit.mjs  # 編集の中核（DOM 非依存: 移動・layout 解除・Undo/Redo・直列化）
    architecture-editor.mjs # 編集 UI（ツールバー・ドラッグ・キーボード・読み上げ）
  schema/
    architecture-v1.schema.json # Architecture DSL v1 の JSON Schema（draft 2020-12）
    README.md              # スキーマの使い方・バージョニング / 移行ポリシー
    examples/              # $schema 付きのサンプル（相対パスで参照）
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
