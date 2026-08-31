# テーマとレイアウト

> English version: [English](../themes-and-layouts.md)

テーマは色とタイポグラフィを定義し、レイアウトは各スライドのコンテンツ配置を定義します。

## 組み込みテーマ

フロントマターでデッキ全体のテーマを指定します。

```markdown
---
theme: dark
---
```

| テーマ | 適した用途 |
| --- | --- |
| `dark` | 既定のダークネイビーのプレゼンテーション |
| `light` | 明るくニュートラルなプレゼンテーション |
| `microsoft` | Microsoft、Fluent、Office をイメージしたプレゼンテーション |
| `custom` | 組織のブランドカラーやカバーアセット |

Canvas Extension はデッキを開くときにテーマを明示的に指定できます。その指定は Markdown の
フロントマターより優先されます。どちらにも指定がない場合は `dark` が使用されます。

## スライドレイアウト

### タイトル

最初のスライドにはタイトルレイアウトを使用します。

```markdown
---
layout: title
---

# Product launch

Technical briefing
```

### 標準

標準スライドでは `layout` を省略します。最初の H1 または H2 はタイトル領域に固定され、
本文はその下から始まります。

### セクション

章の区切りにはセクションレイアウトを使用します。

```markdown
---
layout: section
---

## Architecture
```

セクションスライドの内容は短くします。

### 中央配置

少量のコンテンツを上下中央に配置する場合は `layout: center` を使用します。

```markdown
---
layout: center
---

## One decision

Adopt the shared platform.
```

### バックカバー

Canvas Extension はバックカバーを自動的に追加します。値を表示する場合は、フロントマターまたは
カスタムテーマのメタデータで `logo` や `copyright` を指定します。

## カスタムテーマを作成する

`theme.css` と必要に応じたメタデータを含むフォルダーを作成します。

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

`theme.css` には CSS カスタムプロパティの宣言だけを記述します。

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

セレクター、`@import`、`url()`、JavaScript、ワークスペース外のパスは拒否されます。
同じフォルダーの `theme.json` には、カバーとバックカバーの画像、ロゴ、著作権情報を定義できます。

利用できるプロパティの一覧は
[カスタムテーマ作成ガイド](../../../.github/extensions/markdstage/docs/custom-theme-authoring.md)を参照してください。

## プレゼンテーション前にレイアウトを確認する

柔軟な Canvas では問題なく見えるコンテンツでも、固定 16:9 出力ではクリップされる場合があります。
Canvas Extension で **16:9** を選択し、エクスポート前にすべての警告を解消してください。

[次へ: 図とメディア →](diagrams-and-media.md)
