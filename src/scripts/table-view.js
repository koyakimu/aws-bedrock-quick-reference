// Bedrock 固有の画面 (TABLE-001)。列定義とセルの中身はここが持ち、
// 表の骨組みは汎用の table-engine.js に任せる。
import { createTable, EMPTY } from "./table-engine.js";
import {
  buildViewModel,
  formatPrice,
  geoPlaces,
  orderRows,
  outsideCount,
  selectableRegions,
  regionStatus,
  DEFAULT_SORT,
  PINNED_PROVIDERS,
  SORT_ALPHA,
  SORT_PINNED,
  SORT_VALUES,
} from "./bedrock-view-model.mjs";
import { copyText } from "./copy.js";
import { geoAreaLabel } from "./geo-labels.js";
import { t, getLang, applyTranslations } from "./i18n.js";
import { regionName, regionOptionLabel } from "./region-names.js";

export const DEFAULT_REGION = "ap-northeast-1";

// 脚注の出典リンク (AC-008)。URL は 2026-09-14 に到達確認済み。
export const DOC_LINKS = Object.freeze([
  {
    labelKey: "footnote.docListFoundationModels",
    href: "https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html",
  },
  {
    labelKey: "footnote.docListInferenceProfiles",
    href: "https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html",
  },
  {
    labelKey: "footnote.docGeoCris",
    href: "https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html",
  },
  {
    labelKey: "footnote.docGlobalCris",
    href: "https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html",
  },
  {
    labelKey: "footnote.docEndpoints",
    href: "https://docs.aws.amazon.com/general/latest/gr/bedrock.html",
  },
]);

const GLOBAL_CRIS_DOC = DOC_LINKS.find((link) => link.labelKey === "footnote.docGlobalCris").href;

// 価格の出典 (PRICE-001 / D-009)。prices.json に source が無いときの控え。
const PRICE_INDEX_URL = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json";

// 起点リージョンが変わったことを外に知らせるイベント (SHARE-001 / FILTER-001 の入口)。
export const SOURCE_REGION_EVENT = "source-region-changed";

// 行の並び順が変わったことを外に知らせるイベント (SHARE-001 AC-013 の入口)。
export const SORT_CHANGED_EVENT = "row-sort-changed";

// 並べ替えを切り替えるヘッダの列 (AC-014)。プロバイダ列のヘッダのクリックで pinned ⇄ alpha。
const SORT_TOGGLE_KEY = "provider";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function markNo() {
  const span = el("span", "flag-no");
  span.append(el("span", "mark", "✕"), el("span", "label", t("value.no")));
  return span;
}

function markYes() {
  const span = el("span", "flag-yes");
  span.append(el("span", "mark", "✓"), el("span", "label", t("value.yes")));
  return span;
}

// 推論先の限定を満たさないセルの印 (FILTER-001 AC-005 / AC-008)。
// 行ごと消さずにセルを淡色にするのは「この使い方なら条件を満たす」を残すため。
function limitBadge() {
  return el("span", "limit-out", t("filter.outOfLimit"));
}

// 限定が設定されているか (FILTER-001 が annotateRow で付ける)。
function limitActive(row) {
  return row.limit?.active === true;
}

// 推論先は地名で出す。リージョンコードは表に出さない (AC-004)。
// 判定の根拠として data-region だけ残す (FILTER-001 / DETAIL-001 が行を辿るため)。
function destinationPlace(place) {
  const node = el("span", "geo-place", place.name);
  node.dataset.region = place.code;
  if (place.isSource) node.classList.add("is-source");
  if (place.outside) {
    // 起点リージョンの国の外にある推論先を淡色 + 注意色で区別する (AC-004)。
    node.classList.add("is-outside");
    node.title = t("geo.outsideMark");
  }
  return node;
}

// AC-011: TEXT / IMAGE / VIDEO / SPEECH / EMBEDDING を辞書で平易な語に置き換える。
// 辞書に無い未知の値は列挙子のまま素通しする (DATA-001 と同じ方針)。
function modalityWords(values) {
  const separator = t("value.modalitySeparator");
  return (values ?? [])
    .map((value) => {
      const word = t(`modality.${value}`);
      return word === `modality.${value}` ? value : word;
    })
    .join(separator);
}

function capabilityCell(row) {
  const wrap = el("span", "capability");
  wrap.append(
    el("span", "modality-in", modalityWords(row.input) || EMPTY),
    el("span", "modality-arrow", t("value.modalityArrow")),
    el("span", "modality-out", modalityWords(row.output) || EMPTY),
  );
  return wrap;
}

// AC-006 / AC-012: モデル名。LEGACY のときだけ小さなタグを添える。
function modelNameCell(row) {
  const wrap = el("span", "model-name");
  wrap.append(el("span", "model-name-text", row.name || row.modelId));
  if (row.lifecycle === "LEGACY") {
    const tag = el("span", "legacy-tag", t("table.legacyTag"));
    tag.title = row.lifecycle;
    wrap.appendChild(tag);
  }
  return wrap;
}

function inRegionCell(row) {
  const wrap = el("span", "cell-inregion");
  if (!row.inRegion) {
    wrap.appendChild(markNo());
    return wrap;
  }
  wrap.appendChild(markYes());
  // 起点 R が限定集合 L に入っていなければ In-Region は限定を満たさない (AC-007)。
  if (limitActive(row) && row.limit.inRegion !== true) {
    wrap.classList.add("out-of-limit");
    wrap.appendChild(limitBadge());
  }
  return wrap;
}

// 接頭辞 → 地理圏の平易な名前 (AC-004) は geo-labels.js の 1 か所が実体
// (FILTER-001 / REGIONS-001 / FLOW-001 と共有)。使う側はそちらから import する。

function geoCell(row, notes) {
  if (row.geo.length === 0) return markNo();
  const lang = getLang();
  const separator = t("geo.separator");
  const wrap = el("span", "cell-geo");
  for (const entry of row.geo) {
    const line = el("span", "geo-entry");
    line.dataset.profileId = entry.profileId;
    line.dataset.prefix = entry.prefix;
    // AC-004: プロファイル ID ではなく接頭辞から導いた地理圏の平易な名前を出す。
    line.appendChild(el("span", "geo-area", geoAreaLabel(entry.prefix)));
    if (limitActive(row) && row.limit.geo?.[entry.profileId] !== true) {
      line.classList.add("out-of-limit");
      line.appendChild(limitBadge());
    }
    // AC-004: 推論先はリージョンコードではなく地名を「 ・ 」で連ねる。
    const places = geoPlaces(entry.destinations, {
      region: row.sourceRegion,
      regionNotes: notes,
      lang,
    });
    const list = el("span", "geo-places");
    places.forEach((place, index) => {
      if (index > 0) list.appendChild(el("span", "geo-sep", separator));
      list.appendChild(destinationPlace(place));
    });
    const outside = outsideCount(places);
    if (outside > 0) {
      list.appendChild(el("span", "geo-outside-count", t("geo.outsideCount", { count: outside })));
    }
    line.appendChild(list);
    wrap.appendChild(line);
  }
  return wrap;
}

// PRICE-001 AC-007 / AC-008: 単価は $ 付きで右寄せ。値が無ければ「—」。
function priceCell(value) {
  const text = formatPrice(value);
  if (text == null) return EMPTY;
  return el("span", "price-value", `$${text}`);
}

// Global は destination を列挙しない。sources[R] の ["*"] は画面に出さない (AC-005)。
// Global に別の単価があれば「$入力 / $出力」を同じセルに添える (PRICE-001 AC-008)。
function globalCell(row) {
  if (!row.global) return markNo();
  const wrap = el("span", "cell-global");
  wrap.appendChild(markYes());
  const globalPrice = row.price?.global;
  const input = formatPrice(globalPrice?.input);
  const output = formatPrice(globalPrice?.output);
  if (input != null || output != null) {
    const line = el("span", "global-price");
    line.textContent = `$${input ?? EMPTY} / $${output ?? EMPTY}`;
    line.title = t("price.globalHint");
    wrap.appendChild(line);
  }
  const note = el("span", "global-note");
  note.append(el("span", "global-note-text", t("value.globalNote")), document.createTextNode(" "));
  const link = el("a", "global-note-link", t("value.globalDocs"));
  link.href = GLOBAL_CRIS_DOC;
  link.target = "_blank";
  link.rel = "noreferrer";
  note.appendChild(link);
  wrap.appendChild(note);
  // Global の destination は ["*"] なので、限定が付いていれば常に満たさない (AC-008)。
  if (limitActive(row)) {
    wrap.classList.add("out-of-limit");
    wrap.appendChild(limitBadge());
  }
  return wrap;
}

// MANTLE-001 AC-003: モデルが mantle 対応かつ起点が mantle 提供リージョンのときだけ ✓。
// それ以外 (未対応 / 提供外リージョン / docs に記載なし) は「—」で、
// ツールチップに mantle で指定する素のモデル ID か、なぜ「—」なのかを出す。
function mantleCell(row) {
  const judged = row.mantle;
  const wrap = el("span", "cell-mantle");
  if (judged?.available === true) {
    wrap.appendChild(markYes());
    wrap.dataset.mantleModelId = judged.mantleModelId;
    wrap.title = t("mantle.modelIdTooltip", { id: judged.mantleModelId });
    return wrap;
  }
  wrap.appendChild(el("span", "mantle-dash", EMPTY));
  if (!judged) wrap.title = t("mantle.mantleUnknownModel");
  else if (!judged.modelSupported) wrap.title = t("mantle.mantleUnsupportedModel");
  else wrap.title = t("mantle.notAvailable");
  return wrap;
}

function notesCell(row) {
  if (row.notes.length === 0) return EMPTY;
  const lang = getLang();
  const wrap = el("span", "cell-notes");
  for (const entry of row.notes) {
    const text = entry.note?.[lang];
    if (typeof text !== "string" || text.length === 0) continue;
    wrap.appendChild(el("span", "note-line", text));
  }
  return wrap.childElementCount > 0 ? wrap : EMPTY;
}

// AC-006 の列構成。左から プロバイダ / モデル名 / できること / In-Region / Geo /
// Global / 入力 $/1M / 出力 $/1M / Mantle / 備考。技術的な識別子 (モデル ID / プロファイル ID / lifecycle) は表に出さず
// DETAIL-001 の詳細パネルへ移した。モデル名列は横スクロールしても左端に残す (AC-NFR-001)。
export function buildColumns(regionNotes) {
  return [
    { key: "provider", group: "id", labelKey: "table.provider", type: "text", sticky: true },
    {
      key: "name",
      group: "id",
      labelKey: "table.modelName",
      type: "text",
      sticky: true,
      format: (_value, row) => modelNameCell(row),
    },
    {
      key: "capability",
      group: "spec",
      labelKey: "table.capability",
      type: "text",
      sortable: false,
      format: (_value, row) => capabilityCell(row),
    },
    {
      key: "inRegion",
      group: "judge",
      labelKey: "table.inRegion",
      type: "flag",
      format: (_value, row) => inRegionCell(row),
    },
    {
      key: "geo",
      group: "judge",
      labelKey: "table.geo",
      type: "text",
      sortable: false,
      format: (_value, row) => geoCell(row, regionNotes),
    },
    {
      key: "global",
      group: "judge",
      labelKey: "table.global",
      type: "text",
      sortable: false,
      format: (_value, row) => globalCell(row),
    },
    // PRICE-001 AC-007: Global の右に 標準の 入力 / 出力 の単価 (USD / 100 万トークン)。
    {
      key: "priceInput",
      group: "price",
      labelKey: "price.inputColumn",
      type: "number",
      align: "right",
      format: (value) => priceCell(value),
    },
    {
      key: "priceOutput",
      group: "price",
      labelKey: "price.outputColumn",
      type: "number",
      align: "right",
      format: (value) => priceCell(value),
    },
    // MANTLE-001 AC-003: 備考の手前に置く最後の列。
    {
      key: "mantle",
      group: "judge",
      labelKey: "table.mantle",
      type: "flag",
      sortValue: (row) => row.mantle?.available === true,
      format: (_value, row) => mantleCell(row),
    },
    {
      key: "notes",
      group: "spec",
      labelKey: "table.notes",
      type: "text",
      sortable: false,
      format: (_value, row) => notesCell(row),
    },
  ];
}

/**
 * 画面を組み立てて DOM に取り付ける。
 * 返り値の setRegion / rerender で再描画する。データは引数で受け取り、
 * このモジュールからファイルを読まない (テストが fixture を渡せるようにするため)。
 */
export function mountTableView({
  host,
  models,
  profiles,
  fetchLog,
  regionNotes,
  overrides = {},
  mantle = null,
  prices = {},
}) {
  const regions = selectableRegions(regionNotes);
  let region = regions.includes(DEFAULT_REGION) ? DEFAULT_REGION : regions[0];
  let state = { sortKey: null, sortDir: null, hiddenGroups: [] };
  // 行の並び順 (AC-014)。既定は pinned。列ヘッダでの並べ替え (table-engine) とは別物。
  let sort = DEFAULT_SORT;

  // FILTER-001 が挿す「行を絞る関数」と、描画結果を聞きたい側 (FILTER-001 / DETAIL-001)。
  // 表自身は絞り込みの条件を知らない。
  let rowTransform = null;
  const renderListeners = [];
  let shownRows = [];

  // --- 起点リージョンセレクタとエンドポイント (AC-001 / AC-002) ---
  const bar = el("section", "source-bar");
  bar.id = "source-bar";

  const label = el("label", "source-label");
  label.setAttribute("for", "source-region");
  label.setAttribute("data-i18n", "source.label");
  label.textContent = t("source.label");

  const select = el("select", "ctl mono");
  select.id = "source-region";

  const endpointLine = el("span", "endpoint-line");
  endpointLine.id = "endpoint-line";
  const endpointLabel = el("span", "endpoint-label");
  endpointLabel.setAttribute("data-i18n", "source.endpointLabel");
  endpointLabel.textContent = t("source.endpointLabel");
  const endpointValue = el("code", "endpoint mono");
  endpointValue.id = "endpoint-value";
  const endpointCopy = el("button", "copy-btn", "⧉");
  endpointCopy.type = "button";
  endpointCopy.id = "endpoint-copy";
  endpointCopy.setAttribute("data-i18n-aria-label", "copy.endpoint");
  endpointCopy.setAttribute("aria-label", t("copy.endpoint"));
  endpointCopy.addEventListener("click", async () => {
    const ok = await copyText(endpointValue.textContent);
    endpointCopy.textContent = ok ? "✓" : "⧉";
    setTimeout(() => {
      endpointCopy.textContent = "⧉";
    }, 1200);
  });
  endpointLine.append(endpointLabel, endpointValue, endpointCopy);

  // --- もう一つの接続先 bedrock-mantle (MANTLE-001 AC-001 / AC-002) ---
  const mantleLine = el("span", "endpoint-line mantle-line");
  mantleLine.id = "mantle-endpoint-line";
  const mantleLabel = el("span", "endpoint-label mantle-label");
  mantleLabel.id = "mantle-endpoint-label";
  const mantleValue = el("code", "endpoint mono");
  mantleValue.id = "mantle-endpoint-value";
  const mantleCopy = el("button", "copy-btn", "⧉");
  mantleCopy.type = "button";
  mantleCopy.id = "mantle-endpoint-copy";
  mantleCopy.setAttribute("data-i18n-aria-label", "copy.mantleEndpoint");
  mantleCopy.addEventListener("click", async () => {
    const ok = await copyText(mantleValue.textContent);
    mantleCopy.textContent = ok ? "✓" : "⧉";
    setTimeout(() => {
      mantleCopy.textContent = "⧉";
    }, 1200);
  });
  mantleLine.append(mantleLabel, mantleValue, mantleCopy);

  // AC-004: Mantle では cross-region inference が使えないことを接続先の近くに 1 行で置く。
  const mantleNote = el("p", "mantle-note");
  mantleNote.id = "mantle-no-cris";
  mantleNote.setAttribute("data-i18n", "mantle.noCris");

  bar.append(label, select, endpointLine, mantleLine, mantleNote);

  // FILTER-001 が後で中身を入れる場所。今は空のまま置いておく。
  const filterHost = el("div", "filter-bar");
  filterHost.id = "filter-bar";
  filterHost.dataset.hook = "FILTER-001";
  filterHost.hidden = true;

  // --- 未取得バナー (AC-009) ---
  const banner = el("section", "banner banner-nodata");
  banner.id = "denied-banner";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  const bannerTitle = el("p", "banner-title");
  bannerTitle.setAttribute("data-i18n", "state.noDataTitle");
  const bannerBody = el("p", "banner-body");
  bannerBody.setAttribute("data-i18n", "state.noDataBody");
  // 取得できなかった理由 (cause) はメンテナ向けの情報なので画面には出さない (D-008)。
  banner.append(bannerTitle, bannerBody);

  // --- 表と空状態 ---
  const table = createTable({
    columns: buildColumns(regionNotes),
    rows: [],
    state,
    i18n: t,
    onStateChange(next) {
      // プロバイダ列のヘッダは列の並べ替えではなく pinned ⇄ alpha の切り替えに使う (AC-014)。
      if (next.sortKey === SORT_TOGGLE_KEY) {
        // 先に他の列で並べ替えていたら、その指定を捨ててから切り替える。
        // 残したままだと sortRows がその列で並べ直すので、行の順が pinned / alpha に
        // ならないまま aria-sort と URL だけが変わってしまう。
        state = { ...state, sortKey: null, sortDir: null };
        setSort(sort === SORT_PINNED ? SORT_ALPHA : SORT_PINNED);
        return;
      }
      state = next;
      table.update(shownRows, state);
      markSortHeader();
    },
    // DETAIL-001 が行を特定できるようにしておく。
    rowAttrs: (row) => ({ "data-model-id": row.modelId }),
  });
  table.el.id = "models-table";

  const emptyState = el("p", "empty");
  emptyState.id = "empty-state";
  emptyState.setAttribute("data-i18n", "state.notOffered");
  emptyState.hidden = true;

  // DETAIL-001 が行の展開先として使う場所。
  const detailHost = el("div", "detail-host");
  detailHost.id = "detail-host";
  detailHost.dataset.hook = "DETAIL-001";
  // 現在この枠に描くものは無い (エラー原文の脚注を廃止したため)。
  detailHost.hidden = true;

  // --- 脚注 (AC-008) ---
  const footnote = el("footer", "notes");
  footnote.id = "footnote";

  host.replaceChildren(bar, filterHost, banner, table.el, emptyState, detailHost, footnote);

  let model = null;
  function current() {
    return model;
  }

  function renderOptions() {
    const lang = getLang();
    select.replaceChildren(
      ...regions.map((code) => {
        const option = document.createElement("option");
        option.value = code;
        const denied = regionStatus(fetchLog, code).status === "denied";
        const label = regionOptionLabel(code, lang, regionNotes);
        // 未取得のリージョンも選べる。ラベルに「（未取得）」だけを添える (AC-009)。
        option.textContent = denied ? t("source.optionUnfetched", { label }) : label;
        option.dataset.status = regionStatus(fetchLog, code).status;
        if (denied) option.classList.add("denied");
        return option;
      }),
    );
    select.value = region;
  }

  function renderFootnote() {
    const lang = getLang();
    footnote.replaceChildren();
    footnote.appendChild(el("h3", null, t("footnote.heading")));
    const list = el("ul", "footnote-list");
    list.appendChild(
      el("li", "footnote-generated", t("footnote.generatedAt", { date: model.generatedAt ?? EMPTY })),
    );
    list.appendChild(
      el("li", "footnote-account", t("footnote.accountKind", { kind: model.accountKind ?? EMPTY })),
    );
    const denied = model.deniedRegions;
    list.appendChild(
      el(
        "li",
        "footnote-denied",
        denied.length === 0
          ? t("footnote.deniedNone")
          : t("footnote.deniedRegions", {
              count: denied.length,
              regions: denied
                .map((code) => `${code} (${regionName(code, lang, regionNotes)})`)
                .join(", "),
            }),
      ),
    );
    // 価格の取得日・価格表の発行日・出典 (PRICE-001 AC-009)。
    if (model.priceGeneratedAt || model.pricePublicationDate) {
      list.appendChild(
        el("li", "footnote-price-generated", t("price.fetchedAt", { date: model.priceGeneratedAt ?? EMPTY })),
      );
      const item = el("li", "footnote-price-source");
      item.append(
        document.createTextNode(
          t("price.publicationDate", { date: model.pricePublicationDate ?? EMPTY }),
        ),
        document.createTextNode(" "),
      );
      const anchor = el("a", "doc-link price-source-link", t("price.sourceLabel"));
      anchor.href = model.priceSource?.index ?? PRICE_INDEX_URL;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      item.appendChild(anchor);
      list.appendChild(item);
    }
    // AC-015: 固定したプロバイダを隠さず脚注で明かす。alpha のときは出さない。
    if (sort === SORT_PINNED) {
      const pinned = PINNED_PROVIDERS.join(t("footnote.pinnedJoin"));
      const line = el("li", "footnote-pinned", t("footnote.pinnedProviders", { providers: pinned }));
      list.appendChild(line);
    }
    footnote.appendChild(list);

    footnote.appendChild(el("h4", null, t("footnote.sources")));
    const links = el("ul", "footnote-sources");
    for (const link of DOC_LINKS) {
      const li = el("li");
      const anchor = el("a", "doc-link", t(link.labelKey));
      anchor.href = link.href;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      li.appendChild(anchor);
      links.appendChild(li);
    }
    footnote.appendChild(links);
  }

  function render() {
    model = buildViewModel({
      models,
      profiles,
      fetchLog,
      regionNotes,
      overrides,
      mantle,
      prices,
      region,
    });

    endpointValue.textContent = model.endpoint;

    // AC-001 / AC-002: 提供リージョンなら FQDN + コピーボタン、無ければ提供なしの 1 行。
    if (model.mantleEndpoint) {
      mantleLabel.textContent = t("mantle.endpointLabel");
      mantleValue.textContent = model.mantleEndpoint;
      mantleValue.hidden = false;
      mantleCopy.hidden = false;
      mantleCopy.setAttribute("aria-label", t("copy.mantleEndpoint"));
      mantleLine.classList.remove("mantle-none");
    } else {
      mantleLabel.textContent = t("mantle.notAvailable");
      mantleValue.textContent = "";
      mantleValue.hidden = true;
      mantleCopy.hidden = true;
      mantleLine.classList.add("mantle-none");
    }
    mantleNote.textContent = t("mantle.noCris");

    const denied = model.status === "denied";
    banner.hidden = !denied;

    // 取得できているのに 0 件なら「提供なし」。バナーは出さない (AC-010)。
    // 絞り込みで 0 件になった場合は別の空状態 (FILTER-001 AC-010) なのでここでは出さない。
    emptyState.hidden = denied || model.rows.length > 0;
    emptyState.textContent = t("state.notOffered");

    const filtered =
      typeof rowTransform === "function" ? rowTransform(model.rows, region) : model.rows;
    // AC-014: プロバイダ → モデル名 の 2 段。pinned のときだけ 2 社を先頭に固定する。
    shownRows = orderRows(filtered, { sort, lang: getLang() });

    table.update(shownRows, state);
    markSortHeader();
    renderFootnote();
    applyTranslations(banner);

    for (const listener of renderListeners) {
      listener({ region, rows: model.rows, shown: shownRows, status: model.status });
    }
  }

  select.addEventListener("change", () => {
    setRegion(select.value);
  });

  /**
   * 現在の並び順をプロバイダ列のヘッダに出す (AC-014)。
   * alpha は昇順なので aria-sort="ascending"、pinned は昇順ではないので "other"。
   */
  function markSortHeader() {
    const th = table.el.querySelector(`thead th[data-key="${SORT_TOGGLE_KEY}"]`);
    if (!th) return;
    // プロバイダ列は列の並べ替えに使わない (onStateChange が横取りして state を空にする) ので、
    // state.sortKey がこの列になることはない。
    th.setAttribute("aria-sort", sort === SORT_ALPHA ? "ascending" : "other");
    th.dataset.sort = sort;
  }

  /** 行の並び順を変える (AC-014)。値が同じなら何もしない。 */
  function setSort(next) {
    if (!SORT_VALUES.includes(next) || next === sort) return;
    sort = next;
    render();
    document.dispatchEvent(new CustomEvent(SORT_CHANGED_EVENT, { detail: { sort } }));
  }

  function setRegion(next) {
    if (!regions.includes(next)) return;
    region = next;
    select.value = next;
    render();
    document.dispatchEvent(
      new CustomEvent(SOURCE_REGION_EVENT, { detail: { region, rows: model.rows } }),
    );
  }

  function rerender() {
    renderOptions();
    render();
  }

  renderOptions();
  render();

  return {
    el: host,
    table: table.el,
    getRegion: () => region,
    getRegions: () => [...regions],
    getSort: () => sort,
    setSort,
    getModel: () => model,
    getShownRows: () => shownRows,
    setRegion,
    rerender,
    // 表自身を再描画せずに絞り込みだけを掛け直す入口 (FILTER-001)。
    setRowTransform(fn) {
      rowTransform = fn;
      render();
    },
    refresh: render,
    onRender(listener) {
      renderListeners.push(listener);
      // 登録直後の状態も 1 度渡す (後から mount する側が初期描画を取りこぼさないため)。
      listener({ region, rows: model.rows, shown: shownRows, status: model.status });
      return () => {
        const index = renderListeners.indexOf(listener);
        if (index >= 0) renderListeners.splice(index, 1);
      };
    },
  };
}
