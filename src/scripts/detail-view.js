// 行の展開と詳細パネル (DETAIL-001)。データの組み立ては detail-model.mjs が持ち、
// このファイルは DOM とイベントだけを扱う。
import { buildDetail } from "./detail-model.mjs";
import { createCopyable } from "./copy.js";
import { t, getLang, LANG_CHANGED_EVENT } from "./i18n.js";
import { regionName } from "./region-names.js";

// availability の種別 → 表示ラベルのキー。「提供なし」と「未取得」は
// 別のクラス名・別の文言で描く (AC-003 / AC-008)。
const KIND_LABEL = Object.freeze({
  none: "detail.notOffered",
  empty: "detail.noTypes",
  nodata: "detail.noData",
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// aria-controls / id に使える形にする。モデル ID の "." や ":" をそのまま id にしない。
export function panelId(modelId) {
  return `detail-${String(modelId).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function regionLabel(code, notes) {
  return `${code} — ${regionName(code, getLang(), notes)}`;
}

// 推論先のチップ。一覧 (TABLE-001 v4 AC-004) が地名だけにしたぶん、
// 詳細パネルは地名とリージョンコードを併記する。例: 東京 (ap-northeast-1)
function destinationChip(code, notes) {
  const chip = el("span", "chip chip-dest", `${regionName(code, getLang(), notes)} (${code})`);
  chip.dataset.region = code;
  return chip;
}

// AC-010: 一覧から外したモデル ID はパネルの先頭に置く。
function modelIdSection(detail) {
  const section = el("section", "detail-model-id");
  section.appendChild(el("h4", null, t("detail.modelId")));
  section.appendChild(createCopyable(detail.modelId, { labelKey: "copy.modelId" }));
  return section;
}

// AC-011: 種別 / 指定する ID / 推論先リージョン の 3 列。
const USAGE_LABEL = Object.freeze({
  inRegion: "table.inRegion",
  geo: "table.geo",
  global: "table.global",
});

function usageSection(detail, regionNotes) {
  const section = el("section", "detail-usage");
  section.appendChild(el("h4", null, t("detail.usage")));

  if (!detail.hasUsage) {
    // 起点から呼べない組み合わせでも空欄にしない。
    section.appendChild(el("p", "detail-no-usage", t("detail.usageNone")));
    return section;
  }

  const table = el("table", "detail-usage-table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const key of ["detail.usageKind", "detail.usageId", "detail.usageDestinations"]) {
    const th = el("th", null, t(key));
    th.setAttribute("scope", "col");
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  for (const row of detail.usage) {
    const tr = el("tr", `detail-usage-row detail-usage-${row.kind}`);
    tr.dataset.kind = row.kind;
    tr.dataset.id = row.id;

    const kindCell = document.createElement("td");
    kindCell.className = "detail-usage-kind";
    kindCell.appendChild(el("span", `usage-badge usage-${row.kind}`, t(USAGE_LABEL[row.kind])));
    tr.appendChild(kindCell);

    const idCell = document.createElement("td");
    idCell.className = "detail-usage-id";
    idCell.appendChild(
      createCopyable(row.id, {
        labelKey: row.idKind === "modelId" ? "copy.modelId" : "copy.profileId",
      }),
    );
    tr.appendChild(idCell);

    const destCell = document.createElement("td");
    destCell.className = "detail-usage-dest";
    if (row.allRegions) {
      // "*" は出さず注記にする (AC-011 / AC-006)。
      destCell.appendChild(el("span", "detail-all-regions", t("detail.allRegions")));
    } else {
      const chips = el("span", "chips");
      for (const destination of row.destinations) {
        chips.appendChild(destinationChip(destination, regionNotes));
      }
      destCell.appendChild(chips);
    }
    tr.appendChild(destCell);
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  section.appendChild(table);
  return section;
}

// AC-012: 起点リージョンの接続先。
function endpointSection(detail) {
  const section = el("section", "detail-endpoint");
  section.appendChild(el("span", "detail-endpoint-label", t("detail.endpoint")));
  section.appendChild(el("code", "detail-endpoint-value mono", detail.endpoint));
  return section;
}

function availabilitySection(detail, regionNotes) {
  const section = el("section", "detail-availability");
  const heading = el("h4", null, t("detail.availability"));
  section.appendChild(heading);
  const list = el("ul", "detail-region-list");
  for (const row of detail.availability) {
    const item = el("li", `detail-region detail-region-${row.kind}`);
    item.dataset.region = row.region;
    item.dataset.kind = row.kind;
    // 現在の起点リージョンを視覚的に区別する (AC-007)。
    if (row.region === detail.region) {
      item.classList.add("is-current");
      item.appendChild(el("span", "current-marker", t("detail.currentSource")));
    }
    item.appendChild(el("span", "detail-region-name", regionLabel(row.region, regionNotes)));

    if (row.kind === "types") {
      const badges = el("span", "detail-types");
      // ON_DEMAND / INFERENCE_PROFILE / PROVISIONED はそのままの名前で並べる (AC-002)。
      for (const type of row.types) {
        badges.appendChild(el("span", `badge badge-${type.toLowerCase()} mono`, type));
      }
      item.appendChild(badges);
    } else {
      // 未取得は「未取得」とだけ出す。理由 (cause) はメンテナ向けの情報 (AC-008 / D-008)。
      item.appendChild(el("span", `detail-region-state state-${row.kind}`, t(KIND_LABEL[row.kind])));
    }
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function profileSection(detail, regionNotes) {
  const section = el("section", "detail-profiles");
  section.appendChild(el("h4", null, t("detail.profiles")));

  if (!detail.hasProfiles) {
    // プロファイル 0 件のモデルは空欄にしない (AC-009)。
    section.appendChild(el("p", "detail-no-profiles", t("detail.noProfiles")));
    return section;
  }

  for (const profile of detail.profiles) {
    const block = el("div", "detail-profile");
    block.dataset.profileId = profile.profileId;
    block.dataset.prefix = profile.prefix;
    const head = el("div", "detail-profile-head");
    head.append(
      el("span", `prefix-badge prefix-${profile.prefix}`, profile.prefix),
      createCopyable(profile.profileId, { labelKey: "copy.profileId" }),
    );
    block.appendChild(head);

    const list = el("ul", "detail-source-list");
    for (const source of profile.sources) {
      const item = el("li", "detail-source");
      item.dataset.source = source.source;
      if (source.source === detail.region) {
        item.classList.add("is-current");
        item.appendChild(el("span", "current-marker", t("detail.currentSource")));
      }
      item.appendChild(el("span", "detail-source-region mono", source.source));
      item.appendChild(el("span", "detail-arrow", t("detail.arrow")));
      if (source.allRegions) {
        // "*" は出さず注記にし、公式 docs へのリンクを添える (AC-006)。
        const note = el("span", "detail-all-regions", t("detail.allRegions"));
        const link = el("a", "global-note-link", t("value.globalDocs"));
        link.href =
          "https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html";
        link.target = "_blank";
        link.rel = "noreferrer";
        note.append(" ", link);
        item.appendChild(note);
      } else {
        const chips = el("span", "chips");
        for (const destination of source.destinations) {
          chips.appendChild(destinationChip(destination, regionNotes));
        }
        item.appendChild(chips);
      }
      list.appendChild(item);
    }
    block.appendChild(list);
    section.appendChild(block);
  }
  return section;
}

/**
 * 行の展開を表に取り付ける。
 * 展開状態はモデル ID で持つので、起点リージョンを切り替えても対象モデルが
 * 表に残っている限り開いたままになる (AC-001)。
 */
export function mountDetailView({
  view,
  models,
  profiles,
  fetchLog,
  regionNotes,
} = {}) {
  const open = new Set();

  function buildPanelRow(modelId, columnCount) {
    const detail = buildDetail(modelId, {
      models,
      profiles,
      fetchLog,
      regionNotes,
      region: view.getRegion(),
    });
    const tr = el("tr", "detail-row");
    tr.id = panelId(modelId);
    tr.dataset.modelId = modelId;
    const td = document.createElement("td");
    td.colSpan = columnCount;
    const panel = el("div", "detail-panel");
    // 上から 技術的な識別子 → 横断の事実 → 接続先 の順 (AC-010 〜 AC-012)。
    panel.append(
      modelIdSection(detail),
      usageSection(detail, regionNotes),
      availabilitySection(detail, regionNotes),
      profileSection(detail, regionNotes),
      endpointSection(detail),
    );
    td.appendChild(panel);
    tr.appendChild(td);
    return { tr, detail };
  }

  function toggleButton(modelId) {
    const button = el("button", "detail-toggle");
    button.type = "button";
    button.dataset.modelId = modelId;
    button.setAttribute("aria-expanded", String(open.has(modelId)));
    button.setAttribute("aria-controls", panelId(modelId));
    button.setAttribute("aria-label", t("detail.toggle"));
    button.title = t("detail.toggle");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggle(modelId);
    });
    return button;
  }

  function toggle(modelId) {
    if (open.has(modelId)) open.delete(modelId);
    else open.add(modelId);
    decorate();
  }

  // 表が描き直されるたびにトグルとパネルを付け直す。
  function decorate() {
    const tbody = view.table?.querySelector("tbody");
    if (!tbody) return;
    for (const stale of tbody.querySelectorAll("tr.detail-row")) stale.remove();

    for (const tr of [...tbody.querySelectorAll("tr[data-model-id]")]) {
      const modelId = tr.dataset.modelId;
      const first = tr.firstElementChild;
      if (first && !first.querySelector(".detail-toggle")) {
        first.prepend(toggleButton(modelId));
      }
      const button = tr.querySelector(".detail-toggle");
      const isOpen = open.has(modelId);
      if (button) button.setAttribute("aria-expanded", String(isOpen));
      tr.classList.toggle("expanded", isOpen);
      if (!isOpen) continue;
      const { tr: panel } = buildPanelRow(modelId, tr.children.length);
      tr.insertAdjacentElement("afterend", panel);
    }
  }

  // 行クリックでも開閉する (AC-001)。コピーボタンやリンクの操作は拾わない。
  view.table?.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select")) return;
    const tr = event.target.closest("tr[data-model-id]");
    if (!tr || tr.classList.contains("detail-row")) return;
    toggle(tr.dataset.modelId);
  });

  document.addEventListener(LANG_CHANGED_EVENT, () => decorate());
  view.onRender(() => decorate());

  return {
    isOpen: (modelId) => open.has(modelId),
    openRow(modelId) {
      open.add(modelId);
      decorate();
    },
    closeRow(modelId) {
      open.delete(modelId);
      decorate();
    },
    toggle,
  };
}
