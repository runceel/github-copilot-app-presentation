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
  │ /events(SSE) で更新を通知
  ▼
canvas iframe（renderer/）
  │ marked で本文を HTML 化 → DOMPurify でサニタイズ
  │ highlight.js で言語付きコードフェンスをシンタックスハイライト
  │ ```mermaid を図に変換 → mermaid.run
  │ ◀ ▶ ボタン・矢印キー・☰ 一覧でページ送り（canvas 内で完結）
  ▼
テーマ付きスライドを表示（更新は自動反映）
```

- **全スライドはプレゼン開始時に `open_canvas` の `input`（`slides`）で一括登録**します。open ハンドラーが URL を返す前にデッキを適用するため、canvas を開いた瞬間に最初のスライドが表示され、「スライド未読込」のプレースホルダーを挟みません。発表途中の差し替え・テーマ変更は `load_deck` で行います。**ページ送りは canvas 内のボタン（◀ ▶）・矢印キー・スライド一覧（☰）で完結**し、その操作は拡張機能のループバックサーバー（`POST /navigate`）に送られて全クライアントへ反映されます。外部サーバーや `localhost` ポートの手動起動は不要です。
- 配色は **dark（既定）/ light / microsoft** の 3 テーマ。`open` の `input` または `load_deck` の `theme` でデッキ全体に適用し、レンダラーが `<html data-theme>` 経由で `slides.css` の配色を切り替えます。
- ナビゲーション UI（操作バー・スライド一覧）と現在位置の管理は **canvas（renderer）側**が担当します。エージェントは開始時に `open_canvas`（`input`）を呼ぶだけで、ページ送りの `ask_user` ループは不要です。`goto_slide` はチャットから特定ページへ飛びたいときに使えます。
- ローカル画像はリポジトリ直下の `assets/` を `/assets/...` で配信します。
- コードフェンスに `csharp` / `json` / `diff` などの言語名を付けると、highlight.js がシンタックスハイライトします。

## アクション

> **開始は `open_canvas`（`canvasId: "presentation"`）の `input` でデッキごと開く**のが基本です: `input: { slides: string[], index?: number, theme?: "dark"｜"light"｜"microsoft" }`。open ハンドラーが URL を返す前にデッキを適用するので、最初からスライドが表示されます（再フォーカスのみのときは `input` を省略すると現在位置を維持）。下表は開始後に使うアクションです。

| アクション | 入力 | 説明 |
| --- | --- | --- |
| `load_deck` | `{ slides: string[], index?: number, theme?: "dark"｜"light"｜"microsoft" }` | 登録済みデッキを差し替える / 再ロードする（発表途中の内容・テーマ変更用）。`index`（既定 0）のスライドを表示し、`theme` でデッキ全体の配色（既定 `dark`）を指定。各要素はフロントマター＋本文 Markdown。戻り値 `{ ok, version, index, total, theme }`。 |
| `goto_slide` | `{ index: number }` | 登録済みデッキ内で表示スライドを 0 始まりインデックスで切り替える。範囲外は端に丸める。通常のページ送りは canvas 内で行われるため不要だが、チャットからの指定に使う。戻り値 `{ ok, changed, version, index, total }`。 |
| `show_slide` | `{ markdown: string }` | 現在のスライドを1枚だけ差し替える（単発表示・その場限りの差し替え用）。フロントマター（`deck`/`kicker`/`page`/`total`/`title`/`layout`/`theme`）＋本文 Markdown。`theme` 省略時は現在のデッキテーマを引き継ぐ。 |
| `reset` | なし | スライドとデッキをクリアして待機プレースホルダーに戻す。 |

### canvas が内部で使う HTTP エンドポイント（renderer 専用）

| エンドポイント | 用途 |
| --- | --- |
| `GET /state` | 現在のスライド（`markdown`）・`index`・`total`・`theme`・`mode`・`version`/`deckVersion` を返す（ポーリング用に軽量）。 |
| `GET /deck` | デッキ全体（`slides`）と `deckVersion` を返す。一覧（☰）のタイトル生成用に、`deckVersion` が変わったときだけ取得する。 |
| `POST /navigate` | canvas の操作で呼ぶページ送り。body は `{ index }`（絶対）または `{ delta }`（相対）。サーバーが現在位置を更新し、SSE で全クライアントへ反映する。 |
| `GET /events` | SSE。`version` 変化を低遅延で通知する nudge。 |

## ファイル構成

```
.github/extensions/presentation/
  extension.mjs            # canvas 宣言・ループバックサーバー・アクション
  copilot-extension.json   # gist 共有用マニフェスト
  renderer/
    index.html             # iframe シェル・操作バー・スライド一覧オーバーレイ
    slides.css             # 3 テーマ（dark/light/microsoft）の配色定義・ナビ UI のスタイル
    renderer.js            # フロントマター解析 / marked / mermaid / SSE 購読 / 操作 UI（◀ ▶・キー・一覧）
  vendor/
    marked.min.js          # Markdown レンダラー
    purify.min.js          # DOMPurify（HTML サニタイズ）
    highlight.min.js       # コードのシンタックスハイライト
    highlight.LICENSE      # highlight.js の MIT ライセンス
    mermaid.min.js          # 図のレンダリング
```

## サードパーティライセンス

`vendor/` には以下の OSS を同梱しています（各ライセンスに従います）。

- **marked** — MIT License © 2011-2024 Christopher Jeffrey 他 — https://github.com/markedjs/marked
- **DOMPurify** — Apache-2.0 / MPL-2.0 © Cure53 他 — https://github.com/cure53/DOMPurify
- **highlight.js** — MIT License © 2006 Ivan Sagalaev — https://github.com/highlightjs/highlight.js
- **Mermaid** — MIT License © 2014-2024 Knut Sveidqvist 他 — https://github.com/mermaid-js/mermaid

> 補足: `mermaid.min.js` は約 3MB のため、gist 共有（1 ファイル ~1MB 上限）には乗りません。ローカル利用・リポジトリへのコミットには影響しません。
