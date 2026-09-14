// 表の描画テストが共有する固定入力。
// tests/fixtures/bedrock/ の spike 間引き fixture を normalize.mjs に通し、
// 「取得できた東京」「denied の us-east-1」「ok だがモデル 0 件の eu-west-1」の
// 3 リージョンを持つスナップショットにする。
import fmTokyo from "./bedrock/fm-ap-northeast-1.json";
import ipTokyo from "./bedrock/ip-ap-northeast-1.json";
import fmDenied from "./bedrock/fm-us-east-1.err?raw";
import { normalizeSnapshot } from "../../scripts/lib/normalize.mjs";
import regionNotes from "../../data/region-notes.json";

export const TOKYO = "ap-northeast-1";
export const DENIED_REGION = "us-east-1";
export const EMPTY_REGION = "eu-west-1";

export { regionNotes };

export function buildSnapshot() {
  return normalizeSnapshot({
    regions: {
      [TOKYO]: { fm: fmTokyo, ip: [ipTokyo] },
      // 取得に失敗したリージョン。公開データに残るのは分類 (cause) だけ (AC-009 / D-008)
      [DENIED_REGION]: { error: fmDenied },
      // 取得はできたがモデルが 1 件も無いリージョン (AC-010)
      [EMPTY_REGION]: { fm: { modelSummaries: [] }, ip: [] },
    },
    generatedAt: "2026-09-14T08:10:00Z",
    accountKind: "sandbox",
  });
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
