// データの流れ図 (FLOW-001)。SVG を DOM で組み立てるだけで、座標と切り分けは
// flow-model.mjs が持つ。図の中の文字列はすべて i18n の `flow.*` から引く (AC-009)。
// SVG の中に <style> も style 属性も置かない。見た目は src/styles/flow.css の .s-* が持つ (AC-001)。
import { endpointOf } from "./bedrock-view-model.mjs";
import { countryLabel, geoAreaLabel } from "./geo-labels.js";
import { t, getLang } from "./i18n.js";
import { regionName } from "./region-names.js";
import { CLAIM_IDS, describeFlow, innerWallPath, openWallPath, wallPath } from "./flow-model.mjs";

export { CLAIM_IDS, describeFlow };

const NS = "http://www.w3.org/2000/svg";

// marker の id は文書内で一意でなければならない。図は何枚でも同時に開ける。
let figureSeq = 0;

function node(tag, attrs = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null) continue;
    element.setAttribute(name, String(value));
  }
  if (text != null) element.textContent = String(text);
  return element;
}

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

// 文字幅の見積り (チップの幅と同じ係数)。ラベルの右に続けて描くときの送り幅。
function advance(text) {
  let units = 0;
  for (const ch of String(text ?? "")) units += ch.charCodeAt(0) < 0x80 ? 6.6 : 10.5;
  return Math.round(units);
}

function markerDefs(uid) {
  const defs = node("defs");
  const heads = [
    [`hd-${uid}`, "s-head", 8, 7],
    [`hda-${uid}`, "s-head-accent", 8, 7],
    [`hdd-${uid}`, "s-head-dim", 7, 6],
  ];
  for (const [id, className, width, height] of heads) {
    const marker = node("marker", {
      id,
      viewBox: "0 0 10 8",
      refX: 9,
      refY: 4,
      markerWidth: width,
      markerHeight: height,
      orient: "auto-start-reverse",
    });
    marker.appendChild(node("path", { d: "M0,0 L10,4 L0,8 Z", class: className }));
    defs.appendChild(marker);
  }
  return defs;
}

function enclosure(root, box) {
  const fillClass = box.kind === "yes" ? "s-encl-yes-fill" : "s-encl-plain-fill";
  if (box.kind !== "open") {
    root.appendChild(
      node("rect", {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rx: box.inner ? 8 : 10,
        class: fillClass,
      }),
    );
  }
  const d =
    box.kind === "open"
      ? openWallPath(box)
      : box.inner
        ? innerWallPath(box)
        : wallPath(box);
  const wallClass =
    box.kind === "open" ? "s-wall-open" : box.kind === "yes" ? "s-wall-yes" : "s-wall";
  const wall = node("path", { d, class: wallClass });
  wall.dataset.enclosure = box.id;
  root.appendChild(wall);

  // 見出しのタブ。境界の上辺にまたがせる。
  const tabX = box.x + 14;
  const tabY = box.y - 10;
  const tabClass = box.kind === "open" ? "s-tab-warn" : box.kind === "yes" ? "s-tab-yes" : "s-tab";
  const textClass =
    box.kind === "open" ? "s-t-tab-warn" : box.kind === "yes" ? "s-t-tab-yes" : "s-t-tab";
  root.appendChild(
    node("rect", { x: tabX, y: tabY, width: box.tabWidth, height: 20, rx: 5, class: tabClass }),
  );
  root.appendChild(
    node(
      "text",
      { x: tabX + box.tabWidth / 2, y: tabY + 14, "text-anchor": "middle", class: textClass },
      box.title,
    ),
  );
}

function chip(root, item, { fill = "s-chip", text = "s-chip-t", fade = null } = {}) {
  const fadeClass = fade ? ` s-fade-${fade}` : "";
  root.appendChild(
    node("rect", {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rx: 5,
      class: fill + fadeClass,
    }),
  );
  const label = node(
    "text",
    {
      x: item.x + item.width / 2,
      y: item.y + 15,
      "text-anchor": "middle",
      class: text + fadeClass,
    },
    item.name,
  );
  if (item.code) label.dataset.region = item.code;
  root.appendChild(label);
}

function youNode(root, uid, label) {
  root.appendChild(node("rect", { x: 8, y: 74, width: 68, height: 76, rx: 7, class: "s-node" }));
  root.appendChild(node("circle", { cx: 42, cy: 98, r: 9, class: "s-glyph" }));
  root.appendChild(node("path", { d: "M24,122 a18,18 0 0 1 36,0 z", class: "s-glyph" }));
  const text = node(
    "text",
    { x: 42, y: 142, "text-anchor": "middle", class: "s-t-strong" },
    label,
  );
  text.dataset.node = "you";
  root.appendChild(text);

  // ゲートを 1 度だけ通る往復 (AC-002)。
  root.appendChild(
    node("path", { d: "M80,100 L156,100", class: "s-arrow-accent", "marker-end": `url(#hda-${uid})` }),
  );
  root.appendChild(
    node("text", { x: 107, y: 88, "text-anchor": "middle", class: "s-t-accent-sm" }, t("flow.request")),
  );
  root.appendChild(
    node("path", {
      d: "M162,112 C120,112 100,118 80,120",
      class: "s-arrow-back",
      "marker-end": `url(#hdd-${uid})`,
    }),
  );
  root.appendChild(
    node("text", { x: 107, y: 140, "text-anchor": "middle", class: "s-t-dim" }, t("flow.response")),
  );
}

function originNode(root, { name, code, endpoint }) {
  root.appendChild(
    node("rect", { x: 162, y: 70, width: 244, height: 64, rx: 7, class: "s-node-origin" }),
  );
  const label = node("text", { x: 176, y: 92, class: "s-t-strong" }, name);
  label.dataset.node = "origin";
  root.appendChild(label);
  root.appendChild(node("text", { x: 176 + advance(name) + 10, y: 92, class: "s-mono-strong" }, code));
  root.appendChild(node("text", { x: 176, y: 110, class: "s-mono" }, endpoint));
  root.appendChild(node("text", { x: 176, y: 128, class: "s-t-accent" }, t("flow.originTag")));
}

function recordNode(root, uid, { y, originName, arrowX, arrowTop, labelX, labelY, tagX }) {
  root.appendChild(
    node("path", { d: `M${arrowX},${arrowTop} L${arrowX},${y - 4}`, class: "s-arrow", "marker-end": `url(#hd-${uid})` }),
  );
  root.appendChild(node("text", { x: labelX, y: labelY, class: "s-t-muted" }, t("flow.record")));
  root.appendChild(node("rect", { x: 162, y, width: 244, height: 54, rx: 7, class: "s-node-log" }));
  const lines = [
    ["flow.recordTrail", "c1"],
    ["flow.recordWatch", "c2"],
    ["flow.recordBilling", "c3"],
  ];
  lines.forEach(([key, claim], index) => {
    const text = node("text", { x: 176, y: y + 17 + index * 15, class: "s-t-log" }, t(key));
    if (index === 0) text.dataset.node = "record";
    text.dataset.claim = claim;
    root.appendChild(text);
  });
  const tag = node(
    "text",
    { x: tagX, y: y + 30, class: "s-t-accent-sm" },
    t("flow.recordStaysIn", { place: originName }),
  );
  tag.dataset.claim = "c1";
  root.appendChild(tag);
}

/**
 * レーン 1 つぶんの図の記述。i18n で引いた文言を載せた上で flow-model に渡す。
 * 純粋な座標計算は flow-model.mjs 側。
 */
export function flowDescription(lane, ctx = {}) {
  const { region, regionNotes, prefix = null, available = true, destinations = [] } = ctx;
  const lang = getLang();
  const originName = regionName(region, lang, regionNotes);
  const area = prefix ? geoAreaLabel(prefix) : "";
  const country = countryLabel(regionNotes?.[region]?.country ?? "");
  return describeFlow(lane, {
    available,
    destinations,
    origin: region,
    regionNotes,
    lang,
    labels: {
      originName,
      you: t("flow.you"),
      record: t("flow.record"),
      processedHere: t("flow.processedHere"),
      regionTitle: t("flow.regionTitle", { place: originName }),
      areaTitle: t("flow.areaTitle", { area }),
      countryTitle: country,
      worldTitle: t("flow.worldTitle"),
      innerTitle: t("flow.globalInnerTitle", { place: originName }),
      andMore: t("flow.andMore"),
    },
  });
}

function ariaAndCaption(lane, description, { originName, area, country }) {
  if (lane === "inRegion") {
    return description.available
      ? {
          aria: t("flow.ariaInRegion", { place: originName }),
          caption: t("flow.captionInRegion", { place: originName }),
        }
      : {
          aria: t("flow.ariaInRegionOff", { place: originName }),
          caption: t("flow.captionInRegionOff", { place: originName }),
        };
  }
  if (lane === "global") {
    return {
      aria: t("flow.ariaGlobal", { place: originName }),
      caption: t("flow.captionGlobal", { place: originName }),
    };
  }
  if (!description.countryKnown) {
    return {
      aria: t("flow.ariaGeoUnknown", { place: originName, area }),
      caption: t("flow.captionGeoUnknown", { place: originName, area }),
    };
  }
  return {
    aria: t("flow.ariaGeo", { place: originName, area, country }),
    caption: t("flow.captionGeo", { place: originName, area, country }),
  };
}

/**
 * `figure.flow > div.flow-scroll > svg` + `figcaption` + `p.note-muted`（出典）(AC-001 / AC-007)。
 *
 * @param {"inRegion"|"geo"|"global"} lane
 */
export function buildFlowFigure(lane, ctx = {}) {
  const { region, regionNotes, prefix = null } = ctx;
  const uid = `f${(figureSeq += 1)}`;
  const lang = getLang();
  const originName = regionName(region, lang, regionNotes);
  const area = prefix ? geoAreaLabel(prefix) : "";
  const country = countryLabel(regionNotes?.[region]?.country ?? "");
  const description = flowDescription(lane, ctx);
  const { aria, caption } = ariaAndCaption(lane, description, { originName, area, country });

  const svg = node("svg", {
    viewBox: `0 0 ${description.width} ${description.height}`,
    role: "img",
    "aria-label": aria,
    xmlns: NS,
  });
  svg.dataset.lane = lane;
  svg.appendChild(markerDefs(uid));

  for (const box of description.enclosures) enclosure(svg, box);
  youNode(svg, uid, t("flow.you"));

  // 起点・推論先・記録。そのレーンで呼べないときは境界の内側をまとめて淡色にする
  // (AC-003。DETAIL-001 v8 AC-016 により Geo / Global でも同じ扱い)。
  const off = !description.available;
  const inner = off ? node("g", { class: "s-off" }) : svg;
  originNode(inner, { name: originName, code: region, endpoint: endpointOf(regionNotes, region) });

  if (lane === "inRegion") {
    inner.appendChild(
      node("path", { d: "M406,102 L422,102", class: "s-arrow", "marker-end": `url(#hd-${uid})` }),
    );
    inner.appendChild(node("rect", { x: 430, y: 70, width: 116, height: 64, rx: 7, class: "s-node" }));
    inner.appendChild(
      node("text", { x: 488, y: 92, "text-anchor": "middle", class: "s-t" }, t("flow.processedHere")),
    );
    chip(inner, description.processChip, { fill: "s-chip-yes", text: "s-chip-yes-t" });
    recordNode(inner, uid, {
      y: description.recordY,
      originName,
      arrowX: 284,
      arrowTop: 134,
      labelX: 292,
      labelY: 150,
      tagX: 420,
    });
    if (off) svg.appendChild(inner);
    // 壁の外の注記 (AC-003)。図そのものは消さない。
    if (!description.available) {
      svg.appendChild(
        node(
          "text",
          { x: 134, y: description.unavailableNoteY, class: "s-t-dim" },
          t("flow.notOfferedHere", { place: originName }),
        ),
      );
    }
  }

  if (lane === "geo") {
    // 国内の推論先 (内側の境界の中)。
    if (description.domestic.length > 0 && description.countryKnown) {
      svg.appendChild(
        node("path", { d: "M240,134 L240,144", class: "s-arrow", "marker-end": `url(#hd-${uid})` }),
      );
      svg.appendChild(
        node(
          "text",
          { x: 162, y: 165, class: "s-t-yes" },
          t("flow.domesticCount", { count: description.domesticCount }),
        ),
      );
      description.domestic.forEach((item) =>
        chip(svg, item, {
          fill: item.isOrigin ? "s-chip-accent" : "s-chip",
          text: item.isOrigin ? "s-chip-accent-t" : "s-chip-t",
        }),
      );
    }
    recordNode(inner, uid, {
      y: description.recordY,
      originName,
      arrowX: 390,
      arrowTop: 136,
      labelX: 352,
      labelY: description.recordY - 18,
      tagX: 412,
    });
    if (off) svg.appendChild(inner);
    // 2 つの境界のあいだ (国外)、または国が分からないときの中立のチップ (AC-004 / AC-010)。
    const outside = description.countryKnown ? description.foreign : description.rest;
    if (outside.length > 0) {
      svg.appendChild(
        node("path", {
          d: "M406,110 C436,110 448,110 476,110",
          class: "s-arrow",
          "marker-end": `url(#hd-${uid})`,
        }),
      );
      svg.appendChild(
        node("text", { x: 486, y: 58, class: "s-t-muted" }, t("flow.somewhereIn", { area })),
      );
      if (description.countryKnown) {
        svg.appendChild(
          node(
            "text",
            { x: 486, y: 78, class: "s-t-warn" },
            t("flow.foreignCount", { count: description.foreignCount }),
          ),
        );
      } else {
        svg.appendChild(
          node(
            "text",
            { x: 486, y: 78, class: "s-t-muted" },
            t("flow.destinationCount", { count: description.restCount }),
          ),
        );
      }
      outside.forEach((item) =>
        chip(svg, item, {
          fill: description.countryKnown ? "s-chip-warn" : "s-chip",
          text: description.countryKnown ? "s-chip-warn-t" : "s-chip-t",
        }),
      );
      svg.appendChild(
        node("text", { x: 486, y: description.cannotChooseY, class: "s-t-muted" }, t("flow.cannotChoose")),
      );
    }
    // AC-006: 国外に出るレーンにだけ出す警告。
    const warn = node("text", { x: 486, y: description.warnY, class: "s-t-warn" }, t("flow.abuseDetection"));
    warn.dataset.claim = "c6";
    svg.appendChild(warn);
  }

  if (lane === "global") {
    const faint = node("g", { class: "s-off" });
    faint.appendChild(
      node("path", { d: "M238,134 L238,144", class: "s-arrow", "marker-end": `url(#hd-${uid})` }),
    );
    const originChip = {
      code: region,
      name: originName,
      x: 214,
      y: 148,
      width: Math.max(48, advance(originName) + 22),
      height: 22,
    };
    chip(faint, originChip);
    inner.appendChild(faint);
    recordNode(inner, uid, {
      y: description.recordY,
      originName,
      arrowX: 390,
      arrowTop: 136,
      labelX: 352,
      labelY: description.recordY - 18,
      tagX: 412,
    });
    if (off) svg.appendChild(inner);
    svg.appendChild(
      node("path", {
        d: "M406,110 C436,110 448,110 472,110",
        class: "s-arrow",
        "marker-end": `url(#hd-${uid})`,
      }),
    );
    svg.appendChild(node("text", { x: 484, y: 70, class: "s-t-warn" }, t("flow.includesForeign")));
    for (const sample of description.samples) {
      chip(svg, sample, { fill: "s-chip-faint", text: "s-chip-faint-t", fade: sample.fade });
    }
    svg.appendChild(
      node("text", { x: 484, y: description.noRightWallY, class: "s-t-warn" }, t("flow.noRightWall")),
    );
    const warn = node("text", { x: 484, y: description.warnY, class: "s-t-warn" }, t("flow.abuseDetection"));
    warn.dataset.claim = "c6";
    svg.appendChild(warn);
  }

  // 「応答は同じ経路で戻る」は常に図の左下 (AC-002)。
  svg.appendChild(
    node("text", { x: 8, y: description.height - 12, class: "s-t-dim" }, t("flow.responseSamePath")),
  );

  const figure = el("figure", "flow");
  figure.dataset.lane = lane;
  if (prefix) figure.dataset.prefix = prefix;
  const scroll = el("div", "flow-scroll");
  scroll.appendChild(svg);
  figure.appendChild(scroll);
  figure.appendChild(el("figcaption", null, caption));
  // AC-007: 出典の行。C-5 が推定であることをここで明示する (D-014)。
  const sources = el("p", "note-muted flow-sources", t("flow.sources"));
  sources.dataset.claim = "c5";
  figure.appendChild(sources);
  return figure;
}
