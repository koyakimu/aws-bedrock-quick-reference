// Apply sourced model-card prices only to API-confirmed profile origins and missing axes.
export function applyPriceSupplements(prices, profiles, supplements) {
  for (const [profileId, supplement] of Object.entries(supplements?.byProfile ?? {})) {
    const profile = profiles[profileId];
    if (!profile || !['standard', 'global'].includes(supplement.kind)) continue;
    const model = prices.byModel[profile.modelId] ??= {};
    for (const region of Object.keys(profile.sources)) {
      const bucket = model[region] ??= {};
      const price = bucket[supplement.kind] ??= {};
      for (const axis of ['input', 'output']) {
        const value = supplement.price[axis];
        if (price[axis] != null || !Number.isFinite(value) || value < 0) continue;
        price[axis] = value;
        if (Number.isFinite(supplement.price.maxInputTokens)) {
          price.maxInputTokens = supplement.price.maxInputTokens;
          if (['input', 'output'].every((key) => Number.isFinite(supplement.price.longContext?.[key]) && supplement.price.longContext[key] >= 0)) {
            price.longContext = { ...supplement.price.longContext };
          }
        }
        const sources = bucket.supplementSources ??= {};
        sources[supplement.kind] = {url:supplement.sourceUrl, verifiedAt:supplement.verifiedAt};
      }
    }
  }
  // 公式料金ページが明記するリージョンに限った、画像などの補完価格。
  for (const [modelId, supplement] of Object.entries(supplements?.byModel ?? {})) {
    const rates = (supplement.metered ?? []).filter((rate) =>
      ['input', 'output'].includes(rate.axis) && ['image', 'second', 'request', 'searchUnit'].includes(rate.unit)
      && Number.isFinite(rate.value) && rate.value >= 0);
    if (!rates.length) continue;
    for (const region of supplement.regions ?? []) {
      const model = prices.byModel[modelId] ??= {};
      const bucket = model[region] ??= {};
      if (bucket.metered?.length) continue;
      bucket.metered = rates.map((rate) => ({ ...rate }));
      (bucket.supplementSources ??= {}).metered = { url: supplement.sourceUrl, verifiedAt: supplement.verifiedAt };
    }
  }
  return prices;
}
