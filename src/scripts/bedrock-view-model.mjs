// 起点リージョンから見た表の行を組み立てる純関数群 (TABLE-001 / D-003)。
// DOM も i18n も知らない。入力は data/*.json をそのまま渡す形にしてある。

// Geo の接頭辞 (D-003)。global は別扱いなのでここには入れない。
export const GEO_PREFIXES = Object.freeze(["us", "eu", "apac", "au", "jp"]);
export const GLOBAL_PREFIX = "global";

// In-Region: availability[R] に ON_DEMAND が含まれるか。
// INFERENCE_PROFILE だけ / PROVISIONED だけ / 空配列 はいずれも「不可」(AC-003)。
export function judgeInRegion(models, modelId, region) {
  const types = models?.[modelId]?.availability?.[region];
  return Array.isArray(types) && types.includes("ON_DEMAND");
}

// プロファイルが「その起点から呼べる」か。sources[R] を持つことが条件 (D-003)。
function servesRegion(profile, region) {
  return Array.isArray(profile?.sources?.[region]);
}

// Geo: 接頭辞 5 種のうち modelId が一致し sources[R] を持つプロファイル全件。
// destination は昇順、プロファイルが複数あれば profileId の昇順で並べる (AC-004)。
export function judgeGeo(profiles, modelId, region) {
  return Object.entries(profiles ?? {})
    .filter(
      ([, profile]) =>
        GEO_PREFIXES.includes(profile?.prefix) &&
        profile.modelId === modelId &&
        servesRegion(profile, region),
    )
    .map(([profileId, profile]) => ({
      profileId,
      prefix: profile.prefix,
      destinations: [...profile.sources[region]].sort(),
    }))
    .sort((a, b) => a.profileId.localeCompare(b.profileId));
}

// Global: 接頭辞 global のみ。destination は API から取れず sources[R] は ["*"] なので、
// 列挙せず「該当プロファイルがある」という事実だけを返す (AC-005 / Design FAQ Q6)。
export function judgeGlobal(profiles, modelId, region) {
  const found = Object.entries(profiles ?? {}).find(
    ([, profile]) =>
      profile?.prefix === GLOBAL_PREFIX &&
      profile.modelId === modelId &&
      servesRegion(profile, region),
  );
  if (!found) return null;
  return { profileId: found[0], prefix: GLOBAL_PREFIX };
}

// fetch-log.json の 1 リージョン分。記録が無いリージョンは "unknown" にする。
export function regionStatus(fetchLog, region) {
  const entry = fetchLog?.regions?.[region];
  if (!entry) return { status: "unknown", cause: null, models: 0, profiles: 0 };
  return {
    status: entry.status,
    // 取得失敗の分類 (DATA-001 D-008)。エラー原文は公開データに無い。
    cause: entry.cause ?? null,
    models: entry.models ?? 0,
    profiles: entry.profiles ?? 0,
  };
}

// 取得失敗の分類 (fetch-log.json の cause) → 平易な説明文のキー。
// エラー原文は公開データに無いので、画面に出せるのは分類だけ (DATA-001 D-008)。
export const CAUSE_LABEL = Object.freeze({
  "scp-deny": "cause.scpDeny",
  "access-denied": "cause.accessDenied",
  "not-opted-in": "cause.notOptedIn",
  timeout: "cause.timeout",
  other: "cause.other",
});

export function causeLabelKey(cause) {
  return CAUSE_LABEL[cause] ?? CAUSE_LABEL.other;
}

// 取得できなかったリージョンのコード一覧 (脚注用、昇順)。
export function deniedRegions(fetchLog) {
  return Object.entries(fetchLog?.regions ?? {})
    .filter(([, entry]) => entry?.status === "denied")
    .map(([code]) => code)
    .sort();
}

// 起点リージョンとして選べるコード。region-notes.json のキー全件 (D-004)。
// `_source` はメタデータなので除く。
export function selectableRegions(regionNotes) {
  return Object.keys(regionNotes ?? {})
    .filter((key) => key !== "_source")
    .sort();
}

export function endpointOf(regionNotes, region) {
  return regionNotes?.[region]?.endpoint ?? `bedrock-runtime.${region}.amazonaws.com`;
}

// overrides.json の備考。キーはモデル ID または プロファイル ID。
function noteFor(overrides, id) {
  if (!id || id === "_comment") return null;
  const note = overrides?.[id];
  return note && typeof note === "object" ? note : null;
}

// 起点リージョン R で ListFoundationModels に載っていたモデル = availability[R] を持つモデル。
// 「提供なし」(空の availability) と「そもそも載っていない」は区別せず、
// 載っていたものだけを行にする。
function modelsVisibleFrom(models, region) {
  return Object.entries(models ?? {}).filter(([, model]) =>
    Object.prototype.hasOwnProperty.call(model?.availability ?? {}, region),
  );
}

// 1 行分。table-engine に渡すプレーンオブジェクト。
export function buildRow({ modelId, model, profiles, region, overrides }) {
  const geo = judgeGeo(profiles, modelId, region);
  const globalProfile = judgeGlobal(profiles, modelId, region);
  return {
    modelId,
    provider: model.provider ?? "",
    name: model.name ?? "",
    input: model.input ?? [],
    output: model.output ?? [],
    streaming: model.streaming === true,
    lifecycle: model.lifecycle ?? "",
    availability: model.availability ?? {},
    inRegion: judgeInRegion({ [modelId]: model }, modelId, region),
    geo,
    global: globalProfile,
    // 備考はモデル ID のものに、そのモデルに紐づくプロファイル ID のものを続ける。
    notes: [
      { id: modelId, note: noteFor(overrides, modelId) },
      ...geo.map((entry) => ({ id: entry.profileId, note: noteFor(overrides, entry.profileId) })),
      ...(globalProfile
        ? [{ id: globalProfile.profileId, note: noteFor(overrides, globalProfile.profileId) }]
        : []),
    ].filter((entry) => entry.note != null),
  };
}

/**
 * 画面 1 枚ぶんのビューモデル。
 * status が "denied" のとき rows は必ず 0 行で、cause に取得失敗の分類が入る (AC-009)。
 * status が "ok" で rows が 0 行なら「提供なし」(AC-010)。
 */
export function buildViewModel({
  models,
  profiles,
  fetchLog,
  regionNotes,
  overrides = {},
  region,
}) {
  const fetch = regionStatus(fetchLog, region);
  const rows =
    fetch.status === "ok"
      ? modelsVisibleFrom(models, region)
          .map(([modelId, model]) => buildRow({ modelId, model, profiles, region, overrides }))
          // 一覧は プロバイダ → モデル名 の昇順 (TABLE-001 v2 AC-006)。
          // 同名のモデルが複数あるときだけモデル ID で決着させる。
          .sort(
            (a, b) =>
              a.provider.localeCompare(b.provider) ||
              a.name.localeCompare(b.name) ||
              a.modelId.localeCompare(b.modelId),
          )
      : [];

  return {
    region,
    endpoint: endpointOf(regionNotes, region),
    status: fetch.status,
    cause: fetch.cause,
    rows,
    generatedAt: fetchLog?.generatedAt ?? null,
    accountKind: fetchLog?.accountKind ?? null,
    deniedRegions: deniedRegions(fetchLog),
  };
}
