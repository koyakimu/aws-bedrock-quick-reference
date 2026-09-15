// REGIONS-001 AC-NFR-002: 68 モデル × 33 リージョン (= 2244 セル) の初回描画が 400ms 未満。
// 規模を仕様どおりに固定したいので、実データではなく生成した fixture を使う。
import { describe, it, expect } from "vitest";
import regionNotes from "../data/region-notes.json";
import { initI18n } from "../src/scripts/i18n.js";
import { mountRegionsView } from "../src/scripts/regions-view.js";
import { selectableRegions } from "../src/scripts/bedrock-view-model.mjs";

const MODEL_COUNT = 68;
const PROVIDERS = ["Anthropic", "OpenAI", "Amazon", "Cohere", "Meta", "Mistral AI"];
const TYPES = [["ON_DEMAND"], ["INFERENCE_PROFILE"], ["PROVISIONED"], []];

const regions = selectableRegions(regionNotes);

/** 68 モデル。availability は 3 リージョンに 1 つ埋め、残りは「提供なし」。 */
function buildModels() {
  const models = {};
  for (let index = 0; index < MODEL_COUNT; index++) {
    const availability = {};
    regions.forEach((code, position) => {
      if ((position + index) % 3 === 0) availability[code] = TYPES[(position + index) % TYPES.length];
    });
    models[`vendor.model-v${index}:0`] = {
      provider: PROVIDERS[index % PROVIDERS.length],
      name: `Model ${String(index).padStart(2, "0")}`,
      input: ["TEXT"],
      output: ["TEXT"],
      streaming: true,
      lifecycle: "ACTIVE",
      availability,
    };
  }
  return models;
}

/** 全リージョン ok の取得記録 (空欄で描画が軽くならないようにする)。 */
const fetchLog = {
  generatedAt: "2026-09-15T00:00:00Z",
  accountKind: "test",
  regions: Object.fromEntries(regions.map((code) => [code, { status: "ok", models: MODEL_COUNT }])),
};

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe("AC-NFR-002 行列の描画性能", () => {
  it("68 モデル × 33 リージョンの初回描画の中央値が 400ms 未満", () => {
    expect(regions).toHaveLength(33);
    const models = buildModels();

    const samples = [];
    let cells = 0;
    for (let i = 0; i < 5; i++) {
      document.body.innerHTML = '<main id="main"></main>';
      localStorage.clear();
      initI18n();
      const host = document.getElementById("main");
      const start = performance.now();
      const regionsView = mountRegionsView({ host, models, fetchLog, regionNotes });
      // タブが選ばれて初めて描く (AC-NFR-002)。ここまでが「初回描画」。
      regionsView.activate();
      samples.push(performance.now() - start);
      cells = document.querySelectorAll("#regions-matrix tbody td.mx").length;
    }

    const value = median(samples);
    console.log(
      `REGIONS-001 AC-NFR-002: ${MODEL_COUNT} モデル × ${regions.length} リージョン ` +
        `(${cells} セル) の初回描画 中央値 ${value.toFixed(1)}ms ` +
        `(全 5 回: ${samples.map((s) => s.toFixed(1)).join(", ")}ms, jsdom)`,
    );

    expect(cells).toBe(MODEL_COUNT * regions.length);
    expect(value).toBeLessThan(400);
  });

  it("2 回目以降の切り替えでは描き直さない", () => {
    document.body.innerHTML = '<main id="main"></main>';
    localStorage.clear();
    initI18n();
    const view = mountRegionsView({
      host: document.getElementById("main"),
      models: buildModels(),
      fetchLog,
      regionNotes,
    });
    expect(view.isStarted()).toBe(false);
    view.activate();
    const table = document.querySelector("#regions-matrix tbody");
    const first = table.firstElementChild;
    view.activate();
    expect(document.querySelector("#regions-matrix tbody").firstElementChild).toBe(first);
  });
});
