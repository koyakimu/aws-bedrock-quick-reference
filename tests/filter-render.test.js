// FILTER-001 の結合テスト (jsdom)。AC-009 / AC-010 と、UI 側から見た AC-001〜008。
import { describe, it, expect } from "vitest";
import {
  mountFixtureApp,
  bodyRows,
  modelIds,
  rowFor,
  cells,
  setSelect,
  setSearch,
  setCheckbox,
  $,
} from "./app-harness.js";
import { setLang } from "../src/scripts/i18n.js";

const CLAUDE = "anthropic.claude-sonnet-4-5-20250929-v1:0";
const NOVA = "amazon.nova-lite-v1:0";

// --- AC-001 / AC-002 / AC-003 / AC-004 (UI 側) ---
describe("FILTER-001 AC-001 提供元の選択肢は実データ由来", () => {
  it("表示中データの providerName だけが選択肢になる", () => {
    mountFixtureApp();
    const options = [...document.getElementById("filter-provider").options].map((o) => o.value);
    expect(options).toEqual(["Amazon", "Anthropic", "Cohere", "NVIDIA"]);
  });

  it("選ぶとその提供元の行だけが残る", () => {
    mountFixtureApp();
    setSelect("filter-provider", ["Anthropic"]);
    expect(modelIds()).toEqual([CLAUDE]);
  });
});

describe("FILTER-001 AC-002 モダリティの選択肢は 5 種", () => {
  it("TEXT / IMAGE / SPEECH / VIDEO / EMBEDDING", () => {
    mountFixtureApp();
    expect([...document.getElementById("filter-modality").options].map((o) => o.value)).toEqual([
      "TEXT",
      "IMAGE",
      "SPEECH",
      "VIDEO",
      "EMBEDDING",
    ]);
    setSelect("filter-modality", ["VIDEO"]);
    expect(modelIds()).toEqual([NOVA]);
  });
});

describe("FILTER-001 AC-003 名前の部分一致は入力ごとに即時反映", () => {
  it("大文字小文字を区別せず、リロードは起きない", () => {
    mountFixtureApp();
    setSearch("SoNNet");
    expect(modelIds()).toEqual([CLAUDE]);
    setSearch("");
    expect(bodyRows()).toHaveLength(5);
  });
});

describe("FILTER-001 AC-004 この起点リージョンから呼べるものだけ", () => {
  it("3 つとも不可の行が消える", () => {
    mountFixtureApp();
    expect(modelIds()).toContain("amazon.titan-embed-text-v1:2:8k");
    setCheckbox("filter-callable", true);
    expect(modelIds()).not.toContain("amazon.titan-embed-text-v1:2:8k");
    expect(bodyRows()).toHaveLength(4);
  });
});

// --- AC-005 / AC-006 / AC-007 / AC-008 (セルの印) ---
describe("FILTER-001 AC-005 推論先の限定 (国) の画面表示", () => {
  it("「日本国内のみ」で 4 行が残り、限定を満たさないセルに「限定外」が付く", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["country:jp"]);
    expect(modelIds()).toEqual([
      NOVA,
      CLAUDE,
      "cohere.embed-v4:0",
      "nvidia.nemotron-nano-12b-v2",
    ]);
    // apac. プロファイルは日本国内に収まらない
    const geoCell = cells(rowFor(NOVA))[4];
    expect(geoCell.querySelector(".geo-entry").classList.contains("out-of-limit")).toBe(true);
    expect(geoCell.textContent).toContain("限定外");
    // jp. プロファイルは収まる
    const claudeGeo = cells(rowFor(CLAUDE))[4];
    expect(claudeGeo.querySelector(".geo-entry").classList.contains("out-of-limit")).toBe(false);
  });

  it("セレクタは 制限なし + 国 3 件 + 地理圏 5 件の 2 グループ", () => {
    mountFixtureApp();
    const select = document.getElementById("filter-limit");
    expect(select.value).toBe("none");
    const groups = [...select.querySelectorAll("optgroup")];
    expect(groups.map((group) => group.label)).toEqual(["国", "地理圏"]);
    expect(groups[0].children).toHaveLength(3);
    expect(groups[1].children).toHaveLength(5);
    expect([...select.options].map((o) => o.value)).toEqual([
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
  });
});

describe("FILTER-001 AC-006 推論先の限定 (地理圏) の画面表示", () => {
  it("APAC 内のみでは apac. も jp. も限定を満たす", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["geo:apac"]);
    expect(cells(rowFor(NOVA))[4].textContent).not.toContain("限定外");
    expect(cells(rowFor(CLAUDE))[4].textContent).not.toContain("限定外");
  });
});

describe("FILTER-001 AC-007 In-Region と限定集合の関係 (画面)", () => {
  it("R ∈ L なら In-Region セルに印が付かず、R ∉ L なら付く", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["country:jp"]);
    const inRegion = cells(rowFor("nvidia.nemotron-nano-12b-v2"))[3];
    expect(inRegion.textContent).toContain("可");
    expect(inRegion.textContent).not.toContain("限定外");

    setSelect("filter-limit", ["country:us"]);
    // 起点 ap-northeast-1 は米国内ではないので、In-Region だけの行は消える
    expect(modelIds()).not.toContain("nvidia.nemotron-nano-12b-v2");
  });
});

describe("FILTER-001 AC-008 Global は限定を満たさない (画面)", () => {
  it("限定があるとき Global セルは常に「限定外」", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["country:jp"]);
    const globalCell = cells(rowFor("cohere.embed-v4:0"))[5];
    expect(globalCell.textContent).toContain("✓");
    expect(globalCell.querySelector(".cell-global").classList.contains("out-of-limit")).toBe(true);
    expect(globalCell.textContent).toContain("限定外");
  });

  it("制限なしに戻すと印は消える", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["country:jp"]);
    setSelect("filter-limit", ["none"]);
    expect(cells(rowFor("cohere.embed-v4:0"))[5].textContent).not.toContain("限定外");
  });
});

// --- AC-009 組み合わせと件数表示 ---
describe("FILTER-001 AC-009 絞り込みの組み合わせ", () => {
  it("4 条件を同時に設定すると AND を満たす行だけが残り、件数が出る", () => {
    mountFixtureApp();
    setSelect("filter-provider", ["Anthropic"]);
    setSelect("filter-modality", ["TEXT"]);
    setSearch("claude");
    setSelect("filter-limit", ["country:jp"]);

    expect(modelIds()).toEqual([CLAUDE]);
    expect($("#filter-count").textContent).toBe("1 件 / 全 5 件");
    expect($("#filter-count").getAttribute("aria-live")).toBe("polite");
  });

  it("条件チップが 1 つずつ並び、× で個別に外せる", () => {
    mountFixtureApp();
    setSelect("filter-provider", ["Anthropic"]);
    setSelect("filter-limit", ["country:jp"]);
    const chips = [...document.querySelectorAll("#filter-chips .filter-chip")];
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain("Anthropic");
    expect(chips[1].textContent).toContain("日本国内のみ");

    chips[0].querySelector(".filter-chip-remove").click();
    expect(document.querySelectorAll("#filter-chips .filter-chip")).toHaveLength(1);
    expect(bodyRows().length).toBeGreaterThan(1);
    expect(document.getElementById("filter-limit").value).toBe("country:jp");
  });
});

// --- AC-010 0 件の空状態 ---
describe("FILTER-001 AC-010 結果が 0 件", () => {
  it("空の表ではなく、条件一覧とリセット操作が出る", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["geo:eu"]);
    expect(bodyRows()).toHaveLength(0);
    const empty = document.getElementById("filter-empty");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain("条件に一致するモデルがありません");
    const conditions = [...document.querySelectorAll("#filter-empty-conditions li")];
    expect(conditions).toHaveLength(1);
    expect(conditions[0].textContent).toContain("EU 内のみ");
    expect(document.getElementById("filter-empty-reset")).not.toBeNull();
  });

  it("リセットで条件が消えて全行に戻る", () => {
    mountFixtureApp();
    setSelect("filter-limit", ["geo:eu"]);
    document.getElementById("filter-empty-reset").click();
    expect(bodyRows()).toHaveLength(5);
    expect(document.getElementById("filter-empty").hidden).toBe(true);
    expect(document.getElementById("filter-limit").value).toBe("none");
  });

  it("データなし (denied) の見た目とは別物", () => {
    const app = mountFixtureApp();
    setSelect("filter-limit", ["geo:eu"]);
    expect(document.getElementById("denied-banner").hidden).toBe(true);
    expect(document.getElementById("empty-state").hidden).toBe(true);
    expect(document.getElementById("filter-empty").hidden).toBe(false);

    app.view.setRegion("us-east-1");
    expect(document.getElementById("denied-banner").hidden).toBe(false);
    expect(document.getElementById("filter-empty").hidden).toBe(true);
  });
});

// --- AC-011 未知のリージョンを含む限定集合 (画面側の表示名) ---
describe("FILTER-001 AC-011 限定集合の表示", () => {
  it("限定集合の中身が選択肢の title に出る (リージョン名は region-notes.json 由来)", () => {
    mountFixtureApp();
    const option = [...document.getElementById("filter-limit").options].find(
      (o) => o.value === "country:jp",
    );
    expect(option.title).toContain("ap-northeast-1 (東京)");
    expect(option.title).toContain("ap-northeast-3 (大阪)");
  });
});

// --- 言語切替との相互作用 (I18N-001 AC-003) ---
describe("FILTER-001 言語を切り替えても絞り込みは保たれる", () => {
  it("ラベルだけ英語になり、結果と件数は変わらない", () => {
    mountFixtureApp();
    setSelect("filter-provider", ["Anthropic"]);
    const before = modelIds();
    setLang("en");
    expect(modelIds()).toEqual(before);
    expect(document.getElementById("filter-count").textContent).toBe("1 of 5");
    expect(document.getElementById("filter-limit").options[0].textContent).toBe("No limit");
  });
});
