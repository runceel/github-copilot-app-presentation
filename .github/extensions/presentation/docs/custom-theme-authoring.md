# カスタムテーマ作成ガイド

このガイドは、presentation canvas の `custom` テーマを作成する人と、
テーマを生成する AI のためのリファレンスです。

## 最小構成

テーマファイルには CSS カスタムプロパティだけを書きます。ファイルは
スライド Markdown と同じフォルダーに置くことができます。

```markdown
---
theme: custom
theme-file: ./brand.css
---
```

```css
--bg: #101820;
--fg: #ffffff;
--body: #d7e3ef;
--accent: #00a4ef;
--surface: #182b3a;
--border: #31536b;
```

`:root { ... }` で囲む形式も使用できます。

```css
:root {
  --bg: #101820;
  --accent: #00a4ef;
}
```

## 使用できるプロパティ

### スライドの基本色

| プロパティ | 用途 |
| --- | --- |
| `--bg` | 通常スライドの背景 |
| `--fg` | 見出しや主要テキスト |
| `--muted` | 補助テキスト |
| `--body` | 本文テキスト |
| `--accent` | 主アクセント |
| `--accent-strong` | 強調アクセント |
| `--accent-soft` | 薄いアクセント背景 |
| `--accent-line` | アクセント線 |
| `--surface` | カードや表面 |
| `--code` | コードブロック背景 |
| `--code-fg` | コードブロック文字 |
| `--border` | 境界線 |

### コードシンタックス

`--syntax-comment`、`--syntax-keyword`、`--syntax-string`、
`--syntax-number`、`--syntax-title`、`--syntax-type`、
`--syntax-meta`、`--syntax-variable` はコードの各要素の色です。

差分表示には `--syntax-addition`、`--syntax-addition-bg`、
`--syntax-deletion`、`--syntax-deletion-bg` を使います。

### 装飾と表紙

| プロパティ | 用途 |
| --- | --- |
| `--glow-1` / `--glow-2` | 背景の光彩 |
| `--topbar` | 上部バーの背景 |
| `--kicker-mark` | kicker のマーク |
| `--cover-bg` | 表紙背景 |
| `--backcover-bg` | 背表紙背景 |
| `--print-slide-bg` | PDF の通常ページ背景 |
| `--print-cover-bg` | PDF の表紙背景 |
| `--ms-font` | Microsoft 系テーマのフォント指定 |

`--ms-red`、`--ms-green`、`--ms-blue`、`--ms-yellow` もブランド用の
補助色として利用できます。

### サイズと余白

`--deck-pad-y`、`--deck-pad-x`、`--slide-h1-size`、`--slide-h2-size`、
`--slide-h3-size`、`--slide-body-size`、`--slide-code-size` を変更できます。

値には `px`、`rem`、`clamp(...)` などの CSS 値を指定できます。

## 作成時の注意

- 実行時には `--` で始まる任意のカスタムプロパティを読み込めますが、ここに記載した名前だけが標準レイアウトで使用されます。
- 値は空にできません。
- セレクター、`@import`、`url(...)`、`javascript:`、`expression(...)` は使用できません。
- CSS の任意ルールや JavaScript をテーマファイルへ書かないでください。
- テーマファイルはワークスペース内に置き、Markdown からの相対パスで指定してください。
- テーマファイルの最大サイズは 64 KiB です。
- 同じプロパティを複数回指定した場合は最後の値が使われます。
- 色だけでなくグラデーションも指定できます。本文と補助テキストのコントラストは確認してください。
- PDF 出力にも同じテーマが適用されます。

## 作成例

```css
:root {
  --bg: #0b1320;
  --fg: #f7fbff;
  --muted: #9bb0c6;
  --body: #d9e7f2;
  --accent: #42d3ff;
  --accent-strong: #a6f36b;
  --accent-soft: rgb(66 211 255 / 14%);
  --accent-line: rgb(66 211 255 / 45%);
  --surface: #14263a;
  --code: #101e2e;
  --code-fg: #c6e6ff;
  --border: #2d4d68;
  --topbar: linear-gradient(90deg, #42d3ff, #a6f36b);
  --kicker-mark: linear-gradient(135deg, #42d3ff, #a6f36b);
  --cover-bg: linear-gradient(145deg, #102b48, #101729);
  --backcover-bg: linear-gradient(145deg, #0d6b91, #315b32);
}
```

## AI がテーマを選ぶときの指針

- ブランドカラーを明示された場合は `custom` と `theme-file` を使用する。
- 「明るい」「ダーク」など組み込みテーマで表現できる場合は、カスタムテーマを新規作成せず `light` または `dark` を使用する。
- カスタムテーマを作る場合は、まず `presentation_guide` の
  `theme-schema` を取得してプロパティ名を確認する。
