# このリポジトリについて

このフォルダーは **GitHub Copilot の canvas を使ってプレゼンテーションを行う** ための環境です。

- 「`slides.md` に従ってプレゼンしてください」のように依頼されたら、**`presentation` スキル**を使ってください。
- スライドの内容は Markdown ファイル（例: `slides.md`）に記述します。`---` の行がスライドの区切りです。
- スライドは **presentation canvas 拡張機能**（`.github/extensions/presentation/`）がネイティブ canvas にレンダリングします。プレゼン開始時に全スライドを生成して `load_deck` アクションで一括登録します。
- 登録後の**ページ送り（次へ / 前へ / 一覧）は canvas 内のボタン（◀ ▶）・矢印キー（← →）・スライド一覧（☰）で完結**します。`ask_user` でページ送りループを回す必要はありません。チャットから特定ページへ飛びたいときだけ `goto_slide` を使います。

詳しい進め方は `.github/skills/presentation/SKILL.md` を参照してください。
