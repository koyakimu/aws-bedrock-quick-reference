// 行の展開で見せる「リージョン横断の詳細」を組み立てる純関数群 (DETAIL-001 / D-003 / D-005)。
// DOM も i18n も知らない。表示用の文言は種別 (kind) で返し、翻訳は呼び出し側で行う。

import {
  GLOBAL_PREFIX,
  endpointOf,
  judgeGeo,
  judgeGlobal,
  judgeInRegion,
  regionStatus,
  selectableRegions,
} from "./bedrock-view-model.mjs";

// availability 1 行の種別。
// types    … 推論タイプが 1 つ以上ある
// empty    … availability にキーはあるが空配列 = 提供あり・推論タイプの指定なし (AC-004)
// none     … 取得は成功したが availability にキーが無い = 提供なし (AC-003)
// nodata   … 取得自体が失敗した denied リージョン = データなし (AC-008)
export const AVAILABILITY_KINDS = Object.freeze(["types", "empty", "none", "nodata"]);

// Global の destination。"*" という文字は返り値に入れない (AC-006)。
export const ALL_REGIONS = "all-regions";

/**
 * region-notes.json のキー全件について 1 行ずつ返す (AC-002)。
 * PROVISIONED も落とさずそのまま並べる。順序は region-notes.json のキー昇順。
 */
export function buildAvailabilityRows(modelId, { models, regionNotes, fetchLog } = {}) {
  const availability = models?.[modelId]?.availability ?? {};
  return selectableRegions(regionNotes).map((region) => {
    const fetched = regionStatus(fetchLog, region);
    if (fetched.status === "denied") {
      return { region, kind: "nodata", types: [], cause: fetched.cause ?? null };
    }
    if (!Object.prototype.hasOwnProperty.call(availability, region)) {
      return { region, kind: "none", types: [], cause: null };
    }
    const types = availability[region] ?? [];
    if (types.length === 0) return { region, kind: "empty", types: [], cause: null };
    return { region, kind: "types", types: [...types], cause: null };
  });
}

/**
 * モデル M を対象とするプロファイルの一覧 (AC-005 / AC-006 / AC-009)。
 * プロファイル ID 昇順、sources は起点リージョン昇順、destination も昇順。
 * Global の `["*"]` は destinations を空にして allRegions: true にする。
 */
export function buildProfileRows(modelId, profiles) {
  return Object.entries(profiles ?? {})
    .filter(([, profile]) => profile?.modelId === modelId)
    .map(([profileId, profile]) => ({
      profileId,
      prefix: profile.prefix,
      isGlobal: profile.prefix === GLOBAL_PREFIX,
      sources: Object.entries(profile.sources ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([source, destinations]) => {
          const list = destinations ?? [];
          const allRegions = list.includes("*");
          return {
            source,
            allRegions,
            destinations: allRegions ? [] : [...list].sort(),
          };
        }),
    }))
    .sort((a, b) => a.profileId.localeCompare(b.profileId));
}

/**
 * 起点リージョン R から M を呼ぶときの「種別 / 指定する ID / 推論先」(AC-011)。
 * 判定は TABLE-001 と同じ関数を使うので、表と詳細で食い違いが起きない。
 * Global の推論先は列挙せず allRegions: true にする ("*" は返さない)。
 */
export function buildUsageRows(modelId, { models, profiles, region } = {}) {
  const rows = [];
  if (judgeInRegion(models, modelId, region)) {
    rows.push({
      kind: "inRegion",
      id: modelId,
      idKind: "modelId",
      destinations: [region],
      allRegions: false,
    });
  }
  for (const entry of judgeGeo(profiles, modelId, region)) {
    rows.push({
      kind: "geo",
      id: entry.profileId,
      idKind: "profileId",
      prefix: entry.prefix,
      destinations: entry.destinations,
      allRegions: false,
    });
  }
  const globalProfile = judgeGlobal(profiles, modelId, region);
  if (globalProfile) {
    rows.push({
      kind: "global",
      id: globalProfile.profileId,
      idKind: "profileId",
      prefix: globalProfile.prefix,
      destinations: [],
      allRegions: true,
    });
  }
  return rows;
}

/**
 * 詳細パネル 1 枚ぶん。プロファイルが 1 件も無いことは hasProfiles: false で示す (AC-009)。
 */
export function buildDetail(modelId, { models, profiles, fetchLog, regionNotes, region } = {}) {
  const availability = buildAvailabilityRows(modelId, { models, regionNotes, fetchLog });
  const profileRows = buildProfileRows(modelId, profiles);
  const usage = buildUsageRows(modelId, { models, profiles, region });
  return {
    modelId,
    region,
    // 起点のエンドポイント (AC-012)。
    endpoint: endpointOf(regionNotes, region),
    usage,
    hasUsage: usage.length > 0,
    availability,
    profiles: profileRows,
    hasProfiles: profileRows.length > 0,
  };
}
