// 地理圏コード・国コードの表示名 (D-012 / TABLE-001 AC-004 / FILTER-001 AC-020)。
// 一覧は固定リストを持たずデータから導くので、辞書にラベルが無いコードが必ず出てくる。
// そのときは**コードをそのまま出す**。例外を投げたり一覧から落としたりしない。
// TABLE-001 / FILTER-001 / REGIONS-001 / FLOW-001 はこの 1 か所を使う。
import { t } from "./i18n.js";

/** 辞書を引き、キーが無ければコードをそのまま返す。 */
function labelOr(key, code) {
  const label = t(key);
  return label === key ? String(code) : label;
}

/** 地理圏の平易な名前 (表の Geo セルの見出し・カスタムのピッカーのグループ)。 */
export function geoAreaLabel(code) {
  return labelOr(`geoArea.${code}`, code);
}

/** 推論先の限定の選択肢に出す地理圏の名前 (国との違いが読める語)。 */
export function geoLimitLabel(code) {
  return labelOr(`filter.geo.${code}`, code);
}

/** 推論先の限定の選択肢に出す国の名前。 */
export function countryLimitLabel(code) {
  return labelOr(`filter.country.${code}`, code);
}

/** 国そのものの名前 (FLOW-001 AC-004 の内側の境界の見出し)。無ければコードをそのまま。 */
export function countryLabel(code) {
  return labelOr(`country.${code}`, code);
}
