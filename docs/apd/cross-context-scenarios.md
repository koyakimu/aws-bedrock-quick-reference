---
version: 1
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
- **Action**: `navigator.language` と `localStorage` から表示言語を決め、列ヘッダ・状態ラベル・取得失敗の理由（`cause` の説明文）・リージョン表示名（`region-notes.json` の `ja` / `en`）を供給する。モデル ID・プロファイル ID・リージョンコードは翻訳しない
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
- 起点に `us-east-1` を選んだとき、表の上に「データなし」のバナーと `cause` の説明文が出る。行が 0 件でも「提供なし」とは別の見た目になる
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
- **Action**: 閲覧者が行を開き、全リージョン横断の availability と各プロファイルの起点 → 推論先を見る。展開状態は URL には載らない
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
