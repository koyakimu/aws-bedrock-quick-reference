---
spec_id: "DATA-001"
context: "data"
version: 3
issue_ref: null
title: "スナップショット取得スクリプトと正規化"
decision_refs:
  - D-001
  - D-002
  - D-003
  - D-004
  - D-005
  - D-008
  - D-012
---

## User Story

**As a** このサイトを保守する作者
**I want** `aws` CLI 経由で Bedrock の公開情報を取得し、決まった形の JSON に正規化するスクリプトを手元から実行したい
**So that** 画面が読むデータを人の解釈を挟まずに再現可能な手順で更新でき、取得できなかったリージョンも「提供なし」と区別して記録できる

## Acceptance Criteria

### AC-001 (ON_DEMAND のみ)
- **Given**: あるリージョン R の `ListFoundationModels` 応答に、`inferenceTypesSupported` が `["ON_DEMAND"]` のモデル M が含まれる
- **When**: `normalize.mjs` で正規化する
- **Then**: `models.json[M].availability[R]` が `["ON_DEMAND"]` になり、In-Region 判定の入力として `ON_DEMAND` を含む状態になる

### AC-002 (INFERENCE_PROFILE のみ)
- **Given**: R の応答に `inferenceTypesSupported` が `["INFERENCE_PROFILE"]` のモデル M が含まれる（spike では 68 件中 21 件）
- **When**: 正規化する
- **Then**: `models.json[M].availability[R]` が `["INFERENCE_PROFILE"]` になり、`ON_DEMAND` を含まない（= In-Region 不可）

### AC-003 (両方)
- **Given**: R の応答に `inferenceTypesSupported` が `["ON_DEMAND","INFERENCE_PROFILE"]` または `["INFERENCE_PROFILE","ON_DEMAND"]` のモデル M が含まれる（spike では `cohere.embed-v4:0` と `amazon.nova-lite-v1:0` の 2 件）
- **When**: 正規化する
- **Then**: 応答の並び順にかかわらず `availability[R]` は両方の値を含み、In-Region 可 かつ プロファイル併用可 として扱える

### AC-004 (空配列)
- **Given**: R の応答に `inferenceTypesSupported` が `[]` のモデル M が含まれる（spike では `amazon.titan-embed-text-v1:2:8k` の 1 件）
- **When**: 正規化する
- **Then**: `models.json[M]` は生成されるが `availability[R]` は `[]` になり、In-Region 可とは判定されない（行自体を落としてはいけない）

### AC-005 (Geo プロファイルの destination 抽出)
- **Given**: R の `ListInferenceProfiles` 応答に `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` があり、`models[].modelArn` が `ap-northeast-3` → `ap-northeast-1` の順で並んでいる
- **When**: 正規化する
- **Then**: `profiles.json["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"].sources["ap-northeast-1"]` が `["ap-northeast-1","ap-northeast-3"]`（昇順ソート済み・重複除去済み）になり、`prefix` が `"jp"`、`modelId` が `modelArn` の `foundation-model/` 以降になる

### AC-006 (Global のリージョン空 ARN)
- **Given**: R の応答に `global.cohere.embed-v4:0` があり、`models[]` が `arn:aws:bedrock:::foundation-model/cohere.embed-v4:0`（リージョン空）と `arn:aws:bedrock:ap-northeast-1::foundation-model/cohere.embed-v4:0` の 2 件
- **When**: 正規化する
- **Then**: `sources["ap-northeast-1"]` が `["*"]` になる。リージョン空 ARN を `""` のまま残したり、source region だけを destination として列挙してはいけない

### AC-007 (nextToken ページング)
- **Given**: `ListInferenceProfiles` が 1 回の応答で全件を返さず `nextToken` を含む
- **When**: スクリプトが取得する
- **Then**: `nextToken` が無くなるまで繰り返し呼び、全ページの `inferenceProfileSummaries` を結合してから正規化する。`typeEquals` は `SYSTEM_DEFINED` 固定で、`APPLICATION` 型は取得しない

### AC-008 (生データの保存とフラグ)
- **Given**: `node scripts/fetch-bedrock-snapshot.mjs --profile <名前> --account-kind sandbox --regions ap-northeast-1,us-east-1` を実行する
- **When**: 取得が終わる
- **Then**: 各リージョンの生 JSON と stderr が `data/raw/<実行日 YYYY-MM-DD>/` に書かれ（`.gitignore` 対象）、`data/models.json` / `data/profiles.json` / `data/fetch-log.json` が生成される。`--regions` を省いた場合の対象リージョンは `data/region-notes.json` のキー全件

### AC-009 (runtime 依存を増やさない)
- **Given**: スクリプトを実行する
- **When**: AWS API を呼ぶ
- **Then**: AWS SDK を import せず `aws` CLI を子プロセスとして起動する。`package.json` の `dependencies` は空のまま（先例の規約）

### AC-010 (Error Case: denied リージョン)
- **Given**: `us-east-1` が SCP の明示 Deny で `AccessDeniedException` を返す
- **When**: スクリプトがそのリージョンを取得する
- **Then**: 例外で停止せず残りのリージョンを続行する。`fetch-log.json.regions["us-east-1"]` に `{"status":"denied","cause":"scp-deny"}` が記録され、`models.json` / `profiles.json` に `us-east-1` のキーは一切現れない。**API のエラー原文は生成物に一切載せない**（D-008）。`cause` は原文から機械的に決まる分類で、値は `scp-deny` / `access-denied` / `not-opted-in` / `timeout` / `other` の 5 つ。原文は `.gitignore` 対象の `data/raw/<日付>/*.err` にのみ残る。片方の API だけ失敗した `partial` も同じ `cause` を持つ

### AC-011 (Error Case: 識別子もエラー原文も残さない)
- **Given**: `inferenceProfileArn` やエラー文に AWS アカウント ID・principal ARN・組織 ID・SCP ポリシー ID・permission set 名・IAM セッション名が含まれる
- **When**: `profiles.json` / `models.json` / `fetch-log.json` を生成する
- **Then**: 生成物にアカウント ID を持つフィールドを作らない（`inferenceProfileArn` は保存せず `inferenceProfileId` を使う）。加えて **API のエラー原文を一切保存しない**ので、上記の識別子も例外クラス名も生成物には現れない。`fetch-log.json` の `accountKind` は `--account-kind` で与えた表示用の種別のみ

### AC-012 (生データからの再正規化)
- **Given**: `data/raw/<日付>/` に前回の取得結果が残っている
- **When**: `node scripts/fetch-bedrock-snapshot.mjs --from-raw <日付> --account-kind <種別>` を実行する
- **Then**: `aws` を一度も起動せずに生データだけを読み直し、`models.json` / `profiles.json` / `fetch-log.json` を書き直す。既存の `fetch-log.json` があれば `generatedAt` を引き継ぐ（取得し直していないため）。`--profile` は不要、`--account-kind` は必須

### AC-013 (地理圏は `global` 以外の全接頭辞)
- **Given**: `ListInferenceProfiles` の応答に `ca.amazon.nova-lite-v1:0` や `in.openai.gpt-5.6-luna` のような、`us` / `eu` / `apac` / `au` / `jp` 以外の接頭辞のプロファイルが含まれる
- **When**: 正規化する
- **Then**: 接頭辞を弾かずそのまま `prefix` に入れる。**`global` 以外の接頭辞はすべて地理圏（Geo）として扱う**（D-012）。接頭辞の閉じた一覧をコードにもデータにも持たない
- **And**: 画面側（TABLE-001 AC-004 / FILTER-001 AC-020 / FLOW-001 AC-004）は同じ規則で地理圏を導き、ラベルが辞書に無い接頭辞は接頭辞そのものを表示する

### AC-014 (`region-notes.json` の `geo` は接頭辞に合わせる)
- **Given**: 接頭辞 `ca` / `in` のプロファイルが実在する
- **When**: 手書きの `data/region-notes.json` を直す
- **Then**: `ca-central-1` / `ca-west-1` の `geo` が `"ca"` に、`ap-south-1` / `ap-south-2` の `geo` が `"in"` になる。`geo` の値はプロファイルの接頭辞の地理圏に合わせる規則（CLAUDE.md / D-004）のままで、どの接頭辞にも属さないリージョンだけが `"other"` に残る
- **And**: この変更で REGIONS-001 の列グループ、FILTER-001 のカスタムのピッカーのグループと推論先の限定の選択肢、FLOW-001 の Geo の国の環がそろって追随する。**どれも固定リストを持たないので、コードの変更は要らない**

### AC-NFR-001 (正規化の純粋性)
- **Given**: 同じ生 JSON を入力する
- **When**: `scripts/lib/normalize.mjs` を 2 回呼ぶ
- **Then**: `generatedAt` を除く出力が完全に一致する（キー順・配列順を含む）。`normalize.mjs` はファイル I/O・時刻取得・ネットワークを一切行わない

## UI Description

画面なし。CLI の出力のみ。実行中は `region: status` の 1 行ログを stderr に出し、終了時に `ok` / `denied` の件数を要約する。

## Context Boundary

### Inputs
- **From**: 外部（AWS Bedrock API、`aws` CLI 経由） — `ListFoundationModels` / `ListInferenceProfiles`（`SYSTEM_DEFINED`）の応答
- **From**: 手書きファイル `data/region-notes.json` — 対象リージョンの列挙、日本語名・英語名、opt-in 有無、`bedrock-runtime` エンドポイント
- **From**: 手書きファイル `data/overrides.json` — モデル ID / プロファイル ID をキーにした備考（ja/en）

### Outputs
- **To**: TABLE-001 / FILTER-001 / DETAIL-001 — `data/models.json`、`data/profiles.json`
- **To**: TABLE-001 — `data/fetch-log.json`（`generatedAt`、`accountKind`、リージョンごとの `ok` / `denied`）
- **To**: I18N-001 — `data/region-notes.json` のリージョン表示名

### Dependencies
- **なし（このコンテキストは他コンテキストに依存しない）**: 生成物は手編集禁止。UI 側は読むだけ

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | unit (vitest) | spike 出力を縮めた fixture で `ON_DEMAND` のみのモデルの `availability` を検証 |
| AC-002 | unit (vitest) | `INFERENCE_PROFILE` のみの fixture で同上 |
| AC-003 | unit (vitest) | 両方を含む fixture を、順序を入れ替えた 2 パターンで検証 |
| AC-004 | unit (vitest) | 空配列の fixture でモデルが残りつつ `availability[R]` が `[]` になることを検証 |
| AC-005 | unit (vitest) | `jp.` プロファイル fixture で destination のソート・重複除去・`prefix`・`modelId` 抽出を検証 |
| AC-006 | unit (vitest) | `global.` プロファイル fixture でリージョン空 ARN が `"*"` になることを検証 |
| AC-007 | unit (vitest) | `nextToken` を持つ 2 ページ分の fixture を結合する関数のテスト（CLI 呼び出しはスタブ） |
| AC-008 | integration (vitest, `aws` をスタブ) | 一時ディレクトリで実行し、`data/raw/<日付>/` と 3 つの生成物が書かれることを検証。`--regions` 省略時に `region-notes.json` のキーが使われることも検証 |
| AC-009 | unit (vitest) | `package.json` の `dependencies` が空であること、`scripts/` 配下に `@aws-sdk` の import が無いことを検証 |
| AC-010 | integration (vitest, `aws` をスタブ) | 1 リージョンだけ非ゼロ終了＋`AccessDeniedException` 文字列を返すスタブで、`fetch-log.json` に `cause` だけが残ること・生成物から除外されることを検証。分類関数 `classifyFetchError` は `.err` fixture（SCP 拒否 / opt-in 未有効化 / timeout）で単体検証 |
| AC-011 | unit (vitest) | 生成した JSON 全体を文字列化し、12 桁の数字列・`arn:`・`AccessDenied`・`Exception`・組織 ID・ポリシー ID・`AWSReservedSSO` のいずれにも一致しないことを検証。リージョンコード（`ap-northeast-1` の `p-northeast` など）は誤検出しないことも検証 |
| AC-012 | integration (vitest) | 偽 runner で取得した生データを `--from-raw` 経路で読み直し、同じ生成物になること・`aws` 相当の runner が呼ばれないこと・`generatedAt` を引き継ぐことを検証 |
| AC-013 | unit (vitest) | `ca.` / `in.` を含む fixture で `prefix` がそのまま入り、`global` 以外が Geo として扱われることを検証。接頭辞の固定リストが `scripts/lib/` にも `src/scripts/` にも無いことを検証 |
| AC-014 | unit (vitest, node 環境) | `region-notes.json` を読み、`ca-central-1` / `ca-west-1` の `geo` が `ca`、`ap-south-1` / `ap-south-2` の `geo` が `in` であること、`profiles.json` に現れる `global` 以外の全接頭辞が `geo` の値としても存在することを検証 |
| AC-NFR-001 | unit (vitest) | 同一入力で 2 回呼び、`generatedAt` を除いて `toEqual` かつ `JSON.stringify` が一致することを検証 |

## Deliverable Previews

- `data/models.json` / `data/profiles.json` / `data/fetch-log.json` の実サンプル 1 件ずつ（技術設計 §4 の形）
- `tests/fixtures/` に置く縮小 fixture（spike 出力から 5 モデル・4 プロファイル程度に間引いたもの）

## 委譲する非機能要件

- **セキュリティレビュー: 不要。** 生成物は AWS の公開情報のみで、認証情報も個人情報も含まない。ただし AC-011（識別子とエラー原文を出力に残さない）を機械的なテストとして持つことで代替する
- **AWS 側の権限**: `bedrock:ListFoundationModels` と `bedrock:ListInferenceProfiles` だけを許可した読み取り専用ロールの用意は aws-foundation（統治リポジトリ）側の PR に委譲する（D-005）。合格基準は「全対象リージョンで `denied` が 0 件になること」。それまでは sandbox プロファイルで取得し、denied リージョンは「データなし」として公開してよい

## Notes

- `PROVISIONED` は `availability` にそのまま保持するが、In-Region / Geo / Global の 3 列判定には使わない（技術設計 §3）
- `inferenceTypesSupported` に API Reference の enum に無い `INFERENCE_PROFILE` が返る。enum で弾かず未知の値も素通しする
- プロファイル接頭辞の閉じた一覧は持たない。2026-09-15 のスナップショットでは `apac`（11）/ `au`（8）/ `ca`（1）/ `eu`（23）/ `global`（20）/ `in`（2）/ `jp`（6）/ `us`（56）が観測されている。**`global` 以外はすべて地理圏**として同じ規則で扱う（D-012）。AWS docs も地理圏の閉じた一覧を公開していないので、API のスナップショットが正
- 取得アカウントは手元の SSO で手動実行する。CI に AWS 認証情報は置かない（DEPLOY-001 参照）

## 変更履歴

- **version 3** (2026-09-15): 地理圏の定義を接頭辞 5 種の固定リストから「`global` 以外の全接頭辞」に改め（AC-013 を追加）、`region-notes.json` の `geo` に `ca`（ca-central-1 / ca-west-1）と `in`（ap-south-1 / ap-south-2）を足すことを AC-014 として定めた。正規化の規則・生成物の形・`cause` の扱いは変更しない。理由: `ca.amazon.nova-lite-v1:0` と `in.openai.gpt-5.6-*` が実データに現れ、5 種の固定リストでは Geo と判定できなかった。AWS docs は地理圏の閉じた一覧を公開しておらず（models-region-compatibility は「US, EU, Japan, or Australia」、geographic-cross-region-inference は「such as US, EU, and APAC」と食い違う）、API のスナップショットを正とする（D-012）
- **version 2** (2026-09-14): 取得失敗の理由を公開データから外した。AC-010 は `reason`（API のエラー原文）ではなく `cause`（分類）を記録すると改め、AC-011 をアカウント ID だけでなく識別子全般とエラー原文に広げた。取り直さずに正規化だけやり直す `--from-raw` を AC-012 として追加（D-008）
- **version 1** (2026-09-14): 初版
