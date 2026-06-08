# このリポジトリについて

このフォルダーは **GitHub Copilot の canvas を使ってプレゼンテーションを行う** ための環境です。

- 「`slides.md` に従ってプレゼンしてください」のように依頼されたら、**`presentation` スキル**を使ってください。
- スライドの内容は Markdown ファイル（例: `slides.md`）に記述します。`---` の行がスライドの区切りです。
- スライドは **presentation canvas 拡張機能**（`.github/extensions/presentation/`）がネイティブ canvas にレンダリングします。エージェントは `show_slide` アクションに 1 枚分の Markdown 断片を渡します。
- ページ送り（次へ / 前へ / 一覧 / 終了）は `ask_user` ツールで操作します。

詳しい進め方は `.github/skills/presentation/SKILL.md` を参照してください。
