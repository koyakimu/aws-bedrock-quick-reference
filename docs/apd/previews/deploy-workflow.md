# `.github/workflows/deploy.yml` の構成

- Spec: DEPLOY-001（AC-001 / AC-004 / AC-005 / AC-006 / AC-008）、判断: D-001 / D-002
- 実装: `.github/workflows/deploy.yml`、検証: `tests/deploy-workflow.test.js`
- 先例: `~/workspace/personal/aws-gpu-quick-reference/.github/workflows/deploy.yml`

## トリガー

| イベント | 条件 |
|---|---|
| `push` | `main` ブランチのみ。PR では走らない |
| `workflow_dispatch` | 手動実行（データを取り直してコミットした後の再公開用） |

先例にある cron のデータ自動更新ワークフローは**作らない**（Spec Notes / 技術設計 §8）。

## permissions（AC-005）

| キー | 値 | 用途 |
|---|---|---|
| `contents` | `read` | チェックアウト |
| `pages` | `write` | Pages への公開 |
| `id-token` | `write` | `actions/deploy-pages` の OIDC |

この 3 つだけをワークフロー全体に宣言し、ジョブ単位の上書きは持たない。

## concurrency

```yaml
concurrency:
  group: "pages"
  cancel-in-progress: false
```

同時に 2 つの公開が走らないようにする。進行中の deploy は切らない（切ると公開が中途半端な
状態で終わりうるため）。

## ジョブとステップ

### `build`（ubuntu-latest）

| # | ステップ | 内容 |
|---|---|---|
| 1 | `actions/checkout@v4` | リポジトリを取得。`data/*.json` はコミット済みのものをそのまま使う |
| 2 | `actions/setup-node@v4` | `node-version: 22` / `cache: npm` |
| 3 | `run: npm ci` | `package-lock.json` 通りに devDependencies を入れる（`dependencies` は空） |
| 4 | `run: npm test` | 全 Spec の unit / integration テスト。**1 つでも落ちればここで停止**（AC-006） |
| 5 | `run: npm run build` | `dist/index.html` を 1 ファイル出力（AC-002） |
| 6 | `actions/upload-pages-artifact@v3` | `path: dist` |

先例にある「Copy static assets」ステップは持たない。OGP 画像が無く、`data/` を `dist/`
へコピーすると単一 HTML（AC-002）が崩れるため。

### `deploy`（ubuntu-latest, `needs: build`）

| # | ステップ | 内容 |
|---|---|---|
| 1 | `actions/deploy-pages@v4`（`id: deployment`） | `environment: github-pages`、`url` に `page_url` |

## AWS に触らない（AC-004）

- `aws-actions/*` を使わない。`uses` は `actions/*` のみ
- `AWS_ACCESS_KEY_ID` などの環境変数、`role-to-assume`、`secrets.*` の参照をどこにも置かない
- CI からデータを取得しない。`scripts/fetch-bedrock-snapshot.mjs` は手元の SSO でのみ実行する（D-002）

## 生データを混ぜない（AC-008）

- `data/raw/` は `.gitignore` 済みでリポジトリに入らない。ワークフローも `data/raw` を参照しない
- 成果物は `dist/` のみ

## 所要時間（AC-NFR-001）

push から公開反映まで 5 分以内。実測は main へのマージ後に Actions の run 時間で確認する
（PR 上では計測できない）。
