// Bedrock 固有の画面 (TABLE-001)。列定義とセルの中身はここが持ち、
// 表の骨組みは汎用の table-engine.js に任せる。
import { createTable, EMPTY } from "./table-engine.js";
import {
  buildViewModel,
  causeLabelKey,
  geoPlaces,
  outsideCount,
  selectableRegions,
  regionStatus,
} from "./bedrock-view-model.mjs";
import { copyText } from "./copy.js";
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

// 起点リージョンが変わったことを外に知らせるイベント (SHARE-001 / FILTER-001 の入口)。
export const SOURCE_REGION_EVENT = "source-region-changed";

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
export function modalityWords(values) {
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

// 接頭辞 (jp / apac / us / eu / au) → 地理圏の平易な名前 (AC-004)。
export function geoAreaLabel(prefix) {
  const label = t(`geoArea.${prefix}`);
  return label === `geoArea.${prefix}` ? prefix : label;
}

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

// Global は destination を列挙しない。sources[R] の ["*"] は画面に出さない (AC-005)。
function globalCell(row) {
  if (!row.global) return markNo();
  const wrap = el("span", "cell-global");
  wrap.appendChild(markYes());
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
// Global / 備考。技術的な識別子 (モデル ID / プロファイル ID / lifecycle) は表に出さず
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
export function mountTableView({ host, models, profiles, fetchLog, regionNotes, overrides = {} }) {
  const regions = selectableRegions(regionNotes);
  let region = regions.includes(DEFAULT_REGION) ? DEFAULT_REGION : regions[0];
  let state = { sortKey: null, sortDir: null, hiddenGroups: [] };

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
  bar.append(label, select, endpointLine);

  // FILTER-001 が後で中身を入れる場所。今は空のまま置いておく。
  const filterHost = el("div", "filter-bar");
  filterHost.id = "filter-bar";
  filterHost.dataset.hook = "FILTER-001";
  filterHost.hidden = true;

  // --- データなしバナー (AC-009) ---
  const banner = el("section", "banner banner-nodata");
  banner.id = "denied-banner";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  const bannerTitle = el("p", "banner-title");
  bannerTitle.setAttribute("data-i18n", "state.noDataTitle");
  const bannerBody = el("p", "banner-body");
  bannerBody.setAttribute("data-i18n", "state.noDataBody");
  // 取得失敗の理由は分類から起こした平易な説明文だけを出す。エラー原文は載せない (DATA-001 D-008)。
  const bannerCause = el("p", "banner-cause");
  bannerCause.id = "denied-cause";
  banner.append(bannerTitle, bannerBody, bannerCause);

  // --- 表と空状態 ---
  const table = createTable({
    columns: buildColumns(regionNotes),
    rows: [],
    state,
    i18n: t,
    onStateChange(next) {
      state = next;
      table.update(shownRows, state);
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
        option.textContent = denied
          ? `${regionOptionLabel(code, lang, regionNotes)} (${t("source.noData")})`
          : regionOptionLabel(code, lang, regionNotes);
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
    model = buildViewModel({ models, profiles, fetchLog, regionNotes, overrides, region });

    endpointValue.textContent = model.endpoint;

    const denied = model.status === "denied";
    banner.hidden = !denied;
    // cause は分類なので翻訳する。エラー原文は公開データに無い (I18N-001 AC-004)。
    bannerCause.textContent = denied ? t(causeLabelKey(model.cause)) : "";

    // 取得できているのに 0 件なら「提供なし」。バナーは出さない (AC-010)。
    // 絞り込みで 0 件になった場合は別の空状態 (FILTER-001 AC-010) なのでここでは出さない。
    emptyState.hidden = denied || model.rows.length > 0;
    emptyState.textContent = t("state.notOffered");

    shownRows = typeof rowTransform === "function" ? rowTransform(model.rows, region) : model.rows;

    table.update(shownRows, state);
    renderFootnote();
    applyTranslations(banner);

    for (const listener of renderListeners) {
      listener({ region, rows: model.rows, shown: shownRows, status: model.status });
    }
  }

  select.addEventListener("change", () => {
    setRegion(select.value);
  });

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
