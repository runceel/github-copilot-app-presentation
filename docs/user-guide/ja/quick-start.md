# クイックスタート

> English version: [English](../quick-start.md)

この手順では、同梱の [`examples/quick-start.md`](../examples/quick-start.md) デッキを使用します。
自分のワークスペースへコピーするか、このリポジトリから直接使用してください。

## 1. Markdown デッキを作成する

最小構成のデッキには、フロントマター、タイトル、`---` のスライド区切りを記述します。

```markdown
---
title: My first deck
theme: dark
layout: title
---

# My first deck

Markdown, ready for the stage.

---

## Next slide

- Write standard Markdown
- Keep one main idea per slide
```

`.md` または `.markdown` 拡張子で保存します。

## 2. Canvas Extension で開く

次のいずれかの方法を使用します。

- GitHub Copilot に「`docs/user-guide/examples/quick-start.md` を使ってこのデッキをプレゼンテーションしてください」と依頼します。
- MarkdStage Canvas を開き、**📂 Load Markdown** を選択してファイルを選びます。

デッキ全体がすぐに開きます。**◀**、**▶**、矢印キー、または **☰** で移動します。

![Markdown デッキとプレゼンテーション操作を表示した Canvas Extension](../images/canvas-main.png)

## 3. MarkdStage Desktop で開く

1. [MarkdStage の最新リリース](https://github.com/runceel/markdstage/releases/latest)から、
   対応するポータブル ZIP をダウンロードします。
2. ZIP を展開します。
3. `MarkdStageApp.exe` を実行します。
4. **Open Markdown** を選択し、同じファイルを開きます。

メインウィンドウに現在のスライド、次のスライド、現在のスピーカーノートが表示されます。

![現在と次のスライドおよびスピーカーノートを表示した MarkdStage Desktop](../images/desktop-main.png)

## 4. プレゼンテーションを開始する

- **Canvas Extension:** **⛶** で外部オーディエンスウィンドウを開くか、**Presenter view** で
  現在のスライド、次のスライド、ノートをまとめて表示します。
- **Desktop:** **Start presentation** を選択して、同期されたオーディエンスウィンドウを開きます。
- オーディエンスウィンドウで `F11` を押すと全画面表示になり、`Esc` で解除できます。

## 5. PDF をエクスポートする

PDF エクスポートは Canvas Extension で使用できます。

1. **16:9** を選択し、クリッピング警告を修正します。
2. プリンターアイコンを選択します。
3. ワークスペースに生成された 16:9 PDF を使用します。

MarkdStage Desktop は PDF エクスポートに対応していません。

## 次のステップ

- [GitHub Copilot ハンズオンを実施する](copilot-hands-on.md)
- [GitHub Copilot とスライドを作成する](ai-assisted-authoring.md)
- [Canvas Extension を使う](canvas-extension.md)
- [MarkdStage Desktop を使う](desktop.md)
- [Markdown スライドを記述する](markdown-authoring.md)
