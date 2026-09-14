---
spec_id: "FILTER-001"
context: "filter"
version: 2
issue_ref: null
title: "絞り込みと推論先の限定"
decision_refs:
  - D-003
  - D-007
---

## User Story

**As a** 顧客や情シスから「データはどこで処理されるか」を問われる立場の開発者・コンプライアンス担当者
**I want** 提供元・モダリティ・名前で絞り込むだけでなく、「推論先がこの国（またはこの地理圏）の中に収まるものだけ」を一度の選択で絞りたい
**So that** データ所在の条件を満たすモデルと使い方だけを、公式ドキュメントを読み比べずに候補として取り出せる

## Acceptance Criteria

### AC-001 (提供元で絞る)
- **Given**: 起点リージョンの表が描画されている
- **When**: 提供元の絞り込みで `Anthropic` を選ぶ
- **Then**: `providerName` が `Anthropic` の行だけが残る。選択肢は表示中データに現れる `providerName` の実値から生成する（spike の東京では Amazon / Anthropic / Cohere / DeepSeek / Google / MiniMax / Mistral AI / Moonshot AI / NVIDIA / OpenAI / Qwen / TwelveLabs / Z.AI / xAI）

### AC-002 (モダリティで絞る)
- **Given**: 表が描画されている
- **When**: モダリティの絞り込みで `IMAGE` を選ぶ
- **Then**: `inputModalities` または `outputModalities` に `IMAGE` を含む行だけが残る。選択肢は `TEXT` / `IMAGE` / `SPEECH` / `VIDEO` / `EMBEDDING`

### AC-003 (名前の部分一致)
- **Given**: 表が描画されている
- **When**: 検索欄に `sonnet` と入力する
- **Then**: `modelId` または `modelName` に `sonnet` を含む行だけが残る（大文字小文字を区別しない部分一致）。入力ごとに即時反映され、リロードは起きない

### AC-004 (この起点リージョンから呼べるものだけ)
- **Given**: 起点リージョン R の表が描画されている
- **When**: 「この起点リージョンから呼べるものだけ」トグルを ON にする
- **Then**: In-Region / Geo / Global のいずれかが「可」の行だけが残る。3 つとも不可の行（`availability[R]` が空配列で対応プロファイルも無い）は消える

### AC-005 (推論先の限定: 国)
- **Given**: 起点が `ap-northeast-1` で表が描画されている
- **When**: 推論先の限定で「日本国内のみ」（= `{ap-northeast-1, ap-northeast-3}`）を選ぶ
- **Then**: 次のいずれかを満たす行だけが残る
  - In-Region が可 かつ 起点リージョン R が限定集合 L に含まれる
  - destination が L の部分集合であるプロファイルを 1 つ以上持つ（`jp.` プロファイルは `["ap-northeast-1","ap-northeast-3"] ⊆ L` なので該当）
  - 満たさない使い方（例: `apac.` プロファイル、Global）は、行が残る場合でもセルが「限定を満たさない」印になる

### AC-006 (推論先の限定: 地理圏)
- **Given**: 起点が `ap-northeast-1` で表が描画されている
- **When**: 推論先の限定で「APAC 内のみ」を選ぶ
- **Then**: `apac.` プロファイルの destination（例: `apac.anthropic.claude-sonnet-4-20250514-v1:0` = ap-northeast-1/2/3, ap-south-1/2, ap-southeast-1/2/4）が L の部分集合になるため該当する。`jp.` プロファイルも destination が APAC 内に収まるため該当する（判定は接頭辞ではなく destination の包含で行う）

### AC-007 (In-Region と限定集合の関係)
- **Given**: 推論先の限定 L が選ばれている
- **When**: In-Region 可の行を判定する
- **Then**: 起点リージョン R ∈ L のとき、その行の In-Region は常に L を満たす（In-Region の推論先は R 自身だけのため）。R ∉ L のとき In-Region は L を満たさない

### AC-008 (Global は常に限定を満たさない)
- **Given**: 推論先の限定 L が「制限なし」以外に設定されている
- **When**: Global 列を判定する
- **Then**: destination が `["*"]`（= 全対応リージョン、今後増えうる）である Global は、L が何であっても「満たす」と判定しない。`global.` しか使えないモデルは限定選択時に候補から外れる

### AC-009 (絞り込みの組み合わせ)
- **Given**: 提供元 `Anthropic`、モダリティ `TEXT`、検索 `claude`、推論先の限定「日本国内のみ」を同時に設定する
- **When**: 表を描画する
- **Then**: 全条件の AND を満たす行だけが残り、件数（`n 件 / 全 m 件`）が表示される

### AC-010 (Error Case: 結果が 0 件)
- **Given**: 条件の組み合わせで該当行が 0 件になる（例: 起点 `ap-northeast-1` で「EU 内のみ」）
- **When**: 表を描画する
- **Then**: 空の表ではなく「条件に一致するモデルがありません」と、現在設定中の条件の一覧、および条件をリセットする操作が表示される。これは AC-009（denied のデータなし）とは別の見た目にする

### AC-011 (Error Case: 限定集合に未知のリージョンが含まれる)
- **Given**: 推論先の限定に含まれるリージョンコードが `region-notes.json` に無い
- **When**: 限定集合を組み立てる
- **Then**: そのリージョンコードは限定集合にそのまま含めた上で、表示名はコードをそのまま出す（落としたり例外にしたりしない）。判定結果が黙って緩くならないこと

## UI Description

- 表の直上にフィルタ行: 提供元（複数選択）/ モダリティ（複数選択）/ 名前検索（テキスト）/ 「この起点リージョンから呼べるものだけ」トグル / 推論先の限定（単一選択のセレクタ）
- 推論先の限定セレクタは 2 グループに分けて並べる
  - **国**: 日本国内のみ / オーストラリア国内のみ / 米国内のみ
  - **地理圏**: 日本（jp）内のみ / APAC 内のみ / EU 内のみ / 米国（us）内のみ / オーストラリア（au）内のみ
  - 先頭は「制限なし」（既定）
- 絞り込みの結果件数を「n 件 / 全 m 件」で表示し、設定中の条件をチップで並べて個別に外せる
- 限定が設定されているとき、限定を満たさないセル（Geo の特定プロファイル、Global）は淡色＋「限定外」の印にし、満たすセルと視覚的に区別する

## Context Boundary

### Inputs
- **From**: TABLE-001 — 起点リージョン R と、R から見た全行（モデル、In-Region / Geo / Global の判定結果と destination）
- **From**: DATA-001 — `data/region-notes.json`（リージョンコードと国の対応、表示名）、`data/profiles.json`（地理圏グループ導出のため）
- **From**: I18N-001 — 絞り込みラベル、国名・地理圏名の翻訳
- **From**: SHARE-001 — URL クエリで復元される絞り込み条件（任意）

### Outputs
- **To**: TABLE-001 — 表示する行の集合と、セルごとの「限定を満たすか」の印
- **To**: SHARE-001 — 絞り込み条件の変更イベント

### Dependencies
- **TABLE-001**: 絞り込みの母集団と判定結果。FILTER-001 は判定をやり直さず TABLE-001 の結果を使う
- **DATA-001**: 国 → リージョンの対応と、地理圏グループの導出元

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | unit (vitest) | `applyFilters(rows, {provider})` の結果件数と、選択肢生成が実データ由来であることを検証 |
| AC-002 | unit (vitest) | 入力・出力どちらの modality にマッチしても残ることを検証 |
| AC-003 | unit (vitest) | 大文字小文字混在の入力で `modelId` / `modelName` 双方にマッチすることを検証 |
| AC-004 | unit (vitest) | 3 つとも不可の行が消えることを検証（空配列モデルの fixture を使う） |
| AC-005 | unit (vitest) | `satisfiesLimit(destinations, L)` を `jp.` / `apac.` / In-Region の 3 パターンで検証 |
| AC-006 | unit (vitest) | 地理圏グループが `profiles.json` の destination 和集合から導出されること、判定が接頭辞でなく包含で行われることを検証 |
| AC-007 | unit (vitest) | R ∈ L / R ∉ L の 2 ケースで In-Region の判定を検証 |
| AC-008 | unit (vitest) | destination が `["*"]` のとき、どの L に対しても false になることを検証 |
| AC-009 | integration (jsdom, vitest) | 4 条件を同時に設定し、残る行と件数表示を検証 |
| AC-010 | integration (jsdom, vitest) | 0 件時に空状態メッセージ・条件一覧・リセット操作が出ることを検証 |
| AC-011 | unit (vitest) | `region-notes.json` に無いコードを含む L で、判定が緩まず表示名がコードのままになることを検証 |
| — (a11y) | 手動チェック | 絞り込み UI がキーボードだけで操作できること（下記「委譲する非機能要件」） |

## Deliverable Previews

- 推論先の限定セレクタの選択肢一覧（国 3 件・地理圏 5 件・制限なし）の確定表
- 起点 `ap-northeast-1` × 「日本国内のみ」の絞り込み結果のスクリーンショット

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 絞り込みの各コントロールと条件チップの削除が Tab / Enter / Space で操作でき、絞り込み結果の件数変化がスクリーンリーダーに伝わること（`aria-live`）を**手動チェック**で確認する。合格基準は「マウスを使わずに AC-009 の 4 条件を設定できる」
- **セキュリティレビュー: 不要。** 入力はクライアント内で完結し、サーバ送信も永続化もない静的ページのため `/security-review` は回さない

## Notes

- 国 → リージョンの対応（日本 = ap-northeast-1 / ap-northeast-3、オーストラリア = ap-southeast-2 / ap-southeast-4、米国 = us-east-1 / us-east-2 / us-west-1 / us-west-2）は `region-notes.json` の `country` フィールドを正とする。ap-southeast-6 はニュージーランド（country = nz）なので国「オーストラリア」には含めない。一方、公式 docs の `au.` プロファイルは ap-southeast-2/4/6 に routing するため、地理圏「au」（`geo` フィールド）には 3 リージョンとも含まれる。国と地理圏の集合は一致しないことがある
- 地理圏グループは `profiles.json` のプロファイル接頭辞（`us` / `eu` / `apac` / `au` / `jp`）ごとに destination の和集合を取って導出する。ハードコードした固定表は持たない
- 限定を満たすかの判定は「行を消す」か「セルを淡色にする」かの 2 段構えにする。行ごと消すと「この使い方なら条件を満たす」という情報まで失われるため
- 限定集合の指定方法は D-007 で C（固定リスト + カスタムのリージョン複数選択）に決定。今回のサイクルで実装するのは固定リストの経路だけで、本 Spec の AC もその範囲。カスタム経路は後続サイクル（backlog に記録）で、判定関数 `satisfiesLimit(destinations, L)` は変えずに `L` の作り方と URL の `limit` の表現を足す
- コンプライアンス判断の代行はしない。絞り込みは事実の部分集合を示すだけ（Design「What Not」6）
