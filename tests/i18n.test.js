// I18N-001 AC-001 / 002 / 003 / 004 / 005 / 006 / 008 / 009。
// AC-007 (キー一致) は tests/i18n-keys.test.js。
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SUPPORTED_LANGS,
  LANGUAGES,
  STORAGE_KEY,
  LANG_CHANGED_EVENT,
  resolveInitialLang,
  isSupportedLang,
  t,
  getLang,
  setLang,
  initI18n,
  setupLangToggle,
  applyTranslations,
} from "../src/scripts/i18n.js";
import { regionName, regionOptionLabel } from "../src/scripts/region-names.js";
import { ja } from "../src/i18n/ja.js";
import { en } from "../src/i18n/en.js";
import regionNotes from "../data/region-notes.json";

function setNavigatorLanguage(value) {
  Object.defineProperty(navigator, "language", { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("lang");
  setNavigatorLanguage("ja-JP");
});

// --- 設定値 (D-006) ---
describe("対応言語は設定の配列で決まる", () => {
  it("SUPPORTED_LANGS は ja / en", () => {
    expect(SUPPORTED_LANGS).toEqual(["ja", "en"]);
  });

  it("辞書と表示ラベルは同じ配列から来る", () => {
    expect(LANGUAGES.map((entry) => entry.code)).toEqual([...SUPPORTED_LANGS]);
    expect(LANGUAGES.map((entry) => entry.label)).toEqual(["日本語", "English"]);
    expect(LANGUAGES.map((entry) => entry.dict)).toEqual([ja, en]);
  });
});

// --- AC-002 / AC-008 既定言語の自動判定とフォールバック ---
describe("AC-002 resolveInitialLang", () => {
  it.each([
    ["ja", "ja"],
    ["ja-JP", "ja"],
    ["en-US", "en"],
    ["fr", "en"],
    ["", "en"],
    [undefined, "en"],
  ])("navigator.language %s → %s (保存値なし)", (navigatorLanguage, expected) => {
    expect(resolveInitialLang(navigatorLanguage, null)).toBe(expected);
  });
});

describe("AC-008 保存値が不正なとき", () => {
  it.each(["ko", "", null, undefined, "{}", "ja-JP", 42, {}])(
    "保存値 %o でも例外を投げず自動判定に落ちる",
    (stored) => {
      expect(() => resolveInitialLang("en-US", stored)).not.toThrow();
      expect(resolveInitialLang("en-US", stored)).toBe("en");
      expect(resolveInitialLang("ja-JP", stored)).toBe("ja");
    },
  );

  it("初期化で保存値を有効な値に上書きする", () => {
    localStorage.setItem(STORAGE_KEY, "ko");
    setNavigatorLanguage("ja-JP");
    expect(initI18n()).toBe("ja");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("ja");
  });

  it("localStorage が使えなくても初期化は落ちない", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => initI18n()).not.toThrow();
    spy.mockRestore();
  });

  it("isSupportedLang は ja / en だけを通す", () => {
    expect(isSupportedLang("ja")).toBe(true);
    expect(isSupportedLang("ko")).toBe(false);
    expect(isSupportedLang(null)).toBe(false);
  });
});

// --- AC-006 永続化 ---
describe("AC-006 設定の永続化", () => {
  it("キーは 1 つで、手動切替が navigator.language より優先される", () => {
    setNavigatorLanguage("ja-JP");
    initI18n();
    setLang("en");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("en");
    expect(Object.keys(localStorage).filter((key) => key.includes("lang"))).toEqual([STORAGE_KEY]);

    // 再訪をまねる
    expect(initI18n()).toBe("en");
    expect(getLang()).toBe("en");
  });
});

// --- AC-009 辞書にキーが無いとき ---
describe("AC-009 未定義キー", () => {
  it("t() はキー名をそのまま返す", () => {
    initI18n();
    expect(t("nope.not.here")).toBe("nope.not.here");
    expect(t("table")).toBe("table"); // 葉ではないキーも同じ
    expect(t("")).toBe("");
  });

  it("undefined も空欄も返さない", () => {
    initI18n();
    expect(t("missing.key")).not.toBe("");
    expect(t("missing.key")).toBeTypeOf("string");
  });

  it("置換子を params で埋める", () => {
    initI18n();
    expect(t("footnote.generatedAt", { date: "2026-09-14" })).toContain("2026-09-14");
    expect(t("table.rowCount", { shown: 3, total: 9 })).toBe("3 / 9 行");
  });
});

// --- AC-005 リージョン表示名の出どころ ---
describe("AC-005 リージョン表示名", () => {
  it("data/region-notes.json の ja / en を使う", () => {
    expect(regionName("ap-northeast-1", "ja", regionNotes)).toBe("東京");
    expect(regionName("ap-northeast-1", "en", regionNotes)).toBe("Asia Pacific (Tokyo)");
    expect(regionName("ap-northeast-1", "ja")).toBe("東京");
  });

  it("未知のリージョンはコードをそのまま返す", () => {
    expect(regionName("xx-nowhere-1", "ja", regionNotes)).toBe("xx-nowhere-1");
  });

  it("選択肢のラベルはコードと表示名の併記", () => {
    expect(regionOptionLabel("ap-northeast-1", "ja", regionNotes)).toBe("ap-northeast-1 — 東京");
  });

  it("i18n 辞書はリージョン名を持たない (二重に持たない)", () => {
    const codes = Object.keys(regionNotes).filter((key) => key !== "_source");
    const flat = JSON.stringify({ ja, en });
    for (const code of codes) {
      expect(flat, `${code} が辞書に入っている`).not.toContain(code);
      expect(flat, `${regionNotes[code].ja} が辞書に入っている`).not.toContain(regionNotes[code].ja);
    }
  });
});

// --- AC-001 / AC-003 言語切替 UI ---
describe("AC-001 言語切替 UI", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="lang-toggle"></div>';
    initI18n();
    setupLangToggle();
  });

  it("対応言語の数だけボタンが生成される", () => {
    const buttons = [...document.querySelectorAll("#lang-toggle button")];
    expect(buttons).toHaveLength(SUPPORTED_LANGS.length);
    expect(buttons.map((b) => b.dataset.lang)).toEqual([...SUPPORTED_LANGS]);
    expect(buttons.map((b) => b.textContent)).toEqual(["日本語", "English"]);
  });

  it("現在の言語が aria-pressed で分かる", () => {
    const buttons = [...document.querySelectorAll("#lang-toggle button")];
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    buttons[1].click();
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("ボタンはネイティブの button なのでキーボードで操作できる", () => {
    for (const button of document.querySelectorAll("#lang-toggle button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.type).toBe("button");
      expect(button.hasAttribute("disabled")).toBe(false);
    }
  });
});

describe("AC-003 切り替えの即時反映", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="lang-toggle"></div><h1 data-i18n="app.title"></h1><p data-i18n="state.notOffered"></p>';
    initI18n();
    setupLangToggle();
  });

  it("data-i18n の文言がリロードなしで入れ替わる", () => {
    const reload = vi.fn();
    const original = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      configurable: true,
    });

    expect(document.querySelector("[data-i18n='state.notOffered']").textContent).toBe(
      "このリージョンでは提供なし",
    );
    setLang("en");
    expect(document.querySelector("[data-i18n='state.notOffered']").textContent).toBe(
      "Not offered in this Region",
    );
    expect(reload).not.toHaveBeenCalled();

    if (original) Object.defineProperty(window, "location", original);
  });

  it("<html lang> が更新される", () => {
    expect(document.documentElement.lang).toBe("ja");
    setLang("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("lang-changed が発火する", () => {
    const seen = [];
    document.addEventListener(LANG_CHANGED_EVENT, (event) => seen.push(event.detail.lang));
    setLang("en");
    expect(seen).toEqual(["en"]);
  });

  it("対応していない言語では何も起きない", () => {
    const seen = [];
    document.addEventListener(LANG_CHANGED_EVENT, () => seen.push(1));
    setLang("ko");
    expect(seen).toEqual([]);
    expect(getLang()).toBe("ja");
  });
});

describe("applyTranslations", () => {
  it("data-i18n-title と data-i18n-aria-label も張り替える", () => {
    document.body.innerHTML =
      '<span data-i18n-title="copy.modelId"></span><button data-i18n-aria-label="copy.profileId"></button>';
    initI18n();
    applyTranslations();
    expect(document.querySelector("[data-i18n-title]").title).toBe("モデル ID をコピー");
    expect(document.querySelector("button").getAttribute("aria-label")).toBe(
      "推論プロファイル ID をコピー",
    );
  });
});
