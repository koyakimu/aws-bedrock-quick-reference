// テーマの優先順位は先例 (aws-gpu-quick-reference) と同じ:
//   1. 切替ボタンで明示的に選ばれた値 (localStorage)
//   2. 無ければ OS の prefers-color-scheme
// 初回訪問では保存しない。保存すると以後 OS 設定に追従しなくなるため。
import { t, LANG_CHANGED_EVENT } from "./i18n.js";

const STORAGE_KEY = "bedrock-ref-theme-pref";

function isTheme(value) {
  return value === "light" || value === "dark";
}

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function getSystemTheme() {
  if (typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function getTheme() {
  return getStoredTheme() || getSystemTheme();
}

// 適用するだけ。保存しない。
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// 明示的な選択。適用して保存する。
export function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 保存できなくても表示は続ける */
  }
}

export function initTheme() {
  applyTheme(getTheme());
}

export function setupThemeToggle(btn = document.getElementById("theme-toggle")) {
  if (!btn) return;

  // ラベルは「押すと切り替わる先」の名前。
  function relabel() {
    const current = document.documentElement.getAttribute("data-theme");
    const label = current === "dark" ? t("theme.light") : t("theme.dark");
    btn.textContent = label;
    btn.title = label;
  }

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
    relabel();
  });

  document.addEventListener(LANG_CHANGED_EVENT, relabel);
  relabel();
}
