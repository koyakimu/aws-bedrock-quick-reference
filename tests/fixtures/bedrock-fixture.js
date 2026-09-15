// 表の描画テストが共有する固定入力。
// tests/fixtures/bedrock/ の spike 間引き fixture を normalize.mjs に通し、
// 「取得できた東京」「denied の us-east-1」「ok だがモデル 0 件の eu-west-1」の
// 3 リージョンを持つスナップショットにする。
import fmTokyo from "./bedrock/fm-ap-northeast-1.json";
import ipTokyo from "./bedrock/ip-ap-northeast-1.json";
import fmDenied from "./bedrock/fm-us-east-1.err?raw";
import { normalizeSnapshot } from "../../scripts/lib/normalize.mjs";
import regionNotes from "../../data/region-notes.json";
import priceBedrockTokyo from "./prices/AmazonBedrock-ap-northeast-1.json";
import priceFoundationTokyo from "./prices/AmazonBedrockFoundationModels-ap-northeast-1.json";
import priceModelMap from "../../data/price-model-map.json";
import { normalizePrices } from "../../scripts/lib/prices.mjs";

export const TOKYO = "ap-northeast-1";
// MANTLE-001: bedrock-mantle が提供されていない起点リージョン (大阪)。
export const NON_MANTLE_REGION = "ap-northeast-3";
export const DENIED_REGION = "us-east-1";
export const EMPTY_REGION = "eu-west-1";

export { regionNotes };

export function buildSnapshot() {
  return normalizeSnapshot({
    regions: {
      [TOKYO]: { fm: fmTokyo, ip: [ipTokyo] },
      // bedrock-mantle 提供外の起点。モデルの並びは東京と同じにしておく (MANTLE-001)
      [NON_MANTLE_REGION]: { fm: fmTokyo, ip: [] },
      // 取得に失敗したリージョン。公開データに残るのは分類 (cause) だけ (AC-009 / D-008)
      [DENIED_REGION]: { error: fmDenied },
      // 取得はできたがモデルが 1 件も無いリージョン (AC-010)
      [EMPTY_REGION]: { fm: { modelSummaries: [] }, ip: [] },
    },
    generatedAt: "2026-09-14T08:10:00Z",
    accountKind: "sandbox",
  });
}

// --- DETAIL-001 v8 / FLOW-001 が使う追加のプロファイル ---------------------
// 素の fixture (ip-ap-northeast-1.json) には東京起点の Geo が 1 モデル 1 件しか無いので、
// レーンの組み合わせを作れるだけの最小限をここで足す。`extraProfiles` として渡した
// ときだけ効くので、既存の表のテストの行数・並びは変わらない。

// AC-018: 東京起点で jp. と apac. の 2 つを持つモデル (In-Region は不可)。
export const CLAUDE_45 = "anthropic.claude-sonnet-4-5-20250929-v1:0";
// Geo 0 件のプロファイルを持つモデル (FLOW-001 AC-010)。
export const NVIDIA = "nvidia.nemotron-nano-12b-v2";
// どのレーンも使えないモデル (AC-021)。availability が空配列でプロファイルも無い。
export const NO_LANE_MODEL = "amazon.titan-embed-text-v1:2:8k";

export const EXTRA_PROFILES = Object.freeze({
  // 8 件 = 国内 2 (東京・大阪) + 国外 6。jp. (2 件) より広いので AC-018 の並びは jp → apac。
  [`apac.${CLAUDE_45}`]: {
    prefix: "apac",
    modelId: CLAUDE_45,
    sources: {
      [TOKYO]: [
        "ap-northeast-1",
        "ap-northeast-2",
        "ap-northeast-3",
        "ap-south-1",
        "ap-south-2",
        "ap-southeast-1",
        "ap-southeast-2",
        "ap-southeast-4",
      ],
    },
  },
  // FLOW-001 AC-010: sources[R] が空配列のプロファイル。
  [`au.${NVIDIA}`]: {
    prefix: "au",
    modelId: NVIDIA,
    sources: { [TOKYO]: [] },
  },
});

/**
 * 起点の country が分からない region-notes (TABLE-001 AC-004 / FLOW-001 AC-004)。
 * 手書きの data/region-notes.json には全リージョンに country があるので、
 * テストの中でだけ 1 件落として「判断材料が無い」状態を作る。
 */
export function regionNotesWithoutCountry(region = TOKYO) {
  const { country, ...rest } = regionNotes[region];
  return { ...regionNotes, [region]: rest };
}

/**
 * 取得の記録を差し替えたスナップショット (REGIONS-001 AC-007 / AC-014)。
 * denied にしたいリージョンコードを渡す。"*" で全件を denied にする。
 * models / profiles はそのままなので、「取れているのに status が ok でない」
 * 極端な入力にもなる。行列は status を優先して空欄にする。
 */
export function withDeniedRegions(fetchLog, codes) {
  const all = codes === "*";
  const wanted = new Set(all ? [] : codes);
  return {
    ...fetchLog,
    regions: Object.fromEntries(
      Object.entries(fetchLog.regions).map(([code, entry]) =>
        all || wanted.has(code)
          ? [code, { status: "denied", cause: "access-denied" }]
          : [code, entry],
      ),
    ),
  };
}

/** 取得できなかったリージョンが 1 つも無い記録 (AC-007 の「0 件」)。 */
export function withAllFetched(fetchLog) {
  return {
    ...fetchLog,
    regions: Object.fromEntries(
      Object.entries(fetchLog.regions).map(([code, entry]) => [
        code,
        entry.status === "ok" ? entry : { status: "ok", models: 0, profiles: 0 },
      ]),
    ),
  };
}

// 分類のもとになる原文。公開データには載らないが、テストが分類の前提を確かめるのに使う。
export const DENIED_ERROR_SOURCE = fmDenied;
export const DENIED_CAUSE = "scp-deny";

// overrides.json は空のままなので、備考のテストはこの固定値を使う。
export function buildOverrides(modelId, profileId) {
  return {
    _comment: "テスト用",
    [modelId]: { ja: "モデルの備考", en: "model note" },
    ...(profileId ? { [profileId]: { ja: "プロファイルの備考", en: "profile note" } } : {}),
  };
}

// --- 価格 (PRICE-001) -----------------------------------------------------
// 実データ (2026-09-11 発行) から数 SKU だけ間引いた東京の 2 offer を
// prices.mjs に通し、data/prices.json と同じ形にする。
export function buildPrices(models = buildSnapshot().models) {
  return normalizePrices({
    files: {
      AmazonBedrock: { [TOKYO]: priceBedrockTokyo },
      AmazonBedrockFoundationModels: { [TOKYO]: priceFoundationTokyo },
    },
    models,
    map: priceModelMap,
    generatedAt: "2026-09-14T09:00:00Z",
  }).prices;
}

export { priceBedrockTokyo, priceFoundationTokyo, priceModelMap };
