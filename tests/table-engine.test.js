// 汎用の表エンジンの検証。Bedrock のデータは一切使わない
// (TABLE-001「Bedrock 固有の知識を持たせない」)。
import { describe, it, expect, vi } from "vitest";
import {
  createTable,
  visibleColumns,
  sortRows,
  compareValues,
  nextSortState,
  EMPTY,
} from "../src/scripts/table-engine.js";

const COLUMNS = [
  { key: "name", group: "a", labelKey: "col.name", type: "text", sticky: true, mono: true },
  { key: "count", group: "a", labelKey: "col.count", type: "number" },
  { key: "flagged", group: "b", labelKey: "col.flagged", type: "flag" },
  { key: "misc", group: "b", labelKey: "col.misc", type: "text", sortable: false },
];

const ROWS = [
  { name: "beta", count: 8, flagged: false, misc: "x" },
  { name: "alpha", count: null, flagged: true, misc: "y" },
  { name: "gamma", count: 4, flagged: true, misc: "z" },
];

const i18n = (key) => key;
const baseState = { sortKey: null, sortDir: null, hiddenGroups: [] };

function mount(overrides = {}) {
  const onStateChange = vi.fn();
  const table = createTable({
    columns: COLUMNS,
    rows: ROWS,
    state: baseState,
    onStateChange,
    i18n,
    ...overrides,
  });
  document.body.replaceChildren(table.el);
  return { table, onStateChange };
}

const headerTexts = () =>
  [...document.querySelectorAll("thead th")].map((th) => th.textContent.replace(/[▼▲]/g, "").trim());

const columnTexts = (index) =>
  [...document.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[index].textContent);

describe("compareValues", () => {
  it("数値は数として比べる", () => {
    expect(compareValues("number", 1, 8)).toBeLessThan(0);
    expect(compareValues("number", 4, 4)).toBe(0);
  });

  it("文字列は localeCompare", () => {
    expect(compareValues("text", "alpha", "beta")).toBeLessThan(0);
  });

  it("flag は false < true", () => {
    expect(compareValues("flag", true, false)).toBeGreaterThan(0);
  });
});

describe("sortRows", () => {
  it("並べ替え無しは元の順のコピー", () => {
    const out = sortRows(ROWS, null, null);
    expect(out).not.toBe(ROWS);
    expect(out.map((r) => r.name)).toEqual(["beta", "alpha", "gamma"]);
  });

  it("値なしは方向によらず末尾", () => {
    const col = COLUMNS[1];
    expect(sortRows(ROWS, col, "asc").map((r) => r.name)).toEqual(["gamma", "beta", "alpha"]);
    expect(sortRows(ROWS, col, "desc").map((r) => r.name)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("同値は元の順を保つ (安定ソート)", () => {
    const rows = [{ g: "x", id: 1 }, { g: "x", id: 2 }, { g: "x", id: 3 }];
    expect(sortRows(rows, { key: "g", type: "text" }, "asc").map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("入力を変更しない", () => {
    const before = ROWS.map((r) => r.name);
    sortRows(ROWS, COLUMNS[1], "asc");
    expect(ROWS.map((r) => r.name)).toEqual(before);
  });

  it("列が sortValue を持てばその戻り値で比べる", () => {
    const col = { key: "v", type: "number", sortValue: (row) => row.list.length };
    const rows = [{ name: "three", list: [1, 2, 3] }, { name: "one", list: [1] }];
    expect(sortRows(rows, col, "asc").map((r) => r.name)).toEqual(["one", "three"]);
  });
});

describe("nextSortState", () => {
  it("desc → asc → 解除 と巡回する", () => {
    expect(nextSortState({ sortKey: null, sortDir: null }, "count")).toEqual({
      sortKey: "count",
      sortDir: "desc",
    });
    expect(nextSortState({ sortKey: "count", sortDir: "desc" }, "count")).toEqual({
      sortKey: "count",
      sortDir: "asc",
    });
    expect(nextSortState({ sortKey: "count", sortDir: "asc" }, "count")).toEqual({
      sortKey: null,
      sortDir: null,
    });
  });
});

describe("visibleColumns", () => {
  it("隠したグループの列を落とす", () => {
    expect(visibleColumns(COLUMNS, ["b"]).map((c) => c.key)).toEqual(["name", "count"]);
  });
});

describe("createTable", () => {
  it("列ごとにヘッダを描き、ラベルは i18n を通す", () => {
    mount();
    expect(headerTexts()).toEqual(["col.name", "col.count", "col.flagged", "col.misc"]);
  });

  it("行を渡された順に描く", () => {
    mount();
    expect(columnTexts(0)).toEqual(["beta", "alpha", "gamma"]);
  });

  it("固定列にはキー名入りの class を付ける", () => {
    mount();
    const th = document.querySelectorAll("thead th")[0];
    expect(th.classList.contains("sticky")).toBe(true);
    expect(th.classList.contains("sticky-name")).toBe(true);
  });

  it("flag と空値の既定表示", () => {
    mount();
    expect(columnTexts(2)).toEqual([EMPTY, "✓", "✓"]);
    expect(columnTexts(1)).toEqual(["8", EMPTY, "4"]);
  });

  it("EMPTY を描いたセルは dim", () => {
    mount();
    const cells = [...document.querySelectorAll("tbody tr")].map((tr) => tr.children[2]);
    expect(cells.map((td) => td.classList.contains("dim"))).toEqual([true, false, false]);
  });

  it("format が Node を返せばそのまま入れる", () => {
    const columns = COLUMNS.map((c) =>
      c.key === "name"
        ? {
            ...c,
            format: (value) => {
              const span = document.createElement("span");
              span.className = "chip";
              span.textContent = value;
              return span;
            },
          }
        : c,
    );
    mount({ columns });
    expect(document.querySelectorAll("tbody td .chip")).toHaveLength(3);
  });

  it("rowAttrs で行に印を付けられる", () => {
    mount({ rowAttrs: (row) => ({ "data-name": row.name }) });
    expect([...document.querySelectorAll("tbody tr")].map((tr) => tr.dataset.name)).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
  });

  it("並べ替えできるヘッダには button が入り、クリックで次の状態を通知する", () => {
    const { onStateChange } = mount();
    const button = document.querySelectorAll("thead th")[1].querySelector("button.sort-btn");
    expect(button.type).toBe("button");
    button.dispatchEvent(new Event("click", { bubbles: true }));
    expect(onStateChange).toHaveBeenCalledWith({
      sortKey: "count",
      sortDir: "desc",
      hiddenGroups: [],
    });
  });

  it("sortable: false のヘッダは button を持たずクリックを無視する", () => {
    const { onStateChange } = mount();
    const th = document.querySelectorAll("thead th")[3];
    expect(th.querySelector("button")).toBeNull();
    th.dispatchEvent(new Event("click", { bubbles: true }));
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("自分では再描画せず、呼び出し側の update() で描き直す", () => {
    const { table, onStateChange } = mount();
    document.querySelectorAll("thead th")[0].dispatchEvent(new Event("click", { bubbles: true }));
    expect(columnTexts(0)).toEqual(["beta", "alpha", "gamma"]);
    table.update(ROWS, onStateChange.mock.calls[0][0]);
    expect(columnTexts(0)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("update() で要素は同じまま中身だけ入れ替わる", () => {
    const { table } = mount();
    const before = table.el;
    table.update([], baseState);
    expect(table.el).toBe(before);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(document.querySelectorAll("thead th")).toHaveLength(4);
  });

  it("エンジンは他のモジュールに依存せず、Bedrock 固有の値も持たない", async () => {
    const source = await import("../src/scripts/table-engine.js?raw").then((m) => m.default);
    // コメント以外に Bedrock の語彙が現れないこと。import は 1 つも持たない。
    const code = source.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/^\s*import\s/m);
    for (const word of ["ON_DEMAND", "INFERENCE_PROFILE", "modelId", "inferenceProfile", "bedrock-runtime"]) {
      expect(code, word).not.toContain(word);
    }
  });
});
