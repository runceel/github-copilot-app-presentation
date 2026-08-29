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
- `Presentation-win-x64.zip` と `Presentation-win-arm64.zip`
- 各 Presentation Desktop ZIP の `.sha256`
- 変更概要、互換性、確認済みコミット SHA
- 同梱 OSS の更新がある場合は `THIRD-PARTY-NOTICES.md` の確認

ZIP は `.github/extensions/presentation/` を展開後にユーザー拡張ディレクトリへ配置できる
構成にします。Mermaid を含む完全版は、Gist の単一ファイルおおむね 1 MB 上限に抵触するため
Gist へ分割せず、リポジトリのフォルダー URL またはリリース ZIP で配布します。

Presentation Desktop は次のコマンドで unpackaged・self-contained のポータブル ZIP を作成し、
同じ GitHub Release へ添付します。

```powershell
apps\Presentation.Desktop\scripts\Publish.ps1 -Architecture x64
apps\Presentation.Desktop\scripts\Publish.ps1 -Architecture arm64
```

生成された ZIP と `.sha256` を両方添付します。Windows App SDK と .NET runtime は同梱し、
WebView2 Runtime と Edge / Chrome / Chromium は利用環境の前提としてリリースノートに記載します。

### ZIP に含めないもの

Extension は **実行時の npm 依存をゼロ**に保ちます。利用者は展開したフォルダーをそのまま
配置するだけで動作しなければならないため、開発・CI 専用の資産は ZIP へ入れません。

- ルートの `package.json` / `package-lock.json`（Playwright は開発時の devDependency のみ）
- `node_modules/`
- `playwright.config.mjs`
- `test/`（テストハーネス、ビジュアル回帰、PDF 回帰、ベースライン画像）
- `.github/workflows/`
- `test-results/`、`playwright-report/` などのテスト出力

言い換えると、ZIP に入れるのは `.github/extensions/presentation/` 配下だけです。同ディレクトリ
の中に `package.json` や `node_modules/` を作らないでください。同ディレクトリ配下の
`test/` は開発用資産なので ZIP から省けますが、`scripts/` には Markdown の安全な保存処理で
使う実行時モジュールが含まれるため ZIP へ含めます。
一方 `.github/extensions/presentation/schema/` は**意図的に ZIP へ含めます**。利用者が
手元で Architecture DSL の JSON Schema を参照し、エディター補完・検証を効かせるための
資産だからです（拡張の実行時には読み込まれません）。

## CI

ルートの `package.json` に開発用のテストスクリプトをまとめてあります。

| コマンド | 内容 |
| --- | --- |
| `npm run test:vendor` | 分割された vendor 資産のハッシュ整合性を検証 |
| `npm run test:schema` | Architecture DSL の JSON Schema と `parseArchitecture` の判定一致を検証 |
| `npm run test:unit` | Extension 同梱の `node --test`（Node 標準のみ、npm 依存なし） |
| `npm run test:editing` | Architecture 図の編集ワークフロー（書き戻し・Undo/Redo・presenter/印刷での非表示） |
| `npm run test:visual` | Playwright によるビジュアル回帰（4 テーマ） |
| `npm run test:a11y` | axe-core による違反ゼロ検査と、canvas / presenter / PDF の出力等価性 |
| `npm run test:perf` | 最大サイズの図の描画バジェットと、要素数に対するスケーリング |
| `npm run test:pdf` | 印刷モードを PDF 化してページ数・16:9・SVG 構造を検証 |
| `npm test` | 上記すべて |

この 8 本は `.github/workflows/ci.yml` の 8 ステップと 1 対 1 で対応します。
片方だけを増やすとリリース前の確認漏れになるので、テストスクリプトを追加するときは
CI とこの表の両方を更新してください。

ビジュアル回帰のベースライン画像は環境差の影響を受けるため、CI とローカルの双方で
`mcr.microsoft.com/playwright:<version>-noble` コンテナー内で実行して揃えます。更新は
次のコマンドで行い、差分を確認してからコミットします。

```bash
npm run test:visual:update:linux
```

## 安全な導入案内

リリース後の案内では、次の URL 形式を使います。

```text
https://github.com/runceel/github-copilot-app-presentation/tree/v1.0.0/.github/extensions/presentation
```

Extension は利用者の環境でローカルコードを実行します。利用者には、信頼できるタグまたは
コミットを指定し、導入前に差分を確認するよう案内します。タグを後から付け替えず、修正は
新しいタグで公開します。
