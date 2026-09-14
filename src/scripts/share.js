// URL による状態の共有 (SHARE-001)。クエリの読み書きは url-state.mjs が持ち、
// このファイルは history / clipboard / 通知の DOM だけを扱う。
import { parseState, searchString, serializeState, shareUrl } from "./url-state.mjs";
import { providerOptions } from "./filter-model.mjs";
import { copyText } from "./copy.js";
import { t, getLang, applyTranslations, LANG_CHANGED_EVENT } from "./i18n.js";
import { regionOptionLabel } from "./region-names.js";
import { SOURCE_REGION_EVENT } from "./table-view.js";
import { FILTER_CHANGED_EVENT } from "./filter-bar.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * 起点リージョンと絞り込みを URL に載せ、URL から復元する。
 * view (TABLE-001) と filter (FILTER-001) が mount 済みであることが前提。
 */
export function mountShare({
  view,
  filter,
  regionNotes,
  host = document.getElementById("main"),
  location: loc = window.location,
  history: hist = window.history,
} = {}) {
  const regions = view.getRegions();
  const limits = filter ? filter.getLimitOptions().map((option) => option.value) : [];

  // --- 通知 (AC-007 / AC-008) ---
  const notice = el("section", "banner notice");
  notice.id = "share-notice";
  notice.setAttribute("role", "status");
  notice.hidden = true;
  const noticeList = el("ul", "notice-list");
  noticeList.id = "share-notice-list";
  const close = el("button", "notice-close", "×");
  close.type = "button";
  close.id = "share-notice-close";
  close.setAttribute("data-i18n-aria-label", "share.noticeClose");
  close.setAttribute("aria-label", t("share.noticeClose"));
  close.addEventListener("click", () => {
    notice.hidden = true;
  });
  notice.append(noticeList, close);
  const sourceBar = document.getElementById("source-bar");
  if (sourceBar) sourceBar.insertAdjacentElement("afterend", notice);
  else host?.prepend(notice);

  // --- 「この表示の URL をコピー」(AC-005) ---
  const copy = el("button", "ctl share-copy");
  copy.type = "button";
  copy.id = "share-copy";
  copy.setAttribute("data-i18n", "share.copy");
  copy.textContent = t("share.copy");
  copy.addEventListener("click", async () => {
    const ok = await copyText(currentUrl());
    copy.classList.toggle("copied", ok);
    copy.textContent = ok ? t("share.copied") : t("share.copy");
    setTimeout(() => {
      copy.classList.remove("copied");
      copy.textContent = t("share.copy");
    }, 1200);
  });
  if (sourceBar) sourceBar.appendChild(copy);

  function currentState() {
    return { region: view.getRegion(), ...(filter ? filter.getState() : {}) };
  }

  function currentUrl() {
    return shareUrl(currentState(), loc.href);
  }

  // 絞り込み操作で戻るボタンの履歴を埋めない。常に replaceState (AC-001)。
  function syncUrl() {
    const query = searchString(currentState());
    // 先頭スラッシュの絶対パスを作らない。GitHub Pages のサブパス配下でも動くように
    // 現在のパスをそのまま使う (Spec Notes)。
    const path = `${loc.pathname}${query}`;
    hist.replaceState(hist.state ?? null, "", path);
  }

  function showNotice(messages) {
    noticeList.replaceChildren(...messages.map((message) => el("li", "notice-line", message)));
    notice.hidden = messages.length === 0;
  }

  function describeIgnored(ignored) {
    const messages = [];
    for (const entry of ignored) {
      if (entry.param === "region" && entry.fallback) {
        messages.push(
          t("share.noticeRegion", {
            region: entry.value,
            fallback: regionOptionLabel(view.getRegion(), getLang(), regionNotes),
          }),
        );
      }
    }
    const others = ignored.filter((entry) => !(entry.param === "region" && entry.fallback));
    if (others.length > 0) {
      messages.push(
        t("share.noticeIgnored", {
          items: others.map((entry) => `${entry.param}=${entry.value}`).join(", "),
        }),
      );
    }
    return messages;
  }

  /** 初期化。URL を読み、起点と絞り込みに適用してから URL を現在の状態に揃える。 */
  function restore(search = loc.search) {
    // provider の正当値は「今の起点で表示できる行」の実値 (FILTER-001 AC-001)。
    const providers = providerOptions(view.getModel()?.rows ?? []);
    const { state, ignored } = parseState(search, { regions, providers, limits });

    if (state.region !== view.getRegion()) view.setRegion(state.region);

    if (filter) {
      // 起点が変わると provider の母集団も変わるので、判定し直してから当てる。
      const validProviders = providerOptions(view.getModel()?.rows ?? []);
      const kept = state.provider.filter((entry) => validProviders.includes(entry));
      for (const entry of state.provider) {
        if (!kept.includes(entry)) ignored.push({ param: "provider", value: entry });
      }
      filter.setStateSilently({
        provider: kept,
        modality: state.modality,
        q: state.q,
        callable: state.callable,
        limit: state.limit,
      });
    }

    showNotice(describeIgnored(ignored));
    // 不正値を落とした結果を URL にも反映する (AC-007)。
    syncUrl();
    return { state, ignored };
  }

  // 起点・絞り込みが変わるたびに URL を書き換える (AC-001 / AC-003)。
  document.addEventListener(SOURCE_REGION_EVENT, syncUrl);
  document.addEventListener(FILTER_CHANGED_EVENT, syncUrl);

  document.addEventListener(LANG_CHANGED_EVENT, () => {
    applyTranslations(notice);
    copy.textContent = t("share.copy");
  });

  return {
    notice,
    copyButton: copy,
    restore,
    syncUrl,
    currentUrl,
    currentState,
    serialize: () => serializeState(currentState()),
  };
}
