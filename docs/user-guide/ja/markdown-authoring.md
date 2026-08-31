# Markdown の記述

> English version: [English](../markdown-authoring.md)

MarkdStage は Markdown を信頼できる唯一の情報源として維持します。デッキは、必要に応じて
フロントマターと `---` の区切りを追加した通常の Markdown ファイルです。

## スライドを区切る

空行の後に `---` だけの行を記述します。

```markdown
## First slide

- First point

---

## Second slide

- Second point
```

フェンス付きコードブロック内の区切りはコードとして扱われ、新しいスライドにはなりません。

## フロントマターでデッキを設定する

先頭のフロントマターでデッキ共通の設定を指定します。

```markdown
---
title: Quarterly review
deck: Quarterly review
theme: microsoft
layout: title
---

# Quarterly review
```

各スライドにもフロントマターを記述できます。スライド側の値がデッキ側の値を上書きします。

| キー | 用途 |
| --- | --- |
| `title` | ブラウザーまたはドキュメントのタイトル |
| `deck` | フッターに表示するデッキ名 |
| `kicker` | 見出し上部の小さなラベル |
| `page` / `total` | 明示的なページ情報 |
| `layout` | `title`、`section`、`center`、`backcover` |
| `size` | `auto`、`normal`、`large`、`xlarge` |
| `theme` | `dark`、`light`、`microsoft`、`custom` |
| `theme-file` | ワークスペースからの相対パスで指定するカスタムテーマ CSS |
| `logo` / `copyright` | バックカバーのメタデータ |

ページ情報を省略すると MarkdStage が生成します。タイトル、セクション、バックカバーには
ページ番号を表示しません。画面のページカウンターはバックカバーを含みますが、
自動生成されるスライドフッターの総数にはバックカバーを含みません。

## レイアウトを使い分ける

- 最初のスライドには `layout: title` を使用します。
- 上寄せの標準スライドでは `layout` を省略します。
- 短い見出しだけの章区切りには `layout: section` を使用します。
- 少量のコンテンツを上下中央に配置する場合だけ `layout: center` を使用します。
- バックカバーがない場合、Canvas Extension が自動的に追加します。

例は[テーマとレイアウト](themes-and-layouts.md)を参照してください。

## コンテンツサイズを制御する

既定値は `size: auto` です。余白の多い標準スライドを拡大しますが、
コード、表、画像、図を含むスライドは自動拡大しません。

サイズを明示する場合は `normal`、`large`、`xlarge` を使用します。

```markdown
---
size: large
---

## One important message
```

読み込んだ Markdown では、スライド先頭の `<!-- slide-size: large -->` も使用できます。

## 標準 Markdown を使う

MarkdStage は次の要素に対応します。

- 見出し、段落、リスト、引用、強調、リンク
- 表とインラインコード
- フェンス付きコードブロック
- 画像
- Mermaid 図
- Architecture DSL 図
- 絵文字

フェンス付きコードに言語名を追加すると、シンタックスハイライトが有効になります。

````markdown
```csharp
var deck = new Presentation("slides.md");
```
````

## スピーカーノートを追加する

スライドに1つ以上のトップレベル HTML コメントを記述します。

```markdown
## Deployment

- Deploy after validation.

<!--
Explain the rollback plan before showing the command.
-->
```

ノート内でも Markdown を使用できます。Canvas の発表者ビューと Desktop に表示されますが、
通常のスライド、オーディエンスウィンドウ、PDF には表示されません。

コードフェンス内のコメントと `slide-size` ディレクティブはノートとして扱われません。

## ローカル画像を追加する

Markdown ファイルと同じ場所、またはワークスペースルートに `assets/` フォルダーを作成します。

```markdown
![Diagram showing the deployment flow](/assets/deployment.png)
```

Markdown と同じ場所の `assets/` が先に検索されるため、デッキ固有の画像でワークスペース共通の画像を
上書きできます。画像には必ず意味のある代替テキストを記述してください。

[次へ: テーマとレイアウト →](themes-and-layouts.md)
