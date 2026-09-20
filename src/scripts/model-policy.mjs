/** Exact model IDs only: profiles and provider/family names must not broaden a policy. */
export function retentionNotice(modelId, policies, { language = "ja", lane = "geo" } = {}) {
  const policy = policies?.models?.[modelId]?.abuseDetectionRetention;
  if (!policy) return null;
  const en = language === "en";
  const location = lane === "inRegion"
    ? (en ? "the source Region" : "送信元リージョン")
    : (en ? "the inference destination Region" : "推論先リージョン");
  const traffic = policy.traffic === "all"
    ? (en ? "all input/output traffic" : "すべての入力・出力")
    : (en ? "classifier-flagged input/output traffic" : "分類器で検知された入力・出力");
  return {
    text: en
      ? `Abuse detection: ${traffic} is retained in ${location} for up to ${policy.maxDays} days. ${policy.exception.en}`
      : `不正利用検知：${traffic}が${location}に最大${policy.maxDays}日間保存されます。${policy.exception.ja}`,
    sourceUrl: policy.sourceUrl,
    verifiedAt: policy.verifiedAt,
  };
}
