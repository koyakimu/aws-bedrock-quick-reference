// 地理圏のラベルはデータ由来で、辞書に無ければコードをそのまま出す (D-012)。
// TABLE-001 AC-004 (Geo セルの見出し) と FILTER-001 AC-020 (選択肢・ピッカー) の結合テスト。
import { describe, it, expect, beforeEach } from "vitest";
import { mountFixtureApp, setSelect, $ } from "./app-harness.js";
import { geoAreaLabel, countryLimitLabel, geoLimitLabel } from "../src/scripts/geo-labels.js";
import { dictionaries, SUPPORTED_LANGS, setLang } from "../src/scripts/i18n.js";
import { TOKYO } from "./fixtures/bedrock-fixture.js";

// 東京から呼べる未知の接頭辞のプロファイル。辞書にラベルは無い。
const UNKNOWN_PROFILE = {
  "zz.amazon.nova-lite-v1:0": {
    prefix: "zz",
    modelId: "amazon.nova-lite-v1:0",
    sources: { [TOKYO]: ["ca-central-1", "ca-west-1"] },
  },
};

// 実データにある ca. のプロファイル (辞書にラベルがある)。
const CA_PROFILE = {
  "ca.amazon.nova-lite-v1:0": {
    prefix: "ca",
    modelId: "amazon.nova-lite-v1:0",
    sources: { [TOKYO]: ["ca-central-1", "ca-west-1"] },
  },
};

const geoHeadings = (modelId) =>
  [...document.querySelectorAll(`tbody tr[data-model-id="${modelId}"] .geo-area`)].map(
    (node) => node.textContent,
  );

beforeEach(() => {
  Object.defineProperty(navigator, "language", { value: "ja-JP", configurable: true });
});

describe("TABLE-001 AC-004 地理圏の見出しは辞書 → 無ければ接頭辞そのもの", () => {
  it("辞書にある接頭辞は平易な名前になる (ca → カナダ)", () => {
    mountFixtureApp({ extraProfiles: CA_PROFILE });
    expect(geoHeadings("amazon.nova-lite-v1:0")).toContain("カナダ");
  });

  it("辞書に無い接頭辞は接頭辞そのものを見出しに出す (落とさない・例外にしない)", () => {
    mountFixtureApp({ extraProfiles: UNKNOWN_PROFILE });
    const headings = geoHeadings("amazon.nova-lite-v1:0");
    expect(headings).toContain("zz");
    // ブロック自体は出ているので、推論先の地名も読める
    const block = [...document.querySelectorAll('.geo-entry[data-prefix="zz"]')];
    expect(block).toHaveLength(1);
    expect(block[0].textContent).toContain("カナダ (中部)");
  });

  it("単体でも辞書のキーが無ければコードを返す", () => {
    expect(geoAreaLabel("jp")).toBe("日本国内");
    expect(geoAreaLabel("zz")).toBe("zz");
    expect(geoLimitLabel("zz")).toBe("zz");
    expect(countryLimitLabel("zz")).toBe("zz");
  });
});

describe("FILTER-001 AC-020 地理圏の一覧はデータ由来", () => {
  it("辞書には ca / in のラベルが ja / en の両方にある", () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const family of ["geoArea", "filter.country", "filter.geo"]) {
        const dict = family.split(".").reduce((acc, key) => acc[key], dictionaries[lang]);
        for (const code of ["ca", "in"]) {
          expect(typeof dict[code], `${lang}.${family}.${code}`).toBe("string");
        }
      }
    }
  });

  it("ca / in は国のラベルに畳まれ、件数はデータ由来になる", () => {
    mountFixtureApp();
    const labels = [...document.querySelectorAll("#filter-limit option")].map(
      (option) => option.textContent,
    );
    expect(labels).toEqual([
      "制限なし",
      "日本国内（2）",
      "米国内（4）",
      "オーストラリア国内（2）",
      "カナダ国内（2）",
      "インド国内（2）",
      "オーストラリア＋ニュージーランド（3）",
      "EU 内（8）",
      // fixture は東京だけのスナップショットなので apac. の destination が実データより狭い。
      // 件数は固定値ではなくデータから出ている証拠になる (実データでの 11 件は
      // tests/geo-prefix-rule.test.js が確かめる)。
      "アジア太平洋内（10）",
      "カスタム…",
    ]);
    const values = [...document.querySelectorAll("#filter-limit option")].map(
      (option) => option.value,
    );
    expect(values).not.toContain("geo:ca");
    expect(values).not.toContain("geo:in");
  });

  it("辞書にラベルが無い地理圏も選択肢に残り、コードのまま出る", () => {
    // zz. のプロファイルの destination はカナダの 2 リージョン。country:ca と集合が
    // 同じなので国に畳まれる。畳まれない形にするため東京を足しておく。
    mountFixtureApp({
      extraProfiles: {
        "zz.amazon.nova-lite-v1:0": {
          prefix: "zz",
          modelId: "amazon.nova-lite-v1:0",
          sources: { [TOKYO]: ["ca-central-1", "ca-west-1", TOKYO] },
        },
      },
    });
    const option = [...document.querySelectorAll("#filter-limit option")].find(
      (node) => node.value === "geo:zz",
    );
    expect(option).toBeTruthy();
    expect(option.textContent).toBe("zz（3）");
  });

  it("カスタムのピッカーのグループも ca / in が自動で増える", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["custom"]);
    const geos = [...document.querySelectorAll("#filter-custom .filter-custom-group")].map(
      (node) => node.dataset.geo,
    );
    expect(geos).toEqual(["jp", "apac", "eu", "us", "au", "ca", "in", "other"]);
    expect($('#filter-custom .filter-custom-group[data-geo="ca"] .filter-custom-legend').textContent).toBe(
      "カナダ",
    );
  });

  it("英語でも同じ一覧で、ラベルだけが英語になる", () => {
    mountFixtureApp({ lang: "en-US" });
    setLang("en");
    const labels = [...document.querySelectorAll("#filter-limit option")].map(
      (option) => option.textContent,
    );
    expect(labels).toContain("Canada (2)");
    expect(labels).toContain("India (2)");
    expect(labels).toHaveLength(10);
  });
});
