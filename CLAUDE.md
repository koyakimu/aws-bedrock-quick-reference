# CLAUDE.md

Amazon Bedrock の **モデル × リージョン × 推論が実際に行われる場所** を 1 つの表で確認できる静的サイト。
公式 docs のモデル別リージョン表にある **In-Region / Geo / Global** の 3 区分を表の中心に置く。

先例は `~/workspace/personal/aws-gpu-quick-reference`。構成・規約はそちらを踏襲する (D-001)。

## 構成

- Vite + vite-plugin-singlefile でビルドし、`dist/index.html` に単一 HTML を出力する
- フレームワーク無しの DOM 描画。`package.json` の `dependencies` は**空のまま**にする (AC-009)
- テストは vitest。DOM を触るテストは jsdom、ファイルを読むテストは先頭に
  `// @vitest-environment node` を書いて node 環境で走らせる

```
data/
├── region-notes.json   # 手書き。対象リージョンの正 (ja/en/optIn/endpoint/country/geo)
├── overrides.json      # 手書き。モデル ID / プロファイル ID ごとの備考 (ja/en)
├── mantle.json         # 手書き。bedrock-mantle の提供リージョンと対応モデル (D-010)
├── price-model-map.json # 手書き。価格表のモデル名 → モデル ID (D-009)
├── models.json         # 生成物。手編集禁止
├── profiles.json       # 生成物。手編集禁止
├── fetch-log.json      # 生成物。手編集禁止
├── prices.json         # 生成物。手編集禁止
└── raw/<日付>/         # 取得した生 JSON と stderr。gitignore 対象
scripts/
├── fetch-bedrock-snapshot.mjs  # 薄い CLI。引数を読んで lib/ を呼ぶだけ
├── fetch-bedrock-prices.mjs    # 価格の CLI。引数・fetch・書き出しだけを持つ
└── lib/
    ├── cli-args.mjs    # 引数解析 (純関数)
    ├── normalize.mjs   # 正規化 (純関数。I/O・時刻・ネットワークを持たない)
    ├── prices.mjs      # 価格の正規化 (純関数。同上)
    ├── aws-cli.mjs     # aws を子プロセスで起動する唯一のモジュール
    └── snapshot.mjs    # 取得の段取りとファイル書き出し (唯一の I/O 層)
src/
├── index.html
└── scripts/main.js
tests/
├── normalize.test.js
├── fetch-bedrock-snapshot.test.js
├── prices.test.js          # 価格の正規化 (node 環境)
├── price-render.test.js    # 価格列・Global の単価・詳細の価格 (jsdom)
├── no-runtime-deps.test.js
├── fixtures/bedrock/   # spike 出力を 5 モデル・4 プロファイルに間引いた固定入力
└── fixtures/prices/    # 東京の価格表を 20 SKU に間引いた固定入力
```

### 開発コマンド

- `npm run dev` — Vite 開発サーバー
- `npm run build` — `dist/index.html` に単一 HTML を出力
- `npm run preview` — ビルド結果のプレビュー
- `npm test` — vitest で単体・結合テスト

## データ更新

### 生成物は手で書かない

`data/models.json` / `data/profiles.json` / `data/fetch-log.json` は
`scripts/fetch-bedrock-snapshot.mjs` の、`data/prices.json` は
`scripts/fetch-bedrock-prices.mjs` の出力。**手編集は禁止**。値が間違っていると思ったら、
生成物ではなく取得スクリプトか `data/region-notes.json` を直してから取り直す。
表示上の補足を足したいときは `data/overrides.json` に書く。

### 取り直し方

手元の SSO で手動実行する。CI に AWS 認証情報は置かない (D-002)。

```
aws sso login --profile <名前>
node scripts/fetch-bedrock-snapshot.mjs --profile <名前> --account-kind sandbox
```

- `--profile` と `--account-kind` は必須。`--account-kind` は `fetch-log.json` に載る
  表示用の種別で、アカウント ID は記録しない (AC-011)
- `--regions a,b` で対象を絞れる。省くと `data/region-notes.json` のキー全件 (33 リージョン)
- `--date YYYY-MM-DD` で `data/raw/<日付>/` の日付を上書きできる。既定は JST の今日
- `--dry-run` は取得と生データの保存だけ行い、`data/*.json` を書かない
- 正規化の規則を変えたときは、取り直さずに `data/raw/<日付>/` から作り直せる。`aws` は呼ばない:

  ```
  node scripts/fetch-bedrock-snapshot.mjs --from-raw 2026-09-14 --account-kind sandbox
  ```

  `--from-raw` では `--profile` は要らない（`--account-kind` は必須）。既存の
  `fetch-log.json` に `generatedAt` があれば、取得し直していないのでその値を引き継ぐ
- 更新のタイミングは新しいモデルや推論プロファイルが出たとき。取得日時を画面に出すので、
  古さは読み手が判断できる

`aws` CLI は SSO のトークンキャッシュを書くので、エージェントから実行するときは
Bash のサンドボックスを外す必要がある。

### 価格の取り直し方 (PRICE-001 / D-009)

価格は AWS Price List Bulk API から取る。**認証は要らない**ので `aws sso login` も
`--profile` も不要。判定データ (`models.json` 等) を取り直した後に走らせる。

```
node scripts/fetch-bedrock-prices.mjs
```

- 対象リージョンは `data/fetch-log.json` の `status: "ok"` 全件 (現在 17)。
  `--regions a,b` で絞れる
- `--date YYYY-MM-DD` で `data/raw/<日付>/` の日付を上書きできる。既定は JST の今日
- `--dry-run` は取得と生データの保存だけ行い `data/prices.json` を書かない
- 生 JSON は `data/raw/<日付>/prices-<offer>-<region>.json` (gitignore 対象)。
  正規化の規則や対応表を変えたときは、取り直さずに作り直せる:

  ```
  node scripts/fetch-bedrock-prices.mjs --from-raw 2026-09-14
  ```

- **Node の組み込み `fetch` を使うので、エージェントから実行するときは Bash の
  サンドボックスを外す必要がある** (サンドボックス下では `fetch failed` になる)。
  `curl` は通るが、スクリプトは `fetch` で取る
- 単価はすべて **USD / 100 万トークン**に揃う。`AmazonBedrock` の `1K tokens` は 1000 倍、
  `AmazonBedrockFoundationModels` の `1M tokens` はそのまま
- 取り込むのは 2 offer (`AmazonBedrock` / `AmazonBedrockFoundationModels`)。
  `AmazonBedrockService` と `AmazonBedrockAgentCore` はトークン単価を持たないので対象外

#### price-model-map.json を直すとき

価格表のモデル名と `models.json` の `name` は一致しないことがある
(`Claude Opus 5 (Amazon Bedrock Edition)` / `NVIDIA Nemotron Nano 2 VL` / `Gemma 3 12B` など)。
自動一致 (接尾辞 `(Amazon Bedrock Edition)` を外して大文字小文字・記号を無視した比較) で
当たらない名前だけをこの手書きファイルに書く。

- 実行後に `data/prices.json` の `unmapped` が 0 でなければ、
  `data/raw/<日付>/prices-unmapped.json` を開いて名前を確認し、地図に足す。
  **推測で結び付けない。** `models.json` に該当が無いと確認できたものは値を `null` にする
  (`unmapped` ではなく `ignored` に数えられる)
- 地図を直したら `--from-raw <日付>` で作り直す。取り直しは要らない
- `model` 属性を持たない SKU (Titan 系) の鍵は `usagetype:<token>` の形

### denied リージョンは消さない

取得に失敗したリージョンは **`fetch-log.json` に `status: "denied"` と `cause` (取得失敗の分類) を
残したまま**にする。「提供なし」と「データなし」は画面で区別して表示するため、
denied の行を消すと区別が壊れる (D-003)。

- sandbox アカウントは Organizations の SCP で `us-east-1` などが明示 Deny される。これは想定内
- opt-in リージョン (`region-notes.json` の `optIn: true`) を有効化していないアカウントでも失敗する
- 全リージョンを取れるようにするには `bedrock:ListFoundationModels` と
  `bedrock:ListInferenceProfiles` だけを許可した読み取り専用ロールを aws-foundation 側に
  用意する (D-005)。それまでは取れたリージョンだけで公開してよい
- **API のエラー原文は生成物に一切入れない** (D-008)。原文には principal ARN・アカウント ID・
  組織 ID・SCP ポリシー ID・permission set 名・IAM セッション名が入り、生成物は公開リポジトリに
  載って公開サイトにも描画されるため。代わりに `cause` (分類) だけを残す:
  `scp-deny` / `access-denied` / `not-opted-in` / `timeout` / `other`。
  分類は `scripts/lib/normalize.mjs` の `classifyFetchError` が原文から機械的に決める
- 原文を読みたいときは gitignore 対象の `data/raw/<日付>/*.err` を見る。`cause` はメンテナ向けの
  情報なので**画面には出さない**。未取得のリージョンは「未取得」とだけ表示する
  (TABLE-001 v5 AC-009 / DETAIL-001 v5 AC-008)

### mantle.json を直すとき

`bedrock-mantle` の提供リージョンとモデル別の対応は API から取れないので、公式 docs の
Endpoint availability を転記した手書きファイルが正 (D-010)。出典は `_source` の 3 つの URL。
**region-notes.json と同じく、記憶で足さず必ず doc を読んでから転記する。**

- `models` のキーは `models.json` のモデル ID。docs のモデル名は `name` と大文字小文字を
  無視した完全一致で引き、**突き合わなかった名前は推測で結び付けず `_unmatched` に残す**
- `models.json` に無い mantle 専用モデルは `mantleOnly` に docs のモデル名で残す
- `us-gov-west-1` は転記どおり `regions` に残すが、`region-notes.json` に無いので
  起点リージョンとしては選べない

### region-notes.json を直すとき

対象リージョンの列挙はこのファイルが正 (D-004)。出典は `_source` に書いてある 2 つの URL。
**記憶で足さず、必ず doc を読んでから転記する。**

- `geo` は推論プロファイルの接頭辞の地理圏に合わせる
  (`jp` = ap-northeast-1/3、`au` = ap-southeast-2/4/6、`us` / `eu` = 各リージョン、
  それ以外のアジア太平洋が `apac`、どの接頭辞にも属さないものが `other`)
- GovCloud (`us-gov-*`) は `aws-us-gov` パーティションで商用アカウントから呼べないため対象外

## 判定ルール (技術設計 §3)

source region R、モデル M について:

| 列 | 判定 |
|---|---|
| In-Region | R の `models.json[M].availability[R]` が `ON_DEMAND` を含む |
| Geo | `profiles.json` に接頭辞 `us` / `eu` / `apac` / `au` / `jp` で M を対象とし `sources[R]` を持つものがある |
| Global | 同じく接頭辞 `global`。destination は API から取れないので `["*"]` で、画面では注記にする |
| データなし | `fetch-log.json.regions[R].status` が `denied` |
| 入力 / 出力 $/1M | `prices.json.byModel[M][R].standard` の `input` / `output`。無ければ「—」 |

`PROVISIONED` は `availability` に保持するが、3 列の判定には使わない。
`inferenceTypesSupported` には API Reference の enum に無い `INFERENCE_PROFILE` が返るので、
enum で弾かず未知の値も素通しする。

## 参照

- 仕様: `docs/apd/spec-*.md`、判断の記録: `docs/apd/decisions.md`
- 技術設計: `docs/superpowers/specs/2026-09-14-bedrock-quick-reference-design.md`
