// モデル × 全リージョンの行列の画面 (REGIONS-001)。
// 判定は regions-model.mjs の純関数、表の骨組みは汎用の table-engine.js に任せ、
// ここは DOM の組み立てと i18n だけを持つ。
import { createTable } from "./table-engine.js";
import {
  ALL_GEO,
  CELL_BLANK,
  CELL_NONE,
  CELL_PROFILE,
  CELL_YES,
  buildMatrixColumns,
  buildMatrixRows,
  geoChipOptions,
  matrixCellState,
  matrixColumnGroups,
  matrixSourceRows,
  statusOf,
  unfetchedRegionCount,
} from "./regions-model.mjs";
import {
  DEFAULT_FILTERS,
  MODALITIES,
  applyFilters,
  providerOptions,
} from "./filter-model.mjs";
import { DEFAULT_SORT } from "./bedrock-view-model.mjs";
import { geoAreaLabel } from "./geo-labels.js";
import { t, getLang, applyTranslations, LANG_CHANGED_EVENT } from "./i18n.js";
import { regionName } from "./region-names.js";

// セルの表示 (AC-005)。記号・class・ツールチップのキーを 1 か所にまとめる。
const CELL_MARKS = {
  [CELL_YES]: { mark: "●", className: "mx-yes", titleKey: "regions.cellYes" },
  [CELL_PROFILE]: { mark: "○", className: "mx-prof", titleKey: "regions.cellProfile" },
  [CELL_NONE]: { mark: "—", className: "mx-none", titleKey: "regions.cellNone" },
  [CELL_BLANK]: { mark: "", className: "mx-blank", titleKey: "regions.cellBlank" },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function labelled(id, labelKey, control) {
  const field = el("span", "filter-field");
  const label = el("label", "label");
  label.setAttribute("for", id);
  label.setAttribute("data-i18n", labelKey);
  label.textContent = t(labelKey);
  field.append(label, control);
  return field;
}

/**
 * 行列を host に取り付ける。初回の描画は activate() まで遅らせる (AC-NFR-002)。
 *
 *  - filter: FILTER-001 の絞り込み。提供元・モダリティだけをこの画面から操作する (AC-010)
 *  - getSort: 行の並び順 (TABLE-001 AC-014 と共用。AC-003)
 *  - getOriginRegion: 「起点」の印を付ける列 (AC-008)
 */
export function mountRegionsView({
  host,
  models,
  fetchLog,
  regionNotes,
  filter = null,
  getSort = () => DEFAULT_SORT,
  getOriginRegion = () => null,
}) {
  const allColumns = buildMatrixColumns(regionNotes);
  const allGeos = [...new Set(allColumns.map((column) => column.geo))];
  // 注記の件数は取得の記録から決まり、絞り込みでは変わらない (AC-007)。
  const unfetched = unfetchedRegionCount(fetchLog);
  const baseRows = matrixSourceRows(models);
  let geoFilter = ALL_GEO;
  let started = false;
  let dirty = true;
  // 描いた回数。無駄な描き直しが無いことをテストから確かめるための数え上げ (AC-NFR-002)。
  let renders = 0;

  // --- 上のバー: 地域チップ + 提供元 / モダリティ + 件数 (UI Description) ---
  const bar = el("div", "bar regions-bar");
  bar.id = "regions-bar";

  const geoGroup = el("div", "filter-group regions-geo");
  geoGroup.id = "regions-geo-chips";
  const geoLabel = el("span", "label");
  geoLabel.setAttribute("data-i18n", "regions.geoLabel");
  geoLabel.textContent = t("regions.geoLabel");
  geoGroup.appendChild(geoLabel);

  const chips = geoChipOptions(regionNotes).map((code) => {
    const chip = el("button", "fchip");
    chip.type = "button";
    chip.dataset.geo = code;
    chip.addEventListener("click", () => {
      // 単一選択。この選択は URL に載せない (AC-009)。
      geoFilter = code;
      rebuild();
    });
    geoGroup.appendChild(chip);
    return chip;
  });

  const filterGroup = el("div", "filter-group regions-filters");
  const providerSelect = el("select", "ctl filter-select");
  providerSelect.id = "regions-provider";
  providerSelect.multiple = true;
  providerSelect.size = 4;
  const modalitySelect = el("select", "ctl filter-select");
  modalitySelect.id = "regions-modality";
  modalitySelect.multiple = true;
  modalitySelect.size = MODALITIES.length;
  modalitySelect.replaceChildren(
    ...MODALITIES.map((modality) => {
      const option = document.createElement("option");
      option.value = modality;
      option.textContent = modality;
      return option;
    }),
  );
  filterGroup.append(
    labelled("regions-provider", "filter.provider", providerSelect),
    labelled("regions-modality", "filter.modality", modalitySelect),
  );

  const count = el("span", "row-count");
  count.id = "regions-count";
  count.setAttribute("role", "status");
  count.setAttribute("aria-live", "polite");

  bar.append(geoGroup, filterGroup, count);

  // --- 行列本体 ---
  const table = createTable({
    columns: [],
    rows: [],
    state: { sortKey: null, sortDir: null, hiddenGroups: [] },
    i18n: t,
    frameClass: "matrix-scroll",
    tableClass: "grid matrix",
    // 1 行目は地理圏のグループ。表示中の列から作るので、列が減れば colspan も減る。
    headerGroups: (shown) =>
      matrixColumnGroups(shown.filter((column) => column.geo)).map((group) => ({
        colspan: group.codes.length,
        className: "geo-head",
        content: geoHeadContent(group.geo),
      })),
    rowAttrs: (row) => ({
      "data-model-id": row.modelId,
      // プロバイダが変わる行の上に区切り線を引く (AC-003)。
      class: row.providerStart ? "prov-start" : null,
    }),
  });
  table.el.id = "regions-matrix";

  // --- 空状態 (AC-013) / 凡例 (AC-006) / 注記 (AC-007) ---
  const empty = el("section", "banner regions-empty");
  empty.id = "regions-empty";
  empty.setAttribute("role", "status");
  empty.hidden = true;
  const emptyTitle = el("p", "filter-empty-title");
  emptyTitle.setAttribute("data-i18n", "filter.emptyTitle");
  emptyTitle.textContent = t("filter.emptyTitle");
  const emptyReset = el("button", "ctl filter-reset");
  emptyReset.id = "regions-empty-reset";
  emptyReset.type = "button";
  emptyReset.setAttribute("data-i18n", "filter.reset");
  emptyReset.textContent = t("filter.reset");
  emptyReset.addEventListener("click", () => filter?.setState({ ...DEFAULT_FILTERS }));
  empty.append(emptyTitle, emptyReset);

  const legend = el("p", "legend");
  legend.id = "regions-legend";

  const note = el("p", "note-muted");
  note.id = "regions-note";
  note.hidden = true;

  host.replaceChildren(bar, table.el, empty, legend, note);

  // --- 中身の組み立て ---
  function geoHeadContent(geo) {
    const fragment = document.createDocumentFragment();
    // 辞書に無い geo はコードをそのまま見出しにする (AC-004 / FILTER-001 AC-020)。
    fragment.append(document.createTextNode(`${geoAreaLabel(geo)} `), el("span", "geo-code", geo));
    return fragment;
  }

  function regionHeadContent(column, origin) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(el("span", "rg-ja", regionName(column.code, getLang(), regionNotes)));
    // 起点が region-notes.json に無いときはどの列にも印を付けない (AC-008)。
    if (column.code === origin) {
      fragment.appendChild(el("span", "origin-marker", t("regions.origin")));
    }
    fragment.appendChild(document.createElement("br"));
    fragment.appendChild(el("span", "rg-code", column.code));
    return fragment;
  }

  function cellOf(row, code) {
    return matrixCellState(row.availability?.[code], statusOf(fetchLog, code));
  }

  function cellTitle(cell) {
    // [] のときだけ「提供あり・推論タイプの指定なし」(AC-005)。
    if (cell.state === CELL_PROFILE && cell.unspecified) return t("regions.cellUnspecified");
    return t(CELL_MARKS[cell.state].titleKey);
  }

  /** 列定義。左 2 列が固定、その右に region-notes.json のキーが 1 列ずつ (AC-004)。 */
  function buildColumns() {
    const origin = getOriginRegion();
    const leading = [
      {
        key: "providerName",
        labelKey: "regions.colProvider",
        sticky: true,
        stickyName: "1",
        sortable: false,
        className: "prov",
        // プロバイダ名は先頭行にだけ入る (AC-003)。
        format: (value) => String(value ?? ""),
      },
      {
        key: "name",
        labelKey: "regions.colModel",
        sticky: true,
        stickyName: "2",
        sortable: false,
        format: (value, row) => String(value || row.modelId),
      },
    ];

    const regions = allColumns.map((column) => ({
      key: `region:${column.code}`,
      code: column.code,
      geo: column.geo,
      group: column.geo,
      sortable: false,
      className: ["mx", column.groupStart ? "geo-start" : "", column.code === origin ? "is-origin" : ""]
        .filter(Boolean)
        .join(" "),
      headerContent: () => regionHeadContent(column, origin),
      format: (_value, row) => CELL_MARKS[cellOf(row, column.code).state].mark,
      cellClass: (row) => CELL_MARKS[cellOf(row, column.code).state].className,
      cellTitle: (row) => cellTitle(cellOf(row, column.code)),
    }));

    return [...leading, ...regions];
  }

  function renderChips() {
    for (const chip of chips) {
      const code = chip.dataset.geo;
      chip.textContent = code === ALL_GEO ? t("regions.geoAll") : geoAreaLabel(code);
      const on = code === geoFilter;
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", String(on));
    }
  }

  function renderLegend() {
    legend.replaceChildren(
      el("span", "g-yes", "●"),
      document.createTextNode(` ${t("regions.cellYes")} / `),
      el("span", "g-prof", "○"),
      document.createTextNode(` ${t("regions.cellProfile")} / `),
      el("span", "g-none", "—"),
      document.createTextNode(` ${t("regions.cellNone")} / `),
      // 空欄は色を持たないので語で示す。取得できなかった理由には触れない (D-008)。
      document.createTextNode(`${t("regions.legendBlank")} ${t("regions.cellBlank")}`),
    );
  }

  /** 行列に効く条件は提供元とモダリティだけ (AC-010 / SHARE-001 AC-012)。 */
  function currentFilters() {
    const state = filter ? filter.getState() : DEFAULT_FILTERS;
    return { provider: [...(state.provider ?? [])], modality: [...(state.modality ?? [])] };
  }

  function syncControls(filters) {
    providerSelect.replaceChildren(
      ...providerOptions(baseRows).map((provider) => {
        const option = document.createElement("option");
        option.value = provider;
        option.textContent = provider;
        option.selected = filters.provider.includes(provider);
        return option;
      }),
    );
    for (const option of modalitySelect.options) {
      option.selected = filters.modality.includes(option.value);
    }
  }

  function render() {
    renders += 1;
    const filters = currentFilters();
    // 行を絞るのは FILTER-001 と同じ関数 (AC-010)。起点も限定も渡さない。
    const result = applyFilters(baseRows, { ...DEFAULT_FILTERS, ...filters });
    const rows = buildMatrixRows(result.rows, { sort: getSort(), lang: getLang() });

    const hidden = geoFilter === ALL_GEO ? [] : allGeos.filter((geo) => geo !== geoFilter);
    const shownColumns = allColumns.filter(
      (column) => geoFilter === ALL_GEO || column.geo === geoFilter,
    );

    table.update(rows, { sortKey: null, sortDir: null, hiddenGroups: hidden });

    syncControls(filters);
    renderChips();
    renderLegend();
    count.textContent = t("regions.count", {
      shown: result.shown,
      total: baseRows.length,
      regions: shownColumns.length,
    });
    note.textContent = t("regions.note", { count: unfetched });
    // 0 件のときは注記を出さない (AC-007)。
    note.hidden = unfetched === 0;
    // 空の tbody を無言で出さない (AC-013)。
    empty.hidden = !(baseRows.length > 0 && result.shown === 0);
    applyTranslations(bar);
    applyTranslations(empty);
    dirty = false;
  }

  /** 起点・言語で列そのものが変わるので、列を作り直してから描く。 */
  function rebuild() {
    table.setColumns(buildColumns());
    render();
  }

  /**
   * まだ描いていない・今は伏せてあるビューは印だけ付けておき、activate() で追いつく。
   * 表示中なら提供元・モダリティの選択を追随させたいのでその場で描き直す。
   */
  function invalidate() {
    dirty = true;
    if (started && !host.hidden) rebuild();
  }

  for (const control of [providerSelect, modalitySelect]) {
    control.addEventListener("change", () => {
      if (!filter) return;
      // 絞り込みの状態は「起点から」ビューと 1 つを共用する (AC-010)。
      filter.setState({
        ...filter.getState(),
        provider: [...providerSelect.selectedOptions].map((option) => option.value),
        modality: [...modalitySelect.selectedOptions].map((option) => option.value),
      });
    });
  }

  document.addEventListener(LANG_CHANGED_EVENT, invalidate);

  return {
    el: host,
    table: table.el,
    empty,
    legend,
    note,
    count,
    /** タブが選ばれたときに初めて描く (AC-NFR-002)。2 回目以降は hidden の切り替えだけ。 */
    activate() {
      if (!started) {
        started = true;
        rebuild();
        return;
      }
      if (dirty) rebuild();
    },
    invalidate,
    isStarted: () => started,
    getRenderCount: () => renders,
    getGeoFilter: () => geoFilter,
  };
}
