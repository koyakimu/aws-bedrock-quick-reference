// 行の展開で見せる「リージョン横断の詳細」を組み立てる純関数群 (DETAIL-001 / D-003 / D-005)。
// DOM も i18n も知らない。表示用の文言は種別 (kind) で返し、翻訳は呼び出し側で行う。

import { GLOBAL_PREFIX, regionStatus, selectableRegions } from "./bedrock-view-model.mjs";

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
      return { region, kind: "nodata", types: [], reason: fetched.reason ?? null };
    }
    if (!Object.prototype.hasOwnProperty.call(availability, region)) {
      return { region, kind: "none", types: [], reason: null };
    }
    const types = availability[region] ?? [];
    if (types.length === 0) return { region, kind: "empty", types: [], reason: null };
    return { region, kind: "types", types: [...types], reason: null };
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
 * 詳細パネル 1 枚ぶん。プロファイルが 1 件も無いことは hasProfiles: false で示す (AC-009)。
 */
export function buildDetail(modelId, { models, profiles, fetchLog, regionNotes, region } = {}) {
  const availability = buildAvailabilityRows(modelId, { models, regionNotes, fetchLog });
  const profileRows = buildProfileRows(modelId, profiles);
  return {
    modelId,
    region,
    availability,
    profiles: profileRows,
    hasProfiles: profileRows.length > 0,
    // ツールチップ / 脚注リンクで原文を見せる denied リージョン (AC-008)。
    deniedReasons: availability
      .filter((row) => row.kind === "nodata" && row.reason)
      .map((row) => ({ region: row.region, reason: row.reason })),
  };
}
