// TABLE-001 の結合テスト (jsdom)。AC-001 / 002 / 006 / 007 / 008 / 009 / 010。
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mountTableView, DOC_LINKS, DEFAULT_REGION } from "../src/scripts/table-view.js";
import { initI18n, setLang } from "../src/scripts/i18n.js";
import {
  buildSnapshot,
  buildOverrides,
  regionNotes,
  TOKYO,
  DENIED_REGION,
  EMPTY_REGION,
} from "./fixtures/bedrock-fixture.js";

const snapshot = buildSnapshot();

function mount(overrides = {}) {
  document.body.innerHTML = '<main id="main"></main>';
  localStorage.clear();
  initI18n();
  return mountTableView({
    host: document.getElementById("main"),
    models: snapshot.models,
    profiles: snapshot.profiles,
    fetchLog: snapshot.fetchLog,
    regionNotes,
    overrides,
    ...overrides.mountOverrides,
  });
}

const select = () => document.getElementById("source-region");
const headerTexts = () =>
  [...document.querySelectorAll("thead th")].map((th) => th.textContent.replace(/[▼▲]/g, "").trim());
const bodyRows = () => [...document.querySelectorAll("tbody tr")];
const rowFor = (modelId) => document.querySelector(`tbody tr[data-model-id="${CSS.escape(modelId)}"]`);
const cells = (tr) => [...tr.children];

beforeEach(() => {
  Object.defineProperty(navigator, "language", { value: "ja-JP", configurable: true });
});

// --- AC-001 起点リージョンセレクタの既定値 ---
describe("AC-001 起点リージョンセレクタ", () => {
  it("既定は ap-northeast-1 で、選択肢は region-notes.json のキー全件", () => {
    mount();
    expect(select().value).toBe(DEFAULT_REGION);
    expect(select().value).toBe("ap-northeast-1");
    const expected = Object.keys(regionNotes).filter((key) => key !== "_source").length;
    expect(select().options).toHaveLength(expected);
  });

  it("選択肢はリージョンコードと表示名を併記する", () => {
    mount();
    const option = [...select().options].find((o) => o.value === TOKYO);
    expect(option.textContent).toContain("ap-northeast-1");
    expect(option.textContent).toContain("東京");
  });

  it("denied のリージョンも選べるが「データなし」と印が付く", () => {
    mount();
    const option = [...select().options].find((o) => o.value === DENIED_REGION);
    expect(option.disabled).toBe(false);
    expect(option.dataset.status).toBe("denied");
    expect(option.textContent).toContain("データなし");
  });
});

// --- AC-002 エンドポイント表示 ---
describe("AC-002 エンドポイント", () => {
  it("選択中リージョンの bedrock-runtime FQDN を出す", () => {
    mount();
    expect(document.getElementById("endpoint-value").textContent).toBe(
      "bedrock-runtime.ap-northeast-1.amazonaws.com",
    );
  });

  it("起点を切り替えると同じ位置の値も切り替わる", () => {
    const view = mount();
    view.setRegion("eu-west-1");
    expect(document.getElementById("endpoint-value").textContent).toBe(
      "bedrock-runtime.eu-west-1.amazonaws.com",
    );
  });

  it("セレクタの change でも切り替わる", () => {
    mount();
    select().value = "eu-west-1";
    select().dispatchEvent(new Event("change"));
    expect(document.getElementById("endpoint-value").textContent).toBe(
      "bedrock-runtime.eu-west-1.amazonaws.com",
    );
  });

  it("エンドポイントにコピーボタンがある", () => {
    mount();
    expect(document.getElementById("endpoint-copy")).not.toBeNull();
  });
});

// --- AC-006 表の列構成 ---
describe("AC-006 列構成と 1 行の中身", () => {
  it("列が左から Provider / Model ID / モダリティ / In-Region / Geo / Global / lifecycle / 備考", () => {
    mount();
    expect(headerTexts()).toEqual([
      "Provider",
      "Model ID",
      "モダリティ",
      "In-Region",
      "Geo",
      "Global",
      "lifecycle",
      "備考",
    ]);
  });

  it("1 行 = 1 モデル", () => {
    mount();
    expect(bodyRows()).toHaveLength(5);
    expect(new Set(bodyRows().map((tr) => tr.dataset.modelId)).size).toBe(5);
  });

  it("In-Region が可のモデルはセルにモデル ID を出す (AC-003)", () => {
    mount();
    const row = rowFor("nvidia.nemotron-nano-12b-v2");
    const cell = cells(row)[3];
    expect(cell.textContent).toContain("可");
    expect(cell.querySelector(".copyable .id").textContent).toBe("nvidia.nemotron-nano-12b-v2");
  });

  it("In-Region が不可のモデルはモデル ID を出さない (AC-003)", () => {
    mount();
    const cell = cells(rowFor("anthropic.claude-sonnet-4-5-20250929-v1:0"))[3];
    expect(cell.textContent).toContain("不可");
    expect(cell.querySelector(".copyable")).toBeNull();
  });

  it("Geo 列にプロファイル ID と destination チップが昇順で並ぶ (AC-004)", () => {
    mount();
    const cell = cells(rowFor("amazon.nova-lite-v1:0"))[4];
    expect(cell.querySelector(".copyable .id").textContent).toBe("apac.amazon.nova-lite-v1:0");
    const chips = [...cell.querySelectorAll(".chip-dest")].map((chip) => chip.textContent);
    expect(chips).toEqual([
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-northeast-3",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
    ]);
    expect(chips).toEqual([...chips].sort());
  });

  it("Geo が無い行は「不可」", () => {
    mount();
    expect(cells(rowFor("nvidia.nemotron-nano-12b-v2"))[4].textContent).toContain("不可");
  });

  it("Global 列に ✓ とプロファイル ID と注記とリンクが出る (AC-005)", () => {
    mount();
    const cell = cells(rowFor("cohere.embed-v4:0"))[5];
    expect(cell.textContent).toContain("✓");
    expect(cell.querySelector(".copyable .id").textContent).toBe("global.cohere.embed-v4:0");
    expect(cell.textContent).toContain("全対応リージョン、増えうる");
    expect(cell.querySelector("a.global-note-link").href).toContain(
      "global-cross-region-inference",
    );
  });

  it("Global 列に \"*\" は決して現れない (AC-005)", () => {
    mount();
    for (const tr of bodyRows()) {
      expect(cells(tr)[5].textContent).not.toContain("*");
      expect(cells(tr)[4].textContent).not.toContain("*");
    }
  });

  it("モダリティは入力 → 出力で出る", () => {
    mount();
    const cell = cells(rowFor("amazon.nova-lite-v1:0"))[2];
    expect(cell.querySelector(".modality-in").textContent).toBe("TEXT, IMAGE, VIDEO");
    expect(cell.querySelector(".modality-out").textContent).toBe("TEXT");
  });

  it("lifecycle は生の値を title に残しつつ説明文で出す", () => {
    mount();
    const cell = cells(rowFor("amazon.nova-lite-v1:0"))[6];
    expect(cell.querySelector(".lifecycle").title).toBe("ACTIVE");
    expect(cell.textContent).toBe("提供中");
  });

  it("備考は overrides.json のエントリ、無ければ空", () => {
    mount(buildOverrides("cohere.embed-v4:0"));
    expect(cells(rowFor("cohere.embed-v4:0"))[7].textContent).toBe("モデルの備考");
    expect(cells(rowFor("amazon.nova-lite-v1:0"))[7].textContent).toBe("—");
  });
});

// --- AC-007 ID のコピー ---
describe("AC-007 ID のコピー", () => {
  let writeText;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("モデル ID のコピーボタンは ID の文字列だけをコピーする", async () => {
    mount();
    const button = cells(rowFor("cohere.embed-v4:0"))[1].querySelector("button.copy-btn");
    button.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("cohere.embed-v4:0");
  });

  it("プロファイル ID のコピーボタンはプロファイル ID だけをコピーする", async () => {
    mount();
    const button = cells(rowFor("amazon.nova-lite-v1:0"))[4].querySelector("button.copy-btn");
    button.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("apac.amazon.nova-lite-v1:0");
  });

  it("コピーできたことが視覚的に示される", async () => {
    mount();
    const button = cells(rowFor("cohere.embed-v4:0"))[1].querySelector("button.copy-btn");
    button.click();
    await vi.waitFor(() => expect(button.classList.contains("copied")).toBe(true));
    expect(button.textContent).toBe("✓");
  });

  it("clipboard API が無ければ execCommand に落ちる", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    mount();
    const button = cells(rowFor("cohere.embed-v4:0"))[1].querySelector("button.copy-btn");
    button.click();
    await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    delete document.execCommand;
  });
});

// --- AC-008 脚注 ---
describe("AC-008 脚注", () => {
  it("generatedAt / accountKind / denied 一覧 / 出典リンクが出る", () => {
    mount();
    const footnote = document.getElementById("footnote");
    expect(footnote.textContent).toContain("2026-09-14T08:10:00Z");
    expect(footnote.textContent).toContain("sandbox");
    expect(footnote.querySelector(".footnote-denied").textContent).toContain(DENIED_REGION);
    const links = [...footnote.querySelectorAll("a.doc-link")];
    expect(links).toHaveLength(DOC_LINKS.length);
    expect(links).toHaveLength(5);
    expect(links.map((a) => a.href)).toEqual(DOC_LINKS.map((link) => link.href));
  });
});

// --- AC-009 denied リージョン ---
describe("AC-009 denied リージョンを選んだとき", () => {
  it("バナーが出て reason の原文が表示され、表は 0 行になる", () => {
    const view = mount();
    view.setRegion(DENIED_REGION);
    const banner = document.getElementById("denied-banner");
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("データを取得できませんでした");
    const reason = document.getElementById("denied-reason").textContent;
    expect(reason).toContain("AccessDeniedException");
    expect(reason).toContain("explicit deny in a service control policy");
    expect(bodyRows()).toHaveLength(0);
  });

  it("「提供なし」の空状態は出さない (データなしと区別する)", () => {
    const view = mount();
    view.setRegion(DENIED_REGION);
    expect(document.getElementById("empty-state").hidden).toBe(true);
  });

  it("ok のリージョンに戻すとバナーは消える", () => {
    const view = mount();
    view.setRegion(DENIED_REGION);
    view.setRegion(TOKYO);
    expect(document.getElementById("denied-banner").hidden).toBe(true);
    expect(bodyRows()).toHaveLength(5);
  });
});

// --- AC-010 取得済みだがモデル 0 件 ---
describe("AC-010 取得済みでモデルが 0 件のとき", () => {
  it("「提供なし」を出し、データなしバナーは出さない", () => {
    const view = mount();
    view.setRegion(EMPTY_REGION);
    expect(bodyRows()).toHaveLength(0);
    const empty = document.getElementById("empty-state");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe("このリージョンでは提供なし");
    expect(document.getElementById("denied-banner").hidden).toBe(true);
  });
});

// --- 後続 spec 用のフック ---
describe("FILTER-001 / DETAIL-001 / SHARE-001 のためのフック", () => {
  it("絞り込みと詳細の入れ物が用意されている", () => {
    mount();
    expect(document.getElementById("filter-bar").dataset.hook).toBe("FILTER-001");
    expect(document.getElementById("detail-host").dataset.hook).toBe("DETAIL-001");
  });

  it("起点リージョンの変更がイベントで外に出る", () => {
    const view = mount();
    const seen = [];
    document.addEventListener("source-region-changed", (event) => seen.push(event.detail));
    view.setRegion(EMPTY_REGION);
    expect(seen).toHaveLength(1);
    expect(seen[0].region).toBe(EMPTY_REGION);
    expect(seen[0].rows).toEqual([]);
  });
});

// --- 言語切替と表 (I18N-001 AC-003 / AC-004 の表側) ---
describe("言語を切り替えても表のデータ値は変わらない", () => {
  it("列ヘッダは英語になり、モデル ID / リージョンコード / provider は不変", () => {
    const view = mount();
    const before = {
      modelId: cells(rowFor("cohere.embed-v4:0"))[1].textContent,
      provider: cells(rowFor("cohere.embed-v4:0"))[0].textContent,
      chips: [...cells(rowFor("amazon.nova-lite-v1:0"))[4].querySelectorAll(".chip-dest")].map(
        (c) => c.textContent,
      ),
    };

    setLang("en");
    view.rerender();

    expect(headerTexts()[2]).toBe("Modalities");
    expect(cells(rowFor("cohere.embed-v4:0"))[1].textContent).toBe(before.modelId);
    expect(cells(rowFor("cohere.embed-v4:0"))[0].textContent).toBe(before.provider);
    expect(
      [...cells(rowFor("amazon.nova-lite-v1:0"))[4].querySelectorAll(".chip-dest")].map(
        (c) => c.textContent,
      ),
    ).toEqual(before.chips);
  });

  it("denied の reason は翻訳しない", () => {
    const view = mount();
    view.setRegion(DENIED_REGION);
    const before = document.getElementById("denied-reason").textContent;
    setLang("en");
    view.rerender();
    expect(document.getElementById("denied-reason").textContent).toBe(before);
  });
});
