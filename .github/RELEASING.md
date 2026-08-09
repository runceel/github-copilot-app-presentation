# リリース手順

このリポジトリは、Copilot App からフォルダー URL で導入できる Extension と、任意導入の
Skill を同じリポジトリで配布します。

## バージョンとタグ

1. 変更内容、互換性、同梱 OSS の更新を確認します。
2. `vMAJOR.MINOR.PATCH` 形式の新しいタグを作成します（例: `v1.0.0`）。
3. タグを移動させず、リリース本文に変更概要と対象ファイルを記載します。
4. `main` は最新版の導線として残し、再現可能な導入にはタグまたはコミット SHA の URL を案内します。

Extension の共有マニフェストは
`.github/extensions/presentation/copilot-extension.json` です。`name` は `presentation` を
維持し、マニフェスト形式の `version`（現在は `1`）は、依存する Copilot App の仕様に
従って更新します。アプリが読む形式を確認せず、独自のキーやパッケージ形式を追加しません。
機能のリリース番号は Git タグとリリースページで管理します。

## 配布物

リリースには、少なくとも次を用意します。

- Extension フォルダーを含む手動導入用 ZIP
- ZIP の SHA-256 チェックサム
- 変更概要、互換性、確認済みコミット SHA
- 同梱 OSS の更新がある場合は `THIRD-PARTY-NOTICES.md` の確認

ZIP は `.github/extensions/presentation/` を展開後にユーザー拡張ディレクトリへ配置できる
構成にします。Mermaid を含む完全版は、Gist の単一ファイルおおむね 1 MB 上限に抵触するため
Gist へ分割せず、リポジトリのフォルダー URL またはリリース ZIP で配布します。

## 安全な導入案内

リリース後の案内では、次の URL 形式を使います。

```text
https://github.com/runceel/github-copilot-app-presentation/tree/v1.0.0/.github/extensions/presentation
```

Extension は利用者の環境でローカルコードを実行します。利用者には、信頼できるタグまたは
コミットを指定し、導入前に差分を確認するよう案内します。タグを後から付け替えず、修正は
新しいタグで公開します。
