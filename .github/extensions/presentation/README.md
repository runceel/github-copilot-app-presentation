# presentation canvas 拡張機能

Markdown のスライド断片を **ネイティブ Copilot canvas** にテーマ付きで表示するプレゼン用拡張機能です。`presentation` スキルがこの拡張機能を使ってプレゼンを進めます。

## 仕組み

```
エージェント
  │ invoke_canvas_action("load_deck", { slides: [...] })   # 開始時に全スライドを一括登録
  │ invoke_canvas_action("goto_slide", { index })          # ページ送りはインデックス指定だけ
  ▼
extension.mjs（Node / @github/copilot-sdk）
  │ instance ごとにループバック HTTP サーバーを起動
  │ デッキ（全スライド）と現在 index を保持し、/state に現在スライドを公開
  │ /events(SSE) で更新を通知
  ▼
canvas iframe（renderer/）
  │ marked で本文を HTML 化 → DOMPurify でサニタイズ
  │ ```mermaid を図に変換 → mermaid.run
  ▼
テーマ付きスライドを表示（更新は自動反映）
```

- **全スライドはプレゼン開始時に `load_deck` で一括登録**します。ページ送りは `goto_slide` にインデックスを渡すだけで、**Markdown の再生成が不要**なため速いです。外部サーバーや `localhost` ポートは不要です。
- 配色は **dark（既定）/ light / microsoft** の 3 テーマ。`load_deck` の `theme` でデッキ全体に適用し、レンダラーが `<html data-theme>` 経由で `slides.css` の配色を切り替えます。
- ページ送りのロジックはエージェント側（`ask_user`）が担当し、この拡張機能は登録済みデッキの中から「現在の1枚」をレンダリングするだけです。
- ローカル画像はリポジトリ直下の `assets/` を `/assets/...` で配信します。

## アクション

| アクション | 入力 | 説明 |
| --- | --- | --- |
| `load_deck` | `{ slides: string[], index?: number, theme?: "dark"｜"light"｜"microsoft" }` | 全スライドを一括登録し、`index`（既定 0）のスライドを表示する。`theme` でデッキ全体の配色（既定 `dark`）を指定。各要素はフロントマター＋本文 Markdown。戻り値 `{ ok, version, index, total, theme }`。 |
| `goto_slide` | `{ index: number }` | 登録済みデッキ内で表示スライドを 0 始まりインデックスで切り替える。範囲外は端に丸める。戻り値 `{ ok, version, index, total }`。 |
| `show_slide` | `{ markdown: string }` | 現在のスライドを1枚だけ差し替える（単発表示・その場限りの差し替え用）。フロントマター（`deck`/`kicker`/`page`/`total`/`title`/`layout`/`theme`）＋本文 Markdown。`theme` 省略時は現在のデッキテーマを引き継ぐ。 |
| `reset` | なし | スライドとデッキをクリアして待機プレースホルダーに戻す。 |

## ファイル構成

```
.github/extensions/presentation/
  extension.mjs            # canvas 宣言・ループバックサーバー・アクション
  copilot-extension.json   # gist 共有用マニフェスト
  renderer/
    index.html             # iframe シェル
    slides.css             # 3 テーマ（dark/light/microsoft）の配色定義
    renderer.js            # フロントマター解析 / marked / mermaid / SSE 購読
  vendor/
    marked.min.js          # Markdown レンダラー
    purify.min.js          # DOMPurify（HTML サニタイズ）
    mermaid.min.js          # 図のレンダリング
```

## サードパーティライセンス

`vendor/` には以下の OSS を同梱しています（各ライセンスに従います）。

- **marked** — MIT License © 2011-2024 Christopher Jeffrey 他 — https://github.com/markedjs/marked
- **DOMPurify** — Apache-2.0 / MPL-2.0 © Cure53 他 — https://github.com/cure53/DOMPurify
- **Mermaid** — MIT License © 2014-2024 Knut Sveidqvist 他 — https://github.com/mermaid-js/mermaid

> 補足: `mermaid.min.js` は約 3MB のため、gist 共有（1 ファイル ~1MB 上限）には乗りません。ローカル利用・リポジトリへのコミットには影響しません。
