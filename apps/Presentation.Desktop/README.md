# Presentation Desktop

Markdown を presentation canvas と同じ renderer で表示し、GitHub Copilot App とは独立して発表する WinUI 3 アプリです。

## 機能

- `.md` / `.markdown` を Windows のファイル選択ダイアログから開く
- 現在のスライドと次のスライドを 16:9 でプレビュー
- 矢印、PageUp/PageDown、Space、Home、End で移動
- Markdown 保存時に自動再読込し、現在ページを維持
- 読込失敗時は最後の正常なデッキを維持
- Edge / Chrome の app mode ウィンドウを発表画面として起動
- dark / light / microsoft / custom theme、Mermaid、コード強調、Architecture DSL、ローカル画像に対応

発表画面は 1280x720 を基準に起動します。全画面化はブラウザーまたは Windows の標準操作で行います。

## 開発環境

1. Copilot CLI plugin を導入します。

   ```powershell
   copilot plugin marketplace add microsoft/win-dev-skills
   copilot plugin install winui@win-dev-skills
   ```

2. .NET SDK 10.x、WinApp CLI 0.6.0 以上、Developer Mode を用意します。
3. `scripts\BuildAndRun.ps1 --arch arm64` または `scripts\BuildAndRun.ps1 --arch x64` で起動します。

`BuildAndRun.ps1` は winui plugin 同梱の analyzer と `winapp run --debug-output` を使用します。CI は plugin に依存せず `dotnet build` と `dotnet test` を実行します。

## テスト

```powershell
dotnet test tests\Presentation.Core.Tests\Presentation.Core.Tests.csproj
npm run test:unit
```

アプリを起動した状態で UI Automation テストを実行します。

```powershell
tests\Presentation.UiTests\ui-tests.ps1 -AppPid <PID>
```

## ポータブル版

Windows App SDK と .NET runtime を含む unpackaged フォルダーを作成し、ZIP にまとめます。

```powershell
scripts\Publish.ps1 -Architecture x64
scripts\Publish.ps1 -Architecture arm64
```

成果物は `artifacts\Presentation-win-<architecture>.zip` です。単一 EXE ではなく、renderer、native DLL、ライセンス通知を含むフォルダー配布です。

利用環境には Microsoft Edge WebView2 Runtime と、発表画面用の Edge / Chrome / Chromium が必要です。

## Markdown と assets

- 空行の後に置いた `---` でスライドを区切ります。
- Markdown と同じフォルダーの `assets\` を優先し、次に最寄りの Git ルートの `assets\` を参照します。
- Git 管理外の Markdown は、そのファイルのフォルダーをルートとして扱います。
- `theme-file` は Markdown のフォルダー、Git ルートの順で探索します。
- workspace 外へ出るパス、junction/symlink 越しの脱出、過大ファイルは拒否します。

Markdown の編集、PDF export、Architecture editor、発表者ノート、タイマー、Surface Pen 専用操作は初版の対象外です。
