# Copilot Canvas Presentation

GitHub Copilot の canvas を使って、Markdown からライブにスライドプレゼンを行うための環境です。
スライドは 1 枚ずつ生成され、presentation canvas 拡張機能（Node + marked/mermaid）がネイティブ canvas に表示します。
**Mermaid 記法の図**や、リモート / ローカル（`assets/`）の**画像挿入**にも対応しています。

## セットアップ

必要なものは GitHub Copilot アプリだけです（このリポジトリを開いて使います）。

プレゼンは **presentation canvas 拡張機能**（`.github/extensions/presentation/`）が表示するため、追加のインストールやサーバー起動は不要です。

> 旧構成の .NET 10 / Blazor アプリ（`PresentationApp/`）も引き続きリポジトリに残しています。そちらを使う場合は [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) が必要です。

## 使い方

1. このリポジトリを GitHub Copilot アプリで開きます。
2. スライドの内容を Markdown ファイル（例: [`slides.md`](./slides.md)）に書きます。`---` の行がスライドの区切りです。
3. Copilot にこう伝えます:

   > slides.md に従ってプレゼンしてください。

4. canvas にスライドが表示されます。あとは `次へ` / `前へ` / `スライド一覧` などの選択肢を選ぶだけでページを送れます。

仕組みやスキルの詳細は [`.github/skills/presentation/SKILL.md`](./.github/skills/presentation/SKILL.md) を、canvas 拡張機能の詳細は [`.github/extensions/presentation/README.md`](./.github/extensions/presentation/README.md) を参照してください。

## ライセンス

[MIT License](./LICENSE)
