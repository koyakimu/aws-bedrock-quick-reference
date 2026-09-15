// @vitest-environment node
// ファイル本文を読む検査があるので node 環境で走らせる。
// FLOW-001 の純関数側 (座標・境界・国内 / 国外の切り分け・壁の d 属性)。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CLAIM_IDS,
  FLOW_WIDTH,
  OPEN_WALL_RIGHT,
  chipWidth,
  contains,
  describeFlow,
  layoutChips,
  openWallPath,
  splitDestinations,
} from "../src/scripts/flow-model.mjs";
import { regionNotes, regionNotesWithoutCountry, TOKYO } from "./fixtures/bedrock-fixture.js";

const APAC = [
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-4",
];

const LABELS = {
  you: "あなた",
  record: "記録",
  processedHere: "ここで処理",
  regionTitle: "東京リージョン",
  areaTitle: "アジア太平洋 地理圏",
  countryTitle: "日本",
  worldTitle: "全商用リージョン ・ 境界なし",
  innerTitle: "東京 ・ 記録が残る場所",
  andMore: "ほか…",
};

const describe3 = (lane, options = {}) =>
  describeFlow(lane, {
    origin: TOKYO,
    regionNotes,
    lang: "ja",
    labels: LABELS,
    ...options,
  });

describe("AC-004 推論先の国内 / 国外", () => {
  it("起点の country で切り分け、件数を返す", () => {
    const split = splitDestinations(APAC, { origin: TOKYO, regionNotes });
    expect(split.countryKnown).toBe(true);
    expect(split.domestic.map((place) => place.code)).toEqual(["ap-northeast-1", "ap-northeast-3"]);
    expect(split.foreign).toHaveLength(6);
  });

  it("起点が先頭に来る", () => {
    const split = splitDestinations(APAC, { origin: TOKYO, regionNotes });
    expect(split.domestic[0].isOrigin).toBe(true);
  });

  it("国外 0 件でも落ちない", () => {
    const split = splitDestinations(["ap-northeast-1", "ap-northeast-3"], {
      origin: TOKYO,
      regionNotes,
    });
    expect(split.foreign).toEqual([]);
    expect(split.domestic).toHaveLength(2);
  });

  it("起点の country が分からないときは切り分けない", () => {
    const split = splitDestinations(APAC, {
      origin: TOKYO,
      regionNotes: regionNotesWithoutCountry(),
    });
    expect(split.countryKnown).toBe(false);
    expect(split.domestic).toEqual([]);
    expect(split.foreign).toEqual([]);
    expect(split.rest).toHaveLength(8);
  });

  it("空配列でも例外にならない", () => {
    expect(splitDestinations([], { origin: TOKYO, regionNotes }).all).toEqual([]);
    expect(splitDestinations(undefined, { origin: TOKYO, regionNotes }).all).toEqual([]);
  });
});

describe("AC-002 共通の語彙", () => {
  for (const lane of ["inRegion", "geo", "global"]) {
    it(`${lane}: 「あなた」「起点」「記録」のノードが必ずある`, () => {
      const description = describe3(lane, { destinations: APAC, available: true });
      expect(description.nodes.map((node) => node.id)).toEqual(
        expect.arrayContaining(["you", "origin", "record"]),
      );
    });

    it(`${lane}: 「あなた」はどの境界の矩形にも入らない`, () => {
      const description = describe3(lane, { destinations: APAC, available: true });
      const you = description.nodes.find((node) => node.id === "you");
      for (const box of description.enclosures) {
        // 4 隅のどれも境界の中に無い = 完全に外側。
        for (const [px, py] of [
          [you.x, you.y],
          [you.x + you.width, you.y],
          [you.x, you.y + you.height],
          [you.x + you.width, you.y + you.height],
        ]) {
          expect(contains(box, px, py), `${lane}/${box.id}`).toBe(false);
        }
      }
    });
  }

  it("起点と記録のノードは境界の内側にある", () => {
    const description = describe3("inRegion", { available: true });
    const box = description.enclosures[0];
    for (const id of ["origin", "record"]) {
      const node = description.nodes.find((entry) => entry.id === id);
      expect(contains(box, node.x, node.y)).toBe(true);
    }
  });
});

describe("AC-003 In-Region の図", () => {
  it("境界は 1 つだけ", () => {
    const description = describe3("inRegion", { available: true });
    expect(description.enclosures).toHaveLength(1);
    expect(description.enclosures[0].kind).toBe("yes");
  });

  it("不可でも図の形は変わらない (available だけが false)", () => {
    const off = describe3("inRegion", { available: false });
    expect(off.enclosures).toHaveLength(1);
    expect(off.available).toBe(false);
    expect(off.height).toBe(280);
  });
});

describe("AC-004 Geo の図", () => {
  it("境界が 2 重になる", () => {
    const description = describe3("geo", { destinations: APAC });
    expect(description.enclosures.map((box) => box.id)).toEqual(["area", "country"]);
    expect(description.enclosures[1].kind).toBe("yes");
  });

  it("国が分からないときは内側の境界を描かず、チップを切り分けない", () => {
    const description = describeFlow("geo", {
      origin: TOKYO,
      regionNotes: regionNotesWithoutCountry(),
      labels: LABELS,
      destinations: APAC,
    });
    expect(description.enclosures.map((box) => box.id)).toEqual(["area"]);
    expect(description.countryKnown).toBe(false);
    expect(description.domestic).toEqual([]);
    expect(description.rest).toHaveLength(8);
  });

  it("国外 0 件ならチップ群ごと無くなるが外側の境界は残る", () => {
    const description = describe3("geo", { destinations: ["ap-northeast-1", "ap-northeast-3"] });
    expect(description.foreign).toEqual([]);
    expect(description.enclosures[0].id).toBe("area");
  });

  it("チップが多いと高さが伸び、幅は変わらない", () => {
    const many = describe3("geo", { destinations: Object.keys(regionNotes).filter((k) => k !== "_source") });
    expect(many.width).toBe(FLOW_WIDTH);
    expect(many.height).toBeGreaterThan(280);
  });
});

describe("AC-010 推論先が 0 件のプロファイル", () => {
  it("チップ 0 個・件数の見出し無し・例外なし", () => {
    const description = describe3("geo", { destinations: [] });
    expect(description.domestic).toEqual([]);
    expect(description.foreign).toEqual([]);
    expect(description.domesticCount).toBe(0);
    expect(description.foreignCount).toBe(0);
    // 内側の境界と 起点 / 記録 は描く。
    expect(description.enclosures.map((box) => box.id)).toEqual(["area", "country"]);
    expect(description.nodes.map((node) => node.id)).toEqual(["you", "origin", "record"]);
  });
});

describe("AC-005 Global の壁", () => {
  it("右辺のセグメントを持たない (上辺と下辺のあいだでペンが上がる)", () => {
    const d = openWallPath({ x: 134, y: 40, height: 210 });
    expect(d).toContain(`L${OPEN_WALL_RIGHT},40 M${OPEN_WALL_RIGHT},250`);
    // 右端の x 座標は 2 回しか出ない = 右辺を描いていない。
    expect(d.match(new RegExp(`${OPEN_WALL_RIGHT},`, "g"))).toHaveLength(2);
  });

  it("外側は open、内側は yes の 2 重", () => {
    const description = describe3("global");
    expect(description.enclosures.map((box) => box.kind)).toEqual(["open", "yes"]);
  });

  it("淡くなっていくサンプルのチップが並ぶ", () => {
    const description = describe3("global");
    expect(description.samples.length).toBeGreaterThan(3);
    expect(description.samples.map((chip) => chip.fade)).toEqual(
      expect.arrayContaining([1, 2, 3, 4]),
    );
  });
});

describe("チップの配置", () => {
  it("幅は名前の長さで決まり、最小 48px", () => {
    expect(chipWidth("東京")).toBe(48);
    expect(chipWidth("ハイデラバード")).toBeGreaterThan(chipWidth("東京"));
  });

  it("maxX を越えたら折り返す", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: `name-${i}` }));
    const laid = layoutChips(items, { x: 486, y: 86, maxX: 806 });
    expect(laid.rows).toBeGreaterThan(1);
    for (const chip of laid.chips) expect(chip.x + chip.width).toBeLessThanOrEqual(806);
  });
});

describe("AC-008 主張の識別子", () => {
  it("C-1 〜 C-8 の 8 件", () => {
    expect(CLAIM_IDS).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
  });
});

// --- ソースの検査 ---------------------------------------------------------
const read = (path) =>
  readFileSync(fileURLToPath(new URL(`../src/scripts/${path}`, import.meta.url)), "utf8");

describe("AC-009 図の文字列は辞書経由", () => {
  it("flow-*.js に日本語の直書きが無い (コメントを除く)", () => {
    for (const path of ["flow-model.mjs", "flow-figure.js"]) {
      const code = read(path)
        // 説明のコメントは日本語で書く。検査対象はコードの本体だけ。
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, path).not.toMatch(/[\u3040-\u30ff\u4e00-\u9faf]/);
    }
  });
});

describe("DETAIL-001 AC-022 パネルは cause の経路を持たない (D-008)", () => {
  it("パネルと図のコードに cause も fetchLog も現れない", () => {
    for (const path of ["detail-view.js", "detail-model.mjs", "flow-figure.js", "flow-model.mjs"]) {
      const source = read(path);
      expect(source, path).not.toMatch(/\bcause\b/);
      expect(source, path).not.toContain("fetchLog");
    }
  });
});
