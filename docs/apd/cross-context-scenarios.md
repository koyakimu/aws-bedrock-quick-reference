---
version: 3
---

## Scenario XC-001: スナップショット取得 → 表の描画 → 絞り込み

**Description**: 作者が手元で取得スクリプトを実行して生成した JSON が、そのままページの表として描画され、閲覧者が「推論先を日本国内に限る」で絞り込むまでの一連の流れ。データが人の解釈を挟まずに画面まで届くこと、取得できなかったリージョンが最後まで「データなし」として区別され続けることを確認する。

**Contexts**: data, table, filter, i18n

### Flow

#### Step 1
- **Context**: data
- **Action**: `node scripts/fetch-bedrock-snapshot.mjs --profile <名前> --account-kind sandbox` を実行する。`region-notes.json` のキー全件について `ListFoundationModels` と `ListInferenceProfiles`（`SYSTEM_DEFINED`、`nextToken` を追う）を `aws` CLI 経由で呼び、生 JSON とエラー文を `data/raw/<日付>/` に落としてから `normalize.mjs` で正規化する。`us-east-1` は SCP の明示 Deny で失敗するが、例外にせず続行する
- **Data Out**:
  - To: table
  - Payload: `models.json`（モデル ID をキーに provider / name / input / output / streaming / lifecycle / availability）、`profiles.json`（プロファイル ID をキーに prefix / modelId / name / sources）、`fetch-log.json`（`generatedAt`、`accountKind`、`ap-northeast-1: {status:"ok", models:68, profiles:34}`、`us-east-1: {status:"denied", cause:"scp-deny"}`。エラー原文は載せない → D-008）

#### Step 2
- **Context**: table
- **Action**: 起点リージョン `ap-northeast-1`（既定）で表を描画する。技術設計 §3 の判定ルールで各行の In-Region / Geo / Global を決め、Geo 列にはプロファイル ID と destination チップ、Global 列には ✓ と「全対応リージョン」注記を出す。脚注に `generatedAt` / `accountKind` / denied リージョン（`us-east-1`）/ 出典リンクを出す
- **Data In**:
  - From: data
  - Payload: `models.json` / `profiles.json` / `fetch-log.json` / `region-notes.json` / `overrides.json`
- **Data Out**:
  - To: filter
  - Payload: 起点リージョン `ap-northeast-1` と、その起点から見た全行（モデル、判定結果、各プロファイルの destination 一覧）

#### Step 3
- **Context**: i18n
- **Action**: `navigator.language` と `localStorage` から表示言語を決め、列ヘッダ・状態ラベル・リージョン表示名（`region-notes.json` の `ja` / `en`）を供給する。モデル ID・プロファイル ID・リージョンコードは翻訳しない
- **Data In**:
  - From: data
  - Payload: `region-notes.json` の `ja` / `en`、`overrides.json` の `ja` / `en`
- **Data Out**:
  - To: table, filter
  - Payload: 現在の言語と翻訳済み文言

#### Step 4
- **Context**: filter
- **Action**: 閲覧者が推論先の限定で「日本国内のみ」（`L = {ap-northeast-1, ap-northeast-3}`）を選ぶ。In-Region は起点 `ap-northeast-1` ∈ L なので満たす。`jp.` プロファイル（destination `["ap-northeast-1","ap-northeast-3"]`）は L の部分集合なので満たす。`apac.` プロファイル（destination に `ap-south-1` などを含む）と Global（destination `["*"]`）は満たさない
- **Data In**:
  - From: table
  - Payload: 起点リージョンと全行の判定結果
- **Data Out**:
  - To: table
  - Payload: 表示する行の集合と、セルごとの「限定を満たすか」の印。件数表示「n 件 / 全 m 件」

### Related Specs
- DATA-001
- TABLE-001
- FILTER-001
- I18N-001

### Verification Points
- `us-east-1` は `models.json` / `profiles.json` に一切現れず、`fetch-log.json` にのみ `denied` と API のエラー原文で残る
- 起点に `us-east-1` を選んだとき、表の上に「このリージョンのデータはまだ取得できていません」のバナーが出る（理由は出さない）。行が 0 件でも「提供なし」とは別の見た目になる
- `inferenceTypesSupported` の 4 ケース（`ON_DEMAND` のみ / `INFERENCE_PROFILE` のみ / 両方 / 空配列）が In-Region 列の表示に正しく落ちる
- `global.` プロファイルのリージョン空 ARN が Step 1 で `"*"` になり、Step 2 で destination 列挙ではなく注記として表示され、Step 4 でどの限定も満たさない
- Geo 列の destination チップが昇順・重複なしで、Step 1 のソート結果と一致する
- 「日本国内のみ」の絞り込み後に残る行が、In-Region 可の行と `jp.` プロファイルを持つ行の和集合と一致する
- 言語を切り替えても Step 4 の絞り込み結果と起点リージョンが保たれ、モデル ID / リージョンコードは変化しない

---

## Scenario XC-002: URL を開く → 状態の復元

**Description**: 共有された URL を受け取った閲覧者がそれを開き、起点リージョンと絞り込み条件が復元された画面を見る流れ。URL が唯一の状態の出どころになり、不正な値が混じっても白画面にならないことを確認する。

**Contexts**: share, table, filter, detail, i18n

### Flow

#### Step 1
- **Context**: share
- **Action**: `https://koyakimu.github.io/aws-bedrock-quick-reference/?region=ap-northeast-1&provider=Anthropic&limit=country:jp` を開く。`location.search` を解析し、`region-notes.json` のキーと FILTER-001 の有効値に照らして正当性を判定する。解釈できないパラメータは落として通知する
- **Data Out**:
  - To: table
  - Payload: 起点リージョン `ap-northeast-1`
  - To: filter
  - Payload: 絞り込み条件 `{provider: ["Anthropic"], limit: "country:jp"}`

#### Step 2
- **Context**: table
- **Action**: URL 由来の起点リージョンを既定値より優先して適用し、エンドポイント表示・取得状況・脚注をそのリージョンのものにして表を描画する
- **Data In**:
  - From: share
  - Payload: 起点リージョン
- **Data Out**:
  - To: filter
  - Payload: 起点リージョンから見た全行

#### Step 3
- **Context**: filter
- **Action**: 復元された条件で絞り込み、絞り込み UI のコントロールと条件チップを同じ状態にする。結果が 0 件なら空状態（条件一覧とリセット操作）を出す
- **Data In**:
  - From: share
  - Payload: 絞り込み条件
- **Data Out**:
  - To: table
  - Payload: 表示する行の集合

#### Step 4
- **Context**: detail
- **Action**: 閲覧者が行を開き、使い方（レーン）ごとのデータの流れ図と推論先を見る。全リージョン横断の提供状況は「リージョン」ビュー（XC-004）で見る。展開状態も選んだレーンも URL には載らない
- **Data In**:
  - From: table
  - Payload: モデル ID と現在の起点リージョン

#### Step 5
- **Context**: share
- **Action**: 閲覧者が起点リージョンまたは絞り込みを変更すると、`history.replaceState` で URL を更新する。リロードは起きず、既定値と同じ条件はパラメータから省く
- **Data In**:
  - From: table, filter
  - Payload: 変更後の起点リージョンと絞り込み条件
- **Data Out**:
  - To: 外部（ブラウザのアドレスバー、クリップボード）
  - Payload: 現在の状態を表すクエリ付き URL

### Related Specs
- SHARE-001
- TABLE-001
- FILTER-001
- DETAIL-001
- I18N-001

### Verification Points
- URL のパラメータが TABLE-001 の既定値 `ap-northeast-1` より優先される
- 起点リージョン変更時に `history.replaceState` が呼ばれ、`pushState` は呼ばれない（絞り込み操作で戻る履歴を埋めない）
- `?region=xx-nowhere-9` で既定にフォールバックし、通知が出て URL が既定状態に書き換わる。例外で描画が止まらない
- `?limit=country:atlantis&modality=SMELL` で不正パラメータだけが無視され、有効なパラメータは適用される
- 復元後に 0 件になる URL で、FILTER-001 の空状態が出る（denied の「データなし」バナーとは別の見た目）
- 言語は URL に載らず、開いた人の `localStorage` / `navigator.language` で決まる
- GitHub Pages のサブパス配下でも URL の組み立てと復元が動く（先頭スラッシュの絶対パスを使っていない）

---

## Scenario XC-003: 価格表の取り込み → 表の価格列 → 詳細パネル

**Description**: メンテナが AWS Price List Bulk API から価格を取り込み、その単価が起点リージョンごとに表の価格列と Global セルに出て、行を開くとバッチ・キャッシュまで見られるまでの流れ。価格が判定（In-Region / Geo / Global）を一切変えないこと、単価が無いモデルが「未取得」とも「提供なし」とも別の「—」で出ることを確認する。

**Contexts**: price, data, table, detail, i18n

### Flow

#### Step 1
- **Context**: price
- **Action**: `node scripts/fetch-bedrock-prices.mjs` を実行する。`data/fetch-log.json` の `status: "ok"` の 17 リージョンについて `AmazonBedrock` と `AmazonBedrockFoundationModels` のリージョン別ファイルを認証なしで取得し、`data/raw/<日付>/prices-<offer>-<region>.json` に落としてから `scripts/lib/prices.mjs` で正規化する。単位 `1K tokens` は 1000 倍して USD / 100 万トークンに揃える。`-mantle-` の SKU と Global × batch の組み合わせは載せない
- **Data In**:
  - From: data
  - Payload: `models.json`（モデル ID と `name`）、`fetch-log.json`（対象リージョン）、手書きの `price-model-map.json`
- **Data Out**:
  - To: table, detail
  - Payload: `prices.json`（`generatedAt` / `publicationDate` / `source` / `unmapped` / `byModel[<modelId>][<region>][<種別>]`）
  - To: メンテナ
  - Payload: `data/raw/<日付>/prices-unmapped.json`（地図に足すべき名前の一覧）

#### Step 2
- **Context**: table
- **Action**: 起点リージョン `ap-northeast-1` で表を描画する。Global 列の右の「入力 $/1M」「出力 $/1M」に `byModel[M]["ap-northeast-1"].standard` を出し、`global` があれば Global セルに `$入力 / $出力` を添える。脚注に価格の取得日・価格表の発行日・出典リンクを足す
- **Data In**:
  - From: price
  - Payload: `prices.json`
  - From: data
  - Payload: `models.json` / `profiles.json` / `fetch-log.json` / `region-notes.json`
- **Data Out**:
  - To: detail
  - Payload: 行に対応するモデル ID と現在の起点リージョン（価格の引き先は detail 側が `prices.json` から引き直す）

#### Step 3
- **Context**: detail
- **Action**: 閲覧者が `anthropic.claude-opus-5` の行を開く。価格の節に 標準 / Global / バッチ / キャッシュ読み / キャッシュ書き の 5 行が 入力 / 出力 の 2 列で出る
- **Data In**:
  - From: price
  - Payload: `byModel["anthropic.claude-opus-5"]["ap-northeast-1"]`

#### Step 4
- **Context**: i18n
- **Action**: 列ヘッダ（入力 $/1M / Input $/1M）、種別名（標準 / Standard）、単位の注記を `price.*` の辞書から供給する。単価の数値そのものは翻訳しない
- **Data Out**:
  - To: table, detail
  - Payload: 現在の言語と翻訳済み文言

### Related Specs
- PRICE-001
- DATA-001
- TABLE-001
- DETAIL-001
- I18N-001

### Verification Points
- `$0.00384 /1K`（Nova Pro 東京の出力）が `3.84`、`$5.50 /1M`（Claude Opus 5 東京の入力）が `5.5` になり、どちらも USD / 100 万トークンで並ぶ
- Claude Opus 5 の東京の標準が `$5.50 / $27.50`、Global が `$5.00 / $25.00` で、Global セルに `$5.00 / $25.00` が出る
- 価格の無いモデルの価格列が「—」になり、未取得バナー（TABLE-001 AC-009）とも「提供なし」（AC-010）とも別の見た目になる
- `prices.json` を空にしても行数・In-Region / Geo / Global の判定・絞り込みの結果が変わらない
- `unmapped` が 0 で、`prices-unmapped.json` が空配列（地図が揃っている）
- `byModel` の JSON に `mantle` も SKU も `usagetype` も現れない
- 価格の取得日（`generatedAt`）と価格表の発行日（`publicationDate`）が別々に脚注へ出る
- `--from-raw <日付>` でネットワークを使わずに同じ `prices.json` を作り直せる

---

## Scenario XC-004: ビューの切り替え → URL の共有 → 行列の表示

**Description**: 閲覧者が「起点から」と「リージョン」のビューを行き来し、その状態を URL で共有し、受け取った側が同じ画面を見るまでの流れ。ビューが URL に載ること、行列ビューでは起点と推論先の限定が「保持されるが効かない」こと、その切り分けが「解釈できない指定」の通知と混ざらないことを確認する。

**Contexts**: regions, share, table, filter, i18n

### Flow

#### Step 1
- **Context**: regions
- **Action**: 閲覧者がヘッダ直下のタブで「リージョン」を選ぶ。「起点から」の DOM は `hidden` になり、行列が描画される。行の並びは「起点から」と同じ規則（`sort` の現在値）で、列は `region-notes.json` の全 33 リージョンを `geo` でまとめたもの
- **Data In**:
  - From: data
  - Payload: `models.json` / `fetch-log.json` / `region-notes.json`
  - From: table
  - Payload: 現在の起点リージョン（列の「起点」の印だけに使う）と並び順の規則
- **Data Out**:
  - To: share
  - Payload: 選択中のビュー `regions`

#### Step 2
- **Context**: share
- **Action**: `history.replaceState` で URL を `?view=regions` に更新する。既定の `origin` なら `view` を省く。閲覧者が「この表示の URL をコピー」を押すと、`region` / `provider` / `limit` など既定でない値も含んだ絶対 URL がクリップボードに入る
- **Data In**:
  - From: regions
  - Payload: 選択中のビュー
- **Data Out**:
  - To: 外部（ブラウザのアドレスバー、クリップボード）
  - Payload: `https://koyakimu.github.io/aws-bedrock-quick-reference/?view=regions&region=eu-central-1&provider=Anthropic&limit=country:jp`

#### Step 3
- **Context**: share
- **Action**: 受け取った側がその URL を開く。`view` / `region` / `provider` / `limit` をすべて解析して正当性を判定する。`view=regions` のときも `region` と `limit` は**落とさず保持**し、「解釈できない指定」の通知に出さない
- **Data Out**:
  - To: regions
  - Payload: ビュー `regions`
  - To: table
  - Payload: 起点リージョン `eu-central-1`
  - To: filter
  - Payload: `{provider: ["Anthropic"], limit: "country:jp"}`

#### Step 4
- **Context**: regions
- **Action**: 行列を描画する。効くのは `provider` だけで、行は Anthropic のモデルに絞られる。`eu-central-1` の列に「起点」の印が付く。`limit=country:jp` は行列の内容を一切変えない
- **Data In**:
  - From: share
  - Payload: ビューと起点と絞り込み条件

#### Step 5
- **Context**: table
- **Action**: 閲覧者が「起点から」タブに切り替える。URL から `view` が消え、起点 `eu-central-1` の表が `provider=Anthropic` と `limit=country:jp` で絞り込まれた状態で出る。EU 起点で「日本国内のみ」は 0 件なので、FILTER-001 の空状態が出る
- **Data In**:
  - From: share
  - Payload: 起点と絞り込み条件
- **Data Out**:
  - To: share
  - Payload: ビュー `origin`（既定なので URL から省かれる）

### Related Specs
- REGIONS-001
- SHARE-001
- TABLE-001
- FILTER-001
- I18N-001

### Verification Points
- `view=regions` が URL に載り、既定の `origin` は省かれる（`history.replaceState`。`pushState` は呼ばれない）
- `?view=regions` の URL を開くと初期描画から行列が出る。「起点から」を一度描いてから差し替えない
- `view=regions` の URL に `region=` と `limit=` があっても、SHARE-001 AC-008 の「解釈できない指定」の通知が**出ない**
- 行列に効くのは `provider` / `modality` だけで、`region` は列の印にしか使われない。`q` / `callable` / `limit` は行数も列数も変えない
- タブを「起点から」に戻すと、保持されていた `region` と `limit` がそのまま効く（値が失われていない）
- `sort` を `alpha` に切り替えると、表と行列の行の並びが同時に変わる
- 言語を切り替えても選択中のビューと絞り込みが保たれ、リージョンコードとモデル名は変化しない

---

## Scenario XC-005: 東京起点の Geo タブ（jp + apac）と、ラベルの無い接頭辞

**Description**: 東京起点で `jp.` と `apac.` の 2 つの Geo プロファイルを持つモデルの行を開き、Geo タブに 2 つの図が狭い順で積まれるところまでの流れ。併せて、起点の接頭辞に i18n のラベルが無い場合（`ca.` / `in.`）に、落とさずコードのまま表示されることを確認する。

**Contexts**: detail, flow, data, i18n, filter

### Flow

#### Step 1
- **Context**: detail
- **Action**: 起点 `ap-northeast-1` で `anthropic.claude-sonnet-4-5-20250929-v1:0` の行を開く。レーンの要約を作る。In-Region は `availability["ap-northeast-1"]` に `ON_DEMAND` が無いので「提供なし」、Geo は `jp.`（東京・大阪）と `apac.`（8 件）の和集合を `country` で切り分けて「国内 2 ・ 国外 6」（warn 色）、Global は「世界中 ・ 限定不可」。最も狭い使えるレーンは Geo なので Geo が既定で選ばれる
- **Data In**:
  - From: data
  - Payload: `models.json` / `profiles.json` / `region-notes.json`（`country`）
- **Data Out**:
  - To: flow
  - Payload: レーン `geo`、起点 `ap-northeast-1`、プロファイル `jp.` と `apac.`

#### Step 2
- **Context**: detail
- **Action**: Geo のタブパネルを描画する。プロファイルを `sources["ap-northeast-1"]` の件数の昇順（`jp.` の 2 件 → `apac.` の 8 件）に並べ、ブロックごとに 図 + 指定する ID + 推論先 を積む。価格の節はパネル末尾に 1 つだけ置く
- **Data Out**:
  - To: flow
  - Payload: ブロックごとの描画要求

#### Step 3
- **Context**: flow
- **Action**: `jp.` の図を描く。外側の境界は「日本 地理圏」、内側の境界も「日本」で、国外のチップは 0 件なので国外の一群を省く。`apac.` の図を描く。外側が「APAC 地理圏」、内側が「日本」、そのあいだに国外 6 件（ソウル・ムンバイ・ハイデラバード・シンガポール・シドニー・メルボルン）が warn 色で並ぶ。どちらの図にも「記録」ノードと「東京に残る」タグ、「不正利用検知で保存される入出力は推論先に置かれうる」が入る
- **Data In**:
  - From: data
  - Payload: `sources["ap-northeast-1"]`、`region-notes.json` の表示名と `country`
  - From: i18n
  - Payload: `flow.*` の文言、接頭辞のラベル

#### Step 4
- **Context**: i18n
- **Action**: 起点を `ca-central-1` に切り替える。`ca.amazon.nova-lite-v1:0` の Geo タブを描くとき、接頭辞 `ca` のラベルを辞書から引く。**辞書にキーが無ければ接頭辞の文字列 `ca` をそのまま返す**（I18N-001 AC-009 の方針）。地理圏を一覧から落としたり例外を投げたりしない
- **Data Out**:
  - To: detail, flow, filter, regions
  - Payload: ラベル（辞書にあれば「カナダ」、無ければ `ca`）

#### Step 5
- **Context**: filter
- **Action**: 推論先の限定の選択肢を作り直す。`geo:ca` の集合は `country:ca` と一致するので国のラベルに畳まれ、`geo:in` も同様に畳まれる。選択肢は 11 件になる。カスタムのピッカーには `ca` と `in` のグループが増える
- **Data In**:
  - From: data
  - Payload: `region-notes.json` の `geo`（`ca` / `in` を含む）、`profiles.json` の接頭辞

### Related Specs
- DETAIL-001
- FLOW-001
- DATA-001
- I18N-001
- FILTER-001
- REGIONS-001

### Verification Points
- Geo タブに図が 2 枚あり、並びが `jp.`（2 件）→ `apac.`（8 件）の狭い順になる
- 「指定する ID」がブロックごとに 1 つずつ（`jp.` と `apac.` の 2 つ）出て、価格の節はパネル全体で 1 つだけ
- `jp.` の図では国外のチップが 0 個で、「国外 0」という見出しも出ない
- `apac.` の図で国外 6 件が warn 色になり、内側の境界が「日本」、外側が「APAC 地理圏」になる
- どちらの図にも「記録」ノードの 3 行と「東京に残る」タグが入り、In-Region の図にだけ「不正利用検知…」の文が無い
- レーンのタブの要約「国内 2 ・ 国外 6」が、タブを開かなくても読める
- 起点を `ca-central-1` にしたとき、`ca.` のプロファイルが Geo として判定され（`global` 以外はすべて Geo）、ラベルが辞書に無ければ `ca` がそのまま画面に出る。行が消えたり例外になったりしない
- `ap-south-1` / `ap-south-2` の `geo` が `in` になったことで、行列の列グループとカスタムのピッカーのグループに `in` が現れ、`apac` のグループからは外れる
- 推論先の限定の選択肢が 11 件になり、`geo:ca` と `geo:in` が国のラベルに畳まれている
