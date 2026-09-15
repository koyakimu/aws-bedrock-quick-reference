// REGIONS-001 の画面 (jsdom)。AC Coverage 表の結合テスト側。
import { describe, it, expect, beforeEach } from "vitest";
import {
  mountFixtureApp,
  matrixBodyRows,
  matrixCells,
  matrixHeadRows,
  matrixRegionHeads,
  regionNotes,
  viewTab,
  $,
} from "./app-harness.js";
import { withAllFetched, withDeniedRegions } from "./fixtures/bedrock-fixture.js";
import { setLang } from "../src/scripts/i18n.js";
import { buildMatrixColumns, matrixColumnGroups } from "../src/scripts/regions-model.mjs";
import { geoAreaLabel } from "../src/scripts/geo-labels.js";

const REGION_COUNT = Object.keys(regionNotes).filter((key) => key !== "_source").length;
const TOKYO = "ap-northeast-1";

const showMatrix = () => viewTab("regions").click();
const headerGroups = () => [...document.querySelectorAll("#regions-matrix thead th[scope=colgroup]")];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("AC-001 ヘッダ直下のビュータブ", () => {
  it("タブが 2 つ並び、既定は「起点から」", () => {
    mountFixtureApp();
    const tablist = document.querySelector("nav.tabs[role=tablist]");
    expect(tablist).not.toBeNull();
    const tabs = [...tablist.querySelectorAll("[role=tab]")];
    expect(tabs).toHaveLength(2);
    expect(tabs.map((tab) => tab.textContent)).toEqual(["起点から", "リージョン"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect($("#vp-origin").hidden).toBe(false);
    expect($("#vp-regions").hidden).toBe(true);
  });

  it("既存の画面 (表・絞り込み・詳細) は「起点から」のパネルの中にある", () => {
    mountFixtureApp();
    const panel = $("#vp-origin");
    for (const id of ["source-bar", "filter-bar", "models-table", "detail-host"]) {
      expect(panel.querySelector(`#${id}`), id).not.toBeNull();
    }
    // 取得日時・出典の脚注は 2 つのビューで共用する 1 つ (UI Description)。
    expect(panel.querySelector("#footnote")).toBeNull();
    expect($("#footnote")).not.toBeNull();
    expect($("#footnote").closest("[role=tabpanel]")).toBeNull();
  });

  it("クリックで aria-selected と hidden が入れ替わり、リロードは起きない", () => {
    const app = mountFixtureApp();
    let reloaded = false;
    app.location.reload = () => {
      reloaded = true;
    };
    showMatrix();
    expect(viewTab("regions").getAttribute("aria-selected")).toBe("true");
    expect(viewTab("origin").getAttribute("aria-selected")).toBe("false");
    expect($("#vp-regions").hidden).toBe(false);
    expect($("#vp-origin").hidden).toBe(true);
    expect(reloaded).toBe(false);
    expect(app.history.pushState).not.toHaveBeenCalled();

    viewTab("origin").click();
    expect($("#vp-origin").hidden).toBe(false);
    expect($("#vp-regions").hidden).toBe(true);
  });

  it("矢印キーと Home / End でタブを移動できる", () => {
    mountFixtureApp();
    const origin = viewTab("origin");
    origin.focus();
    origin.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(viewTab("regions").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(viewTab("regions"));
    // 選択中のタブだけが Tab の順路に入る (roving tabindex)。
    expect(viewTab("regions").tabIndex).toBe(0);
    expect(viewTab("origin").tabIndex).toBe(-1);

    viewTab("regions").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(viewTab("origin").getAttribute("aria-selected")).toBe("true");
  });

  it("2 回目の切り替えは描き直さない (AC-NFR-002)", () => {
    mountFixtureApp();
    showMatrix();
    const table = $("#regions-matrix");
    viewTab("origin").click();
    showMatrix();
    expect($("#regions-matrix")).toBe(table);
  });
});

describe("AC-002 ビューは URL に載る", () => {
  it("タブを選ぶと view=regions が載り、既定では省かれる", () => {
    const app = mountFixtureApp();
    showMatrix();
    expect(app.location.search).toContain("view=regions");
    expect(app.history.replaceState).toHaveBeenCalled();
    viewTab("origin").click();
    expect(app.location.search).not.toContain("view=");
  });

  it("?view=regions&region=...&provider=... で行列が出て region は行列を変えない", () => {
    const app = mountFixtureApp({
      search: "?view=regions&region=ap-northeast-3&provider=Anthropic&limit=country:jp",
    });
    expect($("#vp-regions").hidden).toBe(false);
    expect(viewTab("regions").getAttribute("aria-selected")).toBe("true");
    // region は「起点」の印だけに使われ、列も行も減らさない (SHARE-001 AC-012)。
    expect(matrixRegionHeads()).toHaveLength(REGION_COUNT);
    const providers = new Set(
      matrixBodyRows().map((tr) => tr.querySelector("td.prov").textContent).filter(Boolean),
    );
    expect([...providers]).toEqual(["Anthropic"]);
    const origin = [...document.querySelectorAll("#regions-matrix thead th.is-origin")];
    expect(origin.map((th) => th.querySelector(".rg-code").textContent)).toEqual(["ap-northeast-3"]);
    // 解釈できない指定として通知してはいけない (SHARE-001 AC-012)。
    expect(app.share.notice.hidden).toBe(true);
  });
});

describe("AC-004 列の構成と地理圏のグループ", () => {
  it("左 2 列が rowspan=2 で、ヘッダは 2 行", () => {
    mountFixtureApp();
    showMatrix();
    const rows = matrixHeadRows();
    expect(rows).toHaveLength(2);
    const leading = [...rows[0].children].slice(0, 2);
    expect(leading.map((th) => th.rowSpan)).toEqual([2, 2]);
    expect(leading.map((th) => th.textContent)).toEqual(["プロバイダ", "モデル名"]);
    expect(leading[0].classList.contains("sticky-1")).toBe(true);
    expect(leading[1].classList.contains("sticky-2")).toBe(true);
  });

  it("region-notes.json のキー全件が 1 列ずつ並ぶ", () => {
    mountFixtureApp();
    showMatrix();
    expect(matrixRegionHeads()).toHaveLength(REGION_COUNT);
    expect(matrixRegionHeads()).toContain(TOKYO);
  });

  it("グループの見出しが平易な名前 + コードで、colspan の合計が列数に一致する", () => {
    mountFixtureApp();
    showMatrix();
    const groups = headerGroups();
    expect(groups[0].textContent).toBe(`${geoAreaLabel("jp")} jp`);
    expect(groups[0].querySelector(".geo-code").textContent).toBe("jp");
    expect(groups.reduce((sum, th) => sum + th.colSpan, 0)).toBe(REGION_COUNT);
    expect(groups.map((th) => th.querySelector(".geo-code").textContent)).toEqual(
      matrixColumnGroups(buildMatrixColumns(regionNotes)).map((group) => group.geo),
    );
  });

  it("グループの先頭の列に geo-start が付く", () => {
    mountFixtureApp();
    showMatrix();
    const starts = [...matrixHeadRows()[1].children].filter((th) =>
      th.classList.contains("geo-start"),
    );
    expect(starts).toHaveLength(headerGroups().length);
  });
});

describe("AC-005 セルの 4 状態", () => {
  it("● / ○ / — / 空欄 が class とツールチップ付きで出る", () => {
    mountFixtureApp();
    showMatrix();
    const cells = matrixCells(0);
    expect(cells).toHaveLength(REGION_COUNT);
    const byClass = (name) => cells.filter((td) => td.classList.contains(name));
    expect(byClass("mx-blank").length).toBeGreaterThan(0);
    for (const td of byClass("mx-blank")) {
      expect(td.textContent).toBe("");
      expect(td.title).toBe("未取得");
      // 取得できなかった理由は画面に出さない (D-008)。
      expect(td.title).not.toMatch(/deny|denied|opt|権限|アカウント/i);
    }
    const marks = new Set(cells.map((td) => td.textContent));
    expect([...marks].every((mark) => ["●", "○", "—", ""].includes(mark))).toBe(true);
    for (const td of byClass("mx-yes")) expect(td.title).toBe("直接提供（On-Demand）");
    for (const td of byClass("mx-none")) expect(td.title).toBe("提供なし");
  });
});

describe("AC-003 行の並び", () => {
  it("プロバイダ名は先頭行にだけ出て、境目に prov-start が付く", () => {
    mountFixtureApp();
    showMatrix();
    const rows = matrixBodyRows();
    expect(rows.length).toBeGreaterThan(1);
    let previous = null;
    let starts = 0;
    for (const tr of rows) {
      const shown = tr.querySelector("td.prov").textContent;
      if (tr.classList.contains("prov-start")) {
        starts += 1;
        expect(shown).not.toBe("");
        previous = shown;
      } else {
        expect(shown).toBe("");
      }
    }
    expect(starts).toBeGreaterThan(0);
    expect(previous).not.toBeNull();
  });

  it("?sort=alpha で行列の並びも変わる (SHARE-001 AC-013)", () => {
    mountFixtureApp({ search: "?view=regions&sort=alpha" });
    const providers = matrixBodyRows()
      .map((tr) => tr.querySelector("td.prov").textContent)
      .filter(Boolean);
    expect(providers).toEqual([...providers].sort((a, b) => a.localeCompare(b, "ja")));
  });
});

describe("AC-006 凡例 / AC-007 注記", () => {
  it("凡例に 4 項目が同じ色の class で出る", () => {
    mountFixtureApp();
    showMatrix();
    const legend = $("#regions-legend");
    expect(legend.querySelector(".g-yes").textContent).toBe("●");
    expect(legend.querySelector(".g-prof").textContent).toBe("○");
    expect(legend.querySelector(".g-none").textContent).toBe("—");
    expect(legend.textContent).toBe(
      "● 直接提供（On-Demand） / ○ 推論プロファイル経由のみ / — 提供なし / 空欄 未取得",
    );
  });

  it("未取得が 2 件なら注記の件数が 2 で、理由には触れない", () => {
    mountFixtureApp({ fetchLog: (log) => withDeniedRegions(log, ["us-east-1", "eu-west-1"]) });
    showMatrix();
    const note = $("#regions-note");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("2 リージョン");
    for (const word of ["scp", "deny", "access", "opt", "権限", "アカウントで有効", "cause"]) {
      expect(note.textContent.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });

  it("0 件なら注記を出さない", () => {
    mountFixtureApp({ fetchLog: withAllFetched });
    showMatrix();
    expect($("#regions-note").hidden).toBe(true);
  });
});

describe("AC-008 起点リージョンの列", () => {
  it("起点の列ヘッダとセルにだけ印が付き、起点を切り替えると移る", () => {
    const app = mountFixtureApp();
    showMatrix();
    const originHeads = () =>
      [...document.querySelectorAll("#regions-matrix thead th.is-origin")].map(
        (th) => th.querySelector(".rg-code").textContent,
      );
    expect(originHeads()).toEqual([TOKYO]);
    expect(document.querySelectorAll("#regions-matrix thead .origin-marker")).toHaveLength(1);
    expect(document.querySelector("#regions-matrix thead .origin-marker").textContent).toBe("起点");
    expect(matrixCells(0).filter((td) => td.classList.contains("is-origin"))).toHaveLength(1);

    app.view.setRegion("ap-northeast-3");
    showMatrix();
    expect(originHeads()).toEqual(["ap-northeast-3"]);
  });
});

describe("AC-009 地域の絞り込みチップ", () => {
  it("チップは geo の実値から作られ、単一選択で列が絞られる", () => {
    const app = mountFixtureApp();
    showMatrix();
    const before = app.location.search;
    const chips = [...document.querySelectorAll("#regions-geo-chips .fchip")];
    expect(chips[0].textContent).toBe("すべて");
    expect(chips[0].classList.contains("on")).toBe(true);
    expect(chips.slice(1).map((chip) => chip.dataset.geo)).toEqual(
      matrixColumnGroups(buildMatrixColumns(regionNotes)).map((group) => group.geo),
    );

    const jp = chips.find((chip) => chip.dataset.geo === "jp");
    jp.click();
    expect(matrixRegionHeads()).toEqual(["ap-northeast-1", "ap-northeast-3"]);
    expect(headerGroups()).toHaveLength(1);
    expect(jp.getAttribute("aria-pressed")).toBe("true");
    expect(chips[0].classList.contains("on")).toBe(false);
    // この選択は URL に載せない。
    expect(app.location.search).toBe(before);

    chips[0].click();
    expect(matrixRegionHeads()).toHaveLength(REGION_COUNT);
  });
});

describe("AC-010 提供元・モダリティの絞り込みの共用", () => {
  it("提供元で行が減り、q / callable / limit のコントロールは無い", () => {
    const app = mountFixtureApp();
    showMatrix();
    const all = matrixBodyRows().length;
    const select = $("#regions-provider");
    for (const option of select.options) option.selected = option.value === "Anthropic";
    select.dispatchEvent(new Event("change"));

    const rows = matrixBodyRows();
    expect(rows.length).toBeLessThan(all);
    expect(rows.length).toBeGreaterThan(0);
    // 「起点から」ビューの絞り込みと同じ 1 つの状態 (AC-010)。
    expect(app.filter.getState().provider).toEqual(["Anthropic"]);

    const panel = $("#vp-regions");
    expect(panel.querySelector("#regions-modality")).not.toBeNull();
    for (const selector of ["input[type=search]", "input[type=checkbox]", "#filter-limit", "#regions-limit"]) {
      expect(panel.querySelector(selector), selector).toBeNull();
    }
  });
});

describe("AC-011 件数表示 / AC-012 i18n", () => {
  it("「n / m モデル ・ k リージョン」が出て、絞り込みで n が減る", () => {
    mountFixtureApp();
    showMatrix();
    const total = matrixBodyRows().length;
    expect($("#regions-count").textContent).toBe(`${total} / ${total} モデル ・ ${REGION_COUNT} リージョン`);

    const select = $("#regions-provider");
    for (const option of select.options) option.selected = option.value === "Anthropic";
    select.dispatchEvent(new Event("change"));
    const shown = matrixBodyRows().length;
    expect($("#regions-count").textContent).toBe(`${shown} / ${total} モデル ・ ${REGION_COUNT} リージョン`);
  });

  it("英語に切り替えるとラベルが英語になり、コードとモデル名は変わらない", () => {
    mountFixtureApp();
    showMatrix();
    const codes = matrixRegionHeads();
    const names = matrixBodyRows().map((tr) => tr.children[1].textContent);
    const total = matrixBodyRows().length;

    setLang("en");
    expect(viewTab("regions").textContent).toBe("Regions");
    expect(matrixHeadRows()[0].children[0].textContent).toBe("Provider");
    expect(headerGroups()[0].textContent).toBe(`${geoAreaLabel("jp")} jp`);
    expect($("#regions-count").textContent).toBe(`${total} / ${total} models · ${REGION_COUNT} regions`);
    expect($("#regions-legend").textContent).toContain("Direct (On-Demand)");
    expect(document.querySelector("#regions-matrix thead .origin-marker").textContent).toBe("Origin");
    // モデル ID / リージョンコード / モデル名は翻訳しない (I18N-001 AC-004)。
    expect(matrixRegionHeads()).toEqual(codes);
    expect(matrixBodyRows().map((tr) => tr.children[1].textContent)).toEqual(names);
    // リージョン表示名は region-notes.json の en になる。
    expect(matrixHeadRows()[1].children[0].querySelector(".rg-ja").textContent).toBe(
      regionNotes[TOKYO].en,
    );
    setLang("ja");
  });
});

describe("AC-013 絞り込みで 0 行", () => {
  it("空状態のメッセージとリセット操作が出る", () => {
    mountFixtureApp();
    showMatrix();
    const provider = $("#regions-provider");
    const modality = $("#regions-modality");
    for (const option of provider.options) option.selected = option.value === "Anthropic";
    provider.dispatchEvent(new Event("change"));
    for (const option of modality.options) option.selected = option.value === "EMBEDDING";
    modality.dispatchEvent(new Event("change"));

    expect(matrixBodyRows()).toHaveLength(0);
    const empty = $("#regions-empty");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain("条件に一致するモデルがありません");
    $("#regions-empty-reset").click();
    expect($("#regions-empty").hidden).toBe(true);
    expect(matrixBodyRows().length).toBeGreaterThan(0);
  });
});

describe("AC-014 全リージョンが未取得", () => {
  it("列は全件のまま全セルが空欄になり、例外が出ない", () => {
    expect(() => {
      mountFixtureApp({ fetchLog: (log) => withDeniedRegions(log, "*") });
      showMatrix();
    }).not.toThrow();

    expect(matrixRegionHeads()).toHaveLength(REGION_COUNT);
    expect(matrixBodyRows().length).toBeGreaterThan(0);
    for (const row of matrixBodyRows()) {
      const cells = [...row.querySelectorAll("td.mx")];
      expect(cells).toHaveLength(REGION_COUNT);
      expect(cells.every((td) => td.classList.contains("mx-blank"))).toBe(true);
      expect(cells.every((td) => td.textContent === "")).toBe(true);
    }
    const note = $("#regions-note");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("4 リージョン");
  });
});

describe("AC-NFR-001 横スクロール", () => {
  it("横スクロールの枠は行列の入れ物だけで、左 2 列に sticky の class が付く", () => {
    mountFixtureApp();
    showMatrix();
    const frame = $("#regions-matrix");
    expect(frame.classList.contains("matrix-scroll")).toBe(true);
    expect(document.querySelectorAll("#vp-regions .matrix-scroll")).toHaveLength(1);
    const row = matrixBodyRows()[0];
    expect(row.children[0].classList.contains("sticky-1")).toBe(true);
    expect(row.children[1].classList.contains("sticky-2")).toBe(true);
  });
});
