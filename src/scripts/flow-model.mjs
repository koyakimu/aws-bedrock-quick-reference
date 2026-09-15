// データの流れ図の「形」を決める純関数群 (FLOW-001)。
// DOM も i18n も知らない。表示名・地理圏名・国名は呼び出し側が引いて ctx で渡す。
// 座標は viewBox="0 0 820 <height>" の中の値。幅は固定で、チップが増えたときだけ高さが伸びる
// (FLOW-001 UI Description)。

// --- 図全体の寸法 ---------------------------------------------------------
export const FLOW_WIDTH = 820;
const FLOW_BASE_HEIGHT = 280;
// Global の外壁は viewBox の右端を越えて切れる (AC-005)。
export const OPEN_WALL_RIGHT = 824;

// --- 固定の部品 -----------------------------------------------------------
// 「あなた」はすべての境界の外側に置く (AC-002)。境界の左端は 134 なので、
// x + width = 76 < 134 で必ず外に出る。
const YOU = Object.freeze({ x: 8, y: 74, width: 68, height: 76 });
const ORIGIN = Object.freeze({ x: 162, y: 70, width: 244, height: 64 });
const RECORD = Object.freeze({ x: 162, width: 244, height: 54 });
const PROCESS = Object.freeze({ x: 430, y: 70, width: 116, height: 64 });

// 左の壁のゲート (AC-002: ゲートは 1 つだけ)。往路も復路もここを通る。
const GATE_TOP = 96;
const GATE_BOTTOM = 116;
// 内側の境界の右の壁にある、推論先へ抜ける開口。
const EXIT_TOP = 100;
const EXIT_BOTTOM = 120;

const CHIP_HEIGHT = 22;
const CHIP_GAP = 6;
const ROW_GAP = 32;

// AC-008 の主張の識別子。図に出る主張はこの 8 つだけ (D-014)。
export const CLAIM_IDS = Object.freeze(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);

// Global の図に並べる地名は「例示」(AC-005)。実際の推論先は API から取れないので
// 列挙してはいけない (D-003)。ここは固定のサンプルで、判定には一切使わない。
const GLOBAL_SAMPLE_REGIONS = Object.freeze([
  "us-east-1",
  "eu-central-1",
  "ap-southeast-2",
  "ap-northeast-1",
]);

// --- チップの幅 -----------------------------------------------------------
// 文字幅の見積り。SVG にテキスト計測が無いので、ASCII と全角で係数を分ける。
function textUnits(text) {
  let units = 0;
  for (const ch of String(text ?? "")) units += ch.charCodeAt(0) < 0x80 ? 6.6 : 10.5;
  return units;
}

export function chipWidth(name) {
  return Math.max(48, Math.round(textUnits(name) + 22));
}

/** チップを左から並べ、maxX を越えたら折り返す。 */
export function layoutChips(items, { x: startX, y: startY, maxX }) {
  let x = startX;
  let y = startY;
  let rows = items.length > 0 ? 1 : 0;
  const chips = [];
  for (const item of items) {
    const width = chipWidth(item.name);
    if (x !== startX && x + width > maxX) {
      x = startX;
      y += ROW_GAP;
      rows += 1;
    }
    chips.push({ ...item, x, y, width, height: CHIP_HEIGHT });
    x += width + CHIP_GAP;
  }
  return { chips, rows, bottom: startY + Math.max(rows, 1) * ROW_GAP - (ROW_GAP - CHIP_HEIGHT) };
}

// --- 推論先の国内 / 国外 ---------------------------------------------------
function placeName(regionNotes, code, lang) {
  const name = regionNotes?.[code]?.[lang];
  return typeof name === "string" && name.length > 0 ? name : code;
}

/**
 * 推論先を起点の国の内 / 外に切り分ける (AC-004)。
 * 起点の `country` が分からないときは切り分けず、countryKnown: false で全件を rest に入れる
 * (TABLE-001 AC-004 と同じ方針。判断材料が無いのに国内 / 国外を決めない)。
 * 並びは 起点 → それ以外を表示名の昇順。
 */
export function splitDestinations(destinations, { origin, regionNotes, lang = "ja" } = {}) {
  const originCountry = regionNotes?.[origin]?.country ?? null;
  const places = [...new Set(destinations ?? [])]
    .map((code) => ({
      code,
      name: placeName(regionNotes, code, lang),
      country: regionNotes?.[code]?.country ?? null,
      isOrigin: code === origin,
    }))
    .sort(
      (a, b) =>
        Number(b.isOrigin) - Number(a.isOrigin) ||
        a.name.localeCompare(b.name, lang) ||
        a.code.localeCompare(b.code),
    );

  if (originCountry == null) {
    return { countryKnown: false, domestic: [], foreign: [], rest: places, all: places };
  }
  return {
    countryKnown: true,
    domestic: places.filter((place) => place.country === originCountry),
    foreign: places.filter((place) => place.country !== originCountry),
    rest: [],
    all: places,
  };
}

// --- 壁の d 属性 -----------------------------------------------------------
/** 左の壁にゲートが 1 つだけ開いた角丸の枠 (AC-002)。 */
export function wallPath({ x, y, width, height, r = 10 }) {
  const x2 = x + width;
  const y2 = y + height;
  return [
    `M${x},${GATE_TOP}`,
    `L${x},${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `L${x2 - r},${y}`,
    `A${r},${r} 0 0 1 ${x2},${y + r}`,
    `L${x2},${y2 - r}`,
    `A${r},${r} 0 0 1 ${x2 - r},${y2}`,
    `L${x + r},${y2}`,
    `A${r},${r} 0 0 1 ${x},${y2 - r}`,
    `L${x},${GATE_BOTTOM}`,
  ].join(" ");
}

/** 内側の枠。左のゲートに加えて、右の壁に推論先へ抜ける開口がある。 */
export function innerWallPath({ x, y, width, height, r = 8 }) {
  const x2 = x + width;
  const y2 = y + height;
  return [
    `M${x},${GATE_TOP}`,
    `L${x},${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `L${x2 - r},${y}`,
    `A${r},${r} 0 0 1 ${x2},${y + r}`,
    `L${x2},${EXIT_TOP}`,
    `M${x2},${EXIT_BOTTOM}`,
    `L${x2},${y2 - r}`,
    `A${r},${r} 0 0 1 ${x2 - r},${y2}`,
    `L${x + r},${y2}`,
    `A${r},${r} 0 0 1 ${x},${y2 - r}`,
    `L${x},${GATE_BOTTOM}`,
  ].join(" ");
}

/**
 * 右の壁が無い枠 (AC-005)。上下の辺は viewBox の右端を越えたところで終わり、
 * 右辺のセグメントを 1 つも持たない。`L{right},{top} M{right},{bottom}` で
 * ペンが上がるので、線として繋がらない。
 */
export function openWallPath({ x, y, height, r = 10, right = OPEN_WALL_RIGHT }) {
  const y2 = y + height;
  return [
    `M${x},${GATE_TOP}`,
    `L${x},${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    `L${right},${y}`,
    `M${right},${y2}`,
    `L${x + r},${y2}`,
    `A${r},${r} 0 0 1 ${x},${y2 - r}`,
    `L${x},${GATE_BOTTOM}`,
  ].join(" ");
}

// --- 図の記述 --------------------------------------------------------------
function youNode(label) {
  return { id: "you", role: "you", label, ...YOU };
}

function originNode(label) {
  return { id: "origin", role: "origin", label, ...ORIGIN };
}

function recordNode(label, y) {
  return { id: "record", role: "record", label, ...RECORD, y };
}

/** 矩形 r の中に点 (px, py) が入るか。AC-002 の「あなたは境界の外」を機械で確かめる用。 */
export function contains(rect, px, py) {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/**
 * レーン 1 つぶんの図の記述 (座標・境界・ノード・チップ)。
 * ctx の文言はすべて呼び出し側が i18n で引いて渡す (AC-009)。
 *
 * @param {"inRegion"|"geo"|"global"} lane
 */
export function describeFlow(lane, ctx = {}) {
  const {
    available = true,
    destinations = [],
    origin = "",
    regionNotes = {},
    lang = "ja",
    labels = {},
  } = ctx;
  const originName = labels.originName ?? placeName(regionNotes, origin, lang);

  if (lane === "inRegion") return describeInRegion({ available, originName, labels });
  if (lane === "global") {
    return describeGlobal({ available, originName, labels, regionNotes, lang });
  }
  return describeGeo({ available, destinations, origin, regionNotes, lang, originName, labels });
}

function describeInRegion({ available, originName, labels }) {
  const enclosure = {
    id: "region",
    kind: "yes",
    x: 134,
    y: 44,
    width: 428,
    height: 196,
    title: labels.regionTitle ?? "",
    tabWidth: Math.max(80, Math.round(textUnits(labels.regionTitle ?? "") + 26)),
  };
  const chipName = originName;
  const width = chipWidth(chipName);
  return {
    lane: "inRegion",
    available,
    width: FLOW_WIDTH,
    height: FLOW_BASE_HEIGHT,
    enclosures: [enclosure],
    nodes: [
      youNode(labels.you ?? ""),
      originNode(originName),
      { id: "process", role: "process", label: labels.processedHere ?? "", ...PROCESS },
      recordNode(labels.record ?? "", 158),
    ],
    processChip: {
      code: null,
      name: chipName,
      x: Math.round(PROCESS.x + PROCESS.width / 2 - width / 2),
      y: 100,
      width,
      height: CHIP_HEIGHT,
    },
    domestic: [],
    foreign: [],
    rest: [],
    countryKnown: true,
    recordY: 158,
    // 境界の外の下部に出す注記 (AC-003)。
    unavailableNoteY: 268,
  };
}

function describeGeo({ available, destinations, origin, regionNotes, lang, originName, labels }) {
  const split = splitDestinations(destinations, { origin, regionNotes, lang });
  // 国が分からないときは内側の境界を描かず、全チップを中立に置く (AC-004)。
  const insideItems = split.countryKnown ? split.domestic : [];
  const outsideItems = split.countryKnown ? split.foreign : split.rest;

  const inside = layoutChips(insideItems, { x: 214, y: 148, maxX: 460 });
  const recordY = 178 + (Math.max(inside.rows, 1) - 1) * ROW_GAP;
  const innerBottom = recordY + RECORD.height + 8;

  const outside = layoutChips(outsideItems, { x: 486, y: 86, maxX: 806 });
  const cannotChooseY = Math.max(166, outside.bottom + 26);
  const warnY = cannotChooseY + 22;
  const outerBottom = Math.max(250, warnY + 12, innerBottom + 10);

  const enclosures = [
    {
      id: "area",
      kind: "plain",
      x: 134,
      y: 40,
      width: 678,
      height: outerBottom - 40,
      title: labels.areaTitle ?? "",
      tabWidth: Math.max(72, Math.round(textUnits(labels.areaTitle ?? "") + 26)),
    },
  ];
  if (split.countryKnown) {
    enclosures.push({
      id: "country",
      kind: "yes",
      x: 150,
      y: 62,
      width: 320,
      height: innerBottom - 62,
      title: labels.countryTitle ?? "",
      tabWidth: Math.max(46, Math.round(textUnits(labels.countryTitle ?? "") + 24)),
      inner: true,
    });
  }

  return {
    lane: "geo",
    available,
    width: FLOW_WIDTH,
    height: outerBottom + 30,
    enclosures,
    nodes: [youNode(labels.you ?? ""), originNode(originName), recordNode(labels.record ?? "", recordY)],
    processChip: null,
    countryKnown: split.countryKnown,
    domestic: inside.chips,
    foreign: outside.chips,
    rest: split.countryKnown ? [] : outside.chips,
    domesticCount: insideItems.length,
    foreignCount: split.countryKnown ? split.foreign.length : 0,
    restCount: split.countryKnown ? 0 : split.rest.length,
    recordY,
    cannotChooseY,
    warnY,
    outerBottom,
  };
}

function describeGlobal({ available, originName, labels, regionNotes, lang }) {
  const innerBottom = 240;
  const recordY = 178;
  const samples = GLOBAL_SAMPLE_REGIONS.map((code) => ({
    code,
    name: placeName(regionNotes, code, lang),
  }));
  samples.push({ code: null, name: labels.andMore ?? "" });
  const laid = layoutChips(samples, { x: 484, y: 82, maxX: 810 });
  const fading = laid.chips.map((chip, index) => ({ ...chip, fade: Math.min(index + 1, 4) }));
  const noRightWallY = Math.max(170, laid.bottom + 30);
  const warnY = noRightWallY + 22;
  const outerBottom = Math.max(250, warnY + 12);

  return {
    lane: "global",
    available,
    width: FLOW_WIDTH,
    height: outerBottom + 30,
    enclosures: [
      {
        id: "world",
        kind: "open",
        x: 134,
        y: 40,
        width: OPEN_WALL_RIGHT - 134,
        height: outerBottom - 40,
        title: labels.worldTitle ?? "",
        tabWidth: Math.max(140, Math.round(textUnits(labels.worldTitle ?? "") + 26)),
      },
      {
        id: "origin-country",
        kind: "yes",
        x: 150,
        y: 62,
        width: 320,
        height: innerBottom - 62,
        title: labels.innerTitle ?? "",
        tabWidth: Math.max(110, Math.round(textUnits(labels.innerTitle ?? "") + 24)),
        inner: true,
      },
    ],
    nodes: [youNode(labels.you ?? ""), originNode(originName), recordNode(labels.record ?? "", recordY)],
    processChip: null,
    countryKnown: true,
    domestic: [],
    foreign: [],
    rest: [],
    samples: fading,
    recordY,
    noRightWallY,
    warnY,
    outerBottom,
  };
}
