---
spec_id: "DETAIL-001"
context: "detail"
version: 1
issue_ref: null
title: "行の展開によるリージョン横断の詳細表示"
decision_refs:
  - D-003
  - D-005
---

## User Story

**As a** 推論先を根拠付きで説明する必要がある開発者・コンプライアンス担当者
**I want** 表の行を開いて、そのモデルの全リージョン横断の提供状況と、各プロファイルの起点 → 推論先の対応を見たい
**So that** 起点を切り替えて見比べることなく、1 モデルのデータ所在を 1 画面で説明できる

## Acceptance Criteria

### AC-001 (行の展開)
- **Given**: 表が描画されている
- **When**: 行の展開操作（行クリックまたは展開トグル）を行う
- **Then**: その行の直下に詳細パネルが開く。他の行は閉じたままでも複数同時に開けてもよいが、展開状態は起点リージョンを切り替えても対象モデルが表に残っている限り保持する

### AC-002 (全リージョン横断の availability)
- **Given**: モデル M の行を開く
- **When**: 詳細パネルを描画する
- **Then**: `region-notes.json` のキー全件について、`models.json[M].availability[<region>]` の値がリージョンごとに表示される。`ON_DEMAND` / `INFERENCE_PROFILE` / `PROVISIONED` はそのままの名前で並べ、`PROVISIONED` も省略せず表示する（3 列の判定には使わないが事実として出す）

### AC-003 (提供なしの表示)
- **Given**: `fetch-log.json.regions[R].status` が `"ok"` で、`models.json[M].availability` に R のキーが無い
- **When**: 詳細パネルを描画する
- **Then**: そのリージョンは「提供なし」と表示される

### AC-004 (空配列の表示)
- **Given**: `availability[R]` が `[]`（spike の `amazon.titan-embed-text-v1:2:8k` 相当）
- **When**: 詳細パネルを描画する
- **Then**: 「提供あり・推論タイプの指定なし」として、提供なしとも データなし とも別の表示になる

### AC-005 (プロファイルの起点 → 推論先)
- **Given**: モデル M を対象とするプロファイルが `profiles.json` に複数ある
- **When**: 詳細パネルを描画する
- **Then**: プロファイルごとに `prefix`、プロファイル ID（コピー可能）、`sources` の各起点リージョン → destination リージョン一覧（昇順）が表示される。例: `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` は `ap-northeast-1 → ap-northeast-1, ap-northeast-3` と `ap-northeast-3 → ap-northeast-1, ap-northeast-3` の 2 行

### AC-006 (Global の推論先)
- **Given**: `global.` プロファイルの `sources[R]` が `["*"]`
- **When**: 詳細パネルを描画する
- **Then**: destination を列挙せず「全対応リージョン（今後増えうる）」と表示し、公式 docs（global cross-region inference）へのリンクを添える。`*` という文字をそのまま出さない

### AC-007 (現在の起点リージョンの強調)
- **Given**: 起点リージョンが `ap-northeast-1` の状態で行を開く
- **When**: 詳細パネルを描画する
- **Then**: availability 一覧とプロファイルの `sources` 一覧の両方で、`ap-northeast-1` の行が現在の起点として視覚的に区別される

### AC-008 (Error Case: denied リージョンは「データなし」)
- **Given**: `fetch-log.json.regions["us-east-1"].status` が `"denied"`
- **When**: 詳細パネルの availability 一覧を描画する
- **Then**: `us-east-1` は **「データなし」** と表示され、「提供なし」（AC-003）と異なる見た目になる。`reason` の原文はツールチップまたは脚注リンクから参照できる。取得できていないだけのリージョンを「提供なし」と表示してはいけない

### AC-009 (Error Case: 対象プロファイルが 1 件も無い)
- **Given**: モデル M に対応するプロファイルが `profiles.json` に 1 件も無い（In-Region のみのモデル）
- **When**: 行を開く
- **Then**: プロファイル節は空欄ではなく「cross-region inference profile なし（モデル ID を直接指定する）」と表示される

## UI Description

- 表の行の展開トグル（`aria-expanded` を持つボタン）。開くと行直下に全幅の詳細パネルが挿入される
- 詳細パネルは 2 節
  1. **提供状況**: リージョンごとに 1 行。リージョン表示名（コード併記）+ 推論タイプのバッジ、または「提供なし」/「提供あり・推論タイプの指定なし」/「データなし」
  2. **推論プロファイル**: プロファイルごとに、接頭辞バッジ + プロファイル ID（コピー可能）+ 起点 → 推論先の対応行
- 現在の起点リージョンの行にマーカーを付ける
- 375px 幅では 2 節を縦積みにし、推論先チップは折り返す

## Context Boundary

### Inputs
- **From**: TABLE-001 — 展開対象のモデル ID、現在の起点リージョン
- **From**: DATA-001 — `data/models.json`（`availability`）、`data/profiles.json`（`sources`）、`data/fetch-log.json`（denied 判定）、`data/region-notes.json`（表示名・列挙順）
- **From**: I18N-001 — 「提供なし」「データなし」等のラベルとリージョン表示名

### Outputs
- **To**: なし（表示のみ。他コンテキストに状態を渡さない）

### Dependencies
- **TABLE-001**: 行の展開操作と起点リージョンの現在値
- **DATA-001**: 表示する全データ

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | 展開トグルのクリックでパネルが DOM に挿入され、`aria-expanded` が切り替わることを検証 |
| AC-002 | unit (vitest) | `buildAvailabilityRows(M, regionNotes, fetchLog)` が全リージョン分の行を返し、`PROVISIONED` を落とさないことを検証 |
| AC-003 | unit (vitest) | `status: ok` かつキー無しのリージョンが「提供なし」種別になることを検証 |
| AC-004 | unit (vitest) | 空配列が「提供あり・推論タイプの指定なし」種別になり、提供なし / データなし と別種別であることを検証 |
| AC-005 | unit (vitest) | `jp.` プロファイルの fixture で 2 起点分の行が destination 昇順で返ることを検証 |
| AC-006 | unit (vitest) | `["*"]` が注記種別に変換され、`*` の文字列が返り値に含まれないことを検証 |
| AC-007 | integration (jsdom, vitest) | 起点マーカーが該当リージョンの行にだけ付くことを検証 |
| AC-008 | unit + integration (vitest, jsdom) | denied の fixture で「データなし」種別になり、「提供なし」と異なるクラス名で描画されることを検証 |
| AC-009 | integration (jsdom, vitest) | プロファイル 0 件のモデルで説明文が出ることを検証 |
| — (375px 表示) | e2e（Playwright MCP で 375px のスクリーンショットを手動確認） | 詳細パネルが縦積みになり崩れないことを目視。スクリーンショットはリポジトリに入れない |

## Deliverable Previews

- `anthropic.claude-sonnet-4-5-20250929-v1:0` を展開した詳細パネルのスクリーンショット（`jp.` / `apac.` / `global.` と denied リージョンを含むもの）

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 展開トグルが Tab で到達し Enter / Space で開閉できること、開いたパネルにフォーカス順が続くこと、`aria-expanded` と `aria-controls` が正しいことを**手動チェック**で確認する。合格基準は「マウスを使わずに AC-001 から AC-005 の内容まで読める」
- **セキュリティレビュー: 不要。** 表示のみの静的コンテンツで、扱うデータは AWS の公開情報のみ

## Notes

- 「データなし」と「提供なし」の区別は Design の Success Criteria（混同する表示ゼロ）と FAQ Q3 に対応する、この Spec の中心的な要件
- アカウント固有の `APPLICATION` 型 inference profile は表示しない（Design「What Not」3、技術設計 §8）
- 料金・クォータ・ベンチマークは詳細パネルにも出さない（Design「What Not」1・2・4）
