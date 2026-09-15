// 画面の組み立て。表 (TABLE-001) → 絞り込み (FILTER-001) → 行の展開 (DETAIL-001)
// → URL の復元 (SHARE-001) の順に取り付ける。データは引数で受け取り、
// このモジュールからファイルを読まない (テストが fixture を渡せるようにするため)。
import { mountTableView } from "./table-view.js";
import { mountFilterBar } from "./filter-bar.js";
import { mountDetailView } from "./detail-view.js";
import { mountShare } from "./share.js";
import { LANG_CHANGED_EVENT } from "./i18n.js";

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
  const view = mountTableView({
    host,
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

  const share = mountShare({
    view,
    filter,
    regionNotes,
    host,
    location: loc,
    history: hist,
    ...(getView ? { getView } : {}),
    ...(setView ? { setView } : {}),
  });
  // URL の値は TABLE-001 の既定値より優先する (SHARE-001 AC-002)。
  share.restore();

  // 言語が変わってもリロードしない (I18N-001 AC-003)。
  document.addEventListener(LANG_CHANGED_EVENT, () => view.rerender());

  return { view, filter, detail, share };
}
