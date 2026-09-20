# Amazon Bedrock Quick Reference

Amazon Bedrock の **モデル × 起点リージョン × 推論が実際に行われる場所** を 1 つの表で
確認できる静的サイトです。

公式 docs のモデル別リージョン表にある **In-Region / Geo / Global** の 3 区分を表の中心に置き、
「このリージョンから呼べるか」だけでなく「呼んだ推論がどこで実行されうるか」まで一目で分かる
ようにしています。

**URL**: https://koyakimu.github.io/aws-bedrock-quick-reference/

## 特徴

- 起点リージョンを選ぶと、そのリージョンから使えるモデルを In-Region / Geo / Global の 3 列で表示
- Geo の行は推論プロファイルの **推論先リージョン（destination）** をチップで列挙
- 「日本国内のみ」「APAC 内のみ」といった **推論先の限定** で絞り込み
- 提供元・モダリティ・名前の部分一致・「この起点から呼べるものだけ」の絞り込み
- 行を展開すると、そのモデルの **全リージョン横断の提供状況** と推論プロファイルの起点 → 推論先を表示
- **「提供なし」と「データなし」を区別して表示**（取得できなかったリージョンは理由の原文付き）
- 日本語 / 英語の切り替え、ライト / ダークテーマ
- 起点リージョンと絞り込み条件が URL に載るので、そのまま共有できる

## 表示しているのはスナップショット

画面に出ているのは取得日時が明示された**スナップショット**で、リアルタイムの API 結果では
ありません。取得日時はヘッダに表示されます。

現在のスナップショット（2026-09-14）は sandbox アカウントで取得したため、
**取得できたのは `ap-northeast-1` の 1 リージョンだけ**で、残り 32 リージョンは
「データなし」として記録されています（`docs/apd/decisions.md` の D-005）。

## ローカル開発

Vite + vite-plugin-singlefile でビルドし、`dist/index.html` に単一 HTML を出力します。
ランタイム依存はありません（`package.json` の `dependencies` は空）。

```bash
git clone https://github.com/koyakimu/aws-bedrock-quick-reference.git

npm install

npm run dev      # 開発サーバー
npm test         # vitest で単体・結合テスト
npm run build    # dist/index.html に単一 HTML を出力
npm run preview  # ビルド結果のプレビュー
```

## データ更新

`data/models.json` / `data/profiles.json` / `data/fetch-log.json` は
`scripts/fetch-bedrock-snapshot.mjs` の生成物で、**手編集は禁止**です。
取得は手元の SSO で手動実行し、CI に AWS 認証情報は置きません。

```bash
aws sso login --profile <名前>
node scripts/fetch-bedrock-snapshot.mjs --profile <名前> --account-kind sandbox
```

対象リージョンの列挙・`region-notes.json` / `overrides.json` の直し方・denied リージョンの
扱いなど、更新手順の詳細は [`CLAUDE.md`](./CLAUDE.md) の「データ更新」節にまとめてあります。

## デプロイ

`main` への push で `.github/workflows/deploy.yml` が `npm ci` → `npm test` →
`npm run build` → GitHub Pages への公開まで実行します。テストが落ちれば公開されません。
ワークフローの構成は [`docs/apd/previews/deploy-workflow.md`](./docs/apd/previews/deploy-workflow.md) を参照。

## ドキュメント

- 仕様: `docs/apd/spec-*.md`（DATA-001 / TABLE-001 / FILTER-001 / DETAIL-001 / I18N-001 / SHARE-001 / DEPLOY-001）
- プロダクト設計: `docs/apd/design.md`
- 判断の記録: `docs/apd/decisions.md`（D-001〜D-008）
- 成果物プレビュー: `docs/apd/previews/`
- 技術設計: `docs/superpowers/specs/2026-09-14-bedrock-quick-reference-design.md`

## 公式ドキュメント

- [Amazon Bedrock endpoints and quotas (AWS General Reference)](https://docs.aws.amazon.com/general/latest/gr/bedrock.html)
- [Supported foundation models in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html)
- [Inference profiles (cross-region inference)](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html)
- [Regional availability reference (AWS Account Management)](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html)

## ライセンス / 免責

本サイトは AWS 公式のものではありません。掲載内容は取得時点のスナップショットであり、
最新の正確な情報は上記の公式ドキュメントを参照してください。

### 表示と並び順

起点リージョンの概要とモデル比較表、地図による推論先表示を利用できます。
Geoはプロファイルの推論先、In-Regionは起点内の経路、Globalは世界への振り分けの
概念図を表示します。提供なしの方式では地図を表示しません。
「並び順 → 新しい順」はBedrock提供開始日順で、`?sort=newest` として共有できます。

モデル別のログ保存の例外と公式発売日の補正は `data/model-policies.json` に出典付きで管理します。
地図の説明・出典には、推論入出力の移動とログ記録先を区別して記載しています。
