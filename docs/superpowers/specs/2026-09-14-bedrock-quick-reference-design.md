# Amazon Bedrock Quick Reference 設計

- 作成: 2026-09-14
- 状態: 承認済み（brainstorming で全節承認）
- 先例: `~/workspace/personal/aws-gpu-quick-reference`（構成・規約を踏襲する）

## 1. 目的

Amazon Bedrock の **モデル × リージョン（エンドポイント） × 推論が実際に行われる場所** を、
1 つの表で確認できる静的サイトを作る。答えたい問いは 2 つで、同じ表で両方に答える。

1. **データ所在**: 「東京から cross-region inference profile を使うと、実際にどのリージョンで推論されうるか」
2. **提供状況**: 「このモデルはどのリージョンで使えるか。model ID と inference profile ID のどちらを指定するか」

公式 docs のモデル別リージョン表にある **In-Region / Geo / Global** の 3 区分を表の中心に置く。

## 2. 根拠にした事実

### 2.1 公式ドキュメント（2026-09-14 に確認）

- `ListFoundationModels` はリージョン単位の呼び出しで、ページネーション無し。
  返却は `modelId` / `modelArn` / `modelName` / `providerName` / `inputModalities` /
  `outputModalities` / `responseStreamingSupported` / `customizationsSupported` /
  `inferenceTypesSupported` / `modelLifecycle{status,...}`。
  https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html
- `ListInferenceProfiles` は `typeEquals`（`SYSTEM_DEFINED | APPLICATION`）、`maxResults`（1〜1000）、
  `nextToken` を持つ。各プロファイルの `models[].modelArn` が推論先（destination）リージョンを表す。
  呼び出した source region から使えるプロファイルが返る。
  https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html
  https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
- cross-region inference は source region から、プロファイルに定義された **いずれかの** destination
  region にルーティングされる。**未 opt-in のリージョンも destination に含まれ**、abuse detection の
  ためにプロンプトと出力が destination 側に保存されうる。
  https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
- Geographic profile（`us.` `eu.` `apac.` `au.` `jp.`）は地理内に閉じ、destination の一覧は変わらない。
  Global profile（`global.`）は全商用リージョンにルーティングされ、一覧は増えうる。
  IAM/SCP で `aws:RequestedRegion: unspecified` の許可が要る。
  https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html
  https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html
- `jp.` は ap-northeast-1 と ap-northeast-3 の間だけ。
- docs のモデル別リージョン表（Region | In-Region | Geo | Global）は各モデルカードの HTML に分散し、
  機械可読な配信は無い。
  https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html
- エンドポイントは `bedrock-runtime.<region>.amazonaws.com`（cross-region inference はこれのみ対応）。
  リージョン別の一覧は General Reference にある。
  https://docs.aws.amazon.com/general/latest/gr/bedrock.html
  https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html

### 2.2 実 API の spike（2026-09-14、sandbox アカウント、ap-northeast-1）

生データは `data/raw/2026-09-14-spike/`（gitignore 対象、fixture の元）。

- `inferenceTypesSupported` には API Reference の enum に無い **`INFERENCE_PROFILE`** が返る。
  68 モデル中、`ON_DEMAND` のみ 44、`INFERENCE_PROFILE` のみ 21、両方 2、空配列 1。
- Geo プロファイルの `models[].modelArn` は destination リージョンをそのまま列挙する。
- Global プロファイルの `models[]` は **リージョン空の ARN**（`arn:aws:bedrock:::foundation-model/...`）
  と source region の ARN の 2 件。destination の列挙は API から取れない。
- 東京から見えるプロファイルは 34 件（`apac.` 8、`jp.` 6、`global.` 20）。
  `INFERENCE_PROFILE` のみのモデルは全て、同じ region に対応するプロファイルがあった。
- **us-east-1 は sandbox アカウントの SCP で明示 Deny**。`Production/AWSReadOnlyAccess` は
  `bedrock:List*` が無く全リージョンで AccessDenied。

## 3. 判定ルール（source region R、モデル M）

| 列 | 判定 |
|---|---|
| In-Region | R の `ListFoundationModels` に M があり、`inferenceTypesSupported` が `ON_DEMAND` を含む |
| Geo | R の `ListInferenceProfiles` に、接頭辞が `us.` `eu.` `apac.` `au.` `jp.` のいずれかで M を対象とするプロファイルがある。プロファイル ID と destination 一覧を表示 |
| Global | 同じく `global.` 接頭辞のプロファイルがある。destination は「全対応リージョン（docs 参照、増えうる）」と注記 |
| データなし | R の取得が失敗（`fetch-log.json` が `denied`）。「提供なし」とは区別して表示する |

`PROVISIONED` は availability に保持するが、3 列の判定には使わない。

## 4. データモデル（`data/`）

生成物（`models.json` `profiles.json` `fetch-log.json`）は **手編集禁止**。手書きは 2 ファイルだけ。

### 4.1 `models.json`（生成）

```json
{
  "anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "provider": "Anthropic",
    "name": "Claude Sonnet 4.5",
    "input": ["TEXT", "IMAGE"],
    "output": ["TEXT"],
    "streaming": true,
    "lifecycle": "ACTIVE",
    "availability": {
      "ap-northeast-1": ["INFERENCE_PROFILE"],
      "us-east-1": ["ON_DEMAND", "INFERENCE_PROFILE"]
    }
  }
}
```

### 4.2 `profiles.json`（生成）

```json
{
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "prefix": "jp",
    "modelId": "anthropic.claude-sonnet-4-5-20250929-v1:0",
    "name": "JP Claude Sonnet 4.5",
    "sources": {
      "ap-northeast-1": ["ap-northeast-1", "ap-northeast-3"],
      "ap-northeast-3": ["ap-northeast-1", "ap-northeast-3"]
    }
  },
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0": {
    "prefix": "global",
    "modelId": "anthropic.claude-sonnet-4-5-20250929-v1:0",
    "name": "Global Claude Sonnet 4.5",
    "sources": { "ap-northeast-1": ["*"] }
  }
}
```

- `modelId` は `models[].modelArn` の末尾（`foundation-model/` 以降）から取る。
- リージョン空の ARN は destination `"*"` に正規化する。
- destination はソートして重複を除く。

### 4.3 `fetch-log.json`（生成）

```json
{
  "generatedAt": "2026-09-14T08:10:00Z",
  "accountKind": "sandbox",
  "regions": {
    "ap-northeast-1": { "status": "ok", "models": 68, "profiles": 34 },
    "us-east-1": { "status": "denied", "reason": "<removed>" }
  }
}
```

- アカウント ID は記録しない。`accountKind` は実行時の引数で与える表示用の種別。
- `reason` は API のエラー文を **要約せず** 入れる。

### 4.4 `region-notes.json`（手書き）

```json
{
  "ap-northeast-1": { "ja": "東京", "en": "Tokyo", "optIn": false, "endpoint": "bedrock-runtime.ap-northeast-1.amazonaws.com" }
}
```

- 対象リージョンの列挙はこのファイルを正とする。出典は General Reference の Bedrock エンドポイント表。
- SSM public parameter から動的に列挙する案は未確認のため採用しない。実装時に doc で確認できれば
  取得スクリプトの `--regions` 既定値として差し替えてよい。

### 4.5 `overrides.json`（手書き）

モデル ID またはプロファイル ID をキーにした備考（ja/en）。表の行末に表示する。空でよい。

## 5. 画面

- 単一 HTML（Vite + vite-plugin-singlefile）。フレームワーク無しの DOM 描画。i18n は ja/en。
- 上部: **source region セレクタ**（既定 ap-northeast-1）。選択中の region の `bedrock-runtime`
  エンドポイントと取得状況を表示。`denied` の region を選んだら、その旨と理由を表の上に出す。
- 本体: 1 表。行 = モデル。列 = Provider / Model ID / モダリティ / In-Region / Geo / Global /
  lifecycle / 備考。Geo 列はプロファイル ID とその destination リージョンをチップで出す。
  Global 列は ✓ と「全対応リージョン」の注記。
- 行を開くと詳細: 全 source region 横断の availability と、各プロファイルの source → destination。
- フィルタ: provider、モダリティ、文字列検索、「この region から呼べるものだけ」トグル。
- 脚注: 取得日時、`accountKind`、denied region の一覧、出典 docs へのリンク。
- 表の描画は先例の `table-engine.js` 相当の汎用モジュールで行い、Bedrock 固有の知識を持たせない。

## 6. 更新スクリプトと運用

- `scripts/fetch-bedrock-snapshot.mjs --profile <名前> --account-kind <種別> [--regions a,b,...]`
  - `region-notes.json` の全 region で `ListFoundationModels` と
    `ListInferenceProfiles`（`SYSTEM_DEFINED`、`nextToken` を追う）を呼ぶ。
  - 生 JSON とエラー文を `data/raw/<日付>/` に置く（gitignore）。
  - `scripts/lib/normalize.mjs`（純粋関数、副作用なし）で `data/*.json` に正規化する。
  - 失敗した region は例外にせず `fetch-log.json` に `denied` と原文を記録して続行する。
- AWS SDK は使わず `aws` CLI を子プロセスで呼ぶ（runtime 依存を増やさない先例の規約に合わせる）。
- 手元の SSO で手動実行し、生成 JSON をコミットする。CI に AWS 認証は置かない。
- deploy は先例と同じ GitHub Actions（push to main → `npm ci` → `npm test` → `npm run build` → Pages）。
- リポジトリ: `~/workspace/personal/aws-bedrock-quick-reference`、公開 URL は
  `https://koyakimu.github.io/aws-bedrock-quick-reference/`。

### 6.1 取得アカウント（前提タスク）

全リージョンを取るには `bedrock:ListFoundationModels` と `bedrock:ListInferenceProfiles` だけを許可した
**読み取り専用ロールを aws-foundation（統治リポ）で用意する**。monban の git-only フローに従い PR を出し、
ラベル付けと merge は人間が行う。ロールが揃うまでは sandbox プロファイルで取れる region だけ
（東京中心）で進め、denied region は「データなし」として公開してよい。

## 7. テスト

- `scripts/lib/normalize.mjs` の単体テスト（vitest）。fixture は spike 出力を縮めたもの。
  - `ON_DEMAND` / `INFERENCE_PROFILE` / 両方 / 空配列の各ケースが In-Region 判定に正しく落ちる
  - Geo プロファイルの destination 抽出、順序とソート
  - Global プロファイルのリージョン空 ARN が `"*"` になる
  - denied region が `fetch-log.json` に原文付きで残り、`models.json` に混ざらない
- 表の描画とフィルタ、source region 切り替えは jsdom で vitest。
- i18n キー一致テストは先例を流用。
- 目視確認は Playwright MCP のスクリーンショット（リポジトリには入れない）。

## 8. スコープ外

- APPLICATION 型の inference profile（アカウント固有なので載せない）
- 料金、クォータ、Provisioned Throughput の詳細
- docs HTML の scrape
- CI からの自動データ更新
