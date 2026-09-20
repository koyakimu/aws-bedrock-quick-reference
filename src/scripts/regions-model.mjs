// モデル × 全リージョンの行列 (REGIONS-001)。純関数だけを置く。
// DOM も i18n も時刻もネットワークも触らない。列の全件は region-notes.json が正 (D-004)。
import { orderGeoCodes, UNGROUPED_GEO } from "./filter-model.mjs";
import { DEFAULT_SORT, orderRows, selectableRegions } from "./bedrock-view-model.mjs";

// セルの 4 状態 (AC-005)。判定の材料は availability と fetch-log の status だけ。
export const CELL_YES = "yes";
export const CELL_PROFILE = "profile";
export const CELL_NONE = "none";
export const CELL_BLANK = "blank";

// 地域チップの「すべて」(AC-009)。地理圏コードと衝突しない値にしてある。
export const ALL_GEO = "all";

const ON_DEMAND = "ON_DEMAND";

/**
 * 列の並び (AC-004)。region-notes.json のキー全件を地理圏でまとめ、
 * グループは orderGeoCodes (jp → apac → eu → us → au → 残り昇順 → other)、
 * グループ内はリージョンコードの昇順。geo が無いリージョンは other に入れる。
 */
export function buildMatrixColumns(regionNotes) {
  const byGeo = new Map();
  for (const code of selectableRegions(regionNotes)) {
    const geo = regionNotes?.[code]?.geo;
    const key = typeof geo === "string" && geo.length > 0 ? geo : UNGROUPED_GEO;
    if (!byGeo.has(key)) byGeo.set(key, []);
    byGeo.get(key).push(code);
  }

  const columns = [];
  for (const geo of orderGeoCodes([...byGeo.keys()])) {
    byGeo.get(geo).forEach((code, index) => {
      // グループの先頭の列に区切り線を引く (AC-004)。
      columns.push({ code, geo, groupStart: index === 0 });
    });
  }
  return columns;
}

/** 列の並びから地理圏グループ (colspan の元) を作る。列が減れば colspan も減る。 */
export function matrixColumnGroups(columns) {
  const groups = [];
  for (const column of columns ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.geo === column.geo) last.codes.push(column.code);
    else groups.push({ geo: column.geo, codes: [column.code] });
  }
  return groups;
}

/** 地域チップの選択肢 (AC-009)。「すべて」+ 実在する geo を列の並びで。 */
export function geoChipOptions(regionNotes) {
  return [ALL_GEO, ...matrixColumnGroups(buildMatrixColumns(regionNotes)).map((g) => g.geo)];
}

/**
 * セル 1 つの状態 (AC-005)。
 *  - availability: models.json[M].availability[X] (キーが無ければ undefined)
 *  - status: fetch-log.json.regions[X].status
 * 取得できなかった理由 (cause) は受け取らないし返さない (D-008)。
 */
export function matrixCellState(availability, status) {
  // status が ok 以外なら、他に何があっても「未取得」。
  if (status !== "ok") return { state: CELL_BLANK, unspecified: false };
  if (!Array.isArray(availability)) return { state: CELL_NONE, unspecified: false };
  if (availability.includes(ON_DEMAND)) return { state: CELL_YES, unspecified: false };
  // INFERENCE_PROFILE のみ / PROVISIONED のみ / [] はどれも「推論プロファイル経由のみ」。
  // [] だけツールチップを変えるので印を返す。
  return { state: CELL_PROFILE, unspecified: availability.length === 0 };
}

/** models.json (または既に作った行の配列) を行列の行にする。行は起点に依存しない (AC-003)。 */
export function matrixSourceRows(models) {
  if (Array.isArray(models)) return [...models];
  return Object.entries(models ?? {}).map(([modelId, model]) => ({
    modelId,
    provider: model?.provider ?? "",
    name: model?.name ?? "",
    releasedAt: model?.releasedAt ?? null,
    input: model?.input ?? [],
    output: model?.output ?? [],
    lifecycle: model?.lifecycle ?? "",
    availability: model?.availability ?? {},
  }));
}

/**
 * 行の並び (AC-003)。TABLE-001 と同じ orderRows を使い、
 * プロバイダ名は先頭行にだけ入れ、プロバイダが変わる行に印を付ける。
 */
export function buildMatrixRows(models, { sort = DEFAULT_SORT, lang = "ja" } = {}) {
  let previous = null;
  return orderRows(matrixSourceRows(models), { sort, lang }).map((row) => {
    const provider = row.provider ?? "";
    const start = provider !== previous;
    previous = provider;
    return { ...row, providerName: start ? provider : "", providerStart: start };
  });
}

/** 注記の件数 (AC-007)。status が ok 以外のリージョンの数。理由は数えも返しもしない。 */
export function unfetchedRegionCount(fetchLog) {
  return Object.values(fetchLog?.regions ?? {}).filter((entry) => entry?.status !== "ok").length;
}

/** 1 リージョンの status。記録が無ければ null (= ok 以外なので未取得扱い)。 */
export function statusOf(fetchLog, region) {
  return fetchLog?.regions?.[region]?.status ?? null;
}
