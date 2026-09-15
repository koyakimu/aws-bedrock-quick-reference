// 画面の組み立て。表 (TABLE-001) → 絞り込み (FILTER-001) → 行の展開 (DETAIL-001)
// → URL の復元 (SHARE-001) の順に取り付ける。データは引数で受け取り、
// このモジュールからファイルを読まない (テストが fixture を渡せるようにするため)。
import { mountTableView } from "./table-view.js";
import { mountFilterBar } from "./filter-bar.js";
import { mountDetailView } from "./detail-view.js";
import { mountShare } from "./share.js";
import { mountViewTabs } from "./view-tabs.js";
import { mountRegionsView } from "./regions-view.js";
import { LANG_CHANGED_EVENT } from "./i18n.js";
import { SORT_CHANGED_EVENT, SOURCE_REGION_EVENT } from "./table-view.js";
import { FILTER_CHANGED_EVENT } from "./filter-bar.js";
import { VIEW_REGIONS } from "./url-state.mjs";

export function mountApp({
  host,
  models,
  profiles,
  fetchLog,
  regionNotes,
  overrides = {},
  mantle = null,
  prices = {},
  location: loc = typeof window !== "undefined" ? window.location : undefined,
  history: hist = typeof window !== "undefined" ? window.history : undefined,
  // 画面ビュー (REGIONS-001) の入口。タブの UI ができるまでは既定の "origin" のまま。
  getView,
  setView,
}) {
  // ヘッダ直下の 2 ビュー (REGIONS-001 AC-001)。既存の画面は「起点から」のパネルに入る。
  const tabs = mountViewTabs({ host });

  const view = mountTableView({
    host: tabs.panels.origin,
    models,
    profiles,
    fetchLog,
    regionNotes,
    overrides,
    mantle,
    prices,
  });

  const filter = mountFilterBar({
    view,
    host: host.querySelector("#filter-bar"),
    profiles,
    regionNotes,
  });

  const detail = mountDetailView({
    view,
    models,
    profiles,
    fetchLog,
    regionNotes,
    mantle,
    prices,
  });

  // 取得日時・出典の脚注は 2 つのビューで共用する 1 つにする (REGIONS-001 UI Description)。
  const footnote = tabs.panels.origin.querySelector("#footnote");
  if (footnote) host.appendChild(footnote);

  const regions = mountRegionsView({
    host: tabs.panels.regions,
    models,
    fetchLog,
    regionNotes,
    filter,
    getSort: () => view.getSort(),
    getOriginRegion: () => view.getRegion(),
  });

  // 行列は「リージョン」タブが初めて選ばれたときに描く (AC-NFR-002)。
  tabs.onChange((next) => {
    if (next === VIEW_REGIONS) regions.activate();
  });
  // 起点・絞り込み・並び順が変わったら、次に開いたときに追いつく。
  for (const event of [SOURCE_REGION_EVENT, FILTER_CHANGED_EVENT, SORT_CHANGED_EVENT]) {
    document.addEventListener(event, () => regions.invalidate());
  }

  const share = mountShare({
    view,
    filter,
    regionNotes,
    host,
    location: loc,
    history: hist,
    getView: getView ?? tabs.getView,
    setView: setView ?? tabs.setView,
  });
  // 通知はどちらのビューでも読めるよう、タブの上に置く (SHARE-001 AC-007 / AC-008)。
  tabs.nav.insertAdjacentElement("beforebegin", share.notice);
  // URL の値は TABLE-001 の既定値より優先する (SHARE-001 AC-002)。
  share.restore();
  // 復元は絞り込みを黙って当てる (イベントを出さない) ので、行列にも当て直す。
  regions.invalidate();
  // 復元で「リージョン」が選ばれていたら、ここで描く (SHARE-001 AC-011)。
  if (tabs.getView() === VIEW_REGIONS) regions.activate();

  // 言語が変わってもリロードしない (I18N-001 AC-003)。
  document.addEventListener(LANG_CHANGED_EVENT, () => view.rerender());

  return { view, filter, detail, share, tabs, regions };
}
