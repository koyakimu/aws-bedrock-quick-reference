# Decisions

技術選択の記録。**新しい判断ほど上に積む。** 最終決定はユーザーが行い、AI の推奨は参考情報。

D-001〜D-005 は brainstorming の対話で内容が固まり、技術設計
（`docs/superpowers/specs/2026-09-14-bedrock-quick-reference-design.md`）から転記したものを
2026-09-14 にユーザーが確定した。D-006・D-007 は Spec フェーズで決定した。D-008 は Build 中に発生した矛盾の解消で、暫定決定 B をオーナーの指示で D に差し替えた。

---

## D-008: fetch-log.json に残す「取得できなかった理由」の形

- **Date**: 2026-09-14（Decision を D に差し替え）
- **Context**: DATA-001 AC-010 は denied リージョンの理由を「要約せず原文で」残すことを求め、AC-011 は生成 JSON に 12 桁のアカウント ID が含まれないことを求める。SCP 拒否の AccessDeniedException の原文には、呼び出し元の principal ARN（アカウント ID・permission set 名・IAM セッション名）と Organizations のポリシー ARN（組織 ID・ポリシー ID）が埋め込まれており、両立しない。生成 JSON は public リポジトリにコミットされ、公開サイトにもそのまま描画される。
- **Options**:
  - A: 原文をそのまま残す（AC-010 優先）。アカウント ID が公開リポジトリに載る
  - B: 理由文中の 12 桁の数字列だけを `<account-id>` に置換し、それ以外は一字も変えない
  - C: 理由文を例外クラス名だけに要約する
  - D: 理由の原文は公開データに一切載せず、分類（`cause`）だけを残す。原文は gitignore の `data/raw/<日付>/*.err` にのみ残る
- **AI Recommendation**: 当初は **B** を採った（置換が機械的で、根拠も読める）
- **Decision**: **D**。理由の原文は公開データに一切載せず、分類（`cause`）だけを残す。原文は gitignore の `data/raw` にのみ残る
- **Reason**: オーナーの指示「エラー情報は出さない」。B は伏字の網羅性に依存し、AWS 側がエラー文の書式を変えたら伏せ漏れが公開リポジトリに出る。分類だけを残せば、載る値が 5 種の enum に閉じるので、伏せ漏れという失敗様式そのものが無くなる。「提供なし」と「データなし」の区別（D-003）は `status` で付き、閲覧者が知りたい粒度（組織のポリシー / 未有効化 / 接続不可）は `cause` で足りる。原因の追跡が要るときは手元の `data/raw/<日付>/*.err` を読む
- **cause の値**: `scp-deny`（AccessDeniedException かつ SCP の明示 Deny）/ `access-denied`（それ以外の AccessDeniedException）/ `not-opted-in`（未有効化の opt-in リージョン）/ `timeout`（接続できない）/ `other`
- **2026-09-14 追記**: 画面には分類（`cause`）も出さないことにした。取得できなかったリージョンは「未取得」とだけ表示し、理由は書かない（TABLE-001 v5 AC-009、DETAIL-001 v5 AC-008）。分類は取得作業をするメンテナ向けの情報で、閲覧者には意味が無く、「使えないリージョン」と誤読されるため。**Decision 自体は変えない**: `cause` は `fetch-log.json` に残り、エラー原文は引き続き公開データに載せない
- **Refs**: `spec-data.md`（DATA-001 AC-010 / AC-011 / AC-012）、`spec-table.md`（AC-009）、`spec-detail.md`（AC-008）、`spec-i18n.md`、実装は `scripts/lib/normalize.mjs` の `classifyFetchError`

## D-007: 推論先の限定フィルタの指定方法

- **Date**: 2026-09-14
- **Context**: Design の「推論先を限定して絞れる」を実装するには、閲覧者が「収まっていてほしいリージョンの集合」をどう指定するかを決める必要がある。起点が東京なら「日本国内のみ」、フランクフルトなら「EU 内のみ」といった使い方が想定されている。判定そのもの（destination ⊆ 限定集合、In-Region は起点が集合に入れば満たす、Global は常に満たさない）は方式によらず同じ。
- **Options**:
  - A: **固定リストからの単一選択**。国（日本 / オーストラリア / 米国）と地理圏（jp / apac / eu / us / au、プロファイル接頭辞から destination の和集合で導出）を並べたセレクタ。実装が軽く、選択肢が「よくある問い」と一致する。反面、リストに無い国（ドイツ単独、カナダ単独など）は指定できない
  - B: **リージョンの複数選択（自由集合）**。閲覧者が許可するリージョンをチェックして集合を作る。任意の条件を表現できるが、全リージョンから選ぶ操作は重く、Design の「一度の選択で済む」という定性目標に反する
  - C: **A を既定にし、「カスタム」を選ぶと B のリージョン複数選択に展開するハイブリッド**。よくある問いは 1 選択で済み、特殊な条件も表現できる。UI と URL のシリアライズ（SHARE-001）が 2 系統になる
- **AI Recommendation**: **C**。まず A だけを実装して公開し、「リストに無い国で絞りたい」という要望が実際に出た時点で B の経路を足す。A と C は判定関数が同じ（`satisfiesLimit(destinations, L)` に渡す `L` の作り方だけが違う）ため、後から足しても手戻りが小さい
- **Decision**: **C**
- **Reason**: よくある問い（自国内・地理圏内）は 1 選択で済ませたい。今回のサイクルは固定リスト（A の経路）だけを実装し、カスタムのリージョン複数選択は要望が出た時点で足す。判定関数は同じなので後から足しても手戻りが小さい
- **Refs**: `spec-filter.md`（FILTER-001 v3）、`spec-share.md`（SHARE-001 v2 の `limit` パラメータ）
- **実装状況** (2026-09-14 追記): カスタムのリージョン複数選択も実装済み（Issue #1）。Decision は C のまま変わらない。固定リストは初回サイクル、カスタムは Issue #1 で、推奨どおり判定関数 `satisfiesLimit(destinations, L)` は変えずに `L` の作り方（FILTER-001 AC-012〜AC-015）と `limit` の表現（AC-016 / AC-017、SHARE-001 AC-010）だけを足した

---

## D-006: 対応言語

- **Date**: 2026-09-14
- **Context**: 先例の aws-gpu-quick-reference は ja / en / ko の 3 言語に対応している。本プロジェクトは Design で「日本語と英語を切り替えられる」と書いており、ko をどう扱うかが決まっていない。i18n キー一致テストは対応言語の数だけ辞書の維持コストがかかる。
- **Options**:
  - A: **ja / en の 2 言語のみ**。Design の記述どおり。辞書 2 本の維持で済み、キー一致テストも軽い。韓国語話者は英語で読むことになる
  - B: **ja / en / ko の 3 言語**（先例を踏襲）。先例の辞書構成と切替 UI をそのまま流用でき、コードの差分が小さい。ただし ko の翻訳を新規に書き起こす必要があり、以後の文言追加のたびに 3 本を揃える手間がかかる
  - C: **ja / en で作り、辞書の追加だけで言語を増やせる構造にしておく**。対応言語は設定の配列で決め、切替 UI はそこから生成する。ko は要望が出たら辞書 1 本を足す
- **AI Recommendation**: **C**。Design が約束しているのは ja / en の 2 つで、それ以上は約束していない。一方で先例が 3 言語であることを考えると、増やせない作りにするのは惜しい。言語リストを設定値にしておけば A のコストで B の拡張性が得られる
- **Decision**: **C**
- **Reason**: Design が約束するのは ja / en の 2 つ。言語一覧を設定値にして切替 UI をそこから生成し、ko などは辞書 1 本の追加で足せるようにしておく
- **Refs**: `spec-i18n.md`（I18N-001。暫定で ja / en の 2 言語として記述してある）

---

## D-005: 取得に使うアカウントと権限

- **Date**: 2026-09-14
- **Context**: spike では sandbox アカウントの `AWSAdministratorAccess` で取得したが、`us-east-1` は Organizations の SCP による明示 Deny で `AccessDeniedException` になった。`Production/AWSReadOnlyAccess` は `bedrock:List*` を持たず全リージョンで拒否される。全リージョンのスナップショットを取るには権限の手当てが要る。
- **Options**:
  - A: 既存の管理者権限で取れるリージョンだけを取り、残りは「データなし」として公開する
  - B: `bedrock:ListFoundationModels` と `bedrock:ListInferenceProfiles` だけを許可した読み取り専用ロールを aws-foundation（統治リポジトリ）に追加し、それで全リージョンを取る
  - C: SCP の明示 Deny を緩める
- **AI Recommendation**: **B**（A を暫定として並走）。C は統治の緩和になり、このサイトのために行うべき変更ではない
- **Decision**: **B を最終形、A を暫定とする**
- **Reason**: 取得に必要なのは 2 つの List 権限だけなので、専用の読み取り専用ロールを用意するのが最小権限として素直。monban の git-only フローに従って aws-foundation に PR を出し、ラベル付けと merge は人間が行う。ロールが揃うまでは sandbox プロファイルで取れるリージョン（東京中心）で進め、denied リージョンは「データなし」として公開してよい
- **Refs**: `spec-data.md`（DATA-001 AC-010）、`spec-detail.md`（DETAIL-001 AC-008）、技術設計 §6.1

---

## D-004: 対象リージョンの列挙元

- **Date**: 2026-09-14
- **Context**: 取得スクリプトが「どのリージョンを回るか」の正を決める必要がある。Bedrock が提供されるリージョンの一覧は、General Reference のエンドポイント表に載っている。動的に取る方法として SSM の public parameter（`/aws/service/global-infrastructure/services/bedrock/regions`）が考えられる。
- **Options**:
  - A: `data/region-notes.json` を手書きし、そのキー全件を対象とする。出典は General Reference の Bedrock エンドポイント表
  - B: SSM public parameter から動的に列挙する
  - C: `ListFoundationModels` を全 AWS リージョンで試し、成功したリージョンだけを採用する
- **AI Recommendation**: **A**。B は 2026-09-14 時点で Bedrock のパスの存在を確認できていない。C は denied と「Bedrock 未提供」を区別できず、Design の中心要件（データなしと提供なしの区別）を壊す
- **Decision**: **A**
- **Reason**: SSM public parameter から動的に列挙する案は未確認のため採用しない。`region-notes.json` はリージョンの日本語名・英語名・opt-in 有無・`bedrock-runtime` エンドポイントも同時に持つため、どのみち手書きのファイルが要る。実装時に doc で SSM のパスを確認できれば、`--regions` の既定値として差し替えてよい
- **Refs**: `spec-data.md`（DATA-001 AC-008）、技術設計 §4.4

---

## D-003: In-Region / Geo / Global の判定ルール

- **Date**: 2026-09-14
- **Context**: 公式 docs のモデル別リージョン表にある In-Region / Geo / Global の 3 区分を表の中心に置くと決めた。この 3 区分を何から導くかを決める必要がある。docs の表は各モデルカードの HTML に分散しており、機械可読な配信は無い。
- **Options**:
  - A: API の応答から導く。In-Region は `ListFoundationModels` の `inferenceTypesSupported` に `ON_DEMAND` が含まれるか。Geo / Global は `ListInferenceProfiles` に接頭辞 `us.` `eu.` `apac.` `au.` / `global.` のプロファイルがあるか
  - B: docs の HTML を scrape して表をそのまま取り込む
  - C: A と B を突き合わせ、食い違いを手で解消する
- **AI Recommendation**: **A**。B は HTML 構造の変更に弱く、docs は最近も構成が変わっている（Design の Why に記載）。C は「人の解釈による差分ゼロ」という Success Criteria と矛盾する
- **Decision**: **A**
- **Reason**: API の応答は AWS が公開している定義そのもので、人の解釈を挟まない。判定ルールは次のとおり（source region R、モデル M）

  | 列 | 判定 |
  |---|---|
  | In-Region | R の `ListFoundationModels` に M があり、`inferenceTypesSupported` が `ON_DEMAND` を含む |
  | Geo | R の `ListInferenceProfiles` に、接頭辞が `us.` `eu.` `apac.` `au.` `jp.` のいずれかで M を対象とするプロファイルがある。プロファイル ID と destination 一覧を表示 |
  | Global | 同じく `global.` 接頭辞のプロファイルがある。destination は「全対応リージョン（docs 参照、増えうる）」と注記 |
  | データなし | R の取得が失敗（`fetch-log.json` が `denied`）。「提供なし」とは区別して表示する |

  `PROVISIONED` は availability に保持するが 3 列の判定には使わない。Global の destination は API から取れない（リージョン空 ARN が返る）ため、推測して列挙せず注記にとどめる
- **Refs**: `spec-table.md`（TABLE-001 AC-003〜005）、`spec-filter.md`、`spec-detail.md`、技術設計 §3

---

## D-002: データの取得元と更新の運用

- **Date**: 2026-09-14
- **Context**: 掲載するモデル・プロファイル・推論先の情報をどこから取るか。公式 docs のモデル別リージョン表は各モデルカードの HTML に分散しており、機械可読な配信は無い。一方で `ListFoundationModels` と `ListInferenceProfiles` は同じ事実を API として返す。
- **Options**:
  - A: **AWS API のスナップショットを `aws` CLI で取得**。手元の SSO で手動実行し、生成した JSON をコミットする。CI に AWS 認証情報は置かない
  - B: **docs の HTML を scrape** する。認証が不要で CI から自動化できるが、HTML 構造の変更に弱い
  - C: **CI から定期的に API を叩いて自動更新**する（OIDC ロールを GitHub Actions に付ける）
- **AI Recommendation**: **A**。B は Design の Why にあるとおり docs の構成が最近変わっており、壊れやすさが掲載内容の正確さに直結する。C は CI に AWS への権限を常設することになり、更新頻度（新モデル・新プロファイルが出たとき）に対して割に合わない
- **Decision**: **A**
- **Reason**: 手元の SSO で手動実行し、生成 JSON をコミットする。CI に AWS 認証は置かない。更新は新しいモデルやプロファイルが出たタイミングを目安にした手動更新で、取得日を画面に出すので古さは読み手が判断できる（Design FAQ Q4）
- **Refs**: `spec-data.md`（DATA-001）、`spec-deploy.md`（DEPLOY-001 AC-004）、技術設計 §6・§8

---

## D-001: 技術スタック

- **Date**: 2026-09-14
- **Context**: 公開する成果物は「ログイン不要の公開ページ」で、スマートフォンでも表が読めること、GitHub Pages で配信できることが要件。先行して作った aws-gpu-quick-reference が同じ形（公式情報を一表に集約する静的サイト）で日常的に使われており、Design の定性目標に「先行の EC2 GPU リファレンスと同じ感覚で使え、見た目と操作に違和感がない」がある。
- **Options**:
  - A: **Vite + vite-plugin-singlefile + vitest、フレームワーク無しの DOM 描画、runtime 依存ゼロ**（先例と同じ構成）
  - B: React / Svelte などのフレームワークを使う。状態管理と再描画が書きやすいが、bundle が増え、先例と構成が分かれる
  - C: 静的サイトジェネレータ（Astro など）でリージョンごとにページを生成する。ただし Design FAQ Q13 で「ページは分けず起点リージョンの選択で切り替える」と決めており、方針と合わない
- **AI Recommendation**: **A**。表 1 枚と絞り込みという規模でフレームワークの利点が出にくく、先例と構成を揃えることで table-engine 相当の汎用モジュールや i18n の仕組みを流用できる
- **Decision**: **A**
- **Reason**: 先例（aws-gpu-quick-reference）の構成・規約を踏襲する。単一 HTML（Vite + vite-plugin-singlefile）でフレームワーク無しの DOM 描画、テストは vitest（jsdom 併用）、`package.json` の runtime 依存は増やさない。表の描画は先例の `table-engine.js` 相当の汎用モジュールで行い、Bedrock 固有の知識を持たせない。取得スクリプトも AWS SDK を使わず `aws` CLI を子プロセスで呼ぶ
- **Refs**: `spec-table.md`、`spec-data.md`（DATA-001 AC-009）、`spec-deploy.md`、技術設計 §5・§6
