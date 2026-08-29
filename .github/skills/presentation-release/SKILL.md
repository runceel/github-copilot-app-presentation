---
name: presentation-release
description: 'presentation canvas Extension と WinUI Presentation Desktop の GitHub Release を安全に作るスキル。ユーザーが「リリースして」「Win app のリリースを作って」「presentation のバージョンを公開して」「タグと ZIP を作って」のように、このリポジトリのリリース、タグ、配布 ZIP、SHA-256、PR のマージを依頼したときは、スキル名を指定していなくても必ず使う。明示的なリリース依頼がない通常の開発・プレゼン実行では使わない。'
---

# presentation-release Skill

presentation canvas Extension と WinUI Presentation Desktop を同じ GitHub Release へ公開します。タグの再利用、未検証コミット、欠けた配布物を防ぎ、Extension と x64/ARM64 Desktop の ZIP と SHA-256 を揃えます。

## Prerequisites

- 対象リポジトリは `runceel/github-copilot-app-presentation`
- `gh auth status` が成功し、release 作成権限がある
- PowerShell 7、Git、Node.js、npm、.NET SDK 10.x が利用可能
- WinUI のローカル開発では WinApp CLI 0.6.0 以上を推奨
- リリース対象 PR とバージョン変更の種類が分かっている

## Workflow

### 1. 対象 PR と main を確認する

1. `gh pr view <number> --json state,isDraft,mergeable,mergeStateStatus,statusCheckRollup` で PR を確認する。
2. draft、競合、失敗中の check がある場合はマージしない。
3. ユーザーがマージも依頼している場合だけ、check 成功後に `gh pr merge <number> --squash --delete-branch` を実行する。
4. `git fetch origin --tags` の後、`main` を `origin/main` へ fast-forward する。公開対象は必ずマージ後の `main` にする。

### 2. バージョンを決める

- `gh release list --limit 20` と `git tag --sort=-v:refname` で最新タグを確認する。
- 後方互換の機能追加は minor、修正だけは patch、互換性を壊す変更は major を上げる。
- `git rev-parse <tag>` または `gh release view <tag>` が成功する既存タグを再利用しない。
- README の「最新リリース」と固定タグ URL を新しいバージョンへ更新し、タグ作成前に `main` へ入れる。

### 3. リリース前検証を実行する

```powershell
npm ci
npm test
dotnet test apps/Presentation.Desktop/tests/Presentation.Core.Tests/Presentation.Core.Tests.csproj -c Release
```

1 つでも失敗した場合は release を作らず、原因を修正する。WinUI UI の変更を含む場合は `winapp ui` の batch script と x64/ARM64 portable smoke test も実行する。

### 4. 全配布物を生成する

```powershell
pwsh scripts/PackageRelease.ps1 -Version vMAJOR.MINOR.PATCH
```

生成先は `artifacts/releases/<version>/` です。

- `presentation-<version>.zip`
- `presentation-<version>.zip.sha256`
- `Presentation-win-x64.zip`
- `Presentation-win-x64.zip.sha256`
- `Presentation-win-arm64.zip`
- `Presentation-win-arm64.zip.sha256`

スクリプトは Extension ZIP から開発用 `test/` を除外し、Desktop を self-contained で publish し、全 ZIP の SHA-256 を再検証します。

### 5. リリース本文を作る

次を含めます。

- 変更概要
- 互換性または利用要件
- 6 個の配布物
- `git rev-parse HEAD` で取得した確認済みコミット SHA
- Presentation Desktop では WebView2 Runtime と Edge / Chrome / Chromium が必要なこと

### 6. GitHub Release を作成する

```powershell
gh release create <version> artifacts/releases/<version>/* `
  --target main `
  --title "<version>" `
  --notes-file <release-notes-file>
```

release 作成後、`gh release view <version> --json tagName,isDraft,isPrerelease,assets,url` でタグ、公開状態、6 個の asset 名を確認します。

## Error Handling

| 状況 | 対応 |
| --- | --- |
| PR check が失敗または未完了 | マージ・release を停止し、check の完了または修正を待つ |
| タグまたは release が既に存在 | タグを動かさず、新しいバージョンを選ぶ |
| `PackageRelease.ps1` が失敗 | release を作らず、欠けた SDK、publish、ZIP、checksum の問題を修正する |
| Extension ZIP に `test/` が入る | 配布物を破棄し、package script の除外処理を修正する |
| asset が 6 個揃わない | release を公開完了と扱わず、不足 asset を調査する |
| release 作成後に誤りを発見 | 既存タグを付け替えず、修正版を新しい patch version で公開する |

## Output Format

完了時は、次だけを簡潔に報告します。

```text
Merged PR: <number>
Release: <version>
Commit: <sha>
Assets: 6
Next PR: <release documentation or automation PR, if created>
```

## Post-Run Reflection

手作業、命名の揺れ、検証漏れ、ツールの失敗があった場合は、`scripts/PackageRelease.ps1`、この Skill、または `.github/RELEASING.md` の改善点として残します。公開済みタグを変更する方法では改善しません。

## References

| Reference | Read when |
| --- | --- |
| [Release procedure](../../RELEASING.md) | 配布対象、ZIP の内容、CI、導入 URL を確認するとき |
| [Desktop packaging](../../../apps/Presentation.Desktop/README.md#ポータブル版) | WinUI Desktop の self-contained publish を確認するとき |
