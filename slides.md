# Copilot canvas で<br>プレゼンしよう

GitHub Copilot とつくる、ライブなスライド発表

---

## このプレゼンの仕組み

- スライドは **Markdown**（このファイル）に書く
- Copilot は 1 枚ずつ **小さな Markdown 断片**を生成するだけ
- **HTML 変換・装飾は presentation canvas 拡張機能**が担当
- 断片を渡すと **自動でスライドが切り替わる** ⚡

---

## ページ送りは ask_user で

- **次へ ▶** / **◀ 前へ** で 1 枚ずつ移動
- **スライド一覧 ☰** から任意のスライドへジャンプ
- **再読み込み ↻** で表示を作り直し
- **終了 ✖** で発表を終える

> 発表者は選択肢を選ぶだけ。スライドは Copilot が生成します。

---

## コードもきれいに表示

```js
await invokeCanvasAction("presentation", "show_slide", {
  markdown: "## 次のスライド\n\n- 箇条書きも\n- 自由自在",
});
```

`show_slide` に小さな Markdown 断片を渡すだけでスライドが入れ替わります。

---

## はじめかた

1. このリポジトリで Copilot にこう伝える:
   - 「**slides.md に従ってプレゼンしてください**」
2. canvas にスライドが表示される
3. あとは選択肢でページを送るだけ 🎉

---

## 図も画像も使える

```mermaid
flowchart LR
    A[Markdown] --> B[marked]
    B --> C[Mermaid.js]
    C --> D((図 / SVG))
```

![ローカル画像の例](/assets/sample.svg)

- 図は **Mermaid 記法**（` ```mermaid ` ブロック）でそのまま描ける
- 画像は **リモート URL** か、`assets/` に置いた**ローカルファイル**で挿入

---

# ありがとうございました

質問やフィードバックをどうぞ！
