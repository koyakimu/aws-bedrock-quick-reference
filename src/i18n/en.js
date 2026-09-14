// English dictionary. Its key set must match ja.js exactly (I18N-001 AC-007).
// Region display names do not live here — data/region-notes.json ja / en is the source (AC-005).
export const en = {
  app: {
    title: "Amazon Bedrock Quick Reference",
    tagline: "Model x source Region x where inference actually runs",
  },
  lang: {
    label: "Language",
  },
  theme: {
    light: "Light",
    dark: "Dark",
  },
  source: {
    label: "Source Region",
    endpointLabel: "Endpoint",
    optIn: "opt-in",
    noData: "no data",
    statusOk: "fetched",
  },
  table: {
    provider: "Provider",
    modelId: "Model ID",
    modalities: "Modalities",
    inRegion: "In-Region",
    geo: "Geo",
    global: "Global",
    lifecycle: "Lifecycle",
    notes: "Notes",
    rowCount: "{shown} / {total} rows",
  },
  value: {
    yes: "Yes",
    no: "No",
    globalNote: "all supported Regions, may grow",
    globalDocs: "AWS docs",
    modalityArrow: "→",
  },
  lifecycle: {
    ACTIVE: "Active",
    LEGACY: "Legacy",
  },
  copy: {
    action: "Copy",
    done: "Copied",
    modelId: "Copy model ID",
    profileId: "Copy inference profile ID",
    endpoint: "Copy endpoint",
  },
  state: {
    noDataTitle: "This Region could not be fetched (no data)",
    noDataBody:
      "This is not the same as “not offered”. The account used for the snapshot lacked permission, or the Region was not opted in. The raw AWS API error follows.",
    notOffered: "Not offered in this Region",
  },
  footnote: {
    heading: "About this page",
    generatedAt: "Snapshot taken at: {date}",
    accountKind: "Account kind used for the snapshot: {kind}",
    deniedRegions: "Regions that could not be fetched ({count}): {regions}",
    deniedNone: "Every Region was fetched successfully.",
    sources: "Sources",
    docListFoundationModels: "ListFoundationModels (API Reference)",
    docListInferenceProfiles: "ListInferenceProfiles (API Reference)",
    docGeoCris: "Geographic cross-Region inference",
    docGlobalCris: "Global cross-Region inference",
    docEndpoints: "Amazon Bedrock endpoints and quotas",
  },
};
