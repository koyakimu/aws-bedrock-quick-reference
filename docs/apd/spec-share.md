---
spec_id: "SHARE-001"
context: "share"
version: 1
issue_ref: null
title: "URL による起点リージョンと絞り込みの共有"
decision_refs:
  - D-001
---

## User Story

**As a** 調べた結果を同僚やコンプライアンス担当者に渡したい開発者
**I want** 起点リージョンと絞り込みの状態が URL に載り、その URL を開けば同じ画面が再現されてほしい
**So that** 「東京起点で日本国内に閉じるモデル」といった見え方を、口頭の操作説明なしに共有できる

## Acceptance Criteria

### AC-001 (起点リージョンが URL に載る)
- **Given**: 起点リージョンが `ap-northeast-1` の初期状態
- **When**: 起点リージョンを `ap-northeast-3` に変更する
- **Then**: URL のクエリパラメータが `?region=ap-northeast-3` に更新される。ページのリロードは発生せず、`history.replaceState` で現在のエントリを書き換える（戻るボタンの履歴を絞り込み操作で埋めない）

### AC-002 (URL からの起点リージョン復元)
- **Given**: `?region=eu-central-1` を含む URL を開く
- **When**: 初期描画が終わる
- **Then**: 起点リージョンセレクタが `eu-central-1` になり、表・エンドポイント表示・脚注がそのリージョンのものになる。TABLE-001 の既定値 `ap-northeast-1` より URL が優先される

### AC-003 (絞り込み条件が URL に載る)
- **Given**: 表が描画されている
- **When**: 提供元 `Anthropic`、モダリティ `TEXT`、名前検索 `claude`、「この起点リージョンから呼べるものだけ」ON、推論先の限定「日本国内のみ」を設定する
- **Then**: URL に `provider` / `modality` / `q` / `callable` / `limit` のパラメータが載る。複数選択はカンマ区切り、既定値と同じ条件のパラメータは URL から省く（既定状態の URL はクエリなし）

### AC-004 (URL からの絞り込み復元)
- **Given**: `?region=ap-northeast-1&provider=Anthropic&limit=country:jp` の URL を開く
- **When**: 初期描画が終わる
- **Then**: 絞り込み UI のコントロールがその状態になり、表も絞り込まれた結果で描画される。条件チップも同じ内容で並ぶ

### AC-005 (共有用 URL のコピー)
- **Given**: 任意の状態のページ
- **When**: 「この表示の URL をコピー」を操作する
- **Then**: 現在のクエリを含む絶対 URL がクリップボードにコピーされる

### AC-006 (言語は URL に載せない)
- **Given**: 日本語表示で状態を設定し URL をコピーする
- **When**: 英語環境の閲覧者がその URL を開く
- **Then**: 起点リージョンと絞り込みは復元されるが、言語は開いた人の設定（I18N-001 AC-002 / AC-006）で決まる

### AC-007 (Error Case: 未知のリージョン)
- **Given**: `?region=xx-nowhere-9` のように `region-notes.json` に無いリージョンコードを含む URL を開く
- **When**: 初期描画する
- **Then**: 例外を投げず既定の `ap-northeast-1` にフォールバックし、「URL で指定されたリージョン `xx-nowhere-9` は対象外のため東京を表示しています」と通知する。URL は既定状態に書き換える

### AC-008 (Error Case: 不正な絞り込みパラメータ)
- **Given**: `?limit=country:atlantis&modality=SMELL&callable=maybe` のような不正値を含む URL を開く
- **When**: 初期描画する
- **Then**: 解釈できないパラメータだけを無視して残りを適用し、無視した項目を通知する。ページは常に描画され、白画面にならない

### AC-009 (Error Case: 復元後に結果が 0 件)
- **Given**: 復元した条件で該当行が 0 件になる URL を開く
- **When**: 初期描画する
- **Then**: FILTER-001 AC-010 の空状態（条件一覧とリセット操作）が表示される。「壊れている」と誤解される無言の空表にしない

## UI Description

- URL の更新はアドレスバーに反映されるのみで、専用の UI は持たない
- 「この表示の URL をコピー」ボタンをヘッダまたは脚注の近くに置く
- AC-007 / AC-008 の通知は、表の上にインラインの注意メッセージとして出し、閉じられるようにする

## Context Boundary

### Inputs
- **From**: 外部（ブラウザ） — `location.search`
- **From**: TABLE-001 — 起点リージョンの変更イベント、有効なリージョンコードの集合
- **From**: FILTER-001 — 絞り込み条件の変更イベント、有効な条件値の集合

### Outputs
- **To**: TABLE-001 — 初期化時に適用する起点リージョン
- **To**: FILTER-001 — 初期化時に適用する絞り込み条件
- **To**: 外部（ブラウザ） — `history.replaceState` による URL 更新、クリップボードへの URL コピー

### Dependencies
- **TABLE-001**: 起点リージョンの正当性判定（`region-notes.json` のキー）
- **FILTER-001**: 絞り込み条件のパラメータ名と値の正当性判定

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | 起点変更後の `location.search` を検証し、`pushState` ではなく `replaceState` が呼ばれることをスパイで確認 |
| AC-002 | integration (jsdom, vitest) | `?region=` 付きで初期化し、セレクタ値・エンドポイント表示が URL 由来になることを検証 |
| AC-003 | unit (vitest) | `serializeState(state)` が既定値のパラメータを省き、複数選択をカンマ区切りにすることを検証 |
| AC-004 | integration (jsdom, vitest) | `parseState(search)` → 初期描画で UI と表の両方が復元されることを検証 |
| AC-005 | integration (jsdom, vitest) | クリップボード API をスタブし、コピーされた文字列が絶対 URL でクエリを含むことを検証 |
| AC-006 | unit (vitest) | `serializeState` の出力に言語のパラメータが含まれないことを検証 |
| AC-007 | unit + integration (vitest, jsdom) | 未知リージョンで既定にフォールバックし通知が出ること、URL が書き換わることを検証 |
| AC-008 | unit (vitest) | `parseState` が不正値のみを落とし、有効値を残すことを複数パターンで検証 |
| AC-009 | integration (jsdom, vitest) | 0 件になる URL で空状態 UI が出ることを検証 |
| — (実 URL 確認) | e2e（Playwright MCP で URL を開いてスクリーンショットを手動確認） | ビルド後の単一 HTML を GitHub Pages 相当のパスで開き、URL 復元が動くことを目視 |

## Deliverable Previews

- URL パラメータの一覧表（名前 / 値の形 / 既定値 / 省略条件）

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: URL コピーボタンと通知の閉じるボタンが Tab / Enter で操作でき、通知が `role="status"` でスクリーンリーダーに伝わることを**手動チェック**で確認する
- **セキュリティレビュー: 不要。** URL に載るのはリージョンコードと絞り込み条件だけで、個人情報も認証情報も含まない。クエリ値は DOM にテキストとして挿入する際にエスケープする（AC-008 の不正値テストで併せて検証する）ため、静的サイトとして `/security-review` は回さない

## Notes

- 起点リージョンを URL で共有できることは Design FAQ Q13 で約束している。絞り込みの共有はその自然な拡張として同じ仕組みに載せる
- 展開中の行（DETAIL-001）は URL に載せない。行数が増えると URL が長くなり、共有の主目的（起点と条件）がぼやけるため
- GitHub Pages のサブパス（`/aws-bedrock-quick-reference/`）配下で動くこと。URL の組み立てで先頭スラッシュの絶対パスを使わない
