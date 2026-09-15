// ヘッダ直下のビュータブ (REGIONS-001 AC-001 / AC-002)。
// タブは表示の切り替えだけを持ち、中身 (表・行列) は知らない。
// 選ばれていないビューは hidden で伏せるだけで、作り直さない。
import { t, LANG_CHANGED_EVENT } from "./i18n.js";
import { DEFAULT_VIEW, VIEW_ORIGIN, VIEW_REGIONS, VIEW_VALUES } from "./url-state.mjs";

export const VIEW_CHANGED_EVENT = "view-changed";

const TABS = [
  { view: VIEW_ORIGIN, tabId: "vtab-origin", panelId: "vp-origin", labelKey: "view.tabOrigin" },
  { view: VIEW_REGIONS, tabId: "vtab-regions", panelId: "vp-regions", labelKey: "view.tabRegions" },
];

/**
 * host の中にタブとビューの入れ物を作る。
 * 返り値の panels に各ビューの中身を入れる。getView / setView は SHARE-001 の入口。
 */
export function mountViewTabs({ host, initial = DEFAULT_VIEW } = {}) {
  let current = VIEW_VALUES.includes(initial) ? initial : DEFAULT_VIEW;
  const listeners = [];

  // タブと、ビューに依らない操作 (URL のコピー) を並べる 1 行。
  const row = document.createElement("div");
  row.className = "tabs-row";
  row.id = "view-tabs-row";

  const nav = document.createElement("nav");
  nav.className = "tabs";
  nav.id = "view-tabs";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("data-i18n-aria-label", "view.tablistLabel");
  nav.setAttribute("aria-label", t("view.tablistLabel"));

  const panels = {};
  const buttons = TABS.map((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.id = tab.tabId;
    button.dataset.view = tab.view;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", tab.panelId);
    button.setAttribute("data-i18n", tab.labelKey);
    button.textContent = t(tab.labelKey);
    button.addEventListener("click", () => setView(tab.view));
    nav.appendChild(button);

    const panel = document.createElement("div");
    panel.id = tab.panelId;
    panel.className = "view-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.tabId);
    panel.tabIndex = 0;
    panels[tab.view] = panel;
    return button;
  });

  // 矢印キーでタブの間を移動する (委譲する非機能要件 a11y)。
  // Enter / Space はネイティブの button がそのまま click にしてくれる。
  nav.addEventListener("keydown", (event) => {
    const index = buttons.findIndex((button) => button === event.target);
    if (index < 0) return;
    const last = buttons.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % buttons.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + last) % buttons.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    buttons[next].focus();
    setView(TABS[next].view);
  });

  function mark() {
    TABS.forEach((tab, index) => {
      const on = tab.view === current;
      buttons[index].setAttribute("aria-selected", String(on));
      // roving tabindex: 選択中のタブだけが Tab の順路に入る。
      buttons[index].tabIndex = on ? 0 : -1;
      panels[tab.view].hidden = !on;
    });
  }

  function setView(next) {
    if (!VIEW_VALUES.includes(next) || next === current) return;
    current = next;
    mark();
    for (const listener of listeners) listener(current);
    document.dispatchEvent(new CustomEvent(VIEW_CHANGED_EVENT, { detail: { view: current } }));
  }

  document.addEventListener(LANG_CHANGED_EVENT, () => {
    nav.setAttribute("aria-label", t("view.tablistLabel"));
    TABS.forEach((tab, index) => {
      buttons[index].textContent = t(tab.labelKey);
    });
  });

  row.appendChild(nav);
  host.replaceChildren(row, panels[VIEW_ORIGIN], panels[VIEW_REGIONS]);
  mark();

  return {
    row,
    nav,
    tabs: buttons,
    panels,
    getView: () => current,
    setView,
    onChange(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}
