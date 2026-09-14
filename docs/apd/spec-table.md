---
spec_id: "TABLE-001"
context: "table"
version: 2
issue_ref: null
title: "起点リージョン選択とメイン比較表"
decision_refs:
  - D-001
  - D-003
  - D-004
  - D-008
---

## User Story

**As a** 特定のリージョンを起点に Bedrock を使う開発者・アーキテクト
**I want** 起点リージョンを一つ選ぶだけで、そこから使える全モデルの In-Region / Geo / Global の可否と推論先リージョンを一つの表で見たい
**So that** モデルカードを一枚ずつ開かずに「このモデルは自分のリージョンで使えるか」と「実際にどこで推論されるか」の両方に答えられる

## Acceptance Criteria

### AC-001 (起点リージョンセレクタの既定値)
- **Given**: URL に起点リージョンの指定がない状態でページを開く
- **When**: 初期描画が終わる
- **Then**: 起点リージョンセレクタに `ap-northeast-1`（東京）が選択されており、選択肢は `region-notes.json` のキー全件がリージョンコードと表示名で並ぶ

### AC-002 (エンドポイント表示)
- **Given**: 起点リージョンに `ap-northeast-1` が選択されている
- **When**: 表示を見る
- **Then**: セレクタの近くに `bedrock-runtime.ap-northeast-1.amazonaws.com` が表示され、コピーできる。起点を切り替えると同じ位置の値も切り替わる

### AC-003 (In-Region 判定)
- **Given**: 起点リージョン R、モデル M について `models.json[M].availability[R]` が `ON_DEMAND` を含む
- **When**: 表を描画する
- **Then**: In-Region 列が「可」の表示になり、そのセルにコピー可能な **モデル ID** が出る。`ON_DEMAND` を含まない場合（`INFERENCE_PROFILE` のみ、`PROVISIONED` のみ、空配列）は「不可」の表示になりモデル ID は出ない

### AC-004 (Geo 判定と destination チップ)
- **Given**: 起点リージョン R について、`profiles.json` に接頭辞が `us.` / `eu.` / `apac.` / `au.` / `jp.` のいずれかで `modelId` が M、かつ `sources` に R を持つプロファイル P がある
- **When**: 表を描画する
- **Then**: Geo 列に P の **プロファイル ID**（コピー可能）と、`sources[R]` の destination リージョンがチップとして昇順で並ぶ。同じ M に対し複数の Geo プロファイルがあれば全て並べる。該当が無ければ「不可」

### AC-005 (Global 判定と注記)
- **Given**: 起点リージョン R について、接頭辞 `global.` で `modelId` が M、`sources` に R を持つプロファイル P がある
- **When**: 表を描画する
- **Then**: Global 列に ✓ と P のプロファイル ID（コピー可能）が出て、destination は列挙せず「全対応リージョン（今後増えうる）」の注記と公式 docs へのリンクが付く。`sources[R]` が `["*"]` であることを destination 列挙の代わりに使う

### AC-006 (表の列構成)
- **Given**: 起点リージョンが選択されている
- **When**: 表を描画する
- **Then**: 列が左から Provider / Model ID / モダリティ（入力→出力）/ In-Region / Geo / Global / lifecycle / 備考 の順で並ぶ。1 行 = 1 モデル。モダリティは `inputModalities` と `outputModalities`（`TEXT` / `IMAGE` / `SPEECH` / `VIDEO` / `EMBEDDING`）、lifecycle は `ACTIVE` / `LEGACY`、備考は `overrides.json` の該当エントリ（無ければ空）

### AC-007 (ID のコピー)
- **Given**: 表にモデル ID またはプロファイル ID が表示されている
- **When**: その ID のコピー操作（クリックまたは付随のコピーボタン）を行う
- **Then**: クリップボードに ID の文字列だけがコピーされ、コピーできたことが視覚的に示される

### AC-008 (脚注)
- **Given**: ページを開く
- **When**: 表の下を見る
- **Then**: `fetch-log.json` の `generatedAt`（取得日時）、`accountKind`、`status` が `denied` のリージョンの一覧、および出典 docs（ListFoundationModels / ListInferenceProfiles / geographic cross-region inference / global cross-region inference / Bedrock エンドポイント）へのリンクが表示される

### AC-009 (Error Case: denied リージョンを選んだとき)
- **Given**: `fetch-log.json.regions["us-east-1"].status` が `"denied"` の状態で、起点リージョンに `us-east-1` を選ぶ
- **When**: 表を描画する
- **Then**: 表の上にバナーが出て「このリージョンはデータを取得できなかった（データなし）」ことと、`cause` に対応する平易な説明文（例: 「組織のポリシーで取得できませんでした」）が表示される。**API のエラー原文は表示しない**（D-008。公開データに原文が無い）。表は 0 行になり、「提供なし」とは異なる見た目（バナー付きの空状態）になる。空の表を無言で出してはいけない

### AC-010 (Error Case: 取得済みだがモデルが 0 件)
- **Given**: `fetch-log.json.regions[R].status` が `"ok"` で `models` が 0
- **When**: そのリージョンを選ぶ
- **Then**: 「このリージョンでは提供なし」と表示される。AC-009 の「データなし」バナーは出ない

### AC-NFR-001 (スマートフォン幅)
- **Given**: ビューポート幅 375px
- **When**: 表を描画する
- **Then**: 表は横スクロールで全列を読め、ページ全体の横スクロールやセルの重なり・はみ出しといったレイアウト崩れが 0 件。モデル ID 列は横スクロール時も固定表示にする（左端に配置する）

### AC-NFR-002 (描画性能)
- **Given**: spike 相当の 68 モデル × 34 プロファイル
- **When**: 起点リージョンを切り替える
- **Then**: 再描画が 200ms 未満で完了する（`performance.now()` で計測）

## UI Description

- **上部**: 起点リージョンセレクタ（既定 `ap-northeast-1`）。右隣に選択中リージョンの `bedrock-runtime` エンドポイントと取得状況（取得日時 / ok・denied）。denied のときは表の直上に警告バナー
- **本体**: 1 つの表。行 = モデル、列 = Provider / Model ID / モダリティ / In-Region / Geo / Global / lifecycle / 備考
  - In-Region セル: ✓ + モデル ID（コピー可能な等幅表示）
  - Geo セル: プロファイル ID（コピー可能）+ destination リージョンのチップ列
  - Global セル: ✓ + プロファイル ID + 「全対応リージョン」注記（docs リンク付き）
  - 不可のセルは ✕ または「—」で、データなしとは別の見た目
- **下部**: 脚注（取得日時、accountKind、denied リージョン一覧、出典リンク）
- 表の描画は先例の `table-engine.js` 相当の汎用モジュールで行い、Bedrock 固有の知識を持たせない（列定義とセルレンダラを外から渡す）

## Context Boundary

### Inputs
- **From**: DATA-001 — `data/models.json`、`data/profiles.json`、`data/fetch-log.json`、`data/region-notes.json`、`data/overrides.json`
- **From**: SHARE-001 — URL クエリで指定された起点リージョン（あれば既定値より優先）
- **From**: I18N-001 — 列ヘッダ・注記・リージョン表示名の翻訳辞書

### Outputs
- **To**: FILTER-001 — 起点リージョン R と、R から見た全行のデータ（絞り込みの母集団）
- **To**: DETAIL-001 — 行に対応するモデル ID（詳細展開の対象）
- **To**: SHARE-001 — 起点リージョンの変更イベント

### Dependencies
- **DATA-001**: 表示するデータの全て。手編集された生成物は読まない前提
- **I18N-001**: 表示文言。データ値（モデル ID、リージョンコード）は翻訳しない

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | 初期描画後のセレクタの `value` と選択肢件数を検証 |
| AC-002 | integration (jsdom, vitest) | 起点切り替え前後のエンドポイント文字列を検証 |
| AC-003 | unit (vitest) | 判定関数 `judgeInRegion(models, M, R)` を 4 ケース（ON_DEMAND のみ / INFERENCE_PROFILE のみ / 両方 / 空配列）で検証 |
| AC-004 | unit (vitest) | `judgeGeo(profiles, M, R)` が接頭辞 5 種を拾い、destination が昇順であることを検証。複数プロファイルのケースも含む |
| AC-005 | unit (vitest) | `judgeGlobal` が `global.` のみを拾い、`["*"]` を destination 列挙に展開しないことを検証 |
| AC-006 | integration (jsdom, vitest) | 描画された `<th>` の並びと 1 行分のセル内容を検証 |
| AC-007 | integration (jsdom, vitest) | クリップボード API をスタブし、コピーされた文字列が ID と完全一致することを検証 |
| AC-008 | integration (jsdom, vitest) | 脚注に `generatedAt` / `accountKind` / denied リージョン名 / 出典リンク数が出ることを検証 |
| AC-009 | integration (jsdom, vitest) | denied の fixture でバナーの有無・`cause` の説明文の表示・表 0 行を検証。併せて画面上にエラー原文（`AccessDenied` / `arn:aws` など）が現れないことを検証 |
| AC-010 | integration (jsdom, vitest) | `ok` かつ 0 件の fixture で「提供なし」表示になり、バナーが出ないことを検証 |
| AC-NFR-001 | e2e（Playwright MCP で 375px のスクリーンショットを手動確認） | `document.documentElement.scrollWidth <= clientWidth` を評価し、スクリーンショットでセルの重なりが無いことを目視。結果はリポジトリに入れない |
| AC-NFR-002 | 計測 (vitest, jsdom) | 68 モデルの fixture で再描画時間を `performance.now()` で 5 回測り中央値 < 200ms |

## Deliverable Previews

- 起点 `ap-northeast-1` での表のスクリーンショット（デスクトップ幅・375px 幅の 2 枚）
- denied リージョン選択時のバナー表示のスクリーンショット

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 起点リージョンセレクタ、コピーボタン、行の展開トグルが Tab で到達でき Enter / Space で操作できること、フォーカスリングが見えることを**手動チェック**で確認する。自動テストは持たない。合格基準は「マウスを使わずに AC-001 → AC-007 → DETAIL-001 の行展開まで到達できる」
- **セキュリティレビュー: 不要。** 認証も入力の保存もサーバも持たない静的 HTML 1 枚で、扱うデータは AWS の公開情報のみ。`/security-review` は回さない

## Notes

- 判定ルールは技術設計 §3 をそのまま実装する。docs の HTML を scrape して補正することはしない
- `PROVISIONED` は 3 列の判定に使わない（DETAIL-001 の availability 表示には出す）
- Global の destination を推測して列挙しない（Design FAQ Q6）
- 料金・クォータ・性能比較は列に持たない（Design「What Not」1・2・4）

## 変更履歴

- **version 2** (2026-09-14): AC-009 のバナーを、API のエラー原文の表示から `cause`（取得失敗の分類）の説明文の表示に改めた（D-008）
- **version 1** (2026-09-14): 初版
