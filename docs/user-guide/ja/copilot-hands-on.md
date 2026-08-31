# ハンズオン: GitHub Copilot でデッキを作成する

> English version: [English](../copilot-hands-on.md)

この演習では、記録済みの GitHub Copilot セッションをたどりながら、最初の依頼から、検証済みの
Markdown デッキ、必要なスライドの画像、PDF 出力までを一気に体験します。
[GitHub Copilot とスライドを作成する](ai-assisted-authoring.md)を読んだ後に取り組むと、
作成、表示、確認の流れを実際に試せます。

## 作るもの

この例では、社内向けデプロイサービスについての6枚のアーキテクチャレビュー資料を作ります。

- Microsoft テーマ
- 簡潔なスピーカーノート
- Architecture DSL によるシステム構成図
- Architecture の検証エラーなし
- 固定 16:9 でのクリッピングなし
- 指定したスライドの PNG 画像
- 16:9 PDF

実際の出力はこのリポジトリに含めてあります。

- [生成された Markdown デッキ](../examples/copilot-hands-on-result.md)
- [書き出した PDF](../examples/copilot-hands-on-result.pdf)

同じ依頼でも、結果が毎回同じとは限りません。バイト単位で同じものができる前提ではなく、
Markdown と表示されたスライドを見て確かめてください。

## 前提条件

- MarkdStage Canvas Extension を入れたワークスペースを開いておきます。
- GitHub Copilot がワークスペースにファイルを作成できることを確かめます。
- 表示結果をその場で確認できるよう、MarkdStage Canvas を開いたままにします。

## 1. 要件をまとめて依頼する

記録した実行では、独立した GitHub Copilot セッションで次の英語プロンプトを使いました。

```text
Create a six-slide architecture review deck at `docs/user-guide/examples/copilot-hands-on-result.md` for engineering leaders who are evaluating a small internal deployment service.

Use the Microsoft theme and add concise speaker notes to content slides. Include these topics: title, problem and objective, requirements, target architecture, rollout plan, and risks with next steps. Use MarkdStage Architecture DSL for the target architecture. The target flow is: Developer -> GitHub Actions -> Deployment API -> Azure Container Apps, with Deployment API also reading secrets from Azure Key Vault and writing release status to Azure SQL.

Open the complete deck in MarkdStage. Validate the Architecture DSL, inspect the fixed 16:9 layout, and correct every validation or clipping issue. Capture the title slide and architecture slide, plus any slide that still needs visual review, under `docs/user-guide/images/copilot-hands-on/`. Export the final deck to `docs/user-guide/examples/copilot-hands-on-result.pdf`.

Keep Markdown as the source of truth. Do not change existing product or manual files outside the requested example output and capture directory.
```

日本語で依頼する場合は、次のように同じ内容を伝えられます。

```text
小規模な社内デプロイサービスを評価するエンジニアリングリーダー向けに、6枚のアーキテクチャレビュー資料を `docs/user-guide/examples/copilot-hands-on-result.md` として作成してください。

Microsoft テーマを使用し、本文スライドには簡潔なスピーカーノートを追加してください。タイトル、課題と目的、要件、目標アーキテクチャ、展開計画、リスクと次のステップを含めてください。目標アーキテクチャには MarkdStage Architecture DSL を使用してください。処理の流れは Developer -> GitHub Actions -> Deployment API -> Azure Container Apps です。Deployment API は Azure Key Vault からシークレットを読み取り、Azure SQL にリリース状態を書き込みます。

デッキ全体を MarkdStage で開いてください。Architecture DSL を検証し、固定 16:9 レイアウトを検査して、検証エラーまたはクリッピングをすべて修正してください。タイトルスライドとアーキテクチャスライド、および視覚的な確認が引き続き必要なスライドを `docs/user-guide/images/copilot-hands-on/` に画像として保存してください。最終デッキを `docs/user-guide/examples/copilot-hands-on-result.pdf` にエクスポートしてください。

Markdown を正本として維持してください。指定したサンプル出力と画像ディレクトリ以外の既存の製品ファイルやマニュアルファイルは変更しないでください。
```

この依頼には、聞き手、スライド枚数、テーマ、必要な内容、図に描く事実、出力先、完了条件が
そろっています。そのため、MarkdStage のアクションを1つずつ指示しなくても、
Copilot がデッキの作成と確認を進められます。

## 2. Canvas でデッキを確認する

Copilot は Markdown ファイルをひととおり作り、MarkdStage でデッキを開きます。
修正を頼む前に、次の点を見ておきます。

1. スライド一覧で、依頼したトピックが正しい順に並んでいるか確かめます。
2. Architecture スライドに、プロンプトで挙げたシステムと接続がすべて入っているか確かめます。
3. Presenter view を開き、スピーカーノートがスライドの内容をうまく補っているか確かめます。
4. 表現、事実、構成を直接見たいときは、Markdown ファイルも開いたままにします。

正本はあくまで Markdown ファイルです。Canvas は表示結果を確かめるための画面であり、
プレゼンテーションの別ファイルではありません。

## 3. Copilot に出力を検証させる

このプロンプトでは、Copilot に3種類の確認を頼んでいます。

| 確認 | 期待する結果 |
| --- | --- |
| Architecture の検証 | スキーマ、参照、配置のエラーが残っていない |
| 固定 16:9 の検査 | PDF と同じ 1280x720 の領域をはみ出すページがない |
| 範囲を絞った目視確認 | 指定したページと未解決のページにだけ PNG ができている |

画像を見る前に、まず構造化された検証を済ませます。16:9 に収まっていても手直しが要る場合が
あるので、書き出した画像で情報の優先順位、バランス、ラベル、読みやすさを確かめてください。

## 4. 記録した結果と見比べる

この例は2026年8月31日に、独立したワークツリーセッションで `gpt-5.6-luna` と
medium reasoning を使って実行しました。

| 結果 | 記録値 |
| --- | --- |
| 作成したスライド | 6枚 |
| 表示されたページ | 自動で付く裏表紙を含めて7ページ |
| 最終的な Architecture の検証 | エラー0件 |
| 最終的な固定 16:9 の検査 | 見切れたページ0件、全7ページが範囲内 |
| 画像にしたページ | 1ページ目（タイトル）と4ページ目（目標アーキテクチャ） |
| 書き出した PDF | `../examples/copilot-hands-on-result.pdf`、148,526バイト |

最初の Architecture 検証では、コネクター要素に使えない `id` プロパティが見つかりました。
Copilot はそのプロパティを削除し、デッキ全体を読み込み直して、Architecture の検証と
固定 16:9 の検査をやり直してから PDF を書き出しています。

その後、指定したスライドの画像を見ると、固定レイアウトの検査には通っていても、
コネクターのラベルが目立ちすぎていることが分かりました。Copilot は左から右へ流れる
デプロイ経路の冗長なラベル表示を消し、コネクターごとの関係の説明は `ariaLabel` に残しました。
残りのラベルは `secrets` と `status` に短くして `fontSize` を14にし、主要ノードの間隔も広げています。
仕上げた図をもう一度検証、画像化して PDF に出力しました。作成者が Architecture JSON を
直接編集する必要はありませんでした。

![ハンズオンのプロンプトから作成されたタイトルスライド](../images/copilot-hands-on/slide-001.png)

![検証後の目標アーキテクチャスライド](../images/copilot-hands-on/slide-004.png)

上の画像は、指定したページを 1280x720 で書き出したものです。最終的な Markdown には
作成した6枚がすべて入っており、そのまま読んだり再利用したりできます。

## 5. 範囲を絞って直してもらう

結果を確認したら、変える範囲を絞り、そのままにしてほしい内容もはっきり伝えます。

### 1枚のスライドを整理する

```text
2枚目の課題説明を、エンジニアリングリーダー向けに簡潔にしてください。
目的とすべての事実は変更せず、修正後はそのスライドだけを固定 16:9 で再検査してください。
```

### 図を改善する

```text
目標アーキテクチャスライドのコネクターラベルが目立ちすぎます。
ノードの順序だけでデプロイ経路を理解できるため、左から右へ進む3本のコネクターから
表示ラベルを削除し、関係の説明は ariaLabel に残してください。
縦方向のラベルは "secrets" と "status" に短縮し、fontSize を14にしてください。
主要ノードを均等に配置し、Architecture DSL を検証して、そのスライドだけを画像化してください。
```

### 最終 PDF を準備する

```text
デッキ全体について、用語の一貫性とスピーカーノートの品質を確認してください。
スライドは追加しないでください。Architecture と固定 16:9 出力を再検査し、既存の PDF を置き換えてください。
```

範囲を絞って依頼すれば、意図しない書き換えを防ぎつつ、デッキ全体を最後に見直す前に
変更したページだけを検証し直せます。

## 関連ガイド

- [GitHub Copilot とスライドを作成する](ai-assisted-authoring.md)
- [Markdown の記述](markdown-authoring.md)
- [図とメディア](diagrams-and-media.md)
- [プレゼンテーションとエクスポート](presenting-and-export.md)
