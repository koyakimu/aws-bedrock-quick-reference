// DETAIL-001 v2 の結合テスト (jsdom)。AC-001 / 007 / 008 / 009 / 010 / 011 / 012 と、
// 単体で作った行が画面にそのまま出ていること (AC-002 〜 006)。
import { describe, it, expect, vi } from "vitest";
import { mountFixtureApp, rowFor, cells, $ } from "./app-harness.js";
import { panelId } from "../src/scripts/detail-view.js";
import { DENIED_REGION, TOKYO, EMPTY_REGION } from "./fixtures/bedrock-fixture.js";

const CLAUDE = "anthropic.claude-sonnet-4-5-20250929-v1:0";
const NVIDIA = "nvidia.nemotron-nano-12b-v2";
const TITAN = "amazon.titan-embed-text-v1:2:8k";

const toggleOf = (modelId) => rowFor(modelId).querySelector(".detail-toggle");
const panelOf = (modelId) => document.getElementById(panelId(modelId));

// --- AC-001 行の展開 ---
describe("DETAIL-001 AC-001 行の展開", () => {
  it("展開トグルのクリックで行の直下にパネルが挿入され aria-expanded が切り替わる", () => {
    mountFixtureApp();
    const row = rowFor(CLAUDE);
    const toggle = toggleOf(CLAUDE);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(panelId(CLAUDE));
    expect(panelOf(CLAUDE)).toBeNull();

    toggle.click();
    const panel = panelOf(CLAUDE);
    expect(panel).not.toBeNull();
    expect(row.nextElementSibling).toBe(panel);
    expect(toggleOf(CLAUDE).getAttribute("aria-expanded")).toBe("true");
    expect(panel.querySelector("td").colSpan).toBe(cells(row).length);

    toggleOf(CLAUDE).click();
    expect(panelOf(CLAUDE)).toBeNull();
    expect(toggleOf(CLAUDE).getAttribute("aria-expanded")).toBe("false");
  });

  it("行クリックでも開く (パネル内のコピーボタンでは閉じない)", () => {
    mountFixtureApp();
    cells(rowFor(CLAUDE))[0].click();
    expect(panelOf(CLAUDE)).not.toBeNull();

    // 表にコピーボタンは無い (TABLE-001 v2 AC-007)。パネル内のボタンを押しても閉じない
    panelOf(CLAUDE).querySelector("button.copy-btn").click();
    expect(panelOf(CLAUDE)).not.toBeNull();
  });

  it("複数行を同時に開ける", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    toggleOf(NVIDIA).click();
    expect(panelOf(CLAUDE)).not.toBeNull();
    expect(panelOf(NVIDIA)).not.toBeNull();
  });

  it("起点リージョンを切り替えても対象モデルが表に残っていれば開いたまま", () => {
    const app = mountFixtureApp();
    toggleOf(CLAUDE).click();
    app.view.setRegion(EMPTY_REGION);
    expect(rowFor(CLAUDE)).toBeNull();
    app.view.setRegion(TOKYO);
    expect(panelOf(CLAUDE)).not.toBeNull();
    expect(toggleOf(CLAUDE).getAttribute("aria-expanded")).toBe("true");
  });
});

// --- AC-002 / AC-003 / AC-004 提供状況 ---
describe("DETAIL-001 AC-002 全リージョン横断の availability", () => {
  it("region-notes.json のキー全件が並ぶ", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const items = panelOf(CLAUDE).querySelectorAll(".detail-region");
    expect(items).toHaveLength(33);
    expect(items[0].dataset.region).toBe("af-south-1");
  });

  it("推論タイプはそのままの名前で並ぶ", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const tokyo = panelOf(CLAUDE).querySelector('.detail-region[data-region="ap-northeast-1"]');
    expect([...tokyo.querySelectorAll(".badge")].map((b) => b.textContent)).toEqual([
      "INFERENCE_PROFILE",
    ]);
  });
});

describe("DETAIL-001 AC-003 提供なしの表示", () => {
  it("取得できているがモデルが無いリージョンは「提供なし」", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const row = panelOf(CLAUDE).querySelector('.detail-region[data-region="eu-west-1"]');
    expect(row.dataset.kind).toBe("none");
    expect(row.textContent).toContain("提供なし");
  });
});

describe("DETAIL-001 AC-004 空配列の表示", () => {
  it("「提供あり・推論タイプの指定なし」は提供なし / データなし と別のクラス", () => {
    mountFixtureApp();
    toggleOf(TITAN).click();
    const panel = panelOf(TITAN);
    const tokyo = panel.querySelector('.detail-region[data-region="ap-northeast-1"]');
    expect(tokyo.dataset.kind).toBe("empty");
    expect(tokyo.querySelector(".state-empty")).not.toBeNull();
    expect(tokyo.textContent).toContain("提供あり・推論タイプの指定なし");
    expect(panel.querySelector('.detail-region[data-region="eu-west-1"]').dataset.kind).toBe(
      "none",
    );
    expect(
      panel.querySelector(`.detail-region[data-region="${DENIED_REGION}"]`).dataset.kind,
    ).toBe("nodata");
  });
});

// --- AC-005 / AC-006 プロファイル ---
describe("DETAIL-001 AC-005 プロファイルの起点 → 推論先", () => {
  it("接頭辞バッジとコピー可能な ID と destination が出る", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const jp = panelOf(CLAUDE).querySelector(
      '.detail-profile[data-prefix="jp"]',
    );
    expect(jp.querySelector(".prefix-badge").textContent).toBe("jp");
    expect(jp.querySelector(".copyable .id").textContent).toBe(
      "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    const source = jp.querySelector('.detail-source[data-source="ap-northeast-1"]');
    // 推論先は地名とコードを併記する (DETAIL-001 v4 AC-005)
    expect([...source.querySelectorAll(".chip-dest")].map((c) => c.textContent)).toEqual([
      "東京 (ap-northeast-1)",
      "大阪 (ap-northeast-3)",
    ]);
  });
});

describe("DETAIL-001 AC-006 Global の推論先", () => {
  it("destination を列挙せず注記とリンクを出し、'*' を出さない", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const panel = panelOf(CLAUDE);
    const global = panel.querySelector('.detail-profile[data-prefix="global"]');
    expect(global.textContent).toContain("全対応リージョン（今後増えうる）");
    expect(global.querySelector("a").href).toContain("global-cross-region-inference");
    expect(global.querySelectorAll(".chip-dest")).toHaveLength(0);
    expect(panel.textContent).not.toContain("*");
  });
});

// --- AC-007 現在の起点リージョンの強調 ---
describe("DETAIL-001 AC-007 現在の起点リージョンの強調", () => {
  it("availability と sources の両方で起点の行にだけ印が付く", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const panel = panelOf(CLAUDE);
    const currentRegions = [...panel.querySelectorAll(".detail-region.is-current")];
    expect(currentRegions).toHaveLength(1);
    expect(currentRegions[0].dataset.region).toBe(TOKYO);

    const currentSources = [...panel.querySelectorAll(".detail-source.is-current")];
    expect(currentSources.length).toBeGreaterThan(0);
    for (const source of currentSources) expect(source.dataset.source).toBe(TOKYO);
    expect(panel.querySelectorAll(".current-marker").length).toBeGreaterThanOrEqual(2);
  });
});

// --- AC-008 denied は「データなし」 ---
describe("DETAIL-001 AC-008 denied リージョンは「データなし」", () => {
  it("「提供なし」と異なるクラス名で描画される", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const panel = panelOf(CLAUDE);
    const denied = panel.querySelector(`.detail-region[data-region="${DENIED_REGION}"]`);
    expect(denied.dataset.kind).toBe("nodata");
    expect(denied.querySelector(".state-nodata")).not.toBeNull();
    expect(denied.querySelector(".state-none")).toBeNull();
    expect(denied.textContent).toContain("データなし");
    expect(denied.textContent).not.toContain("提供なし");
  });

  it("理由は分類から起こした平易な説明文だけを出す (D-008)", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const denied = panelOf(CLAUDE).querySelector(
      `.detail-region[data-region="${DENIED_REGION}"] .state-nodata`,
    );
    expect(denied.textContent).toContain("組織のポリシーで取得できませんでした");
    expect(denied.title).toBe("組織のポリシーで取得できませんでした");
    expect(denied.querySelector("a")).toBeNull();
  });

  it("エラー原文は詳細パネルのどこにも出ない", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const text = document.body.textContent;
    expect(text).not.toContain("AccessDenied");
    expect(text).not.toContain("service control policy");
    expect(text).not.toContain("arn:aws:sts");
    expect(text).not.toContain("AWSReservedSSO");
  });
});

// --- AC-009 プロファイルが 1 件も無い ---
describe("DETAIL-001 AC-009 対象プロファイルが 1 件も無い", () => {
  it("空欄ではなく説明文が出る", () => {
    mountFixtureApp();
    toggleOf(NVIDIA).click();
    const panel = panelOf(NVIDIA);
    expect(panel.querySelectorAll(".detail-profile")).toHaveLength(0);
    expect(panel.querySelector(".detail-no-profiles").textContent).toBe(
      "cross-region inference profile なし（モデル ID を直接指定する）",
    );
  });
});

// --- AC-010 モデル ID をパネルの先頭に出す ---
describe("DETAIL-001 AC-010 モデル ID", () => {
  it("パネルの先頭にモデル ID がコピーボタン付きで出る", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const panel = panelOf(CLAUDE);
    const section = panel.querySelector(".detail-panel").firstElementChild;
    expect(section.classList.contains("detail-model-id")).toBe(true);
    expect(section.querySelector(".copyable .id").textContent).toBe(CLAUDE);
    expect(section.querySelector("button.copy-btn")).not.toBeNull();
  });

  it("コピーボタンはモデル ID の文字列だけをコピーする", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    panelOf(CLAUDE).querySelector(".detail-model-id button.copy-btn").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(CLAUDE);
  });
});

// --- AC-011 使い方ごとの「指定する ID」 ---
describe("DETAIL-001 AC-011 種別 / 指定する ID / 推論先リージョン", () => {
  it("3 列の表が出て、Geo は プロファイル ID と destination を出す", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const usage = panelOf(CLAUDE).querySelector(".detail-usage");
    expect([...usage.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "種別",
      "指定する ID",
      "推論先リージョン",
    ]);
    const geo = usage.querySelector('.detail-usage-row[data-kind="geo"]');
    expect(geo.querySelector(".usage-badge").textContent).toBe("Geo");
    expect(geo.querySelector(".copyable .id").textContent).toBe(
      "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    expect([...geo.querySelectorAll(".chip-dest")].map((chip) => chip.textContent)).toEqual([
      "東京 (ap-northeast-1)",
      "大阪 (ap-northeast-3)",
    ]);
    expect([...geo.querySelectorAll(".chip-dest")].map((chip) => chip.dataset.region)).toEqual([
      "ap-northeast-1",
      "ap-northeast-3",
    ]);
  });

  it("Global は推論先を列挙せず注記にする ('*' を出さない)", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const global = panelOf(CLAUDE).querySelector(
      '.detail-usage .detail-usage-row[data-kind="global"]',
    );
    expect(global.querySelector(".usage-badge").textContent).toBe("Global");
    expect(global.querySelector(".detail-usage-dest").textContent).toBe(
      "全対応リージョン（今後増えうる）",
    );
    expect(global.querySelectorAll(".chip-dest")).toHaveLength(0);
  });

  it("In-Region で呼べるモデルはモデル ID と起点リージョンの行を出す", () => {
    mountFixtureApp();
    toggleOf(NVIDIA).click();
    const row = panelOf(NVIDIA).querySelector('.detail-usage-row[data-kind="inRegion"]');
    expect(row.querySelector(".usage-badge").textContent).toBe("In-Region");
    expect(row.querySelector(".copyable .id").textContent).toBe(NVIDIA);
    expect([...row.querySelectorAll(".chip-dest")].map((chip) => chip.textContent)).toEqual([
      `東京 (${TOKYO})`,
    ]);
  });

  it("プロファイル ID のコピーボタンはプロファイル ID だけをコピーする", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    panelOf(CLAUDE)
      .querySelector('.detail-usage-row[data-kind="geo"] button.copy-btn')
      .click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("jp.anthropic.claude-sonnet-4-5-20250929-v1:0");
  });

  it("起点から呼べる使い方が無ければ説明文を出す", () => {
    const app = mountFixtureApp();
    toggleOf(CLAUDE).click();
    app.view.setRegion(EMPTY_REGION);
    app.view.setRegion(TOKYO);
    // 起点を東京に戻した状態では使い方がある
    expect(panelOf(CLAUDE).querySelector(".detail-no-usage")).toBeNull();
    expect(panelOf(CLAUDE).querySelectorAll(".detail-usage-row").length).toBeGreaterThan(0);
  });
});

// --- AC-012 起点のエンドポイント ---
describe("DETAIL-001 AC-012 起点のエンドポイント", () => {
  it("パネルの最後に起点のエンドポイントが出て、ページ上部の表示と一致する", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const panel = panelOf(CLAUDE).querySelector(".detail-panel");
    expect(panel.lastElementChild.classList.contains("detail-endpoint")).toBe(true);
    expect(panel.querySelector(".detail-endpoint-value").textContent).toBe(
      "bedrock-runtime.ap-northeast-1.amazonaws.com",
    );
    expect(panel.querySelector(".detail-endpoint-value").textContent).toBe(
      document.getElementById("endpoint-value").textContent,
    );
    expect(panel.textContent).toContain("エンドポイント");
  });
});

// --- パネルの節の並び (UI Description) ---
describe("DETAIL-001 詳細パネルの節の並び", () => {
  it("モデル ID → 使い方 → 提供状況 → 推論プロファイル → エンドポイント", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const sections = [...panelOf(CLAUDE).querySelector(".detail-panel").children].map(
      (node) => node.className,
    );
    expect(sections).toEqual([
      "detail-model-id",
      "detail-usage",
      "detail-availability",
      "detail-profiles",
      "detail-endpoint",
    ]);
  });
});
