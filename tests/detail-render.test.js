// DETAIL-001 の結合テスト (jsdom)。AC-001 / 007 / 008 / 009 と、
// 単体で作った行が画面にそのまま出ていること (AC-002 〜 006)。
import { describe, it, expect } from "vitest";
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

  it("行クリックでも開く (コピーボタンのクリックでは開かない)", () => {
    mountFixtureApp();
    cells(rowFor(CLAUDE))[0].click();
    expect(panelOf(CLAUDE)).not.toBeNull();

    cells(rowFor(NVIDIA))[1].querySelector("button.copy-btn").click();
    expect(panelOf(NVIDIA)).toBeNull();
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
    expect([...source.querySelectorAll(".chip-dest")].map((c) => c.textContent)).toEqual([
      "ap-northeast-1",
      "ap-northeast-3",
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

  it("reason の原文はツールチップと脚注リンクから参照できる", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    const denied = panelOf(CLAUDE).querySelector(
      `.detail-region[data-region="${DENIED_REGION}"] .state-nodata`,
    );
    expect(denied.title).toContain("AccessDeniedException");
    expect(denied.querySelector("a").getAttribute("href")).toBe(`#detail-reason-${DENIED_REGION}`);
    const footnote = document.getElementById(`detail-reason-${DENIED_REGION}`);
    expect(footnote).not.toBeNull();
    expect(footnote.textContent).toContain("explicit deny in a service control policy");
    expect($("#detail-host").hidden).toBe(false);
  });

  it("閉じると reason の脚注も消える", () => {
    mountFixtureApp();
    toggleOf(CLAUDE).click();
    toggleOf(CLAUDE).click();
    expect($("#detail-host").hidden).toBe(true);
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
