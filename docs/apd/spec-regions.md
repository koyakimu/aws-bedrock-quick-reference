---
spec_id: "REGIONS-001"
context: "regions"
version: 1
issue_ref: null
title: "画面ビューの切り替えとモデル × 全リージョンの行列"
decision_refs:
  - D-003
  - D-008
  - D-012
  - D-013
---

## User Story

**As a** 「このモデルはどの国で使えるのか」を横断で確認したい開発者・コンプライアンス担当者
**I want** 起点リージョンに縛られず、モデルを行・全リージョンを列に取った 1 枚の行列を見たい
**So that** 起点を 33 回切り替えて見比べることなく、モデルごとの提供状況を地理の並びのまま読める

## Acceptance Criteria

### AC-001 (ヘッダ直下のビュータブ)
- **Given**: ページを開く
- **When**: 初期描画が終わる
- **Then**: ヘッダの直下に `role="tablist"` のタブが 2 つ並ぶ。「起点から」（既定）と「リージョン」で、選択中のタブに `aria-selected="true"` が付く。先例の EC2 GPU サイトと同じ `nav.tabs` の見た目にする
  - 「起点から」は TABLE-001 の表・FILTER-001 の絞り込み・件数・DETAIL-001 の詳細パネルを含む、既存の画面そのもの
  - 「リージョン」は本 Spec の行列（AC-004 以降）
  - タブの切り替えでページのリロードは起きず、選択されていないビューの DOM は `hidden` で伏せる（破棄してもよいが、切り替えのたびに再取得はしない）

### AC-002 (ビューは URL に載る)
- **Given**: 「リージョン」タブを選ぶ
- **When**: URL を見る
- **Then**: `view=regions` が載る。既定の「起点から」では `view` を URL から省く（SHARE-001 AC-011）。`region=` と FILTER-001 の絞り込み・`limit` は「起点から」ビューにだけ効き、`view=regions` の URL でも値は保持されるが行列の表示には影響しない（SHARE-001 AC-012）

### AC-003 (行の並び)
- **Given**: 行列を描画する
- **When**: 行の並びを見る
- **Then**: 行は **プロバイダ → モデル名** でまとまり、プロバイダの並びは TABLE-001 AC-006 と同じ規則（`sort=pinned` なら Anthropic → OpenAI → 残りのプロバイダを名前の昇順、`sort=alpha` なら全プロバイダを名前の昇順）に従う。プロバイダ名はそのプロバイダの先頭行にだけ出し、2 行目以降は空にする。プロバイダが変わる行の上に区切り線を引く
- **And**: 行の母集団は `models.json` の全モデルで、起点リージョンによって増減しない

### AC-004 (列の構成と地理圏のグループ)
- **Given**: 行列を描画する
- **When**: ヘッダを見る
- **Then**: 左の 2 列が **プロバイダ / モデル名**（`rowspan=2`）、その右に `region-notes.json` のキー全件が 1 列ずつ並ぶ。ヘッダは 2 行で、1 行目が地理圏のグループ（`colspan` 付き、`scope="colgroup"`）、2 行目が各リージョンの表示名（`region-notes.json` の `ja` / `en`）とリージョンコードの 2 段
  - グループは `region-notes.json` の `geo` の値。並びは **jp → apac → eu → us → au → 残りの geo をコードの昇順 → other**（`other` は必ず最後）。グループ内はリージョンコードの昇順
  - グループの見出しは地理圏の平易な名前（日本 / アジア太平洋 / ヨーロッパ / 米国 / オセアニア / その他 …）に `geo` のコードを淡色で添える。ラベルは I18N-001 の辞書から引き、辞書に無い `geo` は**コードをそのまま**見出しに出す（FILTER-001 AC-020 と同じフォールバック）
  - グループの先頭の列に区切り線を引く

### AC-005 (セルの 4 状態)
- **Given**: モデル M とリージョン X について行列のセルを描画する
- **When**: `models.json[M].availability[X]` と `fetch-log.json.regions[X].status` を読む
- **Then**: セルは次の 4 つのいずれかになる。判定の材料はこの 2 つだけで、推測で埋めない

  | 表示 | 条件 | ツールチップ（`title`） |
  |---|---|---|
  | ● | `availability[X]` が `ON_DEMAND` を含む | 直接提供（On-Demand） |
  | ○ | `availability[X]` にキーはあるが `ON_DEMAND` を含まない（`INFERENCE_PROFILE` のみ / `PROVISIONED` のみ / `[]`） | 推論プロファイル経由のみ。`[]` のときだけ「提供あり・推論タイプの指定なし」 |
  | — | `status` が `ok` で、`availability` に X のキーが無い | 提供なし |
  | 空欄 | `status` が `ok` 以外（`denied` / `partial`） | 未取得 |

  - 空欄のセルには**取得できなかった理由（`cause`）を出さない**（D-008）。ツールチップも「未取得」だけにする
  - `PROVISIONED` を省略して「提供なし」に倒してはいけない（DETAIL-001 v7 AC-002 の要件をここが引き継ぐ）

### AC-006 (凡例)
- **Given**: 行列が描画されている
- **When**: 表の下を見る
- **Then**: 「● 直接提供（On-Demand） / ○ 推論プロファイル経由のみ / — 提供なし / 空欄 未取得」の 1 行が、それぞれ表中と同じ色で出る

### AC-007 (空欄の列についての注記)
- **Given**: `fetch-log.json` に `status` が `ok` 以外のリージョンが N 件ある
- **When**: 凡例の下を見る
- **Then**: 「空欄の N リージョンは、データ取得に使ったアカウントで取得できていない。提供の有無は不明。」という淡色の注記が出る。N が 0 のときは注記を出さない。**理由（`cause`）・アカウント・権限・オプトインに触れる文言は出さない**（D-008、TABLE-001 AC-009 と同じ方針）

### AC-008 (現在の起点リージョンの列を示す)
- **Given**: 「起点から」ビューの起点リージョンが `ap-northeast-1`
- **When**: 行列を描画する
- **Then**: `ap-northeast-1` の列ヘッダに「起点」（en: `Origin`）のタグが付き、ヘッダとセルの背景が視覚的に区別される。起点を切り替えると印も移る。起点が `region-notes.json` に無いときはどの列にも印を付けない

### AC-009 (地域の絞り込みチップ)
- **Given**: 行列が描画されている
- **When**: 表の上のチップ列で `jp` を選ぶ
- **Then**: 表示される列が `geo` が `jp` のリージョンだけになる。チップは「すべて」（既定・選択中）と `region-notes.json` に実在する `geo` の値ごとに 1 つで、並びは AC-004 の列の並びと同じ。単一選択で、「すべて」に戻すと全列に戻る
- **And**: この選択は URL に載せない（行列の見え方の一時的な調整で、共有の主目的ではない）

### AC-010 (提供元・モダリティの絞り込みの共用)
- **Given**: 行列が描画されている
- **When**: 提供元とモダリティの絞り込みを操作する
- **Then**: FILTER-001 AC-001 / AC-002 と同じ関数（`applyFilters`）で行が絞られる。名前検索・「この起点リージョンから呼べるものだけ」・推論先の限定（`limit`）は**行列には出さない**。起点に依存する条件だからで、「起点から」ビューの設定値は保持したまま行列には効かせない

### AC-011 (件数表示)
- **Given**: 行列が描画されている
- **When**: 表の上を見る
- **Then**: 「n / m モデル ・ k リージョン」（en: `n / m models · k regions`）が出る。n は絞り込み後の行数、m は全モデル数、k は現在表示している列数

### AC-012 (i18n)
- **Given**: 言語を英語に切り替える
- **When**: 行列を再描画する
- **Then**: タブ名・列グループ見出し・リージョン表示名・凡例・注記・ツールチップ・件数表示が英語になる。モデル ID / リージョンコード / `providerName` / モデル名は翻訳しない（I18N-001 AC-004）

### AC-013 (Error Case: 絞り込みで 0 行)
- **Given**: 提供元とモダリティの組み合わせで該当モデルが 0 件になる
- **When**: 行列を描画する
- **Then**: 空の `tbody` を無言で出さず、「条件に一致するモデルがありません」と条件のリセット操作を出す（FILTER-001 AC-010 と同じ見た目）

### AC-014 (Error Case: 全リージョンが未取得)
- **Given**: `fetch-log.json` の全リージョンの `status` が `ok` 以外
- **When**: 行列を描画する
- **Then**: 列は全件出たまま全セルが空欄になり、AC-007 の注記が全件の件数で出る。例外で描画が止まらず、行を落としもしない

### AC-NFR-001 (横スクロール)
- **Given**: ビューポート幅 375px
- **When**: 行列を描画する
- **Then**: 行列の入れ物だけが `overflow-x: auto` で横スクロールし、**ページ本体は横スクロールしない**（`document.documentElement.scrollWidth <= clientWidth`）。左 2 列（プロバイダ / モデル名）は横スクロール中も `position: sticky` で固定され、セルと重ならない

### AC-NFR-002 (描画性能)
- **Given**: 68 モデル × 33 リージョン（= 2244 セル）
- **When**: ビューを「リージョン」に切り替える
- **Then**: 初回描画が 400ms 未満で完了する（`performance.now()` で計測）。2 回目以降の切り替えは再描画せず `hidden` の切り替えだけで済ませてよい

## UI Description

- **上部**: ヘッダ直下に「起点から」/「リージョン」のタブ（`nav.tabs`、`role="tablist"`）。GPU サイトと同じセグメント型
- **行列ビューの上**: 地域チップ（すべて / jp / apac / eu / us / au / … / other）と、提供元・モダリティの絞り込み、右端に件数
- **本体**: 1 つの行列。左 2 列が sticky、ヘッダは 2 行（地理圏グループ → リージョン名 + コード）
  - セルは ● / ○ / — / 空欄 の 1 文字で、中央揃え。それぞれ 別の色（yes / chip / dim / 透明）
  - 起点リージョンの列はヘッダとセルにアクセント色の背景、ヘッダに「起点」タグ
- **下部**: 凡例 1 行と、空欄の列についての淡色の注記。取得日時・出典の脚注は「起点から」ビューと共用の 1 つを使う
- 行列の描画も TABLE-001 と同じ汎用モジュールで行い、Bedrock 固有の知識を持たせない

## Context Boundary

### Inputs
- **From**: DATA-001 — `data/models.json`（`availability`）、`data/fetch-log.json`（`status`）、`data/region-notes.json`（列の全件・表示名・`geo`）
- **From**: TABLE-001 — 現在の起点リージョン（AC-008 の印だけに使う）、プロバイダの並び順の規則（AC-006 / AC-014）
- **From**: FILTER-001 — 提供元・モダリティの絞り込み条件と `applyFilters`
- **From**: SHARE-001 — URL の `view=`
- **From**: I18N-001 — タブ名・地理圏名・凡例・注記・ツールチップ

### Outputs
- **To**: SHARE-001 — 選択中のビューの変更イベント
- **To**: なし（行列は表示のみ。DETAIL-001 の詳細パネルは開かない）

### Dependencies
- **DATA-001**: 行列の全データ
- **TABLE-001**: 並び順の規則と起点リージョンの現在値
- **FILTER-001**: 提供元・モダリティの絞り込み

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | `role="tablist"` のタブが 2 つあり、クリックで `aria-selected` と `hidden` が入れ替わること、`location.reload` が呼ばれないことを検証 |
| AC-002 | unit + integration (vitest, jsdom) | `serializeState` が `view=regions` を載せ既定を省くこと、`?view=regions&region=eu-central-1&provider=Anthropic` で行列が出て `region` が行列の内容に影響しないことを検証 |
| AC-003 | unit (vitest) | `buildMatrixRows(models, { sort })` が pinned / alpha の両方で TABLE-001 と同じ並びを返し、プロバイダ名が先頭行にだけ入ることを検証 |
| AC-004 | unit + integration (vitest, jsdom) | `buildMatrixColumns(regionNotes)` が全 33 件を返しグループの並びが jp → apac → eu → us → au → 残り昇順 → other になること、未知の `geo` でコードが見出しになることを検証。描画側で `colspan` の合計が列数に一致することを検証 |
| AC-005 | unit (vitest) | `matrixCellState(availability, status)` を 6 ケース（`ON_DEMAND` 含む / `INFERENCE_PROFILE` のみ / `PROVISIONED` のみ / `[]` / キー無し + ok / `denied`）で検証。`cause` が返り値に含まれないことも検証 |
| AC-006 | integration (jsdom, vitest) | 凡例の 4 項目の文字列とクラス名を検証 |
| AC-007 | integration (jsdom, vitest) | denied 2 件の fixture で注記の件数が 2 になること、0 件で注記が出ないこと、`cause` の文言が現れないことを検証 |
| AC-008 | integration (jsdom, vitest) | 起点の列ヘッダにだけ「起点」タグと `is-origin` が付き、起点の切り替えで移ることを検証 |
| AC-009 | integration (jsdom, vitest) | チップが `geo` の実値から生成されること、`jp` 選択で列数が 2 になり「すべて」で戻ること、URL が変わらないことを検証 |
| AC-010 | integration (jsdom, vitest) | 提供元で行が減り、`q` / `callable` / `limit` のコントロールが行列ビューに無いことを検証 |
| AC-011 | integration (jsdom, vitest) | 絞り込み前後の件数表示の文字列を ja / en で検証 |
| AC-012 | integration (jsdom, vitest) | 言語切替の前後で DOM を比較し、リージョンコードとモデル名が不変であることを検証 |
| AC-013 | integration (jsdom, vitest) | 0 件時に空状態メッセージとリセット操作が出ることを検証 |
| AC-014 | integration (jsdom, vitest) | 全件 denied の fixture で列数が変わらず全セルが空欄になり、例外が出ないことを検証 |
| AC-NFR-001 | e2e（Playwright MCP で 375px のスクリーンショットを手動確認）+ integration (jsdom, vitest) | jsdom で左 2 列に `position: sticky` のクラスが付くことを検証し、375px の実描画で `scrollWidth <= clientWidth` を目視確認。スクリーンショットはリポジトリに入れない |
| AC-NFR-002 | 計測 (vitest, jsdom) | 68 モデル × 33 リージョンの fixture で初回描画を `performance.now()` で 5 回測り中央値 < 400ms |

## Deliverable Previews

- 起点 `ap-northeast-1` での行列のスクリーンショット（デスクトップ幅・375px 幅の 2 枚）
- 地域チップで `jp` を選んだときの行列のスクリーンショット

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: ビュータブが矢印キーで移動でき Enter / Space で切り替わること（`role="tablist"` の標準的な挙動）、地域チップが Tab で到達できること、行列が横スクロールのコンテナ内でキーボードスクロールできることを**手動チェック**で確認する。合格基準は「マウスを使わずに AC-001 → AC-009 まで到達できる」
- **セキュリティレビュー: 不要。** 表示のみの静的コンテンツで、扱うデータは AWS の公開情報のみ

## Notes

- この行列は DETAIL-001 の「提供状況」節が持っていた事実（全リージョン横断の availability、提供なし / 未取得 / 推論タイプの指定なしの区別、起点の強調）を引き継ぐ場所（D-013）。詳細パネル側では DETAIL-001 v8 で節ごと外れる
- 3 つ目のビュー「プロファイル」（推論プロファイルごとの 起点 → 推論先 の一覧）は**今回は作らない**（D-013 で先送り）。DETAIL-001 v7 の「推論プロファイル」節が持っていた情報の行き先はそこになる
- Global プロファイルの推論先は行列に出さない。行列が答えるのは「そのリージョンで提供があるか」であって「どこで推論されるか」ではない。後者は FLOW-001 の図と DETAIL-001 のレーンが答える
- 列の全件は `region-notes.json` が正（D-004）。`models.json` に現れるリージョンから列を作らない。作ると「提供なし」の列が消えてしまう
- `geo` の値は固定リストを持たない（D-012）。`region-notes.json` に新しい `geo` が増えたら列グループも地域チップも自動で増え、ラベルが辞書に無ければコードがそのまま出る

## 変更履歴

- **version 1** (2026-09-15): 初版。ヘッダ直下の 2 ビュー（起点から / リージョン）と、モデル × 全リージョンの行列を定めた。行列は DETAIL-001 v7 の「提供状況」節（AC-002 / AC-003 / AC-004 / AC-007 / AC-008）が持っていた事実を引き継ぐ（D-013）。理由: 1 モデルずつ行を開かないと読めなかった横断の提供状況を、1 枚で読めるようにするため
