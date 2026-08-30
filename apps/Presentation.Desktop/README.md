# Presentation Desktop

Markdown を presentation canvas と同じ renderer で表示し、GitHub Copilot App とは独立して発表する WinUI 3 アプリです。

## 機能

- `.md` / `.markdown` を Windows のファイル選択ダイアログから開く
- 現在のスライドと次のスライドを 16:9 でプレビュー
- Slidev / Marp 形式の HTML コメントを現在ページのスピーカーノートとして表示
- ツールバーまたは O キーでスライド一覧を開き、任意のページへ移動
- 矢印、PageUp/PageDown、Space、Home、End で移動
- 発表画面と発表者ビューの現在スライドは、余白の左クリック / タップで次へ、
  右クリックで前へ移動
- Markdown 保存時に自動再読込し、現在ページを維持
- 読込失敗時は最後の正常なデッキを維持
- 発表画面はネイティブ WinUI 3 Window（WebView2 全面表示）として、アプリと同じプロセス内で起動
- dark / light / microsoft / custom theme、Mermaid、コード強調、Architecture DSL、ローカル画像に対応

発表画面は 1280x720、通常のタイトルバー付きウィンドウとして Windows の既定配置で起動します。
F11 で全画面に切り替え、Esc で全画面から通常表示に戻ります（通常表示時の Esc はスライド側の
既存の挙動を妨げません）。メイン画面の開始 / 終了ボタン、発表ウィンドウ自身を閉じる操作、
アプリ終了時の一括終了のいずれからも状態が同期します。

Surface Pen は、ユーザーがメイン画面から発表画面を開いている間だけ有効です。末尾ボタンの
1 回押しで次へ、長押しで前へ移動します。ペンの取り外し、接続、ドッキングではアプリや
発表画面を自動起動せず、ペン操作で発表画面を開閉することもありません。

余白クリックはスライド本文、リンク、画像などの操作領域を除外します。発表者ビューの
次スライド preview は表示専用です。

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

利用環境には Microsoft Edge WebView2 Runtime が必要です。発表画面はアプリ内蔵のネイティブ
Window で表示するため、別途 Edge / Chrome / Chromium を用意する必要はありません。

## Markdown と assets

- 空行の後に置いた `---` でスライドを区切ります。
- Markdown と同じフォルダーの `assets\` を優先し、次に最寄りの Git ルートの `assets\` を参照します。
- Git 管理外の Markdown は、そのファイルのフォルダーをルートとして扱います。
- `theme-file` は Markdown のフォルダー、Git ルートの順で探索します。
- スピーカーノートは各スライドのトップレベル HTML コメントへ記述します。コードフェンス内のコメントと `slide-size` ディレクティブはノートに含めません。
- workspace 外へ出るパス、junction/symlink 越しの脱出、過大ファイルは拒否します。

Markdown の編集、PDF export、Architecture editor、タイマーは初版の対象外です。
