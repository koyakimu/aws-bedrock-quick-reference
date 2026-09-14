// 絞り込み UI (FILTER-001)。判定と条件の当てはめは filter-model.mjs が持ち、
// このファイルは DOM とイベントだけを扱う。
// コントロールはすべてネイティブ要素なので Tab / Enter / Space で操作できる。
import {
  DEFAULT_FILTERS,
  MODALITIES,
  NO_LIMIT,
  activeConditions,
  applyFilters,
  buildLimitOptions,
  limitOption,
  limitRegionSet,
  providerOptions,
  removeCondition,
} from "./filter-model.mjs";
import { t, getLang, applyTranslations, LANG_CHANGED_EVENT } from "./i18n.js";
import { regionName } from "./region-names.js";

export const FILTER_CHANGED_EVENT = "filter-changed";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function labelFor(id, key) {
  const node = el("label", "filter-label");
  node.setAttribute("for", id);
  node.setAttribute("data-i18n", key);
  node.textContent = t(key);
  return node;
}

function field(...children) {
  const wrap = el("div", "filter-field");
  wrap.append(...children);
  return wrap;
}

/** 条件チップに出す 1 件ぶんの表示名。 */
export function conditionLabel(condition, limitOptions) {
  if (condition.param === "provider") return `${t("filter.provider")}: ${condition.value}`;
  if (condition.param === "modality") return `${t("filter.modality")}: ${condition.value}`;
  if (condition.param === "q") return `${t("filter.search")}: ${condition.value}`;
  if (condition.param === "callable") return t("filter.callable");
  if (condition.param === "limit") {
    const option = limitOption(limitOptions, condition.value);
    return `${t("filter.limit")}: ${option ? t(option.labelKey) : condition.value}`;
  }
  return String(condition.value);
}

/**
 * 絞り込み UI を組み立て、表に絞り込み関数を差し込む。
 * host は table-view が置いた #filter-bar。
 */
export function mountFilterBar({
  view,
  host = document.getElementById("filter-bar"),
  profiles,
  regionNotes,
  initial = {},
  onChange,
} = {}) {
  if (!host) return null;
  const limitOptions = buildLimitOptions({ regionNotes, profiles });
  let state = { ...DEFAULT_FILTERS, ...initial };
  let lastResult = { shown: 0, total: 0 };

  host.hidden = false;
  host.replaceChildren();

  // --- コントロール ---
  const controls = el("div", "filter-controls");

  const providerSelect = el("select", "ctl filter-select");
  providerSelect.id = "filter-provider";
  providerSelect.multiple = true;
  providerSelect.size = 4;

  const modalitySelect = el("select", "ctl filter-select");
  modalitySelect.id = "filter-modality";
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

  const search = el("input", "ctl filter-search");
  search.id = "filter-q";
  search.type = "search";
  search.setAttribute("data-i18n-placeholder", "filter.searchPlaceholder");
  search.placeholder = t("filter.searchPlaceholder");

  const callable = el("input");
  callable.id = "filter-callable";
  callable.type = "checkbox";
  const callableLabel = el("label", "filter-check");
  callableLabel.setAttribute("for", "filter-callable");
  const callableText = el("span", null, t("filter.callable"));
  callableText.setAttribute("data-i18n", "filter.callable");
  callableLabel.append(callable, callableText);

  const limitSelect = el("select", "ctl filter-select");
  limitSelect.id = "filter-limit";

  controls.append(
    field(labelFor("filter-provider", "filter.provider"), providerSelect),
    field(labelFor("filter-modality", "filter.modality"), modalitySelect),
    field(labelFor("filter-q", "filter.search"), search),
    field(callableLabel),
    field(labelFor("filter-limit", "filter.limit"), limitSelect),
  );

  // --- 件数・条件チップ・リセット ---
  const count = el("p", "filter-count");
  count.id = "filter-count";
  // 件数の変化をスクリーンリーダーに伝える (委譲する非機能要件)。
  count.setAttribute("role", "status");
  count.setAttribute("aria-live", "polite");

  const chips = el("ul", "filter-chips");
  chips.id = "filter-chips";

  const reset = el("button", "ctl filter-reset");
  reset.id = "filter-reset";
  reset.type = "button";
  reset.setAttribute("data-i18n", "filter.reset");
  reset.textContent = t("filter.reset");
  reset.addEventListener("click", () => setState({ ...DEFAULT_FILTERS }));

  const summary = el("div", "filter-summary");
  summary.append(count, chips, reset);
  host.append(controls, summary);

  // --- 0 件の空状態 (AC-010)。データなしバナーとも「提供なし」とも別物 ---
  const empty = el("section", "banner filter-empty");
  empty.id = "filter-empty";
  empty.setAttribute("role", "status");
  empty.hidden = true;
  const emptyTitle = el("p", "filter-empty-title");
  emptyTitle.setAttribute("data-i18n", "filter.emptyTitle");
  const emptyBody = el("p", "filter-empty-body");
  emptyBody.setAttribute("data-i18n", "filter.emptyBody");
  const emptyList = el("ul", "filter-empty-conditions");
  emptyList.id = "filter-empty-conditions";
  const emptyReset = el("button", "ctl filter-reset");
  emptyReset.id = "filter-empty-reset";
  emptyReset.type = "button";
  emptyReset.setAttribute("data-i18n", "filter.reset");
  emptyReset.textContent = t("filter.reset");
  emptyReset.addEventListener("click", () => setState({ ...DEFAULT_FILTERS }));
  empty.append(emptyTitle, emptyBody, emptyList, emptyReset);
  (view?.table ?? host).insertAdjacentElement("afterend", empty);

  function renderLimitOptions() {
    const lang = getLang();
    const none = document.createElement("option");
    none.value = NO_LIMIT;
    none.textContent = t("filter.limitNone");
    const groups = [
      { key: "filter.groupCountry", kind: "country" },
      { key: "filter.groupGeo", kind: "geo" },
    ].map(({ key, kind }) => {
      const group = document.createElement("optgroup");
      group.label = t(key);
      group.dataset.kind = kind;
      for (const option of limitOptions.filter((entry) => entry.kind === kind)) {
        const node = document.createElement("option");
        node.value = option.value;
        node.textContent = t(option.labelKey);
        // 限定集合の中身は title で見せる。region-notes.json に無いコードは
        // コードのまま出す (AC-011)。
        node.title = t("filter.limitRegions", {
          regions: option.regions
            .map((code) => `${code} (${regionName(code, lang, regionNotes)})`)
            .join(", "),
        });
        group.appendChild(node);
      }
      return group;
    });
    limitSelect.replaceChildren(none, ...groups);
    limitSelect.value = state.limit;
  }

  // 選択肢は表示中データに現れる providerName の実値から生成する (AC-001)。
  function renderProviderOptions(rows) {
    const values = providerOptions(rows);
    providerSelect.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = state.provider.includes(value);
        return option;
      }),
    );
  }

  function syncControls() {
    for (const option of providerSelect.options) {
      option.selected = state.provider.includes(option.value);
    }
    for (const option of modalitySelect.options) {
      option.selected = state.modality.includes(option.value);
    }
    search.value = state.q;
    callable.checked = state.callable === true;
    limitSelect.value = state.limit;
  }

  function renderChips() {
    const conditions = activeConditions(state);
    chips.replaceChildren(
      ...conditions.map((condition) => {
        const item = el("li", "filter-chip");
        const label = conditionLabel(condition, limitOptions);
        item.dataset.param = condition.param;
        item.dataset.value = String(condition.value);
        item.appendChild(el("span", "filter-chip-label", label));
        const remove = el("button", "filter-chip-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", t("filter.remove", { label }));
        remove.addEventListener("click", () => setState(removeCondition(state, condition)));
        item.appendChild(remove);
        return item;
      }),
    );
    chips.hidden = conditions.length === 0;
    reset.hidden = conditions.length === 0;
    return conditions;
  }

  function renderEmpty(conditions, { total, shown, status }) {
    // 絞り込みで 0 件になったときだけ出す。denied (データなし) と
    // 「このリージョンでは提供なし」は別の見た目のまま (AC-010)。
    empty.hidden = !(status === "ok" && total > 0 && shown === 0);
    emptyList.replaceChildren(
      ...conditions.map((condition) => el("li", null, conditionLabel(condition, limitOptions))),
    );
    applyTranslations(empty);
  }

  function transform(rows, region) {
    lastResult = applyFilters(rows, state, {
      region,
      limitRegions: limitRegionSet(limitOptions, state.limit),
    });
    return lastResult.rows;
  }

  function afterRender({ rows, status }) {
    renderProviderOptions(rows);
    syncControls();
    count.textContent = t("filter.count", { shown: lastResult.shown, total: lastResult.total });
    const conditions = renderChips();
    renderEmpty(conditions, { total: lastResult.total, shown: lastResult.shown, status });
  }

  function readControls() {
    return {
      provider: [...providerSelect.selectedOptions].map((option) => option.value),
      modality: [...modalitySelect.selectedOptions].map((option) => option.value),
      q: search.value,
      callable: callable.checked,
      limit: limitSelect.value,
    };
  }

  function setState(next, { notify = true } = {}) {
    state = { ...DEFAULT_FILTERS, ...next };
    // 表を描き直すと afterRender が走り、件数・チップ・空状態も揃う。
    view.refresh();
    if (notify) {
      if (typeof onChange === "function") onChange(getState());
      document.dispatchEvent(
        new CustomEvent(FILTER_CHANGED_EVENT, { detail: { filters: getState() } }),
      );
    }
  }

  function getState() {
    return { ...state, provider: [...state.provider], modality: [...state.modality] };
  }

  for (const control of [providerSelect, modalitySelect, limitSelect, callable]) {
    control.addEventListener("change", () => setState(readControls()));
  }
  // 入力ごとに即時反映する。リロードは起きない (AC-003)。
  search.addEventListener("input", () => setState(readControls()));

  document.addEventListener(LANG_CHANGED_EVENT, () => {
    applyTranslations(host);
    search.placeholder = t("filter.searchPlaceholder");
    renderLimitOptions();
    view.refresh();
  });

  renderLimitOptions();
  applyTranslations(host);
  view.setRowTransform(transform);
  view.onRender(afterRender);

  return {
    el: host,
    empty,
    getState,
    setState: (next) => setState(next),
    setStateSilently: (next) => setState(next, { notify: false }),
    getLimitOptions: () => limitOptions,
    getResult: () => ({ ...lastResult }),
  };
}
