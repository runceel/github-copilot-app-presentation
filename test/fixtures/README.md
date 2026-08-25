# テスト用フィクスチャ

`test/harness/deck.mjs` が読み込むデッキです。

## 形式

拡張機能が受け取るのは「スライド 1 枚分の Markdown 断片の配列」で、元 Markdown を断片へ
分割するのは Skill 側（生成 AI）の仕事です。テストはその分割ルールを再実装せず、拡張機能に
渡るのと同じ断片をそのまま記述します。

断片自身が `---` で囲んだフロントマターを持つため、スライドの区切りには衝突しない
`<!-- slide -->` の行を使います。

```markdown
---
layout: title
---

# 表紙

<!-- slide -->

---
page: 2
total: 2
---

## 2 枚目
```

## ファイル

| ファイル | 用途 |
| --- | --- |
| `architecture-visual.md` | ビジュアル回帰用。ピクセル比較を安定させるため architecture DSL のみで構成し、mermaid は含めない |
| `layout-visual.md` | `layout: section` の H1/H2、任意の kicker／フッター、テーマ別背景、PDF 出力の回帰用 |
| `standard-title.md` | 通常スライド先頭の H1/H2 を上部タイトル領域へ固定する DOM・座標・PDF 回帰用 |
| `print-mixed.md` | PDF 回帰用。mermaid と architecture DSL を 1 枚に混在させたスライド断片（区切りなしの単一断片） |

PDF 回帰スイートは `architecture-visual.md` の背表紙の手前に `print-mixed.md` を差し込んだ
デッキを組み立て、mermaid と architecture DSL が同居した状態の印刷結果を検証します。
