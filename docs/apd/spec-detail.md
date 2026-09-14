---
spec_id: "DETAIL-001"
context: "detail"
version: 7
issue_ref: null
title: "行の展開によるリージョン横断の詳細表示"
decision_refs:
  - D-003
  - D-005
  - D-008
  - D-009
  - D-010
---

## User Story

**As a** 推論先を根拠付きで説明する必要がある開発者・コンプライアンス担当者
**I want** 表の行を開いて、そのモデルの全リージョン横断の提供状況と、各プロファイルの起点 → 推論先の対応を見たい
**So that** 起点を切り替えて見比べることなく、1 モデルのデータ所在を 1 画面で説明できる

## Acceptance Criteria

### AC-001 (行の展開)
- **Given**: 表が描画されている
- **When**: 行の展開操作（行クリックまたは展開トグル）を行う
- **Then**: その行の直下に詳細パネルが開く。他の行は閉じたままでも複数同時に開けてもよいが、展開状態は起点リージョンを切り替えても対象モデルが表に残っている限り保持する

### AC-010 (モデル ID と使い方ごとの ID を詳細パネルで出す)
- **Given**: モデル M の行を開く
- **When**: 詳細パネルを描画する
- **Then**: パネルの先頭に M の **モデル ID** がコピーボタン付きで出る。TABLE-001 が表から外した識別子は、必ずここから辿れる

### AC-011 (使い方ごとに「指定する ID」を出す)
- **Given**: 起点リージョン R でモデル M の行を開く
- **When**: 詳細パネルを描画する
- **Then**: モデル ID の下に小さな表が出る。列は **種別 / 指定する ID / 推論先リージョン** で、行は R から使える使い方ごとに 1 行
  - In-Region（TABLE-001 AC-003 が「可」のときだけ）: 指定する ID = モデル ID、推論先 = R
  - Geo（TABLE-001 AC-004 の各プロファイル）: 指定する ID = プロファイル ID、推論先 = `sources[R]` の destination 昇順。推論先は「東京 (ap-northeast-1)」のように**表示名とリージョンコードを併記**する（一覧は地名だけなので、コードはここで必ず読める）
  - Global（TABLE-001 AC-005）: 指定する ID = プロファイル ID、推論先 = 「全対応リージョン（今後増えうる）」の注記（`*` は出さない）
  - どの ID にもコピーボタンが付く。クリップボードには ID の文字列だけが入る
  - R からどの使い方もできないときは、空欄にせずその旨を表示する

### AC-013 (価格)
- **Given**: 起点リージョン R でモデル M の行を開く
- **When**: 詳細パネルを描画する
- **Then**: 「この起点からの使い方」の下に **価格** の節が入り、**種別 × 入力 / 出力** の小さな表が出る（PRICE-001 AC-010）
  - 行は **標準 / Global / バッチ / キャッシュ読み / キャッシュ書き / 優先 / Flex** のうち、R に単価があるものだけをこの順で
  - 値は `prices.json.byModel[M][R]` の単価で、単位は **USD / 100 万トークン**。出力側の単価が無い種別（キャッシュ読み・キャッシュ書き）は「—」
  - 表の下に「USD / 100 万トークン。標準価格で、割引・契約価格・無料枠は含まない」の注記
  - R に単価が 1 つも無ければ、空欄にせず「この起点リージョンの価格データがありません」と表示する
  - SKU・`usagetype`・offer code は出さない（PRICE-001 AC-012）

### AC-012 (起点のエンドポイント)
- **Given**: 起点リージョン R でモデル M の行を開く
- **When**: 詳細パネルを描画する
- **Then**: パネルの最後に R の `bedrock-runtime` エンドポイント（例: `bedrock-runtime.ap-northeast-1.amazonaws.com`）が出る。起点を切り替えると値も切り替わる
- **And**: この節は「**接続先**」節として、`bedrock-runtime` と `bedrock-mantle` の 2 つの FQDN・それぞれで呼べる API・Mantle で指定するモデル ID・出典リンクを併せて出す（MANTLE-001 AC-005 / AC-006）

### AC-002 (全リージョン横断の availability)
- **Given**: モデル M の行を開く
- **When**: 詳細パネルを描画する
- **Then**: `region-notes.json` のキー全件について、`models.json[M].availability[<region>]` の値がリージョンごとに表示される。`ON_DEMAND` / `INFERENCE_PROFILE` / `PROVISIONED` はそのままの名前で並べ、`PROVISIONED` も省略せず表示する（3 列の判定には使わないが事実として出す）

### AC-003 (提供なしの表示)
- **Given**: `fetch-log.json.regions[R].status` が `"ok"` で、`models.json[M].availability` に R のキーが無い
- **When**: 詳細パネルを描画する
- **Then**: そのリージョンは「提供なし」と表示される

### AC-004 (空配列の表示)
- **Given**: `availability[R]` が `[]`（spike の `amazon.titan-embed-text-v1:2:8k` 相当）
- **When**: 詳細パネルを描画する
- **Then**: 「提供あり・推論タイプの指定なし」として、提供なしとも 未取得 とも別の表示になる

### AC-005 (プロファイルの起点 → 推論先)
- **Given**: モデル M を対象とするプロファイルが `profiles.json` に複数ある
- **When**: 詳細パネルを描画する
- **Then**: プロファイルごとに `prefix`、プロファイル ID（コピー可能）、`sources` の各起点リージョン → destination リージョン一覧（昇順）が表示される。destination は「東京 (ap-northeast-1)」のように表示名とリージョンコードを併記する。例: `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` は `ap-northeast-1 → 東京 (ap-northeast-1), 大阪 (ap-northeast-3)` と `ap-northeast-3 → 同じ 2 件` の 2 行

### AC-006 (Global の推論先)
- **Given**: `global.` プロファイルの `sources[R]` が `["*"]`
- **When**: 詳細パネルを描画する
- **Then**: destination を列挙せず「全対応リージョン（今後増えうる）」と表示し、公式 docs（global cross-region inference）へのリンクを添える。`*` という文字をそのまま出さない

### AC-007 (現在の起点リージョンの強調)
- **Given**: 起点リージョンが `ap-northeast-1` の状態で行を開く
- **When**: 詳細パネルを描画する
- **Then**: availability 一覧とプロファイルの `sources` 一覧の両方で、`ap-northeast-1` の行が現在の起点として視覚的に区別される

### AC-008 (Error Case: denied リージョンは「未取得」)
- **Given**: `fetch-log.json.regions["us-east-1"].status` が `"denied"`
- **When**: 詳細パネルの availability 一覧を描画する
- **Then**: `us-east-1` は **「未取得」** とだけ表示され、「提供なし」（AC-003）と異なる見た目になる。**取得できなかった理由（`cause`）は本文にもツールチップにも出さず、API のエラー原文を開く脚注も置かない**（D-008。`cause` はメンテナ向けの情報で `fetch-log.json` にのみ残る）。取得できていないだけのリージョンを「提供なし」と表示してはいけない

### AC-009 (Error Case: 対象プロファイルが 1 件も無い)
- **Given**: モデル M に対応するプロファイルが `profiles.json` に 1 件も無い（In-Region のみのモデル）
- **When**: 行を開く
- **Then**: プロファイル節は空欄ではなく「cross-region inference profile なし（モデル ID を直接指定する）」と表示される

## UI Description

- 表の行の展開トグル（`aria-expanded` を持つボタン）。開くと行直下に全幅の詳細パネルが挿入される
- 詳細パネルは 6 節で、上から技術的な識別子 → 価格 → 横断の事実 → 接続先の順に並べる
  1. **モデル ID**: コピーボタン付き（AC-010）
  2. **この起点からの使い方**: 種別 / 指定する ID / 推論先リージョン の小さな表（AC-011）
  3. **価格**: 種別 / 入力 / 出力 の小さな表（AC-013）
  4. **提供状況**: リージョンごとに 1 行。リージョン表示名（コード併記）+ 推論タイプのバッジ、または「提供なし」/「提供あり・推論タイプの指定なし」/「未取得」
  5. **推論プロファイル**: プロファイルごとに、接頭辞バッジ + プロファイル ID（コピー可能）+ 起点 → 推論先の対応行（推論先は表示名 + コードの併記）
  6. **接続先**: 起点リージョンの 2 つの接続先（`bedrock-runtime` / `bedrock-mantle`）の FQDN と呼べる API、Mantle で指定するモデル ID、cross-region inference が使えない旨の注記、出典リンク（AC-012 / MANTLE-001 AC-005・AC-006）
- 現在の起点リージョンの行にマーカーを付ける
- 375px 幅では 2 節を縦積みにし、推論先チップは折り返す

## Context Boundary

### Inputs
- **From**: TABLE-001 — 展開対象のモデル ID、現在の起点リージョン。表から外した識別子（モデル ID / プロファイル ID）の表示はこの Spec が引き受ける
- **From**: DATA-001 — `data/models.json`（`availability`）、`data/profiles.json`（`sources`）、`data/fetch-log.json`（denied 判定）、`data/region-notes.json`（表示名・列挙順・`endpoint`）
- **From**: I18N-001 — 「提供なし」「未取得」等のラベルとリージョン表示名

### Outputs
- **To**: なし（表示のみ。他コンテキストに状態を渡さない）

### Dependencies
- **TABLE-001**: 行の展開操作と起点リージョンの現在値
- **DATA-001**: 表示する全データ

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-010 | integration (jsdom, vitest) | パネル先頭にモデル ID とコピーボタンが出て、コピーされた文字列がモデル ID と完全一致することを検証 |
| AC-011 | unit + integration (vitest, jsdom) | `buildUsageRows(M, { models, profiles, region })` が In-Region / Geo / Global の行を種別・ID・推論先付きで返すことを検証（Global は `*` を返さない / 0 件のケースも）。描画側で 3 列の小表とコピーボタンを検証 |
| AC-012 | integration (jsdom, vitest) | パネル末尾のエンドポイントが起点に追随することを検証。接続先節の中身は MANTLE-001 の AC Coverage が受け持つ |
| AC-013 | unit + integration (vitest, jsdom) | `buildPriceRows(M, { prices, region })` が種別の並びどおりに返し、単価が無ければ空配列になることを検証。描画側で 3 列の小表の中身（ja / en）、出力の無い種別の「—」、単位の注記、価格 0 件のときの説明文を検証 |
| AC-001 | integration (jsdom, vitest) | 展開トグルのクリックでパネルが DOM に挿入され、`aria-expanded` が切り替わることを検証 |
| AC-002 | unit (vitest) | `buildAvailabilityRows(M, regionNotes, fetchLog)` が全リージョン分の行を返し、`PROVISIONED` を落とさないことを検証 |
| AC-003 | unit (vitest) | `status: ok` かつキー無しのリージョンが「提供なし」種別になることを検証 |
| AC-004 | unit (vitest) | 空配列が「提供あり・推論タイプの指定なし」種別になり、提供なし / 未取得 と別種別であることを検証 |
| AC-005 | unit (vitest) | `jp.` プロファイルの fixture で 2 起点分の行が destination 昇順で返ることを検証 |
| AC-006 | unit (vitest) | `["*"]` が注記種別に変換され、`*` の文字列が返り値に含まれないことを検証 |
| AC-007 | integration (jsdom, vitest) | 起点マーカーが該当リージョンの行にだけ付くことを検証 |
| AC-008 | unit + integration (vitest, jsdom) | denied の fixture で「未取得」種別になり、「提供なし」と異なるクラス名で描画されることを検証。`cause` の説明文もエラー原文もパネルに現れないことも検証 |
| AC-009 | integration (jsdom, vitest) | プロファイル 0 件のモデルで説明文が出ることを検証 |
| — (375px 表示) | e2e（Playwright MCP で 375px のスクリーンショットを手動確認） | 詳細パネルが縦積みになり崩れないことを目視。スクリーンショットはリポジトリに入れない |

## Deliverable Previews

- `anthropic.claude-sonnet-4-5-20250929-v1:0` を展開した詳細パネルのスクリーンショット（`jp.` / `apac.` / `global.` と denied リージョンを含むもの）

## 委譲する非機能要件

- **a11y（基本的なキーボード操作性）**: 展開トグルが Tab で到達し Enter / Space で開閉できること、開いたパネルにフォーカス順が続くこと、`aria-expanded` と `aria-controls` が正しいことを**手動チェック**で確認する。合格基準は「マウスを使わずに AC-001 から AC-005 の内容まで読める」
- **セキュリティレビュー: 不要。** 表示のみの静的コンテンツで、扱うデータは AWS の公開情報のみ

## Notes

- 「未取得」と「提供なし」の区別は Design の Success Criteria（混同する表示ゼロ）と FAQ Q3 に対応する、この Spec の中心的な要件
- アカウント固有の `APPLICATION` 型 inference profile は表示しない（Design「What Not」3、技術設計 §8）
- クォータ・ベンチマークは詳細パネルにも出さない（Design「What Not」2・4）。価格は公開価格表の単価だけを出し、試算はしない（Design v2「What Not」1、PRICE-001）

## 変更履歴

- **version 7** (2026-09-14): パネルに **価格** の節を足した（AC-013 を追加）。「この起点からの使い方」の下・「提供状況」の上に 種別 × 入力 / 出力 の小さな表を置き、値は PRICE-001 が作る `data/prices.json` から取る。version 6 で足した「接続先」節はパネル末尾のままで、節の並びは モデル ID → 使い方 → 価格 → 提供状況 → 推論プロファイル → 接続先（価格を接続先より前に置く）。既存の AC-001〜AC-012 は変更しない。理由: Design v2 の「バッチ・キャッシュ・優先度別などの細かい価格は、行を開いたときに見られる」に対応するため（D-009）
- **version 6** (2026-09-14): パネル末尾の「エンドポイント」節を「**接続先**」節に広げ、`bedrock-mantle` の FQDN・呼べる API・Mantle で指定するモデル ID・出典リンクを併せて出すようにした（AC-012 に And を追記、UI Description 5 節を改訂）。AC-001 〜 AC-011 の判定内容は変更しない。節の中身の AC は MANTLE-001 AC-005 / AC-006 が持つ
- **version 5** (2026-09-14): denied リージョンの表示を「データなし」+ 理由の説明文から、**「未取得」だけ**に変えた（AC-008 を改訂）。ツールチップの理由も外した。理由: 取得できなかった分類（組織のポリシー / 権限 / 未有効化）はメンテナ向けの情報で、閲覧者には意味が無いため。`cause` は `fetch-log.json` に残る（D-008 は変更しない）
- **version 4** (2026-09-14): 推論先リージョンの表示を「東京 (ap-northeast-1)」のように表示名とコードの併記に変えた（AC-005 / AC-011 の文言、UI Description 4 節）。理由: TABLE-001 v4 が一覧の Geo 列を地名だけにしたため、リージョンコードを読める場所を詳細パネルに残す必要があるため。AC の判定内容そのものは変えていない
- **version 3** (2026-09-14): TABLE-001 v3 が一覧から外した技術的な識別子の置き場所として、パネル先頭にモデル ID（AC-010）、その下に「種別 / 指定する ID / 推論先リージョン」の表（AC-011）、末尾に起点のエンドポイント（AC-012）を追加した。既存の提供状況・推論プロファイルの 2 節と AC-001〜AC-009（version 2 の `cause` 表示を含む）は変更しない。理由: 非技術者向けの情報順に一覧を並べ替えたことで、一覧から消えた ID を必ず詳細から辿れるようにするため
- **version 2** (2026-09-14): AC-008 の「reason の原文をツールチップ / 脚注リンクから参照できる」を取りやめ、`cause`（取得失敗の分類）の説明文だけを出すようにした（D-008）
- **version 1** (2026-09-14): 初版
