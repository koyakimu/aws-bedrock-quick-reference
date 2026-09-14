// SHARE-001 の結合テスト (jsdom)。AC-001 / 002 / 004 / 005 / 007 / 009。
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  mountFixtureApp,
  bodyRows,
  modelIds,
  setSelect,
  setSearch,
  setCheckbox,
  checkCustomRegion,
  customBox,
  BASE_URL,
} from "./app-harness.js";
import { setLang } from "../src/scripts/i18n.js";

const CLAUDE = "anthropic.claude-sonnet-4-5-20250929-v1:0";
const query = (app) => new URL(app.location.href).search;

// --- AC-001 起点リージョンが URL に載る ---
describe("SHARE-001 AC-001 起点リージョンが URL に載る", () => {
  it("起点を変えると replaceState で ?region= が付き、pushState は呼ばれない", () => {
    const app = mountFixtureApp();
    expect(query(app)).toBe("");

    app.view.setRegion("eu-west-1");
    expect(query(app)).toBe("?region=eu-west-1");
    expect(app.history.replaceState).toHaveBeenCalled();
    expect(app.history.pushState).not.toHaveBeenCalled();
    // 先頭スラッシュの絶対 URL を組み立てず、サブパスを保つ
    expect(app.history.replaceState.mock.calls.at(-1)[2]).toBe(
      "/aws-bedrock-quick-reference/?region=eu-west-1",
    );
  });

  it("セレクタの change でも URL が更新される (リロードしない)", () => {
    const app = mountFixtureApp();
    const select = document.getElementById("source-region");
    select.value = "us-east-1";
    select.dispatchEvent(new Event("change"));
    expect(query(app)).toBe("?region=us-east-1");
  });
});

// --- AC-002 URL からの起点リージョン復元 ---
describe("SHARE-001 AC-002 URL からの起点リージョン復元", () => {
  it("既定値より URL が優先され、エンドポイント表示も URL 由来になる", () => {
    mountFixtureApp({ search: "?region=eu-west-1" });
    expect(document.getElementById("source-region").value).toBe("eu-west-1");
    expect(document.getElementById("endpoint-value").textContent).toBe(
      "bedrock-runtime.eu-west-1.amazonaws.com",
    );
  });
});

// --- AC-003 / AC-004 絞り込みの往復 ---
describe("SHARE-001 AC-003 絞り込み条件が URL に載る", () => {
  it("5 条件を設定すると provider / modality / q / callable / limit が載る", () => {
    const app = mountFixtureApp();
    setSelect("filter-provider", ["Anthropic"]);
    setSelect("filter-modality", ["TEXT"]);
    setSearch("claude");
    setCheckbox("filter-callable", true);
    setSelect("filter-limit", ["country:jp"]);

    const params = new URLSearchParams(query(app));
    expect(params.get("provider")).toBe("Anthropic");
    expect(params.get("modality")).toBe("TEXT");
    expect(params.get("q")).toBe("claude");
    expect(params.get("callable")).toBe("1");
    expect(params.get("limit")).toBe("country:jp");
    // 既定値の region は載らない
    expect(params.get("region")).toBeNull();
  });

  it("条件を戻すとパラメータが URL から消える", () => {
    const app = mountFixtureApp();
    setSelect("filter-limit", ["country:jp"]);
    expect(query(app)).toContain("limit=");
    setSelect("filter-limit", ["none"]);
    expect(query(app)).toBe("");
  });
});

describe("SHARE-001 AC-004 URL からの絞り込み復元", () => {
  it("コントロール・表・条件チップが URL の内容で揃う", () => {
    mountFixtureApp({ search: "?region=ap-northeast-1&provider=Anthropic&limit=country:jp" });
    expect(document.getElementById("filter-provider").value).toBe("Anthropic");
    expect(document.getElementById("filter-limit").value).toBe("country:jp");
    expect(modelIds()).toEqual([CLAUDE]);
    expect(document.getElementById("filter-count").textContent).toBe("1 件 / 全 5 件");
    const chips = [...document.querySelectorAll("#filter-chips .filter-chip")];
    expect(chips.map((chip) => chip.dataset.value)).toEqual(["Anthropic", "country:jp"]);
  });
});

// --- AC-005 共有用 URL のコピー ---
describe("SHARE-001 AC-005 共有用 URL のコピー", () => {
  let writeText;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("現在のクエリを含む絶対 URL をコピーする", async () => {
    mountFixtureApp();
    setSelect("filter-limit", ["geo:apac"]);
    document.getElementById("share-copy").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0];
    expect(copied.startsWith(BASE_URL)).toBe(true);
    expect(copied).toContain("limit=geo%3Aapac");
  });
});

// --- AC-006 言語は URL に載せない ---
describe("SHARE-001 AC-006 言語は URL に載らない", () => {
  it("言語を切り替えても URL は変わらない", () => {
    const app = mountFixtureApp();
    setSelect("filter-limit", ["country:jp"]);
    const before = query(app);
    setLang("en");
    expect(query(app)).toBe(before);
    expect(before).not.toContain("lang");
  });
});

// --- AC-007 未知のリージョン ---
describe("SHARE-001 AC-007 未知のリージョン", () => {
  it("既定にフォールバックし、通知を出し、URL を既定状態に書き換える", () => {
    const app = mountFixtureApp({ search: "?region=xx-nowhere-9" });
    expect(document.getElementById("source-region").value).toBe("ap-northeast-1");
    expect(bodyRows()).toHaveLength(5);
    const notice = document.getElementById("share-notice");
    expect(notice.hidden).toBe(false);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain("xx-nowhere-9");
    expect(notice.textContent).toContain("東京");
    expect(query(app)).toBe("");
  });

  it("通知は閉じられる", () => {
    mountFixtureApp({ search: "?region=xx-nowhere-9" });
    document.getElementById("share-notice-close").click();
    expect(document.getElementById("share-notice").hidden).toBe(true);
  });
});

// --- AC-008 不正な絞り込みパラメータ ---
describe("SHARE-001 AC-008 不正な絞り込みパラメータ", () => {
  it("不正値だけを無視して残りを適用し、白画面にしない", () => {
    const app = mountFixtureApp({
      search: "?limit=country:atlantis&modality=SMELL&callable=maybe&provider=Anthropic",
    });
    expect(bodyRows()).toHaveLength(1);
    expect(modelIds()).toEqual([CLAUDE]);
    expect(document.getElementById("filter-limit").value).toBe("none");
    const notice = document.getElementById("share-notice");
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("limit=country:atlantis");
    expect(notice.textContent).toContain("modality=SMELL");
    expect(notice.textContent).toContain("callable=maybe");
    expect(query(app)).toBe("?provider=Anthropic");
  });

  it("クエリ値は DOM にテキストとして入り、スクリプトにならない", () => {
    mountFixtureApp({ search: "?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E" });
    expect(document.getElementById("filter-q").value).toBe("<img src=x onerror=alert(1)>");
    expect(document.querySelectorAll("#filter-chips img")).toHaveLength(0);
    expect(document.querySelector("#filter-chips .filter-chip-label").textContent).toContain(
      "<img src=x onerror=alert(1)>",
    );
  });
});

// --- AC-009 復元後に 0 件 ---
describe("SHARE-001 AC-009 復元後に結果が 0 件", () => {
  it("FILTER-001 AC-010 の空状態が出る (無言の空表にしない)", () => {
    mountFixtureApp({ search: "?limit=geo:eu" });
    expect(bodyRows()).toHaveLength(0);
    const empty = document.getElementById("filter-empty");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain("条件に一致するモデルがありません");
    expect(document.querySelectorAll("#filter-empty-conditions li")).toHaveLength(1);
    expect(document.getElementById("denied-banner").hidden).toBe(true);
  });
});

// --- AC-010 カスタム集合の URL 往復 (Issue #1) ---
describe("SHARE-001 AC-010 カスタム集合の URL 往復", () => {
  it("カスタムで選んだリージョンが limit に載る (コードは昇順・+ 連結)", () => {
    const app = mountFixtureApp();
    setSelect("filter-limit", ["custom"]);
    checkCustomRegion("ap-northeast-3");
    checkCustomRegion("ap-northeast-1");
    expect(new URLSearchParams(query(app)).get("limit")).toBe(
      "custom:ap-northeast-1+ap-northeast-3",
    );
    expect(query(app)).toContain("limit=custom%3Aap-northeast-1%2Bap-northeast-3");
  });

  it("URL から復元するとピッカーが開き、チェックと表が揃う", () => {
    mountFixtureApp({ search: "?limit=custom:ap-northeast-1%2Bap-northeast-3" });
    expect(document.getElementById("filter-limit").value).toBe("custom");
    expect(document.getElementById("filter-custom").hidden).toBe(false);
    expect(customBox("ap-northeast-1").checked).toBe(true);
    expect(customBox("ap-northeast-3").checked).toBe(true);
    expect(customBox("us-east-1").checked).toBe(false);
    expect(bodyRows()).toHaveLength(4);
    expect(document.querySelector("#filter-chips .filter-chip").textContent).toContain(
      "カスタム（2 リージョン）",
    );
  });

  it("手で書いた生の + (空白に復号される) でも復元できる", () => {
    mountFixtureApp({ search: "?limit=custom:ap-northeast-1+ap-northeast-3" });
    expect(customBox("ap-northeast-1").checked).toBe(true);
    expect(customBox("ap-northeast-3").checked).toBe(true);
  });

  it("未知のリージョンコードは落として通知し、URL を書き換える", () => {
    const app = mountFixtureApp({
      search: "?limit=custom:ap-northeast-1%2Bxx-nowhere-9",
    });
    expect(customBox("ap-northeast-1").checked).toBe(true);
    const notice = document.getElementById("share-notice");
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("limit=xx-nowhere-9");
    expect(new URLSearchParams(query(app)).get("limit")).toBe("custom:ap-northeast-1");
  });

  it("空のカスタム集合では絞り込まれず、限定なしと同じ表になる", () => {
    mountFixtureApp({ search: "?limit=custom" });
    expect(document.getElementById("filter-custom").hidden).toBe(false);
    expect(document.getElementById("filter-custom-hint").hidden).toBe(false);
    expect(bodyRows()).toHaveLength(5);
    expect(document.querySelectorAll("#filter-chips .filter-chip")).toHaveLength(0);
  });

  it("固定の選択肢に戻すと limit が置き換わる", () => {
    const app = mountFixtureApp();
    setSelect("filter-limit", ["custom"]);
    checkCustomRegion("ap-northeast-1");
    setSelect("filter-limit", ["country:jp"]);
    expect(new URLSearchParams(query(app)).get("limit")).toBe("country:jp");
    setSelect("filter-limit", ["none"]);
    expect(query(app)).toBe("");
  });
});
