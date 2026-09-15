// FLOW-001 の描画 (jsdom)。図の構造・共通の語彙・レーンごとの違い・i18n。
import { describe, it, expect, beforeEach } from "vitest";
import { mountFixtureApp, rowFor } from "./app-harness.js";
import { panelId } from "../src/scripts/detail-view.js";
import { CLAIM_IDS } from "../src/scripts/flow-model.mjs";
import { dictionaries, setLang, SUPPORTED_LANGS } from "../src/scripts/i18n.js";
import {
  CLAUDE_45,
  EXTRA_PROFILES,
  NVIDIA,
  regionNotes,
  regionNotesWithoutCountry,
} from "./fixtures/bedrock-fixture.js";

const NOVA = "amazon.nova-lite-v1:0";

const panelOf = (modelId) => document.getElementById(panelId(modelId));
const open = (modelId) => {
  rowFor(modelId).querySelector(".detail-toggle").click();
  return panelOf(modelId);
};
const laneOf = (panel, lane) => panel.querySelector(`[role="tabpanel"][data-lane="${lane}"]`);
const figureOf = (panel, lane) => laneOf(panel, lane).querySelector("figure.flow");
const svgOf = (panel, lane) => figureOf(panel, lane).querySelector("svg");
const svgText = (svg) => [...svg.querySelectorAll("text")].map((t) => t.textContent);

beforeEach(() => {
  mountFixtureApp({ extraProfiles: EXTRA_PROFILES });
});

describe("AC-001 図は使い方ごとに 1 枚", () => {
  it("各レーンのパネルに figure.flow > .flow-scroll > svg が 1 つある", () => {
    const panel = open(NOVA);
    for (const lane of ["inRegion", "geo", "global"]) {
      const figure = figureOf(panel, lane);
      expect(figure, lane).not.toBeNull();
      const scroll = figure.firstElementChild;
      expect(scroll.className).toBe("flow-scroll");
      expect(scroll.firstElementChild.tagName.toLowerCase()).toBe("svg");
    }
  });

  it("svg は role=img と空でない aria-label を持つ", () => {
    const svg = svgOf(open(NOVA), "inRegion");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label").length).toBeGreaterThan(20);
  });

  it("svg の中に <style> も style 属性も無い", () => {
    const panel = open(CLAUDE_45);
    for (const lane of ["inRegion", "geo", "global"]) {
      const svg = svgOf(panel, lane);
      expect(svg.querySelector("style"), lane).toBeNull();
      expect(svg.querySelectorAll("[style]"), lane).toHaveLength(0);
    }
  });

  it("Geo に 2 プロファイルあるモデルでは図が 2 枚", () => {
    expect(laneOf(open(CLAUDE_45), "geo").querySelectorAll("figure.flow")).toHaveLength(2);
  });

  it("marker の id は図ごとに違う (同じ文書に何枚も並ぶ)", () => {
    const panel = open(CLAUDE_45);
    const ids = [...panel.querySelectorAll("marker")].map((marker) => marker.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("AC-002 共通の語彙", () => {
  it("「あなた」「起点リージョン」「記録」の 3 行が必ず出る", () => {
    const panel = open(NOVA);
    for (const lane of ["inRegion", "geo", "global"]) {
      const texts = svgText(svgOf(panel, lane));
      expect(texts, lane).toContain("あなた");
      expect(texts, lane).toContain("起点リージョン");
      expect(texts, lane).toContain("CloudTrail（処理先を記録）");
      expect(texts, lane).toContain("CloudWatch ・ 呼び出しログ");
      expect(texts, lane).toContain("請求 ・ バッチ出力");
      expect(texts, lane).toContain("東京に残る");
      expect(texts, lane).toContain("応答は同じ経路で戻る");
    }
  });

  it("起点ノードは表示名・コード・FQDN を持つ", () => {
    const texts = svgText(svgOf(open(NOVA), "inRegion"));
    expect(texts).toContain("東京");
    expect(texts).toContain("ap-northeast-1");
    expect(texts).toContain("bedrock-runtime.ap-northeast-1.amazonaws.com");
  });

  it("往路は実線でアクセント色、復路は破線で同じゲートを通る", () => {
    const svg = svgOf(open(NOVA), "inRegion");
    expect(svg.querySelector("path.s-arrow-accent")).not.toBeNull();
    expect(svg.querySelector("path.s-arrow-back")).not.toBeNull();
  });
});

describe("AC-003 In-Region の図", () => {
  it("境界が 1 つだけで yes 色の実線", () => {
    const svg = svgOf(open(NOVA), "inRegion");
    const walls = [...svg.querySelectorAll("[data-enclosure]")];
    expect(walls).toHaveLength(1);
    expect(walls[0].getAttribute("class")).toBe("s-wall-yes");
    expect(svgText(svg)).toContain("ここで処理");
  });

  it("In-Region 不可なら内側が .s-off になり、外に注記が出る", () => {
    const svg = svgOf(open(CLAUDE_45), "inRegion");
    expect(svg.querySelector("g.s-off")).not.toBeNull();
    expect(svgText(svg)).toContain("このモデルは東京で直接提供なし");
  });

  it("可のときは .s-off を使わない", () => {
    expect(svgOf(open(NOVA), "inRegion").querySelector("g.s-off")).toBeNull();
  });
});

describe("AC-004 Geo の図", () => {
  const apacSvg = () => {
    const blocks = [...laneOf(open(CLAUDE_45), "geo").querySelectorAll(".lane-block")];
    return blocks[1].querySelector("svg");
  };

  it("境界が 2 重 (外側が実線、内側が yes)", () => {
    const walls = [...apacSvg().querySelectorAll("[data-enclosure]")];
    expect(walls.map((wall) => wall.dataset.enclosure)).toEqual(["area", "country"]);
    expect(walls[0].getAttribute("class")).toBe("s-wall");
    expect(walls[1].getAttribute("class")).toBe("s-wall-yes");
  });

  it("外側の見出しは接頭辞の辞書から、内側は起点の国の名前", () => {
    const texts = svgText(apacSvg());
    expect(texts).toContain("アジア太平洋 地理圏");
    expect(texts).toContain("日本");
  });

  it("国外のチップは warn、国内のチップは warn ではない", () => {
    const svg = apacSvg();
    const warn = [...svg.querySelectorAll("rect.s-chip-warn")];
    expect(warn).toHaveLength(6);
    expect(svgText(svg)).toContain("国外 6");
    expect(svgText(svg)).toContain("国内 2");
    expect(svgText(svg)).toContain("アジア太平洋 内のどこかで処理");
    expect(svgText(svg)).toContain("どれが選ばれるかは指定できない");
  });

  it("国外 0 件ならチップ群ごと省く", () => {
    const svg = [...laneOf(open(CLAUDE_45), "geo").querySelectorAll("svg")][0]; // jp. のみ
    expect(svg.querySelectorAll("rect.s-chip-warn")).toHaveLength(0);
    expect(svgText(svg)).not.toContain("国外 0");
    // 外側の境界は残る。
    expect(svg.querySelector('[data-enclosure="area"]')).not.toBeNull();
  });

  it("未知の接頭辞では接頭辞そのものが見出しになる", () => {
    mountFixtureApp({
      extraProfiles: {
        ...EXTRA_PROFILES,
        [`zz.${NOVA}`]: {
          prefix: "zz",
          modelId: NOVA,
          sources: { "ap-northeast-1": ["ap-northeast-1"] },
        },
      },
    });
    const svgs = [...laneOf(open(NOVA), "geo").querySelectorAll("svg")];
    const titles = svgs.flatMap((svg) => svgText(svg)).filter((text) => text.includes("地理圏"));
    expect(titles).toContain("zz 地理圏");
  });

  it("起点の国が分からないときは内側の境界を描かず、warn のチップも出さない", () => {
    mountFixtureApp({
      extraProfiles: EXTRA_PROFILES,
      regionNotes: regionNotesWithoutCountry(),
    });
    const blocks = [...laneOf(open(CLAUDE_45), "geo").querySelectorAll(".lane-block")];
    const svg = blocks[1].querySelector("svg");
    expect([...svg.querySelectorAll("[data-enclosure]")]).toHaveLength(1);
    expect(svg.querySelectorAll("rect.s-chip-warn")).toHaveLength(0);
    expect(svgText(svg)).toContain("推論先 8");
  });
});

describe("AC-005 Global の図", () => {
  const globalSvg = () => svgOf(open(CLAUDE_45), "global");

  it("外側の壁は右端で閉じず、s-wall-open が付く", () => {
    const wall = globalSvg().querySelector('[data-enclosure="world"]');
    expect(wall.getAttribute("class")).toBe("s-wall-open");
    const d = wall.getAttribute("d");
    // 上辺が右端で終わり、下辺は M で始まる = 右辺のセグメントが無い。
    expect(d).toContain("L824,40 M824,250");
    expect(d.match(/824,/g)).toHaveLength(2);
  });

  it("見出しは「全商用リージョン ・ 境界なし」、内側は記録が残る場所", () => {
    const texts = svgText(globalSvg());
    expect(texts).toContain("全商用リージョン ・ 境界なし");
    expect(texts).toContain("東京 ・ 記録が残る場所");
    expect(texts).toContain("国外を含む ・ 限定できない");
    expect(texts).toContain("右に壁がない ＝ 範囲を限定できない");
  });

  it("サンプルのチップに fade クラスが付く", () => {
    const fades = [...globalSvg().querySelectorAll("rect.s-chip-faint")].map((rect) =>
      rect.getAttribute("class"),
    );
    expect(fades.length).toBeGreaterThan(3);
    expect(fades.join(" ")).toMatch(/s-fade-1/);
    expect(fades.join(" ")).toMatch(/s-fade-4/);
  });

  it("figcaption に地名が例示であることを書く", () => {
    expect(figureOf(open(CLAUDE_45), "global").querySelector("figcaption").textContent).toContain(
      "例示",
    );
  });
});

describe("AC-006 国外に出るレーンの警告", () => {
  it("Geo と Global にはあり、In-Region には無い", () => {
    const panel = open(CLAUDE_45);
    const warning = "不正利用検知で保存される入出力は推論先に置かれうる";
    expect(svgText(svgOf(panel, "geo"))).toContain(warning);
    expect(svgText(svgOf(panel, "global"))).toContain(warning);
    expect(svgText(svgOf(panel, "inRegion"))).not.toContain(warning);
  });
});

describe("AC-007 figcaption と出典", () => {
  it("各図に figcaption と出典の行が 1 つずつある", () => {
    const panel = open(CLAUDE_45);
    for (const lane of ["inRegion", "global"]) {
      const figure = figureOf(panel, lane);
      expect(figure.querySelectorAll("figcaption"), lane).toHaveLength(1);
      expect(figure.querySelectorAll("p.flow-sources"), lane).toHaveLength(1);
      expect(figure.querySelector("p.flow-sources").textContent, lane).toContain("出典");
    }
  });
});

describe("AC-008 主張と根拠の対応", () => {
  it("図に出る主張は flow.claims の C-1 〜 C-8 の識別子だけ", () => {
    const panel = open(CLAUDE_45);
    const claims = [...panel.querySelectorAll("[data-claim]")].map(
      (element) => element.dataset.claim,
    );
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) expect(CLAIM_IDS).toContain(claim);
  });

  // AC-008 の本体: 図に出る文は「辞書の flow.* を描いたもの」だけで構成される。
  // data-claim の検査だけだと、属性を付け忘れた根拠の無い文が素通りしてしまう。
  const flowTemplates = (lang) => {
    const out = [];
    const walk = (value) => {
      if (typeof value === "string") out.push(value);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(dictionaries[lang].flow);
    return out;
  };
  // "{place}" のような置換子は任意の文字列に当たる。
  const templateMatchers = (lang) =>
    flowTemplates(lang).map(
      (template) =>
        new RegExp(
          `^${template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[a-zA-Z]+\\\}/g, ".+")}$`,
        ),
    );

  // flow.* 以外で図に出てよいのは、翻訳しない識別子・region-notes.json の地名・
  // 内側の境界の見出しに使う国名 (country.*) だけ (AC-004 / AC-009)。
  const untranslated = (lang) => {
    const codes = Object.keys(regionNotes).filter((key) => key !== "_source");
    return new Set([
      ...codes,
      ...codes.map((code) => regionNotes[code].endpoint),
      ...codes.map((code) => regionNotes[code][lang]),
      ...Object.values(dictionaries[lang].country),
    ]);
  };

  const assertVocabulary = (lang) => {
    const matchers = templateMatchers(lang);
    const allowed = untranslated(lang);
    const panel = open(CLAUDE_45);
    const texts = [...panel.querySelectorAll("svg text, figcaption, p.flow-sources")].map(
      (element) => element.textContent,
    );
    expect(texts.length).toBeGreaterThan(20);
    for (const text of texts) {
      if (allowed.has(text)) continue;
      expect(
        matchers.some((matcher) => matcher.test(text)),
        `${lang}: 図の文「${text}」が flow.* の辞書に無い`,
      ).toBe(true);
    }
  };

  it("図に出る文はすべて flow.* の辞書を描いたもの (ja)", () => {
    assertVocabulary("ja");
  });

  it("図に出る文はすべて flow.* の辞書を描いたもの (en)", () => {
    mountFixtureApp({ extraProfiles: EXTRA_PROFILES, lang: "en-US" });
    setLang("en");
    assertVocabulary("en");
  });

  it("辞書は C-1 〜 C-8 をちょうど持つ", () => {
    for (const lang of SUPPORTED_LANGS) {
      expect(Object.keys(dictionaries[lang].flow.claims).sort()).toEqual([...CLAIM_IDS]);
    }
  });

  it("C-5 の文言は「推定」(en: inferred) と分かる書き方", () => {
    expect(dictionaries.ja.flow.claims.c5).toContain("推定");
    expect(dictionaries.en.flow.claims.c5).toContain("inferred");
  });

  it("出典の行も呼び出しログの所在が推定であることを書く", () => {
    const sources = figureOf(open(CLAUDE_45), "global").querySelector("p.flow-sources");
    expect(sources.dataset.claim).toBe("c5");
    expect(sources.textContent).toContain("推定");
    setLang("en");
    expect(dictionaries.en.flow.sources).toContain("inferred");
  });
});

describe("AC-009 i18n", () => {
  it("英語に切り替えると図の中も英語になる", () => {
    mountFixtureApp({ extraProfiles: EXTRA_PROFILES, lang: "en-US" });
    setLang("en");
    const texts = svgText(svgOf(open(NOVA), "inRegion"));
    expect(texts).toContain("You");
    expect(texts).toContain("Source Region");
    expect(texts).toContain("CloudTrail (records where it ran)");
    expect(texts).not.toContain("あなた");
  });

  it("リージョンコードと FQDN は両言語で変わらない", () => {
    const ja = svgText(svgOf(open(NOVA), "inRegion"));
    mountFixtureApp({ extraProfiles: EXTRA_PROFILES, lang: "en-US" });
    setLang("en");
    const en = svgText(svgOf(open(NOVA), "inRegion"));
    for (const fixed of ["ap-northeast-1", "bedrock-runtime.ap-northeast-1.amazonaws.com"]) {
      expect(ja).toContain(fixed);
      expect(en).toContain(fixed);
    }
  });
});

describe("AC-010 推論先が 0 件のプロファイル", () => {
  it("チップが 0 個で、件数の見出しも出ず、例外も出ない", () => {
    const svg = svgOf(open(NVIDIA), "geo");
    expect(svg.querySelectorAll("rect.s-chip, rect.s-chip-warn, rect.s-chip-accent")).toHaveLength(
      0,
    );
    const texts = svgText(svg);
    expect(texts.some((text) => text.startsWith("国内"))).toBe(false);
    expect(texts.some((text) => text.startsWith("国外"))).toBe(false);
    // 内側の境界・起点・記録は描く。
    expect(svg.querySelectorAll("[data-enclosure]")).toHaveLength(2);
    expect(texts).toContain("起点リージョン");
  });
});

describe("AC-NFR-001 横スクロールの入れ物", () => {
  it("図は .flow-scroll の中に入る (CSS の取り決めは responsive.test.js)", () => {
    expect(figureOf(open(NOVA), "inRegion").querySelector(".flow-scroll")).not.toBeNull();
  });
});
