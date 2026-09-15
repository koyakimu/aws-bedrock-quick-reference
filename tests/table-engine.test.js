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

// REGIONS-001 の行列も同じエンジンで描く (「Bedrock 固有の知識を持たせない」)。
// 足したのは「2 段ヘッダ」「セルごとの class / title」「枠と table の class」の
// 3 つの汎用オプションだけで、ここではデータの意味を一切使わずに検証する。
describe("createTable の 2 段ヘッダと列グループ", () => {
  const MATRIX_COLUMNS = [
    { key: "a", labelKey: "col.a", sticky: true, stickyName: "1", sortable: false },
    { key: "b", labelKey: "col.b", sticky: true, stickyName: "2", sortable: false },
    {
      key: "x1",
      group: "g1",
      sortable: false,
      className: "cell",
      headerContent: () => "X1",
      format: (value) => String(value ?? ""),
      cellClass: (row) => (row.x1 ? "on" : "off"),
      cellTitle: (row) => (row.x1 ? "有" : "無"),
    },
    { key: "x2", group: "g1", sortable: false, headerContent: () => "X2", format: () => "" },
    { key: "y1", group: "g2", sortable: false, headerContent: () => "Y1", format: () => "" },
  ];
  const MATRIX_ROWS = [{ a: "p", b: "q", x1: 1, x2: 0, y1: 0 }];

  function mountMatrix(state = baseState) {
    const table = createTable({
      columns: MATRIX_COLUMNS,
      rows: MATRIX_ROWS,
      state,
      i18n,
      headerGroups: (shown) => {
        const groups = [];
        for (const column of shown.filter((c) => c.group)) {
          const last = groups[groups.length - 1];
          if (last && last.label === column.group) last.colspan += 1;
          else groups.push({ label: column.group, colspan: 1, className: "geo-head" });
        }
        return groups;
      },
      frameClass: "matrix-scroll",
      tableClass: "grid matrix",
    });
    document.body.replaceChildren(table.el);
    return table;
  }

  it("ヘッダが 2 行になり、覆われない列は rowspan=2 になる", () => {
    mountMatrix();
    const rows = document.querySelectorAll("thead tr");
    expect(rows).toHaveLength(2);
    expect([...rows[0].children].map((th) => th.getAttribute("scope"))).toEqual([
      "col",
      "col",
      "colgroup",
      "colgroup",
    ]);
    expect([...rows[0].children].slice(0, 2).every((th) => th.rowSpan === 2)).toBe(true);
    expect(rows[1].children).toHaveLength(3);
  });

  it("colspan の合計が 2 行目の列数に一致する", () => {
    mountMatrix();
    const groups = [...document.querySelectorAll('thead th[scope="colgroup"]')];
    expect(groups.map((th) => th.colSpan)).toEqual([2, 1]);
    expect(groups.reduce((sum, th) => sum + th.colSpan, 0)).toBe(
      document.querySelectorAll("thead tr")[1].children.length,
    );
  });

  it("列が隠れるとグループの colspan も減る", () => {
    const table = mountMatrix();
    table.update(MATRIX_ROWS, { ...baseState, hiddenGroups: ["g2"] });
    expect(
      [...document.querySelectorAll('thead th[scope="colgroup"]')].map((th) => th.colSpan),
    ).toEqual([2]);
  });

  it("stickyName で固定列の class を位置で名乗らせられる", () => {
    mountMatrix();
    expect(document.querySelectorAll("thead th")[0].classList.contains("sticky-1")).toBe(true);
    expect(document.querySelectorAll("tbody td")[0].classList.contains("sticky-1")).toBe(true);
  });

  it("セルごとの class と title を列が決められる", () => {
    mountMatrix();
    const td = document.querySelectorAll("tbody td")[2];
    expect(td.classList.contains("cell")).toBe(true);
    expect(td.classList.contains("on")).toBe(true);
    expect(td.title).toBe("有");
  });

  it("枠と table に class を足せる", () => {
    const table = mountMatrix();
    expect(table.el.classList.contains("table-frame")).toBe(true);
    expect(table.el.classList.contains("matrix-scroll")).toBe(true);
    expect(document.querySelector("table").className).toBe("grid matrix");
  });
});
