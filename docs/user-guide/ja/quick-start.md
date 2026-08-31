# クイックスタート

> English version: [English](../quick-start.md)

この手順では、同梱の [`examples/quick-start.md`](../examples/quick-start.md) デッキを使います。
自分のワークスペースにコピーしても、このリポジトリのまま使っても構いません。

## 1. Markdown デッキを作成する

最小構成のデッキは、フロントマター、タイトル、`---` のスライド区切りだけでできています。

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

どちらの方法でも開けます。

- GitHub Copilot に「`docs/user-guide/examples/quick-start.md` を使ってこのデッキをプレゼンテーションしてください」と依頼します。
- MarkdStage Canvas を開き、**📂 Load Markdown** からファイルを選びます。

デッキ全体がすぐに開きます。**◀**、**▶**、矢印キー、**☰** でスライドを送れます。

![Markdown デッキとプレゼンテーション操作を表示した Canvas Extension](../images/canvas-main.png)

## 3. MarkdStage Desktop で開く

1. [MarkdStage の最新リリース](https://github.com/runceel/markdstage/releases/latest)から、
   環境に合ったポータブル ZIP をダウンロードします。
2. ZIP を展開します。
3. `MarkdStageApp.exe` を実行します。
4. **Open Markdown** から同じファイルを開きます。

メインウィンドウに、現在のスライド、次のスライド、そのスライドのスピーカーノートが並びます。

![現在と次のスライドおよびスピーカーノートを表示した MarkdStage Desktop](../images/desktop-main.png)

## 4. プレゼンテーションを開始する

- **Canvas Extension:** **⛶** で外部の投影用ウィンドウを開くか、**Presenter view** で
  現在のスライド、次のスライド、ノートをまとめて表示します。
- **Desktop:** **Start presentation** を選ぶと、操作が同期する投影用ウィンドウが開きます。
- 投影用ウィンドウで `F11` を押すと全画面表示になり、`Esc` で元に戻ります。

## 5. PDF をエクスポートする

PDF エクスポートは Canvas Extension だけの機能です。

1. **16:9** を選び、クリッピング警告があれば直します。
2. プリンターアイコンを選びます。
3. ワークスペースに出力された 16:9 PDF を確認します。

MarkdStage Desktop に PDF エクスポートはありません。

## 次のステップ

- [GitHub Copilot ハンズオンを試す](copilot-hands-on.md)
- [GitHub Copilot とスライドを作成する](ai-assisted-authoring.md)
- [Canvas Extension を使う](canvas-extension.md)
- [MarkdStage Desktop を使う](desktop.md)
- [Markdown スライドを記述する](markdown-authoring.md)
