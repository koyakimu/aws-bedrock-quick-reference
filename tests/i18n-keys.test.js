// I18N-001 AC-007: 辞書のキー一致。
// 検査対象は SUPPORTED_LANGS / LANGUAGES から生成する。言語を足しても
// このファイルは書き換えなくてよい (D-006)。
import { describe, it, expect } from "vitest";
import { SUPPORTED_LANGS, dictionaries, LANGUAGES } from "../src/scripts/i18n.js";

// 辞書はネストしたプレーンオブジェクト。i18n.js が "footnote.sources" のように
// ドット区切りで引くので、比較の単位は葉のドット付きパスにする。
function collectKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix + key;
    const isPlainObject = value !== null && typeof value === "object" && !Array.isArray(value);
    return isPlainObject ? collectKeys(value, path + ".") : [path];
  });
}

const keySet = (dict) => new Set(collectKeys(dict));
const valueAt = (dict, path) => path.split(".").reduce((acc, key) => acc?.[key], dict);
const missingFrom = (reference, target) => [...reference].filter((key) => !target.has(key)).sort();

describe("AC-007 i18n キー一致", () => {
  it("対応言語の数だけ辞書がある", () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...SUPPORTED_LANGS].sort());
    expect(LANGUAGES).toHaveLength(SUPPORTED_LANGS.length);
  });

  it("全ての葉が空でない文字列", () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const path of collectKeys(dictionaries[lang])) {
        const value = valueAt(dictionaries[lang], path);
        expect(typeof value, `${lang}.${path} must be a string`).toBe("string");
        expect(value.length, `${lang}.${path} must not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("全ての辞書のキー集合が完全に一致する (過不足ゼロ)", () => {
    const sets = Object.fromEntries(
      SUPPORTED_LANGS.map((lang) => [lang, keySet(dictionaries[lang])]),
    );

    const problems = [];
    for (const [langA, setA] of Object.entries(sets)) {
      for (const [langB, setB] of Object.entries(sets)) {
        if (langA === langB) continue;
        const missing = missingFrom(setA, setB);
        if (missing.length > 0) {
          problems.push(
            `${langB} is missing ${missing.length} key(s) present in ${langA}:\n    ${missing.join("\n    ")}`,
          );
        }
      }
    }

    expect(problems.join("\n\n"), "i18n dictionaries are out of sync").toBe("");
  });

  it("全ての辞書のキー数が同じ", () => {
    const counts = Object.fromEntries(
      SUPPORTED_LANGS.map((lang) => [lang, keySet(dictionaries[lang]).size]),
    );
    const first = counts[SUPPORTED_LANGS[0]];
    expect(first).toBeGreaterThan(0);
    for (const lang of SUPPORTED_LANGS) expect(counts[lang], lang).toBe(first);
  });
});

describe("画面が実際に読むキー", () => {
  // TABLE-001 の描画が t() で引くキー。欠けると画面にキー名が出る (AC-009)。
  const REQUIRED = [
    "app.title",
    "lang.label",
    "theme.light",
    "theme.dark",
    "source.label",
    "source.endpointLabel",
    "source.optionUnfetched",
    "table.provider",
    "table.modelName",
    "table.modelId",
    "table.capability",
    "table.inRegion",
    "table.geo",
    "table.global",
    "table.notes",
    "table.legacyTag",
    "modality.TEXT",
    "modality.IMAGE",
    "modality.VIDEO",
    "modality.SPEECH",
    "modality.EMBEDDING",
    "geoArea.jp",
    "geoArea.apac",
    "geoArea.us",
    "geoArea.eu",
    "geoArea.au",
    "geo.separator",
    "geo.outsideCount",
    "geo.outsideMark",
    "value.yes",
    "value.no",
    "value.globalNote",
    "value.globalDocs",
    "value.modalitySeparator",
    "detail.modelId",
    "detail.runtimeEndpoint",
    "detail.mantleEndpoint",
    "detail.laneTabs",
    "detail.laneInRegion",
    "detail.laneGeo",
    "detail.laneGlobal",
    "detail.sumInRegion",
    "detail.sumUnavailable",
    "detail.sumGeo",
    "detail.sumGlobal",
    "detail.specifiedId",
    "detail.destinations",
    "detail.destGlobalScope",
    "detail.noLane",
    "flow.you",
    "flow.originTag",
    "flow.record",
    "flow.recordTrail",
    "flow.abuseDetection",
    "flow.sources",
    "flow.claims.c5",
    "copy.modelId",
    "copy.profileId",
    "copy.endpoint",
    "state.noDataTitle",
    "state.noDataBody",
    "state.notOffered",
    "footnote.generatedAt",
    "footnote.accountKind",
    "footnote.deniedRegions",
    "footnote.sources",
    "footnote.docListFoundationModels",
    "footnote.docListInferenceProfiles",
    "footnote.docGeoCris",
    "footnote.docGlobalCris",
    "footnote.docEndpoints",
  ];

  it("全ての辞書が持っている", () => {
    for (const lang of SUPPORTED_LANGS) {
      const keys = keySet(dictionaries[lang]);
      expect(REQUIRED.filter((key) => !keys.has(key)), `${lang} is missing keys`).toEqual([]);
    }
  });

  // D-008: 取得失敗の分類 (cause) はメンテナ向けの情報で、画面には出さない。
  it("cause.* の説明文はどの辞書にも無い", () => {
    for (const lang of SUPPORTED_LANGS) {
      const causeKeys = [...keySet(dictionaries[lang])].filter((key) => key.startsWith("cause."));
      expect(causeKeys, `${lang} must not carry cause.* labels`).toEqual([]);
    }
  });

  it("置換子を含む文はどの言語でも同じ置換子を持つ", () => {
    const withParams = {
      "footnote.generatedAt": ["{date}"],
      "footnote.accountKind": ["{kind}"],
      "footnote.deniedRegions": ["{count}", "{regions}"],
      "source.optionUnfetched": ["{label}"],
      "table.rowCount": ["{shown}", "{total}"],
      "geo.outsideCount": ["{count}"],
      // DETAIL-001 v8 / FLOW-001 が置換子で組み立てる文
      "detail.laneGeo": ["{areas}"],
      "detail.sumGeo": ["{domestic}", "{foreign}"],
      "detail.destNotOffered": ["{place}"],
      "price.unit": ["{place}"],
      "flow.recordStaysIn": ["{place}"],
      "flow.areaTitle": ["{area}"],
      "flow.regionTitle": ["{place}"],
    };
    for (const lang of SUPPORTED_LANGS) {
      for (const [path, markers] of Object.entries(withParams)) {
        const value = valueAt(dictionaries[lang], path);
        for (const marker of markers) expect(value, `${lang}.${path}`).toContain(marker);
      }
    }
  });
});
