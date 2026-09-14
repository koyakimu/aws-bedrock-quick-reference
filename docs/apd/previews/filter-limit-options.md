# 推論先の限定セレクタの選択肢（確定表）

- Spec: FILTER-001（AC-005 / AC-006 / AC-008 / AC-011）、判断: D-007
- 実装: `src/scripts/filter-model.mjs` の `buildLimitOptions()`
- この表は `data/region-notes.json`（2026-09-14 版）と `data/profiles.json`（同日のスナップショット）
  から生成した実際の値。固定表はコードに持たない

D-007 は C（固定リスト + カスタムのリージョン複数選択）を選んだが、本サイクルで実装するのは
**固定リストの経路だけ**。カスタムのリージョン複数選択は後続サイクル（Issue #1）で、
判定関数 `satisfiesLimit(destinations, L)` を変えずに `L` の作り方と `limit` の表現だけを足す。

## 選択肢（制限なし + 国 3 件 + 地理圏 5 件 = 9 件）

| URL の値 (`limit=`) | グループ | 表示（ja / en） | 限定集合 L の件数 | 限定集合 L |
|---|---|---|---|---|
| `none`（既定） | — | 制限なし / No limit | — | 限定しない（URL からは省かれる） |
| `country:jp` | 国 | 日本国内のみ / Japan only | 2 | `ap-northeast-1` `ap-northeast-3` |
| `country:au` | 国 | オーストラリア国内のみ / Australia only | 2 | `ap-southeast-2` `ap-southeast-4` |
| `country:us` | 国 | 米国内のみ / United States only | 4 | `us-east-1` `us-east-2` `us-west-1` `us-west-2` |
| `geo:jp` | 地理圏 | 日本 (jp) 内のみ / Japan (jp) only | 2 | `ap-northeast-1` `ap-northeast-3` |
| `geo:apac` | 地理圏 | APAC 内のみ / APAC only | 12 | `ap-east-2` `ap-northeast-1` `ap-northeast-2` `ap-northeast-3` `ap-south-1` `ap-south-2` `ap-southeast-1` `ap-southeast-2` `ap-southeast-3` `ap-southeast-4` `ap-southeast-5` `ap-southeast-7` |
| `geo:eu` | 地理圏 | EU 内のみ / EU only | 8 | `eu-central-1` `eu-central-2` `eu-north-1` `eu-south-1` `eu-south-2` `eu-west-1` `eu-west-2` `eu-west-3` |
| `geo:us` | 地理圏 | 米国 (us) 内のみ / US (us) only | 4 | `us-east-1` `us-east-2` `us-west-1` `us-west-2` |
| `geo:au` | 地理圏 | オーストラリア (au) 内のみ / Australia (au) only | 3 | `ap-southeast-2` `ap-southeast-4` `ap-southeast-6` |

## 集合の導出元

| グループ | 導出 |
|---|---|
| 国 | `region-notes.json` の `country` が一致するリージョン（`jp` / `au` / `us`） |
| 地理圏 | `profiles.json` の同じ接頭辞を持つプロファイルの destination 全件 ∪ `region-notes.json` の `geo` が一致するリージョン |

地理圏を 2 つのデータ源の和集合にしているのは次の理由による。

- `profiles.json` だけだと、取得できていない起点リージョンのプロファイルが欠けて集合が狭くなる
  （2026-09-14 のスナップショットは `ap-northeast-1` からしか取れていない）
- `region-notes.json` の `geo` だけだと、`apac.` プロファイルの destination に含まれる
  `ap-northeast-1` / `ap-northeast-3`（`geo` は `jp`）が落ち、AC-006 が求める
  「`apac.` も `jp.` も APAC 内に収まる」が成り立たなくなる

実データでの効き方の例: `geo:apac` に `ap-southeast-2` / `ap-southeast-4`（`region-notes.json` の
`geo` は `au`）が入っているのは、`apac.` プロファイルの destination から導出しているため。

## 判定（`satisfiesLimit(destinations, L)`）

| 使い方 | 判定 |
|---|---|
| In-Region | 推論先は起点 R 自身だけ。R ∈ L なら満たす（AC-007） |
| Geo プロファイル | destination ⊆ L なら満たす。接頭辞では判定しない（AC-006） |
| Global | destination は `["*"]`（全対応リージョン、今後増えうる）。**どの L でも満たさない**（AC-008） |

- 行は「どれか 1 つの使い方が満たす」なら残す。満たさない使い方のセルは淡色 + 「限定外」の印にする
  （行ごと消すと「この使い方なら条件を満たす」という情報まで失われるため）
- `region-notes.json` に無いリージョンコードが集合に入った場合は、そのまま集合に残し、
  表示名はコードをそのまま出す。判定は黙って緩めない（AC-011）

## 既知の差異

`spec-filter.md` の Notes は「オーストラリア = `ap-southeast-2` / `ap-southeast-4` / `ap-southeast-6`」
と書いているが、`region-notes.json` では `ap-southeast-6`（ニュージーランド）の `country` は `nz` で、
`country:au` は 2 件になる。リージョンの正は `region-notes.json`（D-004）なので、**国の集合はデータ側に
合わせた**。`au.` プロファイルの定義に合わせた 3 件が必要な場合は `geo:au` を選べばよい（上表のとおり
`ap-southeast-6` を含む）。
