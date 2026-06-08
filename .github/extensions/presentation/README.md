# presentation canvas 拡張機能

Markdown のスライド断片を **ネイティブ Copilot canvas** にテーマ付きで表示するプレゼン用拡張機能です。`presentation` スキルがこの拡張機能を使ってプレゼンを進めます。

## 仕組み

```
エージェント
  │ invoke_canvas_action("show_slide", { markdown })
  ▼
extension.mjs（Node / @github/copilot-sdk）
  │ instance ごとにループバック HTTP サーバーを起動
  │ /state に現在スライドを保持し、/events(SSE) で更新を通知
  ▼
canvas iframe（renderer/）
  │ marked で本文を HTML 化 → DOMPurify でサニタイズ
  │ ```mermaid を図に変換 → mermaid.run
  ▼
テーマ付きスライドを表示（更新は自動反映）
```

- スライド切り替えは **`show_slide` アクションに小さな Markdown 断片を渡すだけ**。`.NET` アプリや `localhost:5050` は不要です。
- ページ送りのロジックはエージェント側（`ask_user`）が担当し、この拡張機能は「現在の1枚」をレンダリングするだけです。
- ローカル画像はリポジトリ直下の `assets/` を `/assets/...` で配信します。

## アクション

| アクション | 入力 | 説明 |
| --- | --- | --- |
| `show_slide` | `{ markdown: string }` | 現在のスライドを差し替える。フロントマター（`deck`/`kicker`/`page`/`total`/`title`/`layout`）＋本文 Markdown。 |
| `reset` | なし | スライドをクリアして待機プレースホルダーに戻す。 |

## ファイル構成

```
.github/extensions/presentation/
  extension.mjs            # canvas 宣言・ループバックサーバー・アクション
  copilot-extension.json   # gist 共有用マニフェスト
  renderer/
    index.html             # iframe シェル
    slides.css             # スライドのテーマ（SlideState.cs から移植）
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
