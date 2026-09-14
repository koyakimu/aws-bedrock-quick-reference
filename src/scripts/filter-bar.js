// 絞り込み UI (FILTER-001)。判定と条件の当てはめは filter-model.mjs が持ち、
// このファイルは DOM とイベントだけを扱う。
// コントロールはすべてネイティブ要素なので Tab / Enter / Space で操作できる。
import {
  CUSTOM_LIMIT,
  DEFAULT_FILTERS,
  MODALITIES,
  NO_LIMIT,
  activeConditions,
  applyFilters,
  buildLimitOptions,
  canonicalLimitValue,
  customLimitCodes,
  customLimitValue,
  customRegionGroups,
  isCustomLimit,
  limitOption,
  limitRegionSet,
  providerOptions,
  removeCondition,
} from "./filter-model.mjs";
import { t, getLang, applyTranslations, LANG_CHANGED_EVENT } from "./i18n.js";
import { regionName, regionOptionLabel } from "./region-names.js";

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

/**
 * 推論先の限定 1 件の表示名 (AC-018)。固定リストの選択肢はリージョン数を添える。
 * セレクタの選択肢と条件チップは同じこの文字列を使う。
 */
export function limitLabel(option) {
  if (!option) return null;
  if (option.kind === "none" || option.kind === "custom") return t(option.labelKey);
  return t("filter.limitOptionLabel", {
    label: t(option.labelKey),
    count: option.regions.length,
  });
}

/** 条件チップに出す 1 件ぶんの表示名。 */
export function conditionLabel(condition, limitOptions) {
  if (condition.param === "provider") return `${t("filter.provider")}: ${condition.value}`;
  if (condition.param === "modality") return `${t("filter.modality")}: ${condition.value}`;
  if (condition.param === "q") return `${t("filter.search")}: ${condition.value}`;
  if (condition.param === "callable") return t("filter.callable");
  if (condition.param === "limit") {
    // カスタムは集合の件数で示す (AC-012)。
    if (isCustomLimit(condition.value)) {
      const count = customLimitCodes(condition.value).length;
      return `${t("filter.limit")}: ${t("filter.customChip", { count })}`;
    }
    const option = limitOption(limitOptions, condition.value);
    return `${t("filter.limit")}: ${limitLabel(option) ?? condition.value}`;
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

  // --- カスタムのリージョン複数選択 (AC-012 〜 AC-015) ---
  // 「カスタム…」を選んだときだけ開く。要素はネイティブの checkbox / button なので
  // Tab / Space / Enter だけで操作できる。
  const customPicker = el("section", "filter-custom");
  customPicker.id = "filter-custom";
  customPicker.hidden = true;
  customPicker.setAttribute("data-i18n-aria-label", "filter.customHeading");
  customPicker.setAttribute("aria-label", t("filter.customHeading"));

  const customHead = el("div", "filter-custom-head");
  const customHeading = el("h3", "filter-custom-heading");
  customHeading.setAttribute("data-i18n", "filter.customHeading");
  customHeading.textContent = t("filter.customHeading");
  const customClear = el("button", "ctl filter-custom-clear");
  customClear.id = "filter-custom-clear";
  customClear.type = "button";
  customClear.setAttribute("data-i18n", "filter.customClear");
  customClear.textContent = t("filter.customClear");
  customClear.addEventListener("click", () => setState({ ...state, limit: CUSTOM_LIMIT }));
  customHead.append(customHeading, customClear);

  // 1 つも選んでいないときのヒント (AC-015)。
  const customHint = el("p", "filter-custom-hint");
  customHint.id = "filter-custom-hint";
  customHint.setAttribute("role", "status");
  customHint.setAttribute("data-i18n", "filter.customEmptyHint");
  customHint.textContent = t("filter.customEmptyHint");
  customHint.hidden = true;

  const customGroups = el("div", "filter-custom-groups");
  customGroups.id = "filter-custom-groups";
  customPicker.append(customHead, customHint, customGroups);

  const customBoxes = new Map();

  const summary = el("div", "filter-summary");
  summary.append(count, chips, reset);
  host.append(controls, customPicker, summary);

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
    // グループ見出しを持たない平坦な 1 リスト (AC-018)。並びと重複の畳み込みは
    // filter-model.mjs の buildLimitOptions() が決めている。
    const nodes = limitOptions.map((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = limitLabel(option);
      // 限定集合の中身は title で見せる。region-notes.json に無いコードは
      // コードのまま出す (AC-011)。
      if (option.kind === "country" || option.kind === "geo") {
        node.title = t("filter.limitRegions", {
          regions: option.regions
            .map((code) => `${code} (${regionName(code, lang, regionNotes)})`)
            .join(", "),
        });
      }
      return node;
    });
    limitSelect.replaceChildren(...nodes);
    limitSelect.value = selectValue();
  }

  /**
   * セレクタに表示する値。カスタムは集合が何であれ "custom" を選んだ状態にする。
   * 畳まれた値 (`geo:jp` など) は残った選択肢を選んだ状態にする (AC-019)。
   */
  function selectValue() {
    if (isCustomLimit(state.limit)) return CUSTOM_LIMIT;
    return canonicalLimitValue(limitOptions, state.limit) ?? state.limit;
  }

  function customGroupLabel(geo) {
    // 地理圏の名前は I18N-001 の geoArea が正。region-notes.json にしか無い
    // "other" だけ filter 名前空間に持つ。
    return geo === "other" ? t("filter.customGroupOther") : t(`geoArea.${geo}`);
  }

  /** リージョンのチェックボックス一覧 (AC-012 / AC-013)。言語が変わったら作り直す。 */
  function renderCustomPicker() {
    const lang = getLang();
    customBoxes.clear();
    const groups = customRegionGroups(regionNotes).map(({ geo, regions }) => {
      const fieldset = el("fieldset", "filter-custom-group");
      fieldset.dataset.geo = geo;
      const groupLabel = customGroupLabel(geo);
      fieldset.append(el("legend", "filter-custom-legend", groupLabel));

      // グループ一括選択 (AC-013)。
      const selectAll = el("button", "filter-custom-all", t("filter.customSelectAll"));
      selectAll.type = "button";
      selectAll.dataset.geo = geo;
      selectAll.setAttribute("aria-label", t("filter.customSelectAllOf", { group: groupLabel }));
      selectAll.addEventListener("click", () => {
        const next = new Set(customLimitCodes(state.limit));
        for (const code of regions) next.add(code);
        setState({ ...state, limit: customLimitValue([...next]) });
      });
      fieldset.append(selectAll);

      const list = el("ul", "filter-custom-list");
      for (const code of regions) {
        const item = el("li", "filter-custom-item");
        const label = el("label", "filter-custom-label");
        const box = el("input", "filter-custom-box");
        box.type = "checkbox";
        box.value = code;
        box.id = `filter-custom-${code}`;
        box.addEventListener("change", () => setState(readControls()));
        // ラベルは「コード — 現地名」。名前は region-notes.json が正 (I18N-001 AC-005)。
        label.append(box, el("span", null, regionOptionLabel(code, lang, regionNotes)));
        customBoxes.set(code, box);
        item.append(label);
        list.append(item);
      }
      fieldset.append(list);
      return fieldset;
    });
    customGroups.replaceChildren(...groups);
    syncCustom();
  }

  /** ピッカーの開閉・チェック状態・ヒントを state に合わせる。 */
  function syncCustom() {
    const custom = isCustomLimit(state.limit);
    const codes = new Set(customLimitCodes(state.limit));
    customPicker.hidden = !custom;
    // 固定の選択肢に戻したらピッカーは閉じ、集合も持たない (AC-014)。
    for (const [code, box] of customBoxes) box.checked = custom && codes.has(code);
    customHint.hidden = !(custom && codes.size === 0);
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
    limitSelect.value = selectValue();
    syncCustom();
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
      // カスタムのときはチェック済みのリージョンから値を組み立てる (AC-012)。
      limit:
        limitSelect.value === CUSTOM_LIMIT
          ? customLimitValue(
              [...customBoxes].filter(([, box]) => box.checked).map(([code]) => code),
            )
          : limitSelect.value,
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
    renderCustomPicker();
    view.refresh();
  });

  renderLimitOptions();
  renderCustomPicker();
  applyTranslations(host);
  view.setRowTransform(transform);
  view.onRender(afterRender);

  return {
    el: host,
    empty,
    customPicker,
    getState,
    setState: (next) => setState(next),
    setStateSilently: (next) => setState(next, { notify: false }),
    getLimitOptions: () => limitOptions,
    getResult: () => ({ ...lastResult }),
  };
}
