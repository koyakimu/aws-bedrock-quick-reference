---
spec_id: "TABLE-001"
context: "table"
version: 5
issue_ref: null
title: "起点リージョン選択とメイン比較表"
decision_refs:
  - D-001
  - D-003
  - D-004
  - D-008
---

## User Story

**As a** 特定のリージョンを起点に Bedrock を使う開発者・アーキテクト
**I want** 起点リージョンを一つ選ぶだけで、そこから使える全モデルの In-Region / Geo / Global の可否と推論先リージョンを一つの表で見たい
**So that** モデルカードを一枚ずつ開かずに「このモデルは自分のリージョンで使えるか」と「実際にどこで推論されるか」の両方に答えられる

## Acceptance Criteria

### AC-001 (起点リージョンセレクタの既定値)
- **Given**: URL に起点リージョンの指定がない状態でページを開く
- **When**: 初期描画が終わる
- **Then**: 起点リージョンセレクタに `ap-northeast-1`（東京）が選択されており、選択肢は `region-notes.json` のキー全件がリージョンコードと表示名で並ぶ

### AC-002 (エンドポイント表示)
- **Given**: 起点リージョンに `ap-northeast-1` が選択されている
- **When**: 表示を見る
- **Then**: セレクタの近くに `bedrock-runtime.ap-northeast-1.amazonaws.com` が表示され、コピーできる。起点を切り替えると同じ位置の値も切り替わる

### AC-003 (In-Region 判定)
- **Given**: 起点リージョン R、モデル M について `models.json[M].availability[R]` が `ON_DEMAND` を含む
- **When**: 表を描画する
- **Then**: In-Region 列が ✓ と「可」だけの表示になる。`ON_DEMAND` を含まない場合（`INFERENCE_PROFILE` のみ、`PROVISIONED` のみ、空配列）は ✕ と「不可」になる。**モデル ID はセルに出さない**（指定する ID は DETAIL-001 の詳細パネルで見る）

### AC-004 (Geo 判定と推論先の地名表示)
- **Given**: 起点リージョン R について、`profiles.json` に接頭辞が `us.` / `eu.` / `apac.` / `au.` / `jp.` のいずれかで `modelId` が M、かつ `sources` に R を持つプロファイル P がある
- **When**: 表を描画する
- **Then**: Geo 列に、プロファイル P ごとに 1 ブロックが出る。ブロックの見出しは P の接頭辞から導いた**地理圏の平易な名前**（`jp` = 日本国内 / `apac` = アジア太平洋 / `us` = 米国 / `eu` = EU / `au` = オーストラリア）、本文は `sources[R]` の destination リージョンを `region-notes.json` の `ja` / `en` の**地名**で「 ・ 」（en: `, `）で連ねたもの。同じ M に対し複数の Geo プロファイルがあれば全てのブロックを並べる。該当が無ければ「不可」
  - **リージョンコードはセルに出さない**（コードと表示名の併記は DETAIL-001 の詳細パネルで見る）。判定の根拠は `data-region` / `data-profile-id` の data 属性として残す
  - **プロファイル ID はセルに出さない**（DETAIL-001 の詳細パネルで見る）
  - 並びは **起点リージョン → 起点と同じ国（`region-notes.json` の `country`）→ それ以外** の順で、各段の中は表示名の昇順（その言語の照合順）
  - 起点リージョンの `country` と異なる国にある推論先は**視覚的に区別**し（淡色ではなく注意色）、その件数 N が 1 以上のときブロックの末尾に「（国外 N）」（en: `(N outside country)`）を出す。同じ国の推論先には印も件数も付けない。起点の `country` が分からないときはどれも国外扱いにしない
  - FILTER-001 の「限定外」の印はブロック単位で付く（プロファイルごとの判定なので AC-005 / AC-008 の挙動は変わらない）

例（起点 `ap-northeast-1`、ja）:

```
日本国内
 東京 ・ 大阪
アジア太平洋
 東京 ・ 大阪 ・ シドニー ・ シンガポール ・ ソウル ・ ムンバイ （国外 4）
```

### AC-005 (Global 判定と注記)
- **Given**: 起点リージョン R について、接頭辞 `global.` で `modelId` が M、`sources` に R を持つプロファイル P がある
- **When**: 表を描画する
- **Then**: Global 列に ✓ が出て、destination は列挙せず「全世界の対応リージョン（今後増えうる）」の注記と公式 docs へのリンクが付く。`sources[R]` が `["*"]` であることを destination 列挙の代わりに使う。**プロファイル ID はセルに出さない**（DETAIL-001 の詳細パネルで見る）

### AC-006 (表の列構成)
- **Given**: 起点リージョンが選択されている
- **When**: 表を描画する
- **Then**: 列が左から **プロバイダ / モデル名 / できること / In-Region / Geo / Global / 備考** の順で並ぶ。1 行 = 1 モデル。モデル名は API の `modelName`（例: `Claude Sonnet 4.5`）、備考は `overrides.json` の該当エントリ（無ければ空）。行は プロバイダ → モデル名 の昇順で並ぶ。**Model ID 列と lifecycle 列は表に持たない**（AWS を知らない人が最初に読む情報から並べるため。技術的な識別子は DETAIL-001 の詳細パネルへ移す）

### AC-007 (表にコピーボタンを置かない)
- **Given**: 起点リージョンが選択され、表が描画されている
- **When**: 表の本体（`thead` / `tbody`）を見る
- **Then**: モデル ID もプロファイル ID もコピーボタンも表の中には無い。ID のコピーは DETAIL-001 の詳細パネルで行う（DETAIL-001 AC-010 / AC-011）。起点リージョンのエンドポイントのコピー（AC-002）は表の外なのでそのまま残る

### AC-008 (脚注)
- **Given**: ページを開く
- **When**: 表の下を見る
- **Then**: `fetch-log.json` の `generatedAt`（取得日時）、`accountKind`、「未取得のリージョン」の見出しの下に `status` が `denied` のリージョンの一覧（取得できなかった理由は書かない）、および出典 docs（ListFoundationModels / ListInferenceProfiles / geographic cross-region inference / global cross-region inference / Bedrock エンドポイント）へのリンクが表示される

### AC-009 (Error Case: 未取得のリージョンを選んだとき)
- **Given**: `fetch-log.json.regions["us-east-1"].status` が `"denied"` の状態で、起点リージョンに `us-east-1` を選ぶ
- **When**: 表を描画する
- **Then**: 表の上にバナーが出て、見出し「このリージョンのデータはまだ取得できていません」と本文「提供がないという意味ではありません。取得済みのリージョンを選ぶと表を表示できます。」の 2 文だけが表示される。**取得できなかった理由（`cause`）も、アカウント・権限・オプトインに触れる文言も表示しない**（D-008。`cause` はメンテナ向けの情報で `fetch-log.json` にのみ残る）。表は 0 行になり、「提供なし」とは異なる見た目（バナー付きの空状態）になる。空の表を無言で出してはいけない
- **And**: 起点リージョンのセレクタでは、未取得のリージョンも選べるまま、選択肢のラベルに「（未取得）」の接尾辞が付く

### AC-010 (Error Case: 取得済みだがモデルが 0 件)
- **Given**: `fetch-log.json.regions[R].status` が `"ok"` で `models` が 0
- **When**: そのリージョンを選ぶ
- **Then**: 「このリージョンでは提供なし」と表示される。AC-009 の「未取得」バナーは出ない

### AC-011 (「できること」の平易な表記)
- **Given**: モデル M の `input` / `output` に `TEXT` / `IMAGE` / `VIDEO` / `SPEECH` / `EMBEDDING` が入っている
- **When**: 表を描画する
- **Then**: 「できること」列に、列挙子ではなく**その言語の平易な語**で「入力 → 出力」が出る（ja: `テキスト・画像 → テキスト` / `テキスト → 埋め込み` / `音声 → 音声・テキスト`、en: `Text, Image → Text`）。対応表は I18N-001 の辞書に置き、両言語で同じキー集合を持つ

### AC-012 (旧版タグ)
- **Given**: モデル M の `lifecycle` が `LEGACY`
- **When**: 表を描画する
- **Then**: モデル名の右に小さなタグ「旧版」（en: `Legacy`）が付く。`ACTIVE` のモデルにはタグを付けない（既定が現行なので印は要らない）

### AC-NFR-001 (スマートフォン幅)
- **Given**: ビューポート幅 375px
- **When**: 表を描画する
- **Then**: 表は横スクロールで全列を読め、ページ全体の横スクロールやセルの重なり・はみ出しといったレイアウト崩れが 0 件。**モデル名列**は横スクロール時も固定表示にする（プロバイダ列とともに左端に配置する）。Geo 列の地名の並びは自然に折り返す（AC-004 のブロックが縦に伸びるだけで、ページ本体は横に伸びない）

### AC-NFR-002 (描画性能)
- **Given**: spike 相当の 68 モデル × 34 プロファイル
- **When**: 起点リージョンを切り替える
- **Then**: 再描画が 200ms 未満で完了する（`performance.now()` で計測）

## UI Description

- **上部**: 起点リージョンセレクタ（既定 `ap-northeast-1`）。右隣に選択中リージョンの `bedrock-runtime` エンドポイントと取得状況（取得日時 / ok・denied）。denied のときは表の直上に警告バナー
- **本体**: 1 つの表。行 = モデル、列 = プロバイダ / モデル名 / できること / In-Region / Geo / Global / 備考
  - モデル名セル: `modelName`（+ `LEGACY` なら「旧版」タグ）。プロバイダ列とともに左端に固定する
  - できることセル: 入力 → 出力 を平易な語で（例: テキスト・画像 → テキスト）
  - In-Region セル: ✓ / ✕ のみ
  - Geo セル: プロファイルごとのブロック。見出しが地理圏の平易な名前、本文が推論先の地名の並び（「 ・ 」区切り）。起点の国の外の地名は注意色にし、末尾に「（国外 N）」を添える。リージョンコードは出さない
  - Global セル: ✓ + 「全世界の対応リージョン」注記（docs リンク付き）
  - 不可のセルは ✕ または「—」で、未取得とは別の見た目
  - 表の中に ID とコピーボタンは置かない。行を開くと DETAIL-001 が技術的な識別子を出す
- **下部**: 脚注（取得日時、accountKind、未取得のリージョン一覧、出典リンク）
- 表の描画は先例の `table-engine.js` 相当の汎用モジュールで行い、Bedrock 固有の知識を持たせない（列定義とセルレンダラを外から渡す）

## Context Boundary

### Inputs
- **From**: DATA-001 — `data/models.json`、`data/profiles.json`、`data/fetch-log.json`、`data/region-notes.json`、`data/overrides.json`
- **From**: SHARE-001 — URL クエリで指定された起点リージョン（あれば既定値より優先）
- **From**: I18N-001 — 列ヘッダ・注記・リージョン表示名の翻訳辞書

### Outputs
- **To**: FILTER-001 — 起点リージョン R と、R から見た全行のデータ（絞り込みの母集団）
- **To**: DETAIL-001 — 行に対応するモデル ID（詳細展開の対象。表には出さないが `data-model-id` として行に持つ）
- **To**: SHARE-001 — 起点リージョンの変更イベント

### Dependencies
- **DATA-001**: 表示するデータの全て。手編集された生成物は読まない前提
- **I18N-001**: 表示文言。データ値（モデル ID、リージョンコード）は翻訳しない

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | 初期描画後のセレクタの `value` と選択肢件数を検証 |
| AC-002 | integration (jsdom, vitest) | 起点切り替え前後のエンドポイント文字列を検証 |
| AC-003 | unit + integration (vitest, jsdom) | 判定関数 `judgeInRegion(models, M, R)` を 4 ケース（ON_DEMAND のみ / INFERENCE_PROFILE のみ / 両方 / 空配列）で検証し、描画側でセルに ID が出ないことを検証 |
| AC-004 | unit + integration (vitest, jsdom) | `judgeGeo(profiles, M, R)` が接頭辞 5 種を拾い、destination が昇順であることを検証。複数プロファイルのケースも含む。`geoPlaces(destinations, { region, regionNotes, lang })` が 起点 → 同じ国 → それ以外 の順に地名を並べ、`outsideCount` が国外の件数を返すことを検証（ja / en、国外 0 件、起点の国が不明のケースを含む）。描画側で地理圏の平易な名前と地名が出て、プロファイル ID もリージョンコードもセルに現れないこと、国外の地名に印と「（国外 N）」が付くことを検証 |
| AC-005 | unit (vitest) | `judgeGlobal` が `global.` のみを拾い、`["*"]` を destination 列挙に展開しないことを検証 |
| AC-006 | integration (jsdom, vitest) | 描画された `<th>` の並び（7 列）と 1 行分のセル内容、行の並び順（プロバイダ → モデル名）を検証 |
| AC-007 | integration (jsdom, vitest) | 表の中に `.copy-btn` と `.copyable` が 0 個であること、エンドポイントのコピーボタンは残っていることを検証 |
| AC-008 | integration (jsdom, vitest) | 脚注に `generatedAt` / `accountKind` / 「未取得のリージョン」の見出しと該当リージョン名 / 出典リンク数が出ることと、理由の文が出ないことを検証 |
| AC-009 | integration (jsdom, vitest) | denied の fixture でバナーの有無・2 文の文言・選択肢の「（未取得）」接尾辞・表 0 行を検証。併せて画面上に `cause` の説明文もエラー原文（`AccessDenied` / `arn:aws` など）も現れないことを検証 |
| AC-010 | integration (jsdom, vitest) | `ok` かつ 0 件の fixture で「提供なし」表示になり、バナーが出ないことを検証 |
| AC-011 | integration (jsdom, vitest) | ja / en の両方で「できること」セルの文字列を検証（列挙子が出ないこと） |
| AC-012 | integration (jsdom, vitest) | `LEGACY` の行にだけタグが付くことを検証 |
| AC-NFR-001 | e2e（Playwright MCP で 375px のスクリーンショットを手動確認） | `document.documentElement.scrollWidth <= clientWidth` を評価し、スクリーンショットでセルの重なりが無いことを目視。結果はリポジトリに入れない |
| AC-NFR-002 | 計測 (vitest, jsdom) | 68 モデルの fixture で再描画時間を `performance.now()` で 5 回測り中央値 < 200ms |

## Deliverable Previews

- 起点 `ap-northeast-1` での表のスクリーンショット（デスクトップ幅・375px 幅の 2 枚）
- denied リージョン選択時のバナー表示のスクリーンショット

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 起点リージョンセレクタ、コピーボタン、行の展開トグルが Tab で到達でき Enter / Space で操作できること、フォーカスリングが見えることを**手動チェック**で確認する。自動テストは持たない。合格基準は「マウスを使わずに AC-001 → AC-007 → DETAIL-001 の行展開まで到達できる」
- **セキュリティレビュー: 不要。** 認証も入力の保存もサーバも持たない静的 HTML 1 枚で、扱うデータは AWS の公開情報のみ。`/security-review` は回さない

## Notes

- 判定ルールは技術設計 §3 をそのまま実装する。docs の HTML を scrape して補正することはしない
- `PROVISIONED` は 3 列の判定に使わない（DETAIL-001 の availability 表示には出す）
- Global の destination を推測して列挙しない（Design FAQ Q6）
- 料金・クォータ・性能比較は列に持たない（Design「What Not」1・2・4）

## 変更履歴

- **version 5** (2026-09-14): 未取得のリージョンについて、取得できなかった理由（`cause` の説明文）を画面から全て外した（AC-009 を改訂、AC-008 の脚注の文言を調整）。バナーは「このリージョンのデータはまだ取得できていません」と「提供がないという意味ではありません。取得済みのリージョンを選ぶと表を表示できます。」の 2 文だけにし、起点リージョンのセレクタでは選択肢に「（未取得）」の接尾辞を付ける。脚注は「未取得のリージョン」の見出しで一覧だけを残す。理由: 組織のポリシー・権限・オプトインといった分類は取得作業をするメンテナ向けの情報で、閲覧者には意味が無く、かえって「使えないリージョン」と誤読されるため。`cause` は `fetch-log.json` に残す（D-008 は変更しない）
- **version 4** (2026-09-14): Geo 列の推論先を、リージョンコードのチップから `region-notes.json` の地名の並びに変えた（AC-004 を改訂、AC-NFR-001 に折り返しの条件を追記）。プロファイルごとに「地理圏の見出し + 地名の並び」のブロックにし、起点リージョンの国（`country`）の外にある推論先を注意色で区別して「（国外 N）」の件数を添える。並びは 起点 → 同じ国 → それ以外（表示名の昇順）。コードと表示名の併記は DETAIL-001 v4 の詳細パネルが引き受ける。理由: AWS のリージョンコードを読まない読み手に「実際にどこで推論されるか」を地名で伝え、国外に出る推論先を見落とさないようにするため。判定ルール（D-003）・列構成・絞り込み・URL 共有・脚注・denied バナーは変更しない
- **version 3** (2026-09-14): 非技術者向けの情報順に列を並べ替えた。プロバイダ → モデル名 → できること → In-Region / Geo / Global → 備考 とし、Model ID 列・lifecycle 列・表中のコピーボタンを外して技術的な識別子を DETAIL-001 の詳細パネルへ移した（AC-003 / AC-004 / AC-005 / AC-006 / AC-007 / AC-NFR-001 を改訂、AC-011「できること」の平易な表記と AC-012 旧版タグを追加）。理由: AWS を知らない読み手が最初に読む情報（誰が作ったどのモデルで、何ができるか）から並べるため。判定ルール（D-003）・絞り込み・URL 共有・脚注・denied バナー（version 2 の `cause` 表示）は変更しない
- **version 2** (2026-09-14): AC-009 のバナーを、API のエラー原文の表示から `cause`（取得失敗の分類）の説明文の表示に改めた（D-008）
- **version 1** (2026-09-14): 初版
