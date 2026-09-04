---
target: 新Architecture Designerの代表シナリオ別UX評価
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-04T00-33-38Z
slug: tensions-markdstage-architecture-editor-index-html
---
Method: dual-agent (A: ux-design-assessor · B: ux-evidence-assessor)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|------:|-----------|
| 1 | Visibility of System Status | 3 | Dirty、保存、競合は明確。操作ガイドは遠いフッターに偏る |
| 2 | Match System / Real World | 3 | 図形編集の語彙は自然だが Lane / Z / Release layout は説明不足 |
| 3 | User Control and Freedom | 3 | Undo/Redo、Escape、競合保護は強い。中幅ドロワーは閉じるまでキャンバスを遮断 |
| 4 | Consistency and Standards | 3 | 操作語彙は統一。固定パネルが中幅でモーダルドロワーへ変化する |
| 5 | Error Prevention | 3 | リビジョン・外部変更検出・保存拒否が堅牢 |
| 6 | Recognition Rather Than Recall | 2 | 主操作は見えるが高度な操作と意味説明は隠れている |
| 7 | Flexibility and Efficiency | 3 | ショートカット、直接操作、ツリー、コンテキストメニューあり。複数選択なし |
| 8 | Aesthetic and Minimalist Design | 2 | 16ボタン＋Gridがキャンバスと競合 |
| 9 | Error Recovery | 3 | エラーが具体的で作業を保持。Save とフッター通知が離れている |
| 10 | Help and Documentation | 1 | 高度なプロパティ、空状態、初回操作の文脈ヘルプがない |
| **Total** | | **26/40** | **Acceptable — 大きな改善余地あり** |

## Design Specificity Verdict

**機能はMarkdStage固有、見た目は汎用ダイアグラムエディターです。** Markdownのパス表示、Architecture DSLの語彙、ソースを上書きしない保存設計は明確に製品固有です。一方、青い選択色とチャコールのボタン群はカテゴリ横断で流用でき、Midnight Ink / Spotlight Amber の製品性は弱いです。

静的CLI検出は0件でした。ブラウザ注入検出は5件で、`flat-type-hierarchy` 1件と `gpt-thin-border-wide-shadow` 4件です。後者の3件は非表示の一時UIで、常時表示の実害ではありません。ヘッドレス実行のため、利用者が見られる永続オーバーレイは残していません。

## Representative Scenario Evaluation

| シナリオ | 評価 | 動作・見た目 |
|---|---|---|
| スライドからデザイナーへ | 良好 | source-backed時の直接遷移は自然。ソース名と図番号で編集対象も確認できる |
| ワイド画面初期表示 | 要改善 | 1440×900でも左右パネルが530px、ヘッダーが85pxを占有し、図の表示は約785×458まで縮む |
| 選択・ドラッグ・リサイズ | 良好 | 選択、4ハンドル、ライブ変形、スナップ、確定後フィードバックが明快。Properties自動表示廃止後は連続操作できる |
| Properties編集 | 問題あり | 900px以下では340pxドロワー＋全面スクリーンになり、開いている間はキャンバス選択不能。最初の項目まで約23 Tab |
| Elementsツリー | 条件付き良好 | 構造把握には有効。中幅以下ではキャンバスと同時利用できず、往復が増える |
| Shapeパレット | 良好 | 7図形が視覚サンプル付きで、520pxでもクリップしない。キーボード操作も良好 |
| Connector作成・線種 | 良好 | 2段階選択とSolid/Dotted/Dashed/Customは理解しやすい。次操作の案内がフッターで視線移動を伴う |
| 余白パン・Zoom/Fit | 良好 | 上下左右パンとFitは動作する。余白がドラッグ可能である視覚的な手掛かりは弱い |
| 520px狭幅 | 不適 | ヘッダー157px、操作が3段に折返し、ボタン高25〜30px。キャンバスが主役にならない |
| 保存・外部競合 | 非常に良好 | Dirty、保存成功、外部変更拒否、Reload確認が具体的で、Markdownを守る安心感が強い |
| 空のArchitectureブロック | 不適 | 空のツリーと大きな余白だけで、最初に何をすべきか提示されない |

## Cognitive Load

**高負荷（8項目中5項目失敗）。** 単一焦点、チャンク化、視覚階層、選択肢最小化、段階的開示が弱いです。常時16ボタン＋Grid、コネクター選択時は約19フィールドが露出します。狭幅では区切り線を消すだけなので、意味のグルーピングも弱まります。

## Emotional Journey

初見は「高機能だが密集している」。ドラッグ、リサイズ、コネクター作成は即応性が高く最も気持ちよい瞬間です。中幅のドロワー往復で流れが途切れます。保存と競合拒否は最後に強い安心感を作ります。最も深い谷は空図で、開始方法が分かりません。

## What's Working

1. **Markdown保護の信頼性** — 保存、未保存、外部変更競合が具体的で、失敗時も作業を失わない。
2. **直接操作の明快さ** — 選択、ハンドル、ライブ変形、スナップ、Undo/Redoが一貫している。
3. **キーボード基盤** — パレット、コンテキストメニュー、Escape、フォーカス復帰が成熟している。

## Priority Issues

### P1 — 中幅ドロワーが編集を中断する
**Why it matters:** Propertiesを参照しながら別ノードを選べず、閉じる→選ぶ→開くを反復する。フォーカスもドロワーへ移らず、最初の項目まで約23 Tabかかる。

**Fix:** 700〜1100pxではスクリーンを使わない非モーダルのpeek/dockにする。ドロワー内にCloseを置き、開いたら選択中要素の最初の主要フィールドへフォーカスする。キャンバス上のノード選択は許可する。

**Suggested command:** `/impeccable adapt`

### P1 — 狭幅で全コマンドを保持し、キャンバスが消耗する
**Why it matters:** 520pxでヘッダー157px、ボタン高25〜30px。タッチ・運動支援に不足し、図形編集領域を圧迫する。

**Fix:** 狭幅ではUndo/Redo、Add、Properties、Saveだけを一次表示し、順序・複製・削除・Zoom等をMoreメニューへ移す。最小44px相当のターゲットを確保する。

**Suggested command:** `/impeccable adapt`

### P2 — ワイド画面でもキャンバスの優先度が低い
**Why it matters:** 固定左右パネル530pxと折返しヘッダー85pxにより、1440pxでも図が小さい。編集対象よりツールが強く見える。

**Fix:** Propertiesは選択時のみ右ドック、Elementsは折りたたみ可能にする。ツールバーを「追加」「編集」「配置」「表示」「保存」にまとめ、キャンバス面積を初期状態で最大化する。

**Suggested command:** `/impeccable layout`

### P2 — 空状態に開始導線がない
**Why it matters:** 初回利用者は空白が編集領域なのか、読み込み失敗なのか判断できない。

**Fix:** 中央に「Add first shape」、短い説明、Shapeショートカットを表示する。追加後は消える軽量な空状態にする。

**Suggested command:** `/impeccable onboard`

### P2 — 新規図形が既存要素と重なる
**Why it matters:** Toolbarから追加した図形が共通既定位置へ入り、既存ノードを隠す。追加直後に修復作業が必要になる。

**Fix:** ビューポート中心または最後の空き領域へ配置し、衝突時は段階的にずらす。追加前プレビューまたはゴースト配置も有効。

**Suggested command:** `/impeccable harden`

## Persona Red Flags

**Alex（熟練ユーザー）:** 中幅でPropertiesを開いたままノードを連続選択できない。複数選択・整列・一括変更がなく、大きな図で反復回数が増える。

**Jordan（初回ユーザー）:** 空図に開始導線がない。Lane、Z、Release layoutの意味が説明されず、Connectorの次操作は遠いフッターに出る。

**Sam（キーボード・運動支援ユーザー）:** ドロワーを開いてもフォーカスがトグルに残り、プロパティ到達が長い。狭幅の25〜30pxボタンは小さい。パレットとコンテキストメニューのキーボード動作は良好。

## Minor Observations

- 16%スクリーンはモーダル性の表現として弱い一方、クリックは完全遮断するため、見た目と挙動が一致しない。
- 520pxでソースパスが強く切り詰められ、全体を確認する手段がない。
- 7pxの青い選択グローは明確だが、製品の抑制的な視覚言語より強い。
- Spotlight AmberがUnsaved中心で、主要アクションや編集焦点には活用されていない。
- Inspectorは1090pxまで伸びる。セクション単位の折りたたみがない。

## Questions to Consider

- Propertiesは「モーダルな作業」ではなく、ノードを連続選択できる常設peekであるべきではないか。
- 16個すべてのコマンドが常時ツールバーに必要か。
- 520pxを本格編集対象にするのか、閲覧＋軽微編集に限定するのか。
- 空図を開いた瞬間、唯一目立つ操作を「Add first shape」にできないか。
- MarkdStage固有性を、ユーザーの図を邪魔せずどこに表現するか。
