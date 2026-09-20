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
        const sources = bucket.supplementSources ??= {};
        sources[supplement.kind] = {url:supplement.sourceUrl, verifiedAt:supplement.verifiedAt};
      }
    }
  }
  return prices;
}
