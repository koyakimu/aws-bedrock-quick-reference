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
├── models.json         # 生成物。手編集禁止
├── profiles.json       # 生成物。手編集禁止
├── fetch-log.json      # 生成物。手編集禁止
└── raw/<日付>/         # 取得した生 JSON と stderr。gitignore 対象
scripts/
├── fetch-bedrock-snapshot.mjs  # 薄い CLI。引数を読んで lib/ を呼ぶだけ
└── lib/
    ├── cli-args.mjs    # 引数解析 (純関数)
    ├── normalize.mjs   # 正規化 (純関数。I/O・時刻・ネットワークを持たない)
    ├── aws-cli.mjs     # aws を子プロセスで起動する唯一のモジュール
    └── snapshot.mjs    # 取得の段取りとファイル書き出し (唯一の I/O 層)
src/
├── index.html
└── scripts/main.js
tests/
├── normalize.test.js
├── fetch-bedrock-snapshot.test.js
├── no-runtime-deps.test.js
└── fixtures/bedrock/   # spike 出力を 5 モデル・4 プロファイルに間引いた固定入力
```

### 開発コマンド

- `npm run dev` — Vite 開発サーバー
- `npm run build` — `dist/index.html` に単一 HTML を出力
- `npm run preview` — ビルド結果のプレビュー
- `npm test` — vitest で単体・結合テスト

## データ更新

### 生成物は手で書かない

`data/models.json` / `data/profiles.json` / `data/fetch-log.json` は
`scripts/fetch-bedrock-snapshot.mjs` の出力。**手編集は禁止**。値が間違っていると思ったら、
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
- 原文を読みたいときは gitignore 対象の `data/raw/<日付>/*.err` を見る。画面に出るのは
  `cause` に対応する平易な説明文 (i18n の `cause.*`) で、原文を開くトグルは置かない

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

`PROVISIONED` は `availability` に保持するが、3 列の判定には使わない。
`inferenceTypesSupported` には API Reference の enum に無い `INFERENCE_PROFILE` が返るので、
enum で弾かず未知の値も素通しする。

## 参照

- 仕様: `docs/apd/spec-*.md`、判断の記録: `docs/apd/decisions.md`
- 技術設計: `docs/superpowers/specs/2026-09-14-bedrock-quick-reference-design.md`
