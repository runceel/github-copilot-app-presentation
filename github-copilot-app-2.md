---
title: GitHub Copilot App
kicker: DEVELOPERS' WORKFLOW
---

# GitHub Copilot App

**Issue から Pull Request まで**

![](/assets/github-copilot-app/app-overview.png)

---

## 完了条件が明確な Issue

- 例：**再現手順がある UI の不具合**を修正し、テストを追加する
- 任せやすい：範囲の明確な修正、テスト追加、定型的なリファクタリング
- 人が主導する：曖昧な要件、重要な設計判断、セキュリティ上の判断

> Agent に実行を任せ、方針と完了条件は人が決める。

![](/assets/github-copilot-app/issue-to-pr.svg)

---

## Issue 文脈付きの Session

- Issue や Pull Request を起点に、対象リポジトリで Session を開始
- 最初の依頼で、**調べる範囲と期待する成果物**を明示
- 会話、変更内容、レビューを同じ Session で追える

> この Issue を調査してください。まだコードは変更せず、原因の候補と確認方法をまとめてください。

![](/assets/github-copilot-app/centralized-inbox.webp)

---

## 実装前の Plan レビュー

- **変更対象**：どのファイルや処理に手を入れるか
- **影響範囲**：既存動作や別機能へ影響しないか
- **確認方法**：追加・更新するテストと実行コマンド

> 調査結果をもとに、実装手順とテスト方針を Plan にしてください。

Plan が広すぎる、前提が違う、完了条件が足りない場合は、ここで直す。

![](/assets/github-copilot-app/session-modes.svg)

---

## branch / worktree による作業分離

- Session ごとに**専用の branch と git worktree**
- 今開いている branch を止めずに、別の Issue を並行して進められる
- 変更は分離されるが、競合の解消と統合判断はこれまでどおり必要

![](/assets/github-copilot-app/parallel-sessions.svg)

---

## 方針確定後の実装委任

- 判断しながら進めるなら **Interactive**
- 範囲と完了条件が明確なら **Autopilot**
- 実装だけでなく、関連するテストの追加・実行まで依頼する

> この Plan で実装してください。既存のパターンを優先し、関連テストを追加して実行してください。

![](/assets/github-copilot-app/delegate-agents.webp)

---

## 完了判断の根拠

- **差分**：依頼していない変更が混ざっていないか
- **テスト**：何を実行し、何件成功したか
- **CI**：失敗や未実行のチェックが残っていないか
- **残課題**：未確認の前提やリスクが明記されているか

> 変更ファイル、テスト結果、残っているリスクを短くまとめてください。

![](/assets/github-copilot-app/canvases.webp)

---

## Pull Request でのチーム引き継ぎ

- 変更理由、主な差分、テスト結果を Pull Request に整理
- レビューコメントへの対応も、同じ Session の文脈で進める
- **マージするかどうかは人が判断**する

![](/assets/github-copilot-app/review-merge.webp)

---

<!-- slide-size: normal -->

# 最初の一歩：小さい Issue 1件

1. 完了条件が明確な Issue を選ぶ
2. Plan で変更範囲とテスト方針を確認
3. 実装後に差分・テスト・CI を見る
4. Pull Request を人がレビューしてマージ

**macOS・Linux・Windows** ／ すべての Copilot プランで利用可能

## [gh.io/app →](https://gh.io/app)

[公式ドキュメント](https://docs.github.com/en/copilot/concepts/agents/github-copilot-app)

> Business / Enterprise は管理者による Copilot CLI ポリシーの有効化が必要です。
