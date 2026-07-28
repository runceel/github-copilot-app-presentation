---
title: AIが設計書を歴史書にする前に
kicker: ARCHITECTURE DECISION RECORD
---

# AIが設計書を<br>歴史書にする前に

現在の仕様と判断履歴を分けるコンテキスト設計

---

## 自己紹介

- 大田 一希 (Kazuki Ota)
- Microsoft ／ Cloud Solution Architect & Evangelist
- X: **@okazuki**
- zenn: https://zenn.dev/okazuki

![](/assets/profile.jpg)

---

## ドキュメントは大事

- 全体の設計方針
- レイヤー分割方針
- テストの方針
- etc...

細かい詳細設計というよりは、全体方針を決めるドキュメントを個人的には重視しています。

---

## AI が書くドキュメントあるある<br/>（だと思ってる）

### ドキュメントが過去の経緯で埋まる

```markdown
XXXXX は YYYYY をしていたが、ZZZZZ の理由により現在は AAAAA を使用している。
XXXXX の時には BBBBBB をしていて（以下最新の状態には関係ない説明が続く…）
```

---

## AI が書くドキュメントあるある<br/>（だと思ってる）

コードのドキュメント コメント*1 にまで！？

```csharp
/// <summary>
/// 何かをするメソッド。
/// 従来は XXXXX でやっていたが大規模なデータを扱えないため YYYYY で
/// 実装することになった。
/// </summary>
public Task DoSomethingAsync()
{
  ...
}
```

*1: C# における JSDoc や docstring 相当のもの

---

## 読むのが辛い！！最新情報だけでいい！！

ドキュメンテーションルールを書いた SKILL.md に以下を追記

```markdown:SKILL.md
ドキュメントには過去の経緯を含めず最新のスナップショットだけを
含めるようにしてください。
```

---

## 🎉問題解決🎉

スッキリして読みやすくなった。

```markdown
XXXXX は AAAAA を使用している。
```

```csharp
/// <summary>
/// 何かをするメソッド。
/// </summary>
public Task DoSomethingAsync()
{
  ...
}
```

----

## AI が同じ間違いをするようになった

素直に考えたら、そういう実装なんだけど制約によって使えない方法を選択して、エラーが発生して迷走して解決するということが多発…。

トークンも無駄に消費するし、毎回指摘するのに疲れる…。

---

## 対応策

# ADR を導入してみた

---

## ADR

# Architecture<br>Decision Record

新しいものではなく、昔からあるやり方<br>
Microsoft、AWS、Googleの公式ドキュメントでも紹介されています。

---

## ADR

> アーキテクチャ決定レコード (ADR) は、ソリューション アーキテクトの最も重要な成果物の 1 つです。

引用: [アーキテクチャデシジョン レコード (ADR) を維持する](https://learn.microsoft.com/ja-jp/azure/well-architected/architect-role/architecture-decision-record)

---

## ADR とは

重要な設計判断を決まった形で残す

---

## ADRに残すもの

- 判断したこと
- そのときの状況と理由
- 却下した代替案
- 影響やトレードオフ

---

## ADRを書く判断基準

### 次のどれかに当てはまる決定

- **全体の構造に影響** — アーキテクチャ・プロジェクト構成
- **開発全体に影響** — 開発プロセス・主要ツール
- **戻すコストが高い** — データ永続化・外部連携

> 変数名やprivateメソッド分割など、些細な実装詳細はADR化しない。（際限なく膨れるので）

---

## 実際のADRテンプレート

```markdown
## Status
Proposed / Accepted / Superseded / Deprecated

## Context
背景・制約・代替案と却下理由

## Decision
決定内容と適用範囲

## Consequences
メリット・トレードオフ・影響
```

---

## 実際の ADR 1

![](/assets/2026-07-28-11-11-17.png)


---

## 実際の ADR 2

![](/assets/2026-07-28-11-12-25.png)

---

## ARD の効果

- AI が同じ間違いをしなくなった
- ドキュメントが見やすくなった
- ADR がある Pull Requests は注意してみた方が良いという指標になった

---

## チーム開発では…？

- ADR の追加判断をもう少し明確化しないといけない
- 矛盾する ADR が入ることがある
- 全体監督をするアーキテクトの人がやっぱり必要そう

---

## ADR が増えすぎると…

- ADR を効率よく探す仕組みが必要になるかも？
- CLI/MCP Server/etc...

---

## まとめ

- ADR を入れて設計判断と最新の設計のスナップショットを分離
- AI が書いてくれるなら ADR の継続も可能
- ADR が多くなったときの対応は何か必要そう

---

# ご清聴ありがとうございました