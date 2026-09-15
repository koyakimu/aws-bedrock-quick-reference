---
spec_id: "FILTER-001"
context: "filter"
version: 5
issue_ref: "#1"
title: "絞り込みと推論先の限定"
decision_refs:
  - D-003
  - D-007
  - D-012
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
- **When**: 推論先の限定で「日本国内（2）」（= `{ap-northeast-1, ap-northeast-3}`）を選ぶ
- **Then**: 次のいずれかを満たす行だけが残る
  - In-Region が可 かつ 起点リージョン R が限定集合 L に含まれる
  - destination が L の部分集合であるプロファイルを 1 つ以上持つ（`jp.` プロファイルは `["ap-northeast-1","ap-northeast-3"] ⊆ L` なので該当）
  - 満たさない使い方（例: `apac.` プロファイル、Global）は、行が残る場合でもセルが「限定を満たさない」印になる

### AC-006 (推論先の限定: 地理圏)
- **Given**: 起点が `ap-northeast-1` で表が描画されている
- **When**: 推論先の限定で「アジア太平洋内（12）」を選ぶ
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
- **Given**: 条件の組み合わせで該当行が 0 件になる（例: 起点 `ap-northeast-1` で「EU 内（8）」）
- **When**: 表を描画する
- **Then**: 空の表ではなく「条件に一致するモデルがありません」と、現在設定中の条件の一覧、および条件をリセットする操作が表示される。これは AC-009（denied のデータなし）とは別の見た目にする

### AC-011 (Error Case: 限定集合に未知のリージョンが含まれる)
- **Given**: 推論先の限定に含まれるリージョンコードが `region-notes.json` に無い
- **When**: 限定集合を組み立てる
- **Then**: そのリージョンコードは限定集合にそのまま含めた上で、表示名はコードをそのまま出す（落としたり例外にしたりしない）。判定結果が黙って緩くならないこと

### AC-012 (カスタム: リージョンを選んで限定集合を作る)
- **Given**: 起点が `ap-northeast-1` で表が描画されている
- **When**: 推論先の限定の最後の選択肢「カスタム…」を選び、開いたピッカーで `ap-northeast-1` と `ap-northeast-3` にチェックを入れる
- **Then**: 限定集合 L = `{ap-northeast-1, ap-northeast-3}` として `satisfiesLimit(destinations, L)` に渡り、固定リストの「日本国内のみ」と同じ結果になる。条件チップは「カスタム（2 リージョン）」と表示する。判定関数は変えない（D-007）

### AC-013 (カスタム: 地理圏ごとのグループと一括選択)
- **Given**: カスタムのピッカーが開いている
- **When**: 一覧を見る / 地理圏グループの「すべて選ぶ」を押す
- **Then**: チェックボックスは `region-notes.json` の `geo` の**実値**でグループ分けされ（2026-09-15 のデータでは `jp` / `apac` / `in` / `eu` / `us` / `au` / `ca` と、どれにも属さない `other`）、各行は「リージョンコード — 現地名（表示言語）」で並ぶ。グループの「すべて選ぶ」はそのグループの全リージョンを既存の選択に足し込む（他のグループの選択は消さない）

### AC-014 (カスタム: 選択のクリアと固定リストへの復帰)
- **Given**: カスタムでリージョンを選んでいる
- **When**: 「選択をクリア」を押す / 推論先の限定を固定リストの選択肢に戻す
- **Then**: クリアではチェックが全部外れ、ピッカーは開いたまま限定なしの表に戻る。固定リストに戻すとピッカーは閉じ、カスタムの集合は残らない（再びカスタムを選ぶと空の状態から始まる）

### AC-015 (カスタム: 空の集合は限定しない)
- **Given**: 「カスタム…」を選び、リージョンを 1 つも選んでいない
- **When**: 表を描画する
- **Then**: 限定集合 L は作られず（`null`）、「制限なし」と同じく行は落ちずセルに「限定外」の印も付かない。ピッカーには「リージョンを 1 つも選んでいないため、推論先を限定していません」というヒントを `role="status"` で出す。条件チップには数えない

### AC-016 (カスタム: URL の表現と往復)
- **Given**: カスタムで `ap-northeast-3` と `ap-northeast-1` を選んでいる
- **When**: URL を見る / その URL を開き直す
- **Then**: `limit=custom:ap-northeast-1+ap-northeast-3` になる（コードは昇順・重複なし・`+` 連結。アプリが書くときは `+` が `%2B` に percent encode される）。空集合のときは `limit=custom`。開き直すと「カスタム…」が選ばれ、同じリージョンにチェックが入り、表も同じ結果になる（SHARE-001 AC-010）

### AC-017 (Error Case: カスタム集合に未知のリージョンコード)
- **Given**: `?limit=custom:ap-northeast-1+xx-nowhere-9` のように `region-notes.json` に無いコードを含む URL を開く
- **When**: 限定集合を組み立てる
- **Then**: 未知のコードだけを落として残りで限定し、落とした項目を SHARE-001 の通知に出し、URL を `limit=custom:ap-northeast-1` に書き換える。残ったコードでの包含判定は緩めない。全部が未知なら空集合（= AC-015 と同じ扱い）になる。AC-011（`profiles.json` 由来の固定リストの集合）は今までどおりコードを落とさない。両者の違いは出どころで、閲覧者が URL に書いた値は検査し、データから導出した集合はそのまま使う

### AC-018 (選択肢は 1 つのリストで、同じ集合の重複を畳む)
- **Given**: 推論先の限定のセレクタを開く
- **When**: 選択肢を見る
- **Then**: 国と地理圏の見出し（グループ）は無く、1 つの平坦なリストになる。各選択肢のラベルには限定集合のリージョン数が付く（例: 「日本国内（2）」）。件数は `region-notes.json` / `profiles.json` から導いた集合の実件数で、固定値を持たない。国と地理圏で**リージョン集合が完全に一致する選択肢は 1 つに畳み、国のラベルだけを残す**（例: `geo:jp` は `country:jp` と同じ集合なので消える）。集合が違う地理圏は残り、どこが違うかの読めるラベルを i18n 辞書に持つ（`geo:au` =「オーストラリア＋ニュージーランド」、`geo:us` =「米国＋カナダ」。ラベルはコードから組み立てない）。並びは 「制限なし」→ 国（jp → us → au）→ 残った地理圏（au → eu → apac → us）→「カスタム…」。条件チップの表示名は選択肢と同じ文字列にする

### AC-020 (地理圏のラベルはデータ由来で、無ければコードを出す)
- **Given**: `profiles.json` に接頭辞 `ca` / `in` のプロファイルがあり、`region-notes.json` に `geo` が `ca` / `in` のリージョンがある
- **When**: 推論先の限定の選択肢、カスタムのピッカーのグループ、条件チップを組み立てる
- **Then**: 地理圏の一覧は**固定リストを持たず**、`profiles.json` の `global` 以外の接頭辞と `region-notes.json` の `geo` の実値から作られる（D-012）。ラベルは I18N-001 の辞書から引き、**辞書にキーが無い地理圏はコードをそのまま表示する**（`ca` → `ca`）。例外を投げたり、その地理圏を一覧から落としたりしない
- **And**: 辞書には `ca`（カナダ / Canada）と `in`（インド / India）のラベルを足す。今後増える接頭辞も、辞書に足すまではコードのまま出る
- **And**: AC-018 の選択肢の件数と畳み込みは、この増えた地理圏についても同じ規則で自動的に効く（固定の件数を持たない）

### AC-019 (畳まれた値の URL は同じ集合で開ける)
- **Given**: `?limit=geo:jp` のように、AC-018 で畳まれた値を含む既存の URL を開く
- **When**: 状態を復元する
- **Then**: その値は残った選択肢（`country:jp`）の値に読み替えられ、同じ限定集合が当たる。通知の「解釈できない指定」には数えない。セレクタは残った選択肢を選んだ状態になり、URL は残った選択肢の値に書き換わる。残った選択肢の URL の値（`country:jp` / `geo:au` など）は v3 から変えない

## UI Description

- 表の直上にフィルタ行: 提供元（複数選択）/ モダリティ（複数選択）/ 名前検索（テキスト）/ 「この起点リージョンから呼べるものだけ」トグル / 推論先の限定（単一選択のセレクタ）
- 推論先の限定セレクタは見出しの無い 1 つのリスト（AC-018）。先頭が「制限なし」（既定）、
  次に国、次に国と集合が重ならない地理圏、末尾が「カスタム…」。各選択肢はリージョン数付きで、
  `region-notes.json` に `geo` の `ca` / `in` を足した後（v5）のデータでは次の 11 件になる:
  制限なし / 日本国内（2）/ 米国内（4）/ オーストラリア国内（2）/ カナダ国内（2）/ インド国内（2）/
  オーストラリア＋ニュージーランド（3）/ EU 内（8）/ アジア太平洋内（12）/ 米国＋カナダ（5）/ カスタム…
  （`geo:ca` は `country:ca` と、`geo:in` は `country:in` と集合が一致するので国のラベルに畳まれる。
  国の並びは `jp` → `us` → `au` → 残りの国をコードの昇順。件数はデータ由来で固定値を持たない）
- 「カスタム…」を選ぶとセレクタの下にリージョンのピッカーが開く。地理圏ごとの `fieldset` に
  チェックボックスを並べ、グループごとに「すべて選ぶ」、ピッカー全体に「選択をクリア」を置く。
  固定の選択肢に戻すとピッカーは閉じる。コントロールはすべてネイティブ要素で、Tab / Space /
  Enter だけで操作できる。375px ではグループを 1 列に積み、ページ本体は横スクロールしない
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
| AC-012 | unit (vitest) + integration (jsdom, vitest) | `customLimitValue` / `limitRegionSet` がカスタムの集合を作ること、画面でチェックを入れると固定リストの `country:jp` と同じ結果・チップの件数表示になることを検証 |
| AC-013 | unit (vitest) + integration (jsdom, vitest) | `customRegionGroups` が `region-notes.json` の `geo` から全リージョンを重複なく分けること、グループの「すべて選ぶ」が既存の選択に足し込むことを検証 |
| AC-014 | integration (jsdom, vitest) | クリアで全チェックが外れて全行に戻ること、固定の選択肢に戻すとピッカーが閉じ集合が残らないことを検証 |
| AC-015 | unit (vitest) + integration (jsdom, vitest) | 空集合で `limitRegionSet` が `null` になり行が落ちないこと、ヒントが出てチップに数えないことを検証 |
| AC-016 | unit (vitest) + integration (jsdom, vitest) | `serializeState` → `parseState` の往復、コードの昇順・重複除去、生の `+`（空白に復号される）も読めることを検証 |
| AC-018 | unit (vitest) + integration (jsdom, vitest) | `buildLimitOptions()` が同じ集合の選択肢を 1 つに畳み、並びが 国 → 残った地理圏 になること、画面に `optgroup` が無くラベルにデータ由来のリージョン数が付き、チップが同じ文字列を使うことを検証 |
| AC-019 | unit (vitest) + integration (jsdom, vitest) | `canonicalLimitValue()` / `parseState()` が `geo:jp` を `country:jp` に読み替え、同じ限定集合になること、`?limit=geo:jp` でセレクタが `country:jp` を選ぶことを検証 |
| AC-020 | unit (vitest) + integration (jsdom, vitest) | 地理圏の一覧が `profiles.json` の接頭辞（`global` を除く）と `region-notes.json` の `geo` の実値から作られ、固定リストを持たないことを検証。辞書にラベルが無い地理圏でコードがそのまま出て一覧から落ちないこと、`ca` / `in` のラベルが ja / en の両辞書にあることを検証 |
| AC-017 | unit (vitest) + integration (jsdom, vitest) | `normalizeCustomLimit` が未知コードだけを落として報告すること、落とした後の包含判定が緩まないこと、通知と URL の書き換えを検証 |
| — (a11y) | 手動チェック | 絞り込み UI がキーボードだけで操作できること（下記「委譲する非機能要件」） |

## Deliverable Previews

- 推論先の限定セレクタの選択肢一覧（重複を畳んだ後の 1 リスト）の確定表
- 起点 `ap-northeast-1` × 「日本国内のみ」の絞り込み結果のスクリーンショット

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 絞り込みの各コントロールと条件チップの削除が Tab / Enter / Space で操作でき、絞り込み結果の件数変化がスクリーンリーダーに伝わること（`aria-live`）を**手動チェック**で確認する。合格基準は「マウスを使わずに AC-009 の 4 条件を設定できる」
- **セキュリティレビュー: 不要。** 入力はクライアント内で完結し、サーバ送信も永続化もない静的ページのため `/security-review` は回さない

## Notes

- 国 → リージョンの対応（日本 = ap-northeast-1 / ap-northeast-3、オーストラリア = ap-southeast-2 / ap-southeast-4、米国 = us-east-1 / us-east-2 / us-west-1 / us-west-2）は `region-notes.json` の `country` フィールドを正とする。ap-southeast-6 はニュージーランド（country = nz）なので国「オーストラリア」には含めない。一方、公式 docs の `au.` プロファイルは ap-southeast-2/4/6 に routing するため、地理圏「au」（`geo` フィールド）には 3 リージョンとも含まれる。国と地理圏の集合は一致しないことがある（一致した場合は選択肢を 1 つに畳む。AC-018）
- 地理圏グループは `profiles.json` のプロファイル接頭辞（`global` **以外のすべて**。2026-09-15 のデータでは `us` / `eu` / `apac` / `au` / `jp` / `ca` / `in`）ごとに destination の和集合を取って導出する。ハードコードした固定表は持たない（D-012）
- 限定を満たすかの判定は「行を消す」か「セルを淡色にする」かの 2 段構えにする。行ごと消すと「この使い方なら条件を満たす」という情報まで失われるため
- 限定集合の指定方法は D-007 で C（固定リスト + カスタムのリージョン複数選択）に決定。固定リストの経路を初回サイクルで、カスタムの経路を Issue #1 で実装した。判定関数 `satisfiesLimit(destinations, L)` は変えず、`L` の作り方（AC-012）と URL の `limit` の表現（AC-016）だけを足してある
- カスタムの集合は状態として `limit` の値そのものに持つ（`custom:<code>+<code>...`）。固定リストのように `buildLimitOptions()` の `regions` へ持たないのは、選択のたびに選択肢の一覧を作り直さずに済ませるため。空集合は `custom` と書き、意味は「制限なし」と同じ（AC-015）
- コンプライアンス判断の代行はしない。絞り込みは事実の部分集合を示すだけ（Design「What Not」6）

## 変更履歴

- **version 5** (2026-09-15): 地理圏の一覧を「接頭辞 5 種の固定リスト」から「`profiles.json` の `global` 以外の全接頭辞 と `region-notes.json` の `geo` の実値」に改め、辞書にラベルが無い地理圏はコードをそのまま出すことを AC-020 として明文化した。併せて `ca` / `in` のラベルを辞書に足し、カスタムのピッカーのグループ（AC-013）を `geo` の実値由来に改めた。`satisfiesLimit(destinations, L)` と AC-001 〜 AC-019 の判定内容は変更しない。理由: `ca.` / `in.` のプロファイルが実データに現れ、固定リストでは拾えなかった。AWS docs も地理圏の閉じた一覧を公開していない（D-012）
- **version 4** (2026-09-15): 推論先の限定の選択肢を、国 / 地理圏の見出しを持たない 1 つのリストにし、リージョン集合が完全に一致する選択肢を国のラベルへ畳むようにした（AC-018）。各選択肢のラベルにデータ由来のリージョン数を付け、条件チップも同じ文字列にした。畳まれた値（`geo:jp` など）の URL は残った選択肢の値に読み替える（AC-019）。残った選択肢の URL の値と `satisfiesLimit(destinations, L)` は変えない。理由: 国と地理圏が同じ集合になり、閲覧者に区別がつかなかった
- **version 3** (2026-09-14): D-007 のカスタム経路（リージョン複数選択）を実装し、AC-012〜AC-017 を追加した。「カスタム…」を推論先の限定セレクタの末尾に置き、地理圏ごとのチェックボックスのピッカー・グループ一括選択・選択のクリア・空集合のヒントを定めた。URL の `limit` に `custom:<code>+<code>...` を足した（SHARE-001 v2 AC-010）。判定関数 `satisfiesLimit(destinations, L)` と AC-001〜AC-011 は変更しない。理由: Issue #1（固定リストに無い国・地理圏で絞りたい）
- **version 2** (2026-09-14): 国「オーストラリア」の集合を `region-notes.json` の `country` に合わせて 2 件（ap-southeast-6 はニュージーランドなので除く）にし、国と地理圏の集合が一致しないことを Notes に明記した
- **version 1** (2026-09-14): 初版
