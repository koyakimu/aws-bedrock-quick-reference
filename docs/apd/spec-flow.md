---
spec_id: "FLOW-001"
context: "flow"
version: 1
issue_ref: null
title: "データの流れ図（In-Region / Geo / Global）"
decision_refs:
  - D-003
  - D-012
  - D-013
  - D-014
---

## User Story

**As a** 顧客や情シスから「データはどこへ行くのか」を問われる開発者・コンプライアンス担当者
**I want** 使い方（In-Region / Geo / Global）ごとに、データがどの境界の内側で処理され、記録がどこに残るかを 1 枚の図で見たい
**So that** リージョンコードの一覧ではなく「国の外に出るか出ないか」という問いの形のまま、根拠付きで説明できる

## Acceptance Criteria

### AC-001 (図は使い方ごとに 1 枚)
- **Given**: DETAIL-001 v8 の詳細パネルでレーン（In-Region / Geo / Global）のタブを選ぶ
- **When**: そのタブパネルを描画する
- **Then**: パネルの先頭に、そのレーン専用の図が 1 枚出る。図は **手書きのインライン SVG** で、`figure` > `div`（横スクロールの入れ物）> `svg` + `figcaption` の構造を持つ。`svg` は `role="img"` と `aria-label` を持ち、`aria-label` にはその図が主張している内容を 1 文以上の日本語（英語表示では英語）で書く
  - 外部の作図ライブラリを使わない（D-001。`package.json` の `dependencies` は空のまま）
  - SVG の中に `<style>` を置かない。色・線幅・書体はすべて CSS クラス（`.s-*`）で当て、値は `tokens.css` の変数から取る。ライト / ダークの両方で読めること
  - Geo プロファイルが同じ起点に複数あるときは、プロファイルごとに 1 枚（DETAIL-001 v8 AC-006）

### AC-002 (共通の語彙)
- **Given**: どのレーンの図か
- **When**: 図を描画する
- **Then**: 次の要素が共通の意味で現れる。レーンごとに意味を変えない

  | 要素 | 意味 | 位置 |
  |---|---|---|
  | 「あなた」ノード | 呼び出し元 | **すべての境界の外側**。境界の中に描いてはいけない |
  | 境界（enclosure） | データが出ない範囲 | 左の壁に**ゲートが 1 つだけ**開いている |
  | 実線の矢印「リクエスト」 | 往路 | 「あなた」からゲートを通って起点ノードへ |
  | 破線の矢印「応答」 | 復路 | **同じゲート**を通って「あなた」へ戻る。図の下に「応答は同じ経路で戻る」 |
  | 起点ノード | 起点リージョン | 境界の内側。**アクセント色はここだけ**に使う。リージョン表示名 + リージョンコード + `bedrock-runtime` の FQDN + 「起点リージョン」 |
  | 「記録」ノード | 記録の所在 | 起点ノードの直下・境界の内側。3 行で「CloudTrail（処理先を記録）」「CloudWatch ・ 呼び出しログ」「請求 ・ バッチ出力」。右にアクセント色のタグ「＜起点の地名＞に残る」 |

- **And**: 「データが留まる」ことを表す要素には yes 系のトークン（`--yes-*`）、「国の外に出る」ことを表す要素には warn 系のトークン（`--warn-*`）を使う。アクセント色は起点にしか使わない

### AC-003 (In-Region の図)
- **Given**: In-Region のレーンの図を描画する
- **When**: 図を見る
- **Then**: 境界は **1 つだけ**で、yes 色の実線、見出しは「＜起点の地名＞リージョン」。内側に 起点ノード / 「ここで処理」ノード（起点の地名のチップ 1 つ）/ 「記録」ノードが入る
- **And**: そのモデルが起点で直接提供されていない（In-Region 不可）ときは、境界の内側をまとめて淡色にし、境界の外の下部に「このモデルは＜起点の地名＞で直接提供なし」を出す。図そのものは消さない（DETAIL-001 v8 AC-004）

### AC-004 (Geo の図)
- **Given**: Geo のレーンで、起点 R のプロファイル P の図を描画する
- **When**: 図を見る
- **Then**: 境界が **2 重**になる
  - 外側: 実線の境界。見出しは**地理圏の名前**（「APAC 地理圏」「EU 地理圏」…）。名前は P の接頭辞から I18N-001 の辞書で引き、辞書に無ければ接頭辞をそのまま出す（D-012）
  - 内側: yes 色の実線の境界。見出しは**起点の国の名前**（`region-notes.json` の `country` から引く。「日本」など）。内側に 起点ノード / 「記録」ノード / **国内の推論先のチップ**（先頭の「国内 N」の見出し付き）が入る
  - 2 つの境界の**あいだ**に、**国外の推論先のチップ**（warn 色）が「国外 M」の見出し付きで並ぶ。「＜地理圏＞ 内のどこかで処理」と「どれが選ばれるかは指定できない」を添える
  - 国内 / 国外の切り分けは `region-notes.json` の `country` で行う。起点の `country` が分からないときは内側の境界を描かず、全チップを国内扱いにも国外扱いにもしない（TABLE-001 AC-004 と同じ方針）
- **And**: 国外が 0 件のときも外側の境界は描き、「国外 0」ではなく国外のチップ群ごと省く

### AC-005 (Global の図)
- **Given**: Global のレーンの図を描画する
- **When**: 図を見る
- **Then**: 外側の境界は **warn 色の破線で、右の壁が無い**（上下の辺が `viewBox` の右端で切れて閉じない）。見出しは「全商用リージョン ・ 境界なし」
  - 内側に yes 色の実線の境界があり、見出しは「＜起点の地名＞ ・ 記録が残る場所」。中に 起点ノードと「記録」ノードが入る
  - 右へ向かって**淡くなっていくサンプルのチップ**（地名の例示）が並び、「国外を含む ・ 限定できない」「右に壁がない ＝ 範囲を限定できない」を添える
  - チップの地名が**例示**であることを `figcaption` に必ず書く。個別の推論先リージョンは API から取れないため列挙してはいけない（D-003、Design FAQ Q6）

### AC-006 (国外に出るレーンの警告)
- **Given**: Geo または Global のレーンの図を描画する
- **When**: 図を見る
- **Then**: 図の中に warn 色で「不正利用検知で保存される入出力は推論先に置かれうる」が出る。In-Region の図にはこの文を出さない

### AC-007 (figcaption と出典)
- **Given**: どのレーンの図か
- **When**: 図の下を見る
- **Then**: `figcaption` に図の主張を 1〜2 文で書き、その下に淡色の **出典** の行が出る。出典の行は参照した AWS docs のページ名を並べ、**推定に基づく主張があるときはその旨を明記**する（AC-008）

### AC-008 (主張と根拠の対応)
- **Given**: 図・`aria-label`・`figcaption`・出典の行に書く主張
- **When**: 文言を決める
- **Then**: 次の表に載っている主張だけを書く。**根拠が「推定」の主張は、画面上でも「推定」と分かる言い方にする**（D-014）

  | # | 主張 | 根拠 | 出典（Bedrock ユーザーガイド） |
  |---|---|---|---|
  | C-1 | cross-Region inference のリクエストは**すべて起点リージョンの CloudTrail に記録**される。`additionalEventData.inferenceRegion` に実際に処理されたリージョンが入る | **明示** | `cross-region-inference.html` |
  | C-2 | CloudWatch と CloudTrail は**引き続き起点リージョンで記録**する | **明示**（ただし `global-cross-region-inference.html` にしか書かれていない） | `global-cross-region-inference.html` |
  | C-3 | **料金は起点リージョンの単価**で計算される | **明示** | `cross-region-inference.html` |
  | C-4 | **バッチの出力ファイルは起点リージョンの S3 バケット**に置かれる | **明示** | `cross-region-inference.html` |
  | C-5 | モデル呼び出しログ（model invocation logging）の出力先は**設定と同じアカウント・同じリージョン**に限られる → ログは起点リージョンに残る | **推定**。`model-invocation-logging.html` は cross-Region inference に一切触れていない | `model-invocation-logging.html` |
  | C-6 | 不正利用検知のために保存される入出力は、**推論先リージョンに置かれうる**（有効化していない opt-in リージョンを含む） | **明示** | `inference-profiles-support.html` / `data-retention.html` |
  | C-7 | 地理圏プロファイルでは「データは元々存在する AWS リージョンに留まる。既定では起点リージョンにのみ保存される。ただし入力プロンプトと出力結果は cross-Region inference の際に起点リージョンの外へ移ることがある」 | **明示**（引用） | `geographic-cross-region-inference.html` |
  | C-8 | 転送中のデータは **AWS のネットワーク内に留まり、暗号化**される | **明示** | `cross-region-inference.html` |

- **And**: C-5 を画面に出すときは「呼び出しログの所在は『出力先は同一リージョン限定』からの**推定**」と書く。断定形で書いてはいけない
- **And**: この表に無い主張を図に足すときは、先に出典を読んで表に行を足す。**記憶で足さない**（CLAUDE.md の転記の規約と同じ）

### AC-009 (i18n)
- **Given**: 言語を英語に切り替える
- **When**: 図を再描画する
- **Then**: 図の中の全テキスト（境界の見出し、ノードのラベル、「国内 N」「国外 M」、注記、`aria-label`、`figcaption`、出典の行）が英語になる。翻訳しないのは リージョンコード / FQDN / モデル ID / プロファイル ID のみ
- **And**: 文言は I18N-001 の辞書に `flow.*` のキーで持つ。SVG の中に文字列を直書きしない

### AC-010 (Error Case: 推論先が 0 件のプロファイル)
- **Given**: Geo のプロファイル P の `sources[R]` が空配列
- **When**: 図を描画する
- **Then**: 内側の境界と起点ノード・記録ノードは描き、推論先のチップを 1 つも描かない。国内 / 国外の件数の見出しも出さない。例外で描画が止まらない

### AC-NFR-001 (横スクロール)
- **Given**: ビューポート幅 375px
- **When**: 図を描画する
- **Then**: 図の入れ物だけが `overflow-x: auto` で横スクロールし、ページ本体は横スクロールしない。`svg` の `min-width` は 780px、既定の幅は 820px、高さは `height: auto` で縦横比を保つ

### AC-NFR-002 (reduced motion)
- **Given**: `prefers-reduced-motion: reduce`
- **When**: レーンのタブを切り替える
- **Then**: タブパネルのフェードを含め、図に関わるアニメーションが一切走らない

## UI Description

- 図は `figure.flow` > `div.flow-scroll` > `svg` + `figcaption` + `p.note-muted`（出典）の 4 要素
- SVG の中身は `defs`（矢印の marker）→ 境界 → 「あなた」→ 往復の矢印 → 起点ノード → 推論先チップ → 記録ノード → 注記 の順に描く。後から描いたものが上に乗る
- 色の役割は 3 つだけ:
  - **アクセント**: 起点（起点ノード、「＜起点＞に残る」タグ、リクエストの矢印）
  - **yes**: 留まる範囲（In-Region の境界、Geo / Global の内側の境界、国内のチップ）
  - **warn**: 国の外に出るもの（国外のチップ、Global の開いた壁、不正利用検知の注記）
- 図は 820px 幅の `viewBox="0 0 820 280"` を基準にする。Geo で推論先が多いときは高さを伸ばし、幅は変えない

## Context Boundary

### Inputs
- **From**: DETAIL-001 — 描画するレーンの種別、起点リージョン R、対象のプロファイル P（Geo のとき）
- **From**: DATA-001 — `data/profiles.json`（`sources[R]`）、`data/region-notes.json`（表示名・`country`・`endpoint`）、`data/models.json`（In-Region の可否）
- **From**: I18N-001 — `flow.*` の文言、地理圏名・国名・リージョン表示名

### Outputs
- **To**: なし（表示のみ）

### Dependencies
- **DETAIL-001**: 図を置く場所（レーンのタブパネル）とレーンの選択
- **DATA-001**: 推論先と国の判定材料
- **I18N-001**: 図の中の全テキスト

## Test Strategy

### AC Coverage

| AC ID | Test Type | Description |
|-------|-----------|-------------|
| AC-001 | integration (jsdom, vitest) | 各レーンのタブパネルに `figure.flow > .flow-scroll > svg` が 1 つあり、`svg` に `role="img"` と空でない `aria-label` があること、`svg` の中に `<style>` も `style` 属性も無いことを検証。Geo に 2 プロファイルある fixture で図が 2 枚になることも検証 |
| AC-002 | unit + integration (vitest, jsdom) | `buildFlowFigure(lane, ctx)` が返すノードの集合に「あなた」「起点」「記録」が必ず含まれること、「あなた」の座標がどの境界の矩形にも含まれないことを検証。記録ノードの 3 行の文字列と「＜起点＞に残る」タグを検証 |
| AC-003 | integration (jsdom, vitest) | In-Region の図に境界が 1 つだけあること、In-Region 不可の fixture で内側に淡色クラス（`.s-off`）と「直接提供なし」の文が付くことを検証 |
| AC-004 | unit + integration (vitest, jsdom) | `splitDestinations(dests, { origin, regionNotes })` が国内 / 国外に分け件数を返すこと（国外 0 件、`country` 不明のケースを含む）を検証。描画側で境界が 2 つ、国外チップが warn クラス、地理圏の見出しが接頭辞の辞書由来（未知の接頭辞では接頭辞そのもの）であることを検証 |
| AC-005 | integration (jsdom, vitest) | Global の外側の壁のパスが右端で閉じていないこと（`d` に右辺のセグメントが無い）、`.s-wall-open` クラス、サンプルチップに fade クラスが付くこと、`figcaption` に「例示」の語が入ることを検証 |
| AC-006 | integration (jsdom, vitest) | Geo / Global の図に不正利用検知の文があり、In-Region の図に無いことを検証 |
| AC-007 | integration (jsdom, vitest) | 各図に `figcaption` と出典の行が 1 つずつあることを検証 |
| AC-008 | unit (vitest) | 図に出る全文字列を集め、`flow.claims` の表に載る主張のキーだけで構成されることを検証。C-5 に対応する文字列に「推定」（en: `inferred`）が含まれることを検証 |
| AC-009 | unit + integration (vitest, jsdom) | `ja` / `en` 両方で図を描き、SVG 内のテキストが辞書経由であること（直書きの日本語が `src/scripts/` に無いこと）、リージョンコードと FQDN が両言語で不変であることを検証 |
| AC-010 | unit (vitest) | `sources[R]` が `[]` の fixture でチップが 0 個になり、件数の見出しが出ず、例外が出ないことを検証 |
| AC-NFR-001 | e2e（Playwright MCP で 375px のスクリーンショットを手動確認）+ integration (jsdom, vitest) | jsdom で `.flow-scroll` に `overflow-x` のクラスが付き `svg` に `min-width` が当たることを検証し、375px の実描画で `scrollWidth <= clientWidth` を目視確認 |
| AC-NFR-002 | integration (jsdom, vitest) | `prefers-reduced-motion` の media query に対応する CSS が存在することを検証（`animation: none`）。実挙動は手動チェック |

## Deliverable Previews

- 起点 `ap-northeast-1` × `anthropic.claude-sonnet-4-20250514-v1:0` の 3 レーンの図のスクリーンショット（ライト / ダークの 2 枚ずつ）
- AC-008 の主張と根拠の表を、実装した文言と突き合わせた確定表

## 委譲する非機能要件

- **a11y**: 図が `role="img"` + `aria-label` でスクリーンリーダーに 1 文として読まれること、色以外の手がかり（実線 / 破線 / 開いた壁 / 見出しの文言）だけでも 3 レーンの違いが分かることを**手動チェック**で確認する。合格基準は「グレースケールで印刷しても In-Region / Geo / Global を取り違えない」
- **セキュリティレビュー: 不要。** 表示のみの静的 SVG で、扱うデータは AWS の公開情報のみ

## Notes

- 図は**説明の道具であって判断の代行ではない**（Design「What Not」6）。「この構成なら規制を満たす」といった言い方はしない
- 地理圏の名前は接頭辞から引く。接頭辞の閉じた一覧を持たない（D-012）。AWS docs も閉じた一覧を公開していないので、`profiles.json` に出た接頭辞がそのまま地理圏になる
- 記録の所在を図の中心に置いたのは、「どこで処理されるか」と「どこに証跡が残るか」が別の問いで、後者の方が監査で先に聞かれるため
- C-5（呼び出しログ）は推定であり、AWS が cross-Region inference の文脈で明示していない。**docs が明示に変わったら AC-008 の表と画面の文言を同時に直す**
- Global の「右の壁が無い」表現は、範囲が固定されていないことを図で言うための工夫で、AWS の用語ではない。`figcaption` で意味を言葉でも書くのはそのため

## 変更履歴

- **version 1** (2026-09-15): 初版。DETAIL-001 v8 の各レーンに置くデータの流れ図（In-Region / Geo / Global）と、図が主張してよい内容とその根拠の対応表（AC-008）を定めた。理由: 推論先を地名の羅列で示すだけでは「国の外に出るか」という問いに答えられず、記録の所在も伝わらなかったため（D-013 / D-014）
