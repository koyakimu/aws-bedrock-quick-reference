// bedrock-mantle エンドポイントの判定 (MANTLE-001 / D-010)。
// 入力は data/mantle.json をそのまま渡す形。DOM も i18n も知らない純関数群。

// bedrock-mantle が提供する API (MANTLE-001 AC-005)。
// 出典: https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html
export const MANTLE_APIS = Object.freeze([
  "OpenAI Responses",
  "OpenAI Chat Completions",
  "Anthropic Messages",
]);

/** 起点リージョン R で bedrock-mantle が提供されているか (AC-001 / AC-002)。 */
export function isMantleRegion(mantle, region) {
  const regions = mantle?.regions;
  return Array.isArray(regions) && regions.includes(region);
}

/** bedrock-mantle の FQDN。bedrock-runtime と違い `.api.aws` で終わる (AC-001)。 */
export function mantleEndpointOf(region) {
  return `bedrock-mantle.${region}.api.aws`;
}

/**
 * モデル M を起点リージョン R の bedrock-mantle から呼べるか (AC-003)。
 * docs の Endpoint availability 表に載っていないモデルは null を返す
 * (「対応していない」ではなく「転記元に記載が無い」なので、画面では「—」)。
 * mantle で指定するモデル ID は接頭辞の付かない素のモデル ID。docs が
 * 明示している場合だけ mantleModelId を使い、無ければモデル ID をそのまま使う。
 */
export function judgeMantle(mantle, modelId, region) {
  const entry = mantle?.models?.[modelId];
  if (!entry) return null;
  const inRegion = isMantleRegion(mantle, region);
  return {
    modelSupported: entry.mantle === true,
    runtimeSupported: entry.runtime === true,
    regionSupported: inRegion,
    // ✓ になるのは「モデルが mantle 対応」かつ「起点が mantle 提供リージョン」のときだけ。
    available: entry.mantle === true && inRegion,
    mantleModelId: entry.mantleModelId ?? modelId,
  };
}
