// 日本語・英語の切り替え (I18N-001 / D-006)。
// 対応言語は下の LANGUAGES 1 箇所で決まる。切替 UI もキー一致テストもここから生成する。
// 言語を足すときは辞書を 1 本書いて LANGUAGES に 1 行足すだけでよい。
import { ja } from "../i18n/ja.js";
import { en } from "../i18n/en.js";

// 設定値。label は言語名そのもの (固有名詞) なので辞書には置かない。
export const LANGUAGES = Object.freeze([
  { code: "ja", label: "日本語", dict: ja },
  { code: "en", label: "English", dict: en },
]);

export const SUPPORTED_LANGS = Object.freeze(LANGUAGES.map((entry) => entry.code));

// キー一致テストが参照する辞書表。ここも LANGUAGES から生成する。
export const dictionaries = Object.freeze(
  Object.fromEntries(LANGUAGES.map((entry) => [entry.code, entry.dict])),
);

// 永続化のキーは 1 つだけ (AC-006)。
export const STORAGE_KEY = "bedrock-ref-lang";

// navigator.language が ja 以外のときの既定 (AC-002)。
const FALLBACK_LANG = SUPPORTED_LANGS.includes("en") ? "en" : SUPPORTED_LANGS[0];

export const LANG_CHANGED_EVENT = "lang-changed";

let currentLang = SUPPORTED_LANGS[0];

export function isSupportedLang(value) {
  return typeof value === "string" && SUPPORTED_LANGS.includes(value);
}

// localStorage は private モードや設定次第で例外を投げる。読み書きとも握り潰す (AC-008)。
function readStoredLang() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 保存できなくても表示は続ける */
  }
}

/**
 * 初期言語の決定 (AC-002 / AC-006 / AC-008)。純関数。
 * 保存値が対応言語なら最優先。`ko` / "" / null / 壊れた値はすべて自動判定にフォールバックする。
 */
export function resolveInitialLang(navigatorLanguage, stored) {
  if (isSupportedLang(stored)) return stored;
  const nav = typeof navigatorLanguage === "string" ? navigatorLanguage : "";
  if (nav.toLowerCase().startsWith("ja") && SUPPORTED_LANGS.includes("ja")) return "ja";
  return FALLBACK_LANG;
}

export function getLang() {
  return currentLang;
}

/**
 * 翻訳の取得。辞書に無いキーはキー名をそのまま返す (AC-009)。
 * params は "{name}" 形式の置換子に使う。
 */
export function t(key, params) {
  let value = dictionaries[currentLang];
  for (const part of String(key).split(".")) {
    if (value == null || typeof value !== "object") return key;
    value = value[part];
  }
  if (typeof value !== "string") return key;
  if (!params) return value;
  return Object.entries(params).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    value,
  );
}

// data-i18n / data-i18n-title / data-i18n-aria-label を張り替える。
export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
  });
}

// 言語の適用。リロードはしない (AC-003)。再描画は lang-changed を聞いた側が行う。
export function setLang(lang, { persist = true } = {}) {
  if (!isSupportedLang(lang)) return;
  currentLang = lang;
  if (persist) writeStoredLang(lang);
  document.documentElement.lang = lang;
  applyTranslations();
  document.dispatchEvent(new CustomEvent(LANG_CHANGED_EVENT, { detail: { lang } }));
}

export function initI18n() {
  const stored = readStoredLang();
  const resolved = resolveInitialLang(navigator.language, stored);
  currentLang = resolved;
  document.documentElement.lang = resolved;
  // 保存値が不正だったときは有効な値で上書きしておく (AC-008)。
  if (stored !== resolved) writeStoredLang(resolved);
  applyTranslations();
  return resolved;
}

/**
 * 言語切替 UI。対応言語の配列からボタンを生成し、現在の言語に aria-pressed を付ける。
 * ネイティブの button なので Tab で到達し Enter / Space で動く。
 */
export function setupLangToggle(container = document.getElementById("lang-toggle")) {
  if (!container) return;
  container.setAttribute("role", "group");
  container.setAttribute("data-i18n-aria-label", "lang.label");

  const buttons = LANGUAGES.map(({ code, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ctl lang-btn";
    button.dataset.lang = code;
    button.textContent = label;
    button.addEventListener("click", () => setLang(code));
    return button;
  });
  container.replaceChildren(...buttons);

  function mark() {
    for (const button of buttons) {
      const on = button.dataset.lang === currentLang;
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("on", on);
    }
  }

  document.addEventListener(LANG_CHANGED_EVENT, mark);
  mark();
  applyTranslations(container.parentElement ?? document);
}
