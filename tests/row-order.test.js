// TABLE-001 AC-014 / AC-015 (D-011): 行の並び順 pinned / alpha と、固定を明かす脚注。
import { describe, it, expect, beforeEach } from "vitest";
import {
  orderRows,
  PINNED_PROVIDERS,
  DEFAULT_SORT,
  SORT_VALUES,
} from "../src/scripts/bedrock-view-model.mjs";
import { mountFixtureApp, bodyRows, modelIds, $ } from "./app-harness.js";
import { setLang } from "../src/scripts/i18n.js";

const row = (provider, name, modelId = `${provider}.${name}`) => ({ provider, name, modelId });
const providers = (rows) => rows.map((entry) => entry.provider);
const names = (rows) => rows.map((entry) => entry.name);

describe("TABLE-001 AC-014 orderRows (単体)", () => {
  const rows = [
    row("Cohere", "Embed v4"),
    row("Amazon", "Titan"),
    row("OpenAI", "GPT-5"),
    row("Amazon", "Nova Lite"),
    row("Anthropic", "Claude Sonnet 4.5"),
    row("Anthropic", "Claude Haiku 4.5"),
  ];

  it("既定は pinned で、Anthropic → OpenAI → 残りを昇順", () => {
    expect(DEFAULT_SORT).toBe("pinned");
    expect([...SORT_VALUES]).toEqual(["pinned", "alpha", "newest"]);
    expect(providers(orderRows(rows, { sort: "pinned" }))).toEqual([
      "Anthropic",
      "Anthropic",
      "OpenAI",
      "Amazon",
      "Amazon",
      "Cohere",
    ]);
  });

  it("alpha は全プロバイダを昇順にし、固定しない", () => {
    expect(providers(orderRows(rows, { sort: "alpha" }))).toEqual([
      "Amazon",
      "Amazon",
      "Anthropic",
      "Anthropic",
      "Cohere",
      "OpenAI",
    ]);
  });

  it("どちらの値でも同じプロバイダの中はモデル名の昇順", () => {
    for (const sort of SORT_VALUES) {
      const ordered = orderRows(rows, { sort });
      const anthropic = names(ordered.filter((entry) => entry.provider === "Anthropic"));
      expect(anthropic).toEqual(["Claude Haiku 4.5", "Claude Sonnet 4.5"]);
    }
  });

  it("固定するプロバイダがデータに無ければ単に飛ばす (空の見出しを作らない)", () => {
    const withoutOpenAI = rows.filter((entry) => entry.provider !== "OpenAI");
    expect(providers(orderRows(withoutOpenAI, { sort: "pinned" }))).toEqual([
      "Anthropic",
      "Anthropic",
      "Amazon",
      "Amazon",
      "Cohere",
    ]);
    const neither = rows.filter((entry) => !PINNED_PROVIDERS.includes(entry.provider));
    expect(providers(orderRows(neither, { sort: "pinned" }))).toEqual([
      "Amazon",
      "Amazon",
      "Cohere",
    ]);
  });

  it("並び替えるだけで行を落としたり増やしたりしない", () => {
    for (const sort of SORT_VALUES) {
      const ordered = orderRows(rows, { sort });
      expect(ordered).toHaveLength(rows.length);
      expect(new Set(ordered.map((entry) => entry.modelId)).size).toBe(rows.length);
    }
    // 入力の配列は書き換えない
    expect(rows[0].provider).toBe("Cohere");
  });

  it("その言語の照合順で比べる (ja / en)", () => {
    const localized = [row("Zeta", "b"), row("Alpha", "a"), row("Beta", "c")];
    for (const lang of ["ja", "en"]) {
      expect(providers(orderRows(localized, { sort: "alpha", lang }))).toEqual([
        "Alpha",
        "Beta",
        "Zeta",
      ]);
    }
    // 同じプロバイダ内のモデル名も照合順で並ぶ
    const sameProvider = [row("A", "あい"), row("A", "アア"), row("A", "b")];
    expect(names(orderRows(sameProvider, { sort: "alpha", lang: "ja" }))[0]).toBe("b");
  });

  it("引数を省くと pinned で ja の照合順", () => {
    expect(providers(orderRows(rows))).toEqual(providers(orderRows(rows, { sort: "pinned" })));
    expect(orderRows(undefined)).toEqual([]);
  });
});

// --- 画面 (jsdom) ---
const providerColumn = () => bodyRows().map((tr) => tr.children[0].textContent);
const providerHeader = () => document.querySelector('thead th[data-key="provider"]');

beforeEach(() => {
  Object.defineProperty(navigator, "language", { value: "ja-JP", configurable: true });
});

describe("TABLE-001 AC-014 画面の並べ替え", () => {
  it("既定は pinned で Anthropic が先頭、aria-sort が pinned を示す", () => {
    const app = mountFixtureApp();
    expect(app.view.getSort()).toBe("pinned");
    expect(providerColumn()[0]).toBe("Anthropic");
    expect(providerHeader().getAttribute("aria-sort")).toBe("other");
  });

  it("プロバイダ列のヘッダのクリックで pinned ⇄ alpha が切り替わり aria-sort も変わる", () => {
    const app = mountFixtureApp();
    providerHeader().click();
    expect(app.view.getSort()).toBe("alpha");
    expect(providerColumn()[0]).toBe("Amazon");
    expect(providerHeader().getAttribute("aria-sort")).toBe("ascending");

    providerHeader().click();
    expect(app.view.getSort()).toBe("pinned");
    expect(providerColumn()[0]).toBe("Anthropic");
    expect(providerHeader().getAttribute("aria-sort")).toBe("other");
  });

  it("他の列で並べ替えた後でもプロバイダ列のクリックで行の並びが切り替わる", () => {
    // 期待する alpha の並び (同じ fixture を setSort で alpha にしたときの順)。
    const reference = mountFixtureApp();
    reference.view.setSort("alpha");
    const alphaOrder = modelIds();

    const app = mountFixtureApp();
    const nameHeader = () => document.querySelector('thead th[data-key="name"]');
    // まずモデル名の列で並べ替える。
    nameHeader().click();
    expect(nameHeader().getAttribute("aria-sort")).toBe("descending");
    const byName = modelIds();
    expect(byName).not.toEqual(alphaOrder);

    // プロバイダ列のクリックは列の並べ替えを解除し、行も alpha の順になる。
    providerHeader().click();
    expect(app.view.getSort()).toBe("alpha");
    expect(modelIds()).toEqual(alphaOrder);
    expect(providerColumn()[0]).toBe("Amazon");
    // 前に並べ替えていた列の表示は消える。
    expect(nameHeader().getAttribute("aria-sort")).toBe("none");
    expect(nameHeader().classList.contains("sorted")).toBe(false);
  });

  it("setSort で切り替わり、並び順の変更がイベントで外に出る", () => {
    const app = mountFixtureApp();
    const seen = [];
    document.addEventListener("row-sort-changed", (event) => seen.push(event.detail.sort));
    app.view.setSort("alpha");
    app.view.setSort("alpha"); // 同じ値では何も起きない
    app.view.setSort("nonsense"); // 未知の値は無視する
    expect(seen).toEqual(["alpha"]);
    expect(app.view.getSort()).toBe("alpha");
  });
});

describe("TABLE-001 AC-015 固定したプロバイダを脚注で明かす", () => {
  it("pinned のとき 2 社の名前を含む 1 文が出る", () => {
    mountFixtureApp();
    const line = $(".footnote-pinned");
    expect(line).toBeTruthy();
    for (const provider of PINNED_PROVIDERS) expect(line.textContent).toContain(provider);
    expect(line.textContent).toContain("固定");
  });

  it("alpha では出さない", () => {
    const app = mountFixtureApp();
    app.view.setSort("alpha");
    expect($(".footnote-pinned")).toBeNull();
  });

  it("英語でも 2 社の名前が出る", () => {
    mountFixtureApp({ lang: "en-US" });
    setLang("en");
    const line = $(".footnote-pinned");
    expect(line.textContent).toContain("Anthropic");
    expect(line.textContent).toContain("OpenAI");
  });

  it("並び順を変えても行数・判定・価格・絞り込み結果は変わらない", () => {
    const app = mountFixtureApp();
    const before = modelIds().slice().sort();
    const beforeCells = bodyRows().map((tr) =>
      [...tr.children].slice(3).map((td) => td.textContent).join("|"),
    );
    const beforeCount = $("#filter-count").textContent;

    app.view.setSort("alpha");
    const after = modelIds().slice().sort();
    const afterCells = bodyRows().map((tr) =>
      [...tr.children].slice(3).map((td) => td.textContent).join("|"),
    );

    expect(after).toEqual(before);
    expect(afterCells.slice().sort()).toEqual(beforeCells.slice().sort());
    expect($("#filter-count").textContent).toBe(beforeCount);
  });
});

describe('newest: Bedrock launch time', () => {
  it('sorts across providers, places missing/invalid dates last and preserves the input', () => {
    const rows = [
      {...row('Anthropic','Old'), releasedAt:'2024-01-01T00:00:00Z'},
      {...row('Amazon','New'), releasedAt:'2026-09-01T00:00:00Z'},
      {...row('OpenAI','Unknown'), releasedAt:null},
      {...row('Amazon','Invalid'), releasedAt:'invalid'},
    ];
    expect(names(orderRows(rows,{sort:'newest'}))).toEqual(['New','Old','Invalid','Unknown']);
    expect(names(rows)).toEqual(['Old','New','Unknown','Invalid']);
  });
  it('uses actual timestamps, with deterministic name ordering for ties', () => {
    const rows = [
      {...row('Amazon','B'), releasedAt:'2026-09-01T10:00:00+09:00'},
      {...row('Amazon','A'), releasedAt:'2026-09-01T01:00:00Z'},
      {...row('Amazon','C'), releasedAt:'2026-09-01T02:00:00Z'},
    ];
    expect(names(orderRows(rows,{sort:'newest'}))).toEqual(['C','A','B']);
  });
});

it('restores newest from the URL, and selecting it clears a column sort', () => {
  let app=mountFixtureApp({search:'?sort=newest'});
  expect(app.view.getSort()).toBe('newest');
  expect($('#row-sort').value).toBe('newest');
  expect($('#row-sort-hint').hidden).toBe(false);
  app=mountFixtureApp();
  document.querySelector('thead th[data-key="name"]').click();
  const select=$('#row-sort');
  select.value='newest';
  select.dispatchEvent(new Event('change',{bubbles:true}));
  expect(app.view.getSort()).toBe('newest');
  expect(document.querySelector('thead th[data-key="name"]').getAttribute('aria-sort')).toBe('none');
  expect(providerHeader().getAttribute('aria-sort')).toBe('none');
});
