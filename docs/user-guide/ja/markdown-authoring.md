# Markdown の記述

> English version: [English](../markdown-authoring.md)

MarkdStage では、Markdown をそのまま正本として扱います。デッキの実体は、必要に応じて
フロントマターと `---` の区切りを足しただけの、ふつうの Markdown ファイルです。

## スライドを区切る

空行を挟んで、`---` だけの行を書きます。

```markdown
## First slide

- First point

---

## Second slide

- Second point
```

フェンス付きコードブロックの中の区切りはコードとして扱われ、新しいスライドにはなりません。

## フロントマターでデッキを設定する

ファイル先頭のフロントマターに、デッキ全体の設定を書きます。

```markdown
---
title: Quarterly review
deck: Quarterly review
theme: microsoft
layout: title
---

# Quarterly review
```

スライドごとにフロントマターを書くこともできます。スライド側の値がデッキ側の値より優先されます。

| キー | 意味 |
| --- | --- |
| `title` | ブラウザーやドキュメントのタイトル |
| `deck` | フッターに出すデッキ名 |
| `kicker` | 見出しの上に添える小さなラベル |
| `page` / `total` | 明示したいページ情報 |
| `layout` | `title`、`section`、`center`、`backcover` |
| `size` | `auto`、`normal`、`large`、`xlarge` |
| `theme` | `dark`、`light`、`microsoft`、`custom` |
| `theme-file` | ワークスペースからの相対パスで指定するカスタムテーマ CSS |
| `logo` / `copyright` | 裏表紙に載せる情報 |

ページ情報を省くと MarkdStage が自動で補います。タイトル、セクション、裏表紙には
ページ番号を出しません。画面のページカウンターは裏表紙も数えますが、
自動生成されるスライドフッターの総ページ数には裏表紙を含めません。

## レイアウトを使い分ける

- 最初のスライドは `layout: title` にします。
- 上寄せの標準スライドでは `layout` を書きません。
- 短い見出しだけの章区切りには `layout: section` を指定します。
- 内容が少なく、上下中央に置きたいときだけ `layout: center` を指定します。
- 裏表紙がまだない場合は、Canvas Extension が自動で足します。

例は[テーマとレイアウト](themes-and-layouts.md)を参照してください。

## コンテンツサイズを調整する

既定は `size: auto` です。余白の多い標準スライドは大きく表示しますが、
コード、表、画像、図があるスライドは自動で拡大しません。

サイズを固定したいときは `normal`、`large`、`xlarge` を指定します。

```markdown
---
size: large
---

## One important message
```

読み込んだ Markdown では、スライド先頭に `<!-- slide-size: large -->` と書く方法も使えます。

## 標準 Markdown を使う

MarkdStage は次の記法に対応しています。

- 見出し、段落、リスト、引用、強調、リンク
- 表とインラインコード
- フェンス付きコードブロック
- 画像
- Mermaid 図
- Architecture DSL 図
- 絵文字

フェンス付きコードに言語名を書くと、シンタックスハイライトが効きます。

````markdown
```csharp
var deck = new Presentation("slides.md");
```
````

## スピーカーノートを追加する

スライドに直接（コードフェンスの外に）HTML コメントを書きます。1枚に複数書けます。

```markdown
## Deployment

- Deploy after validation.

<!--
Explain the rollback plan before showing the command.
-->
```

ノートの中でも Markdown を使えます。ノートは Canvas の発表者ビュー、Desktop のメインウィンドウ、
CLI の発表者ビューに出るほか、PowerPoint エクスポートでは各スライドのノート欄にプレーンテキストとして
書き出されます。通常のスライド、投影用ウィンドウ、PDF には出ません。

コードフェンスの中のコメントと `slide-size` ディレクティブは、ノートとして扱いません。

## ローカル画像を追加する

Markdown ファイルと同じ場所か、ワークスペースルートに `assets/` フォルダーを作ります。

```markdown
![Diagram showing the deployment flow](/assets/deployment.png)
```

Markdown と同じ場所の `assets/` を先に探すため、デッキ固有の画像でワークスペース共通の画像を
差し替えられます。画像には必ず意味のある代替テキストを付けてください。

[次へ: テーマとレイアウト →](themes-and-layouts.md)
