# URL パラメータの一覧表

- Spec: SHARE-001（AC-001 〜 AC-013）、関連: FILTER-001 / TABLE-001 / REGIONS-001
- 実装: `src/scripts/url-state.mjs`（`parseState` / `serializeState` / `shareUrl`）と
  `src/scripts/share.js`（`history.replaceState` / クリップボード / 通知）

## パラメータ

| 名前 | 値の形 | 既定値 | 省略条件 | 不正値のときの扱い |
|---|---|---|---|---|
| `view` | `origin`（起点から）/ `regions`（リージョンの行列）の 1 件 | `origin` | 既定値と同じとき | 既定値にフォールバックし、通知を出し、URL を書き換える（AC-011） |
| `sort` | `pinned`（既定の並び）/ `alpha`（プロバイダ名の昇順）の 1 件 | `pinned` | 既定値と同じとき | 既定値にフォールバックし、通知を出し、URL を書き換える（AC-013） |
| `region` | リージョンコード 1 件（`region-notes.json` のキー） | `ap-northeast-1` | 既定値と同じとき | 既定値にフォールバックし、通知を出し、URL を書き換える（AC-007） |
| `provider` | `providerName` のカンマ区切り（例: `Anthropic,Cohere`） | 空（絞らない） | 1 件も選んでいないとき | 表示中データに無い値だけを落として通知（AC-008） |
| `modality` | `TEXT` / `IMAGE` / `SPEECH` / `VIDEO` / `EMBEDDING` のカンマ区切り。小文字も受ける | 空（絞らない） | 1 件も選んでいないとき | 5 種に無い値だけを落として通知 |
| `q` | 任意の文字列（`modelId` / `modelName` の部分一致、大文字小文字を区別しない） | 空文字列 | 空、または空白だけのとき | 不正値なし。DOM にはテキストとして入れる |
| `callable` | `1`（ON）または `0`（OFF） | `0`（OFF） | OFF のとき | `1` / `0` 以外は落として通知 |
| `limit` | `none` / `country:<jp\|au\|us>` / `geo:<jp\|apac\|eu\|us\|au>` / `custom` / `custom:<code>(+<code>)*` | `none` | `none` のとき | 固定リストは一覧に無い値を落として通知。`custom:` はコードごとに `region-notes.json` と突き合わせ、無いコードだけを落として通知（選択肢は `filter-limit-options.md`） |

- 並び順は `view` → `region` → `sort` → `provider` → `modality` → `q` → `callable` → `limit`
- `view=regions` のとき、`region` は行列の「起点」の印にだけ使い、`q` / `callable` / `limit` は
  行列の内容を変えない。値は保持され、「起点から」タブに戻すとそのまま効く（AC-012）。
  これらを「解釈できない指定」として通知しない
- `sort` は「起点から」の表と「リージョン」の行列の両方に効く（TABLE-001 AC-014 / REGIONS-001 AC-003）
- 行列の地域チップ（すべて / jp / apac / …）は URL に載せない（REGIONS-001 AC-009）
- **既定状態の URL はクエリなしになる**（全パラメータが既定値なら `?` ごと付かない）
- `limit=custom:...` のリージョンコードは昇順・重複なしで `+` 連結する。アプリが書くときは `+` が
  `%2B` に percent encode されるが、手で書いた生の `+` も（`URLSearchParams` が空白に復号するため
  空白として）区切りに受ける。1 つも選んでいない状態は `custom` で、意味は `none` と同じ（FILTER-001 AC-015）
- 言語は URL に載せない。開いた人の `localStorage` / `navigator.language` で決まる（AC-006）
- 展開中の行（DETAIL-001）も URL に載せない（共有の主目的がぼやけるため）

## 更新と復元の動き

| 場面 | 動き |
|---|---|
| 起点リージョンや絞り込みを変える | `history.replaceState` で現在のエントリを書き換える。`pushState` は使わない（戻る履歴を絞り込み操作で埋めない）。リロードは起きない |
| ページを開く | `location.search` を解析し、TABLE-001 の既定値より優先して適用する。不正値は落として通知し、URL を解釈できた状態に揃える |
| 「この表示の URL をコピー」 | 現在のクエリを含む絶対 URL をクリップボードへ。`location.href` のパスをそのまま使うので、GitHub Pages のサブパス（`/aws-bedrock-quick-reference/`）配下でも壊れない |
| 復元後に 0 件 | FILTER-001 AC-010 の空状態（条件一覧とリセット操作）を出す。未取得のリージョンのバナーとは別の見た目 |

## 例

| URL | 意味 |
|---|---|
| `/aws-bedrock-quick-reference/` | 既定（東京起点、絞り込みなし） |
| `?region=eu-central-1` | フランクフルト起点 |
| `?provider=Anthropic&limit=country:jp` | 東京起点で Anthropic、推論先を日本国内に限定 |
| `?region=ap-northeast-1&modality=TEXT&q=claude&callable=1&limit=geo:apac` | 全 5 条件を設定した状態 |
| `?limit=custom:ap-northeast-1+ap-northeast-3` | 東京起点で推論先を東京・大阪の 2 リージョンに限定（カスタム） |
| `?limit=custom` | カスタムのピッカーを開いた状態。リージョン未選択なので限定はかからない |
| `?limit=custom:ap-northeast-1+xx-nowhere-9` | 未知の `xx-nowhere-9` を落として通知し、URL は `?limit=custom%3Aap-northeast-1` に書き換わる |
| `?region=xx-nowhere-9` | 対象外のリージョン。東京にフォールバックし通知を出し、URL は `/aws-bedrock-quick-reference/` に書き換わる |
| `?view=regions` | モデル × 全リージョンの行列 |
| `?view=regions&region=eu-central-1&provider=Anthropic&limit=country:jp` | 行列を表示。`provider` だけが行に効き、`region` は「起点」の印、`limit` は保持だけ |
| `?sort=alpha` | プロバイダ名の昇順（固定なし）。表と行列の両方に効く |
| `?view=galaxy` | 対象外のビュー。`origin` にフォールバックし通知を出し、URL を書き換える |
