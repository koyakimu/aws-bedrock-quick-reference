// FILTER-001 の単体テスト。AC-001 / 002 / 003 / 004 / 005 / 006 / 007 / 008 / 011。
// 判定は TABLE-001 の行をそのまま使い、やり直さない。
import { describe, it, expect } from "vitest";
import { buildViewModel } from "../src/scripts/bedrock-view-model.mjs";
import { regionName } from "../src/scripts/region-names.js";
import {
  COUNTRY_CODES,
  GEO_CODES,
  MODALITIES,
  NO_LIMIT,
  annotateRow,
  applyFilters,
  activeConditions,
  buildLimitOptions,
  geoGroupRegions,
  isCallable,
  isValidLimit,
  limitRegionSet,
  providerOptions,
  regionsByCountry,
  removeCondition,
  satisfiesLimit,
} from "../src/scripts/filter-model.mjs";
import { buildSnapshot, regionNotes, TOKYO } from "./fixtures/bedrock-fixture.js";

const snapshot = buildSnapshot();

function rowsFor(region = TOKYO) {
  return buildViewModel({
    models: snapshot.models,
    profiles: snapshot.profiles,
    fetchLog: snapshot.fetchLog,
    regionNotes,
    region,
  }).rows;
}

const rows = rowsFor();
const options = buildLimitOptions({ regionNotes, profiles: snapshot.profiles });
const setFor = (value) => limitRegionSet(options, value);
const ids = (result) => result.rows.map((row) => row.modelId).sort();

// --- AC-001 提供元 ---
describe("FILTER-001 AC-001 提供元で絞る", () => {
  it("providerName が一致する行だけが残る", () => {
    const result = applyFilters(rows, { provider: ["Anthropic"] }, { region: TOKYO });
    expect(ids(result)).toEqual(["anthropic.claude-sonnet-4-5-20250929-v1:0"]);
    expect(result.total).toBe(rows.length);
    expect(result.shown).toBe(1);
  });

  it("選択肢は表示中データの providerName の実値から生成する (固定表を持たない)", () => {
    expect(providerOptions(rows)).toEqual(["Amazon", "Anthropic", "Cohere", "NVIDIA"]);
    expect(providerOptions([])).toEqual([]);
  });

  it("複数選んだら OR になる", () => {
    const result = applyFilters(rows, { provider: ["Anthropic", "Cohere"] }, { region: TOKYO });
    expect(ids(result)).toEqual([
      "anthropic.claude-sonnet-4-5-20250929-v1:0",
      "cohere.embed-v4:0",
    ]);
  });
});

// --- AC-002 モダリティ ---
describe("FILTER-001 AC-002 モダリティで絞る", () => {
  it("選択肢は TEXT / IMAGE / SPEECH / VIDEO / EMBEDDING の 5 種", () => {
    expect([...MODALITIES]).toEqual(["TEXT", "IMAGE", "SPEECH", "VIDEO", "EMBEDDING"]);
  });

  it("input に含まれる行が残る", () => {
    const result = applyFilters(rows, { modality: ["IMAGE"] }, { region: TOKYO });
    expect(ids(result)).toEqual([
      "amazon.nova-lite-v1:0",
      "anthropic.claude-sonnet-4-5-20250929-v1:0",
      "cohere.embed-v4:0",
      "nvidia.nemotron-nano-12b-v2",
    ]);
  });

  it("output にしか含まれない行も残る (EMBEDDING は出力側)", () => {
    const result = applyFilters(rows, { modality: ["EMBEDDING"] }, { region: TOKYO });
    expect(ids(result)).toEqual(["amazon.titan-embed-text-v1:2:8k", "cohere.embed-v4:0"]);
  });
});

// --- AC-003 名前の部分一致 ---
describe("FILTER-001 AC-003 名前の部分一致", () => {
  it("modelId に対して大文字小文字を区別せず部分一致する", () => {
    expect(ids(applyFilters(rows, { q: "SONNET" }, { region: TOKYO }))).toEqual([
      "anthropic.claude-sonnet-4-5-20250929-v1:0",
    ]);
  });

  it("modelName にしか無い語にも一致する", () => {
    // modelId は nvidia.nemotron-nano-12b-v2、名前だけが "Nemotron Nano 12B v2 VL BF16"
    expect(ids(applyFilters(rows, { q: "bf16" }, { region: TOKYO }))).toEqual([
      "nvidia.nemotron-nano-12b-v2",
    ]);
  });

  it("空文字や空白だけなら何も絞らない", () => {
    expect(applyFilters(rows, { q: "   " }, { region: TOKYO }).shown).toBe(rows.length);
  });
});

// --- AC-004 この起点から呼べるものだけ ---
describe("FILTER-001 AC-004 この起点リージョンから呼べるものだけ", () => {
  it("In-Region / Geo / Global が 3 つとも不可の行が消える", () => {
    const titan = rows.find((row) => row.modelId === "amazon.titan-embed-text-v1:2:8k");
    expect(titan.inRegion).toBe(false);
    expect(titan.geo).toEqual([]);
    expect(titan.global).toBeNull();
    expect(isCallable(titan)).toBe(false);

    const result = applyFilters(rows, { callable: true }, { region: TOKYO });
    expect(ids(result)).not.toContain("amazon.titan-embed-text-v1:2:8k");
    expect(result.shown).toBe(rows.length - 1);
  });

  it("いずれか 1 つが可なら残る", () => {
    const claude = rows.find((row) => row.modelId === "anthropic.claude-sonnet-4-5-20250929-v1:0");
    expect(claude.inRegion).toBe(false);
    expect(isCallable(claude)).toBe(true);
  });
});

// --- AC-005 推論先の限定: 国 ---
describe("FILTER-001 AC-005 推論先の限定 (国)", () => {
  it("国の選択肢は日本 / オーストラリア / 米国の 3 件", () => {
    expect([...COUNTRY_CODES]).toEqual(["jp", "au", "us"]);
    expect(regionsByCountry(regionNotes, "jp")).toEqual(["ap-northeast-1", "ap-northeast-3"]);
    expect(regionsByCountry(regionNotes, "us")).toEqual([
      "us-east-1",
      "us-east-2",
      "us-west-1",
      "us-west-2",
    ]);
  });

  it("satisfiesLimit: jp. プロファイル / apac. プロファイル / In-Region の 3 パターン", () => {
    const jp = setFor("country:jp");
    // jp. プロファイルの destination は L の部分集合
    expect(satisfiesLimit(["ap-northeast-1", "ap-northeast-3"], jp)).toBe(true);
    // apac. プロファイルは ap-south-1 などを含むので満たさない
    expect(
      satisfiesLimit(
        ["ap-northeast-1", "ap-northeast-2", "ap-northeast-3", "ap-south-1"],
        jp,
      ),
    ).toBe(false);
    // In-Region の推論先は起点自身だけ
    expect(satisfiesLimit(["ap-northeast-1"], jp)).toBe(true);
  });

  it("「日本国内のみ」で残る行は In-Region 可の行と jp. を持つ行の和集合", () => {
    const result = applyFilters(
      rows,
      { limit: "country:jp" },
      { region: TOKYO, limitRegions: setFor("country:jp") },
    );
    expect(ids(result)).toEqual([
      "amazon.nova-lite-v1:0",
      "anthropic.claude-sonnet-4-5-20250929-v1:0",
      "cohere.embed-v4:0",
      "nvidia.nemotron-nano-12b-v2",
    ]);
  });

  it("満たさない使い方は行が残ってもセルが「限定外」の印になる", () => {
    const result = applyFilters(
      rows,
      { limit: "country:jp" },
      { region: TOKYO, limitRegions: setFor("country:jp") },
    );
    const nova = result.rows.find((row) => row.modelId === "amazon.nova-lite-v1:0");
    expect(nova.limit.inRegion).toBe(true);
    expect(nova.limit.geo["apac.amazon.nova-lite-v1:0"]).toBe(false);

    const claude = result.rows.find(
      (row) => row.modelId === "anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    expect(claude.limit.geo["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"]).toBe(true);
    expect(claude.limit.global).toBe(false);
  });
});

// --- AC-006 推論先の限定: 地理圏 ---
describe("FILTER-001 AC-006 推論先の限定 (地理圏)", () => {
  it("地理圏の選択肢は jp / apac / eu / us / au の 5 件", () => {
    expect([...GEO_CODES]).toEqual(["jp", "apac", "eu", "us", "au"]);
  });

  it("地理圏グループは profiles.json の destination 和集合から導出する", () => {
    // ap-southeast-2 は region-notes.json では geo:au だが、apac. プロファイルの
    // destination に現れるのでグループに入る (固定表ではなくデータから導出している証拠)。
    const apac = geoGroupRegions(regionNotes, snapshot.profiles, "apac");
    expect(apac).toContain("ap-southeast-2");
    expect(apac).toContain("ap-northeast-1");
    expect(apac).toContain("ap-northeast-3");
    // プロファイルが 1 件も無い地理圏は region-notes.json の geo から導出する
    expect(geoGroupRegions(regionNotes, {}, "eu")).toContain("eu-central-1");
  });

  it("判定は接頭辞ではなく destination の包含で行う (jp. も APAC 内に収まる)", () => {
    const apac = setFor("geo:apac");
    const result = applyFilters(
      rows,
      { limit: "geo:apac" },
      { region: TOKYO, limitRegions: apac },
    );
    const claude = result.rows.find(
      (row) => row.modelId === "anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    expect(claude.limit.geo["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"]).toBe(true);
    const nova = result.rows.find((row) => row.modelId === "amazon.nova-lite-v1:0");
    expect(nova.limit.geo["apac.amazon.nova-lite-v1:0"]).toBe(true);
  });

  it("起点が EU 圏外なら「EU 内のみ」で 0 件になる", () => {
    const result = applyFilters(
      rows,
      { limit: "geo:eu" },
      { region: TOKYO, limitRegions: setFor("geo:eu") },
    );
    expect(result.shown).toBe(0);
    expect(result.total).toBe(rows.length);
  });
});

// --- AC-007 In-Region と限定集合 ---
describe("FILTER-001 AC-007 In-Region と限定集合の関係", () => {
  it("R ∈ L なら In-Region は常に満たす", () => {
    const row = rows.find((r) => r.modelId === "nvidia.nemotron-nano-12b-v2");
    const annotated = annotateRow(row, { region: TOKYO, limitRegions: setFor("country:jp") });
    expect(annotated.limit.inRegion).toBe(true);
    expect(annotated.limit.any).toBe(true);
  });

  it("R ∉ L なら In-Region は満たさない", () => {
    const row = rows.find((r) => r.modelId === "nvidia.nemotron-nano-12b-v2");
    const annotated = annotateRow(row, { region: TOKYO, limitRegions: setFor("country:us") });
    expect(annotated.limit.inRegion).toBe(false);
    expect(annotated.limit.any).toBe(false);
  });
});

// --- AC-008 Global は常に満たさない ---
describe("FILTER-001 AC-008 Global は限定を満たさない", () => {
  it("destination が ['*'] のときどの L でも false", () => {
    for (const value of options.filter((o) => o.kind !== "none").map((o) => o.value)) {
      expect(satisfiesLimit(["*"], setFor(value)), value).toBe(false);
    }
  });

  it("global. しか使えないモデルは限定選択時に候補から外れる", () => {
    const onlyGlobal = [
      {
        modelId: "vendor.global-only",
        provider: "Vendor",
        name: "Global Only",
        input: ["TEXT"],
        output: ["TEXT"],
        inRegion: false,
        geo: [],
        global: { profileId: "global.vendor.global-only", prefix: "global" },
        notes: [],
      },
    ];
    expect(applyFilters(onlyGlobal, { limit: NO_LIMIT }, { region: TOKYO }).shown).toBe(1);
    expect(
      applyFilters(
        onlyGlobal,
        { limit: "country:jp" },
        { region: TOKYO, limitRegions: setFor("country:jp") },
      ).shown,
    ).toBe(0);
  });
});

// --- AC-009 組み合わせ (単体側。画面側は filter-render.test.js) ---
describe("FILTER-001 AC-009 絞り込みの組み合わせは AND", () => {
  it("4 条件の AND を満たす行だけが残る", () => {
    const result = applyFilters(
      rows,
      { provider: ["Anthropic"], modality: ["TEXT"], q: "claude", limit: "country:jp" },
      { region: TOKYO, limitRegions: setFor("country:jp") },
    );
    expect(ids(result)).toEqual(["anthropic.claude-sonnet-4-5-20250929-v1:0"]);
    expect(result.total).toBe(5);
  });
});

// --- AC-011 限定集合に未知のリージョン ---
describe("FILTER-001 AC-011 限定集合に未知のリージョンが含まれる", () => {
  const profilesWithUnknown = {
    ...snapshot.profiles,
    "jp.vendor.future-model": {
      prefix: "jp",
      modelId: "vendor.future-model",
      name: "JP Future",
      sources: { "ap-northeast-1": ["ap-northeast-1", "xx-nowhere-9"] },
    },
  };

  it("region-notes.json に無いコードも限定集合にそのまま含める", () => {
    const jp = geoGroupRegions(regionNotes, profilesWithUnknown, "jp");
    expect(jp).toContain("xx-nowhere-9");
    expect(jp).toContain("ap-northeast-1");
  });

  it("表示名はコードをそのまま出す (落とさない・例外にしない)", () => {
    expect(regionName("xx-nowhere-9", "ja", regionNotes)).toBe("xx-nowhere-9");
    expect(regionName("xx-nowhere-9", "en", regionNotes)).toBe("xx-nowhere-9");
  });

  it("判定が黙って緩まない (未知コードを含む L でも包含判定は厳密)", () => {
    const unknownOptions = buildLimitOptions({ regionNotes, profiles: profilesWithUnknown });
    const jp = limitRegionSet(unknownOptions, "geo:jp");
    expect(satisfiesLimit(["ap-northeast-1", "xx-nowhere-9"], jp)).toBe(true);
    // L に無い ap-south-1 が 1 つでも混じれば満たさない
    expect(satisfiesLimit(["ap-northeast-1", "ap-south-1"], jp)).toBe(false);
    expect(satisfiesLimit([], jp)).toBe(false);
  });
});

// --- 補助: 条件チップと limit の正当性判定 (SHARE-001 が使う) ---
describe("FILTER-001 条件チップ", () => {
  it("設定中の条件が 1 個ずつチップに展開される", () => {
    expect(
      activeConditions({ provider: ["Anthropic"], modality: ["TEXT"], q: "claude", callable: true, limit: "country:jp" }),
    ).toEqual([
      { param: "provider", value: "Anthropic" },
      { param: "modality", value: "TEXT" },
      { param: "q", value: "claude" },
      { param: "callable", value: true },
      { param: "limit", value: "country:jp" },
    ]);
    expect(activeConditions({})).toEqual([]);
  });

  it("チップを外すとその条件だけが消える", () => {
    const next = removeCondition(
      { provider: ["Anthropic", "Cohere"], limit: "country:jp" },
      { param: "provider", value: "Anthropic" },
    );
    expect(next.provider).toEqual(["Cohere"]);
    expect(next.limit).toBe("country:jp");
    expect(removeCondition(next, { param: "limit", value: "country:jp" }).limit).toBe(NO_LIMIT);
  });

  it("limit の正当値は 制限なし + 国 3 + 地理圏 5 の 9 件", () => {
    expect(options.map((option) => option.value)).toEqual([
      "none",
      "country:jp",
      "country:au",
      "country:us",
      "geo:jp",
      "geo:apac",
      "geo:eu",
      "geo:us",
      "geo:au",
    ]);
    expect(isValidLimit(options, "country:atlantis")).toBe(false);
    expect(isValidLimit(options, "geo:apac")).toBe(true);
  });
});
