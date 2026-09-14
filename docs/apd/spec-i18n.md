---
spec_id: "I18N-001"
context: "i18n"
version: 2
issue_ref: null
title: "日本語・英語の切り替え"
decision_refs:
  - D-006
  - D-008
---

## User Story

**As a** 日本語話者と英語話者の両方を含む閲覧者（作者本人、海外の開発者、社内のコンプライアンス担当者）
**I want** UI 文言を日本語と英語で切り替えられ、既定が閲覧環境の言語に合っていてほしい
**So that** 同じ URL を言語をまたいで共有でき、翻訳の説明を添えずに参照してもらえる

## Acceptance Criteria

### AC-001 (言語切替 UI)
- **Given**: ページを開く
- **When**: 初期描画が終わる
- **Then**: ヘッダに言語切替（日本語 / English）が表示され、現在の言語が視覚的に分かる

### AC-002 (既定言語の自動判定)
- **Given**: この起源（origin）に保存された言語設定が無い
- **When**: ページを開く
- **Then**: `navigator.language` が `ja` で始まるなら日本語、それ以外は英語で表示する

### AC-003 (切り替えの即時反映)
- **Given**: 日本語で表示されている
- **When**: English を選ぶ
- **Then**: ページリロードなしで UI 文言（ページタイトル、列ヘッダ、絞り込みラベル、注記、脚注、空状態・エラーのメッセージ）が英語に切り替わる。表の行の並びと絞り込み条件、起点リージョンの選択、展開中の行はそのまま保たれる

### AC-004 (翻訳対象と非対象)
- **Given**: 言語を切り替える
- **When**: 表を再描画する
- **Then**: 次は翻訳される — ページタイトル / 列ヘッダ / 絞り込みラベル / 国名・地理圏名 / リージョン表示名 / lifecycle の説明文 / 「提供なし」「データなし」等の状態ラベル / 脚注 / 取得失敗の理由（`fetch-log.json` の `cause` に対応する説明文）/ `overrides.json` の備考（`ja` / `en` の該当キー）。次は翻訳されない — モデル ID / プロファイル ID / リージョンコード / `providerName` / モダリティの値（`TEXT` 等）/ エンドポイント FQDN

### AC-005 (リージョン表示名の出どころ)
- **Given**: 言語が日本語
- **When**: `ap-northeast-1` を表示する
- **Then**: `region-notes.json["ap-northeast-1"].ja`（= 東京）が使われる。英語では `.en`（= Tokyo）が使われる。リージョン名を i18n 辞書側に二重に持たない

### AC-006 (設定の永続化)
- **Given**: 言語を手動で切り替えた
- **When**: 同じブラウザで再訪する
- **Then**: 保存された言語設定が `navigator.language` より優先して適用される。永続化は `localStorage` で、キーは 1 つ

### AC-007 (キー一致テスト)
- **Given**: `src/i18n/ja.js` と `src/i18n/en.js`
- **When**: テストを実行する
- **Then**: 2 つの辞書のキー集合が完全に一致し（過不足ゼロ）、値が空文字列のキーが 0 件であることが検証される

### AC-008 (Error Case: 保存値が不正)
- **Given**: `localStorage` の言語キーに `ja` / `en` 以外の値（旧バージョンの `ko`、手動改変、破損など）が入っている
- **When**: ページを開く
- **Then**: 例外を投げずに AC-002 の自動判定にフォールバックし、保存値を有効な値で上書きする

### AC-009 (Error Case: 辞書にキーが無い)
- **Given**: 表示しようとした i18n キーが辞書に存在しない
- **When**: 描画する
- **Then**: 空欄や `undefined` を表示せず、キー名をそのまま出して開発時に気づける形にする（本番では AC-007 のテストにより発生しない）

## UI Description

- 言語切替はヘッダ右上。2 択なのでトグル、またはセグメント化したボタン 2 つ
- 現在の言語のボタンに `aria-pressed="true"` を付ける
- 切り替え時に `<html lang>` を `ja` / `en` に更新する

## Context Boundary

### Inputs
- **From**: 外部（ブラウザ） — `navigator.language`、`localStorage`
- **From**: DATA-001 — `data/region-notes.json` の `ja` / `en`、`data/overrides.json` の `ja` / `en`

### Outputs
- **To**: TABLE-001 / FILTER-001 / DETAIL-001 / SHARE-001 — 現在の言語と翻訳済み文言
- **To**: 外部（ブラウザ） — `localStorage` への言語設定の保存、`<html lang>` の更新

### Dependencies
- **DATA-001**: リージョン表示名と備考の翻訳の出どころ
- **TABLE-001 / FILTER-001 / DETAIL-001**: 翻訳キーの利用側。言語変更時に再描画を受け取る

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | 初期描画後に言語切替要素が存在し、現在言語が `aria-pressed` で示されることを検証 |
| AC-002 | unit (vitest) | `resolveInitialLang(navigatorLanguage, stored)` を `ja` / `ja-JP` / `en-US` / `fr` × 保存値なし で検証 |
| AC-003 | integration (jsdom, vitest) | 絞り込みと起点リージョンを設定した状態で切り替え、文言が変わり状態が保たれることを検証。`location.reload` が呼ばれないことも検証 |
| AC-004 | integration (jsdom, vitest) | 切り替え前後の DOM を比較し、モデル ID / リージョンコード / provider 名が不変であることを検証 |
| AC-005 | unit (vitest) | 表示名の解決が `region-notes.json` 由来であること、i18n 辞書にリージョン名キーが存在しないことを検証 |
| AC-006 | integration (jsdom, vitest) | 切り替え → 再初期化で保存値が優先されることを検証 |
| AC-007 | unit (vitest) | ja / en の再帰的なキー集合の差分が空、値が空文字のキーが 0 件であることを検証（先例の i18n キー一致テストを流用） |
| AC-008 | unit (vitest) | 保存値 `ko` / `""` / `null` / 壊れた JSON で例外が出ず既定にフォールバックすることを検証 |
| AC-009 | unit (vitest) | 未定義キーの `t()` がキー名を返すことを検証 |
| — (a11y) | 手動チェック | 言語切替がキーボードで操作でき、`<html lang>` が更新されることを確認 |

## Deliverable Previews

不要（既存の先例プロジェクトと同じ仕組みのため、プレビューを別途作らない）。

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 言語切替が Tab で到達し Enter / Space で切り替わること、切り替え後に `<html lang>` が正しいことを**手動チェック**で確認する
- **セキュリティレビュー: 不要。** `localStorage` に保存するのは `ja` / `en` の 2 値のみで、個人情報も認証情報も扱わない静的ページのため `/security-review` は回さない

## Notes

- 対応言語は ja / en の 2 つ（D-006 で C に決定）。対応言語の一覧は設定値（配列）で持ち、言語切替 UI とキー一致テストの対象はその配列から生成する。ko などを足すときは辞書 1 本と配列への追加だけで済む構造にする。先例プロジェクトの ko 辞書は引き継がない
- 翻訳辞書の構成は先例（`src/i18n/ja.js` / `en.js`）を踏襲する
- `fetch-log.json` は取得失敗の分類（`cause`）だけを持ち、AWS API のエラー原文を持たない（D-008）。画面に出すのは `cause` から起こした説明文なので、これは翻訳する

## 変更履歴

- **version 2** (2026-09-14): 翻訳対象から「`reason` 原文は翻訳しない」を外し、`cause` の説明文を翻訳対象に加えた（D-008）
- **version 1** (2026-09-14): 初版
