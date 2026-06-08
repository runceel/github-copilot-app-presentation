---
name: presentation
description: 'Markdown ファイルを使って GitHub Copilot の canvas でスライドプレゼンを行うためのスキル。「slides.md に従ってプレゼンして」「プレゼンを始めて」「このスライドで発表して」など、Markdown を元にスライドを 1 枚ずつ表示しながら発表を進めたいときに使う。スライドは PresentationApp (.NET 10 / ASP.NET Core Blazor + Markdig) が http://localhost:5050 で配信し、ブラウザー canvas に表示する。ページ送りは ask_user ツールで行う。Use when the user wants to give a slide presentation driven by a markdown file and shown in the browser canvas.'
---

# presentation スキル

Markdown ファイルを元に、**1 スライドずつ「小さな Markdown 断片」を生成して `PresentationApp` に渡し、ブラウザー canvas で表示**しながらプレゼンを進めるスキルです。ページ送りは `ask_user` ツールで操作します。

## いちばん大事な原則 ⚡

**あなた（生成 AI）が書くのは、表示したいスライド 1 枚分の「小さな Markdown 断片」だけ**です。HTML・CSS・テーマ・レイアウト・ページ番号・アニメーションは**すべてアプリ側（Markdig）が担当**します。フル HTML を生成しないこと。これにより 1 枚あたりの生成量がごく小さくなり、ページ切り替えが速くなります。

スライド 1 枚は、せいぜいこの程度の Markdown です:

```markdown
---
deck: プレゼンのタイトル
kicker: セクション名
page: 2
total: 6
---
## スライドの見出し

- 箇条書き **1**
- 箇条書き 2
```

これを `PresentationApp/slides/current.md` に書き込むだけで、canvas のスライドが切り替わります。

## 仕組み

```
あなた → 小さな Markdown 断片を current.md に書く
                 │ FileSystemWatcher が検知
                 ▼
   アプリが Markdig で HTML 化 + テーマ適用（/slide）
                 │ SignalR
                 ▼
   ブラウザー canvas の iframe が自動更新
```

- スライド切り替えは **`PresentationApp/slides/current.md` を上書きするだけ**。アプリの再起動は不要です（これがユーザーの言う「動的にページが書き換わる」挙動）。
- アプリは `http://localhost:5050` で動作し、`/health`（生存確認）と `/slide`（current.md を Markdig でレンダリングしたスライド HTML を no-store で返す）を持ちます。
- 同時に表示できるデッキは 1 つ（`current.md` は 1 ファイル）。1 人での発表を前提とします。

## current.md のフォーマット

先頭に **フロントマター**（`---` で囲んだ `key: value`）を置き、その下に**本文の Markdown**を書きます。フロントマターは任意で、使えるキーは次のとおり（すべて省略可）:

| キー | 役割 |
| --- | --- |
| `deck` | フッター左に出すデッキ名 |
| `kicker` | 見出し上の小さなラベル（セクション名など） |
| `page` | 現在ページ番号（1 始まり）。`total` と両方あるときだけフッター右に表示 |
| `total` | 総ページ数 |
| `title` | ブラウザータブのタイトル（省略時は `deck`） |
| `layout` | `title` を指定すると中央寄せの表紙レイアウトになる。通常スライドは省略 |

本文では通常の Markdown が使えます（Markdig の advanced 拡張が有効）:
見出し `#`/`##`/`###`、箇条書き `-`/番号付き `1.`、強調 `**太字**`/`*色付き*`、`` `コード` ``、コードブロック ` ``` `、引用 `>`、表 `|...|`、リンク、画像 `![](...)`、Mermaid 図 ` ```mermaid `、絵文字 `:rocket:` など。**HTML エスケープやタグ生成は不要**で、素の Markdown をそのまま書きます。

> 注意: フッターに `page`/`total` を出す場合は、ページ送りのたびに `page` の値を更新すること。

## 図（ダイアグラム）と画像

### 図: Mermaid 記法
` ```mermaid ` のコードフェンスに Mermaid 記法を書くと、アプリが図（SVG）として描画します。フローチャート・シーケンス図・クラス図・円グラフなどが使えます。

````markdown
```mermaid
flowchart LR
    A[企画] --> B[実装] --> C[発表]
```
````

- Mermaid.js はアプリに**同梱**（`PresentationApp/wwwroot/lib/mermaid/`）。オフラインでも描画されます。
- 記法に誤りがあってもスライドは**空白になりません**。エラー表示と他の本文はそのまま表示されます。

### 画像
- **リモート URL**: `![代替テキスト](https://example.com/foo.png)` をそのまま書けます。
- **ローカル画像**: リポジトリ直下の **`assets/`** フォルダーに画像を置き、`![代替テキスト](/assets/foo.png)` で参照します（サブフォルダー・SVG・日本語ファイル名も可。`/assets/...` の絶対パスで参照すること）。

## プレゼン開始の手順

### 1. 対象 Markdown を特定する
ユーザーの指示（例: 「`slides.md` に従ってプレゼンして」）から元 Markdown ファイルのパスを決めます。指定が無ければリポジトリ直下の `slides.md` を既定とし、無い場合は `ask_user` でパスを尋ねます。

### 2. Markdown をスライド配列にパースする
- **区切り**: 行頭から行末まで完全に `---`（ハイフン 3 つのみ）の行をスライド区切りとします。
- **コードフェンス内は無視**: ` ``` ` で囲まれたブロック内の `---` は区切りにしません。
- **先頭の front matter**: ファイル先頭が `---` で始まる YAML ブロックはデッキ設定（任意）でありスライドではありません。読み飛ばします。
- 各スライドの前後の空白をトリムし、空スライドは捨てます。
- 各スライドの**タイトル**（一覧表示用）は、最初の見出し行、無ければ最初の非空行の先頭 40 文字程度を使います。
- デッキ全体のタイトルは、先頭 front matter の `title`、無ければ最初のスライドの見出しを使います。

### 3. デッキ状態を保存する（中断への保険）
パース後、以下を `PresentationApp/slides/` に保存します。
- `deck.json`: `{ "source": "<md パス>", "title": "<デッキ名>", "count": N, "titles": ["…", …] }`
- `state.json`: `{ "index": 0 }`（現在のスライド番号。0 始まり）

進行中はスライド配列と現在 index を会話メモリで保持しつつ、ページ送りのたびに `state.json` を更新します。中断時はこの 2 ファイルと元 Markdown から再開できます。

### 4. アプリを起動して canvas を開く
1. 生存確認: `Invoke-WebRequest http://localhost:5050/health` が成功すれば起動済み。**二重起動しない**こと。
2. 起動していなければ `PresentationApp` で次を **detach した非同期プロセス**として起動します（`powershell` ツールを `mode="async"`, `detach: true`）:
   ```
   dotnet run --urls http://localhost:5050
   ```
3. `/health` が `{"ok":true,...}` を返すまでポーリング（最大 ~30 秒）。
4. ブラウザー canvas を開く: `open_canvas`（`canvasId: "browser"`, `instanceId: "presentation"`, `input: { "url": "http://localhost:5050", "title": "プレゼン" }`）。

### 5. 最初のスライドを表示する
`state.json` の index のスライドを「スライド断片の生成」に従って `current.md` に書き込みます。canvas が自動更新されます。

### 6. ページ送りループ（ask_user）
`ask_user` ツールで次の選択肢を提示します:

- **次へ ▶** … index を +1（最後なら据え置き）。
- **◀ 前へ** … index を -1（先頭なら据え置き）。
- **スライド一覧 ☰** … `ask_user` を再度呼び、`deck.json` の `titles` を「1. タイトル」「2. タイトル」… の選択肢として提示。選ばれたスライドへジャンプ。
- **再読み込み ↻** … 現在のスライドを生成し直す（表示が崩れたときの保険）。
- **終了 ✖** … ループを抜ける。

選択のたびに、対象スライドの**小さな Markdown 断片を生成して `current.md` を上書き** → `state.json` を更新 → ループ継続。**終了が選ばれるまで繰り返す**。

### 7. 終了処理
- ループを抜けたら発表が終わった旨を伝えます。
- アプリは基本そのまま動かしておきます（次の発表でそのまま使えます）。ユーザーが停止を望む場合のみ、起動した `dotnet` プロセスを `Stop-Process -Id <PID>` で停止します。
- `slides/` に残った一時ファイルがあれば削除します。

## スライド断片の生成（current.md への書き込み）

各スライドは、フロントマター + 本文 Markdown の**小さなテキスト**です。これを `PresentationApp/slides/current.md` に **UTF-8** で書き込みます。

最速かつ確実な方法は、`powershell` ツールでの 1 回の書き込みです（here-string を使う）:

```powershell
$md = @'
---
deck: Copilot canvas でプレゼンしよう
kicker: Copilot Presentation
page: 2
total: 6
---
## このプレゼンの仕組み

- スライドは **Markdown** の小さな断片だけ
- 変換・装飾・ページ番号は **アプリ側**が担当
- だから切り替えが **速い** ⚡
'@
Set-Content -Path "PresentationApp\slides\current.md" -Value $md -Encoding UTF8
```

> `/slide` エンドポイントには再試行と直前スライドの保持があるため、書き込み途中でも画面が真っ白にはなりません。原子的にしたい場合は、`.render.md` に書いてから `Move-Item -Force .render.md current.md` で差し替えてもよいです。

### 元 Markdown とのマッピング
元ファイル（例 `slides.md`）の各スライドは、すでに本文 Markdown になっています。各ページでは **その本文をほぼそのまま使い**、先頭に `deck` / `kicker` / `page` / `total`（必要なら `layout: title`）のフロントマターを付けるだけです。表紙や結びなど見出しだけのスライドは `layout: title` を付けると中央寄せになります。本文は短く、箇条書き中心にすると読みやすく、生成も速くなります。

## 注意・トラブルシューティング
- canvas が更新されないとき: `/health` の `version` が増えているか確認。増えていなければ `current.md` の書き込み先パスを確認。`version` は増えているのに表示が変わらないときは「再読み込み ↻」を選ぶ。
- サーバーが落ちた／接続拒否のとき: `dotnet run` を起動し直し、現在のスライドを `current.md` に書き直す。canvas は `open_canvas` を再実行して開き直す。
- ポート 5050 が使用中のとき: 既に同アプリが起動している可能性が高い。`/health` が応答すればそれを使う。別プロセスが占有している場合は別ポート（例 5051）で起動し、canvas の URL もそれに合わせる。
- 文字化けするとき: ファイルは必ず UTF-8 で書き込む。
