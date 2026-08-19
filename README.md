# Copilot Canvas Presentation

GitHub Copilot App の canvas で、Markdown をスライドとして表示する
**presentation canvas Extension** です。Markdown の変換、テーマ、Mermaid、画像、
ページ送りを canvas 側で処理します。

## インストール

このリポジトリをプロジェクトとして開くと、`.github/extensions/presentation/` の
Extension がプロジェクトスコープで読み込まれます。別のリポジトリでも使う場合は、
GitHub Copilot App に次のように依頼してください。

> 次の GitHub リポジトリフォルダーから presentation をユーザースコープへインストールしてください。
>
> `https://github.com/runceel/github-copilot-app-presentation/tree/main/.github/extensions/presentation`

`main` の URL は最新版を指します。再現可能な導入には、固定タグ `v1.2.0` の URL を
使ってください。

```text
https://github.com/runceel/github-copilot-app-presentation/tree/v1.2.0/.github/extensions/presentation
```

## 最新リリース

現在の presentation canvas の最新版は **v1.2.0** です。

- [v1.2.0 リリース](https://github.com/runceel/github-copilot-app-presentation/releases/tag/v1.2.0)
- [固定タグから Extension を導入](https://github.com/runceel/github-copilot-app-presentation/tree/v1.2.0/.github/extensions/presentation)

リリースには、手動導入用 ZIP と SHA-256 チェックサムを添付しています。更新時は既存のタグを
移動せず、新しいバージョンタグを使用します。

Extension はローカルでコードを実行します。導入前に内容を確認し、信頼できるタグまたは
コミットを指定してください。公開済みのタグは移動させず、更新時は新しいバージョンを
使います。リリースページには手動導入用 ZIP と SHA-256 チェックサムを添付します。
ZIP を展開すると、`.github/extensions/presentation/` の内容をユーザー拡張ディレクトリへ
配置できます。

Gist は小さな Extension の共有には便利ですが、単一ファイルがおおむね 1 MB に制限されます。
同梱の `mermaid.min.js` はこの制限を超えるため、Mermaid を含む完全版は公開リポジトリの
フォルダー URL またはリリース ZIP から導入してください。Mermaid を含まない軽量版を
別配布する場合は、Mermaid 対応を省いた構成として明示します。

## 何が含まれるか

| ファイル | 責務 |
| --- | --- |
| `.github/extensions/presentation/` | Copilot canvas Extension。本体、renderer、同梱 OSS を提供します。 |
| `.github/skills/presentation/SKILL.md` | Markdown を全スライドの断片へ変換し、Extension を起動する任意導入の Skill です。 |
| `slides.md` などのルート Markdown | すぐ試せるサンプルおよびプレゼン原稿です。利用者の資料に置き換えられます。 |

Skill は便利な起動手順であり、Extension 本体の代替ではありません。Skill を導入しない
場合も、`presentation` canvas を直接開いて `slides` を渡せます。Extension と Skill の
変更は独立してリリースできるため、互換性を壊す変更はリリースノートに記載します。

## 最小操作例

1. `slides.md` を編集します。`---` の行でスライドを区切ります。
2. Copilot に次のように依頼します。

   > `slides.md` に従ってプレゼンしてください。

3. canvas 内の **◀ ▶ ボタン**、**矢印キー**、**☰ スライド一覧**で操作します。

テーマを指定する場合は、たとえば次のように依頼できます。

> `slides.md` を Microsoft っぽいテーマでプレゼンしてください。

ルートの `slides.md` が presentation canvas を試すためのサンプルです。ローカル画像は
`assets/` に置き、Markdown から `/assets/...` で参照します。Mermaid は
` ```mermaid ` のコードフェンスで記述できます。登壇用のプレゼン資料は
[presentation-materials](https://github.com/runceel/presentation-materials) に分離しています。

## ドキュメント

- [presentation Skill](./.github/skills/presentation/SKILL.md)
- [Extension の仕様とアクション](./.github/extensions/presentation/README.md)
- [同梱 OSS の第三者通知](./.github/extensions/presentation/THIRD-PARTY-NOTICES.md)
- [リリース手順](./.github/RELEASING.md)
- [MIT License](./LICENSE)

## ライセンス

このリポジトリのオリジナル部分は MIT License で公開しています。同梱 OSS のライセンスと
著作権表示は [THIRD-PARTY-NOTICES.md](./.github/extensions/presentation/THIRD-PARTY-NOTICES.md)
を参照してください。
