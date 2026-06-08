# Copilot Canvas Presentation

GitHub Copilot の canvas を使って、Markdown からライブにスライドプレゼンを行うための環境です。
スライドは 1 枚ずつ生成され、.NET 10 / Blazor アプリがブラウザー canvas に表示します。

## セットアップ

必要なものは 2 つだけです。

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- GitHub Copilot アプリ（このリポジトリを開いて使います）

> アプリの起動やパッケージの復元は、プレゼン開始時に Copilot が自動で行います。手動の準備は不要です。

## 使い方

1. このリポジトリを GitHub Copilot アプリで開きます。
2. スライドの内容を Markdown ファイル（例: [`slides.md`](./slides.md)）に書きます。`---` の行がスライドの区切りです。
3. Copilot にこう伝えます:

   > slides.md に従ってプレゼンしてください。

4. ブラウザー canvas にスライドが表示されます。あとは `次へ` / `前へ` / `スライド一覧` などの選択肢を選ぶだけでページを送れます。

仕組みやスキルの詳細は [`.github/skills/presentation/SKILL.md`](./.github/skills/presentation/SKILL.md) を参照してください。

## ライセンス

[MIT License](./LICENSE)
