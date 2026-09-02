# テーマとレイアウト

> English version: [English](../themes-and-layouts.md)

テーマは色とタイポグラフィを決め、レイアウトは各スライドの内容の並べ方を決めます。

## 組み込みテーマ

デッキ全体のテーマはフロントマターで指定します。

```markdown
---
theme: dark
---
```

| テーマ | 向いている場面 |
| --- | --- |
| `dark` | 既定のダークネイビーのプレゼンテーション |
| `light` | 明るくくせのないプレゼンテーション |
| `microsoft` | Microsoft、Fluent、Office を意識したプレゼンテーション |
| `custom` | 組織のブランドカラーやカバー画像を使いたいとき |

Canvas Extension でデッキを開くときにテーマを指定すると、その指定が Markdown の
フロントマターより優先されます。どちらにもない場合は `dark` になります。

## スライドレイアウト

### タイトル

最初のスライドはタイトルレイアウトにします。

```markdown
---
layout: title
---

# Product launch

Technical briefing
```

### 標準

標準スライドでは `layout` を書きません。最初の H1 または H2 がタイトル領域に固定され、
本文はその下から始まります。

### セクション

章の区切りにはセクションレイアウトを使います。

```markdown
---
layout: section
---

## Architecture
```

セクションスライドの内容は短くまとめます。

### 中央配置

内容が少なく、上下中央に置きたいときは `layout: center` を指定します。

```markdown
---
layout: center
---

## One decision

Adopt the shared platform.
```

### 裏表紙

裏表紙は Canvas Extension が自動で足します。表示する内容は、フロントマターか
カスタムテーマのメタデータで `logo` や `copyright` に指定します。

## カスタムテーマを作成する

`theme.css` と、必要ならメタデータを入れたフォルダーを用意します。

```text
themes/brand/
  theme.css
  theme.json
  assets/
    cover.svg
    logo.svg
```

Markdown から参照します。

```markdown
---
theme: custom
theme-file: themes/brand/theme.css
---
```

`theme.css` には、CSS カスタムプロパティの宣言だけを書きます。

```css
:root {
  --bg: #101820;
  --fg: #ffffff;
  --body: #d7e3ef;
  --accent: #00a4ef;
  --surface: #182b3a;
  --border: #31536b;
}
```

セレクター、`@import`、`url()`、JavaScript、ワークスペース外のパスは受け付けません。
同じフォルダーに `theme.json` を置くと、表紙と裏表紙の画像、ロゴ、著作権表記を指定できます。

指定できるプロパティの一覧は
[カスタムテーマ作成ガイド](../../../.github/extensions/markdstage/docs/custom-theme-authoring.md)を参照してください。

## 発表前にレイアウトを確認する

伸縮する Canvas ではうまく見えても、固定 16:9 の出力では内容が見切れることがあります。
Canvas Extension で **More controls > Output preview** を選び、書き出す前に警告をすべて
解消してください。

[次へ: 図とメディア →](diagrams-and-media.md)
