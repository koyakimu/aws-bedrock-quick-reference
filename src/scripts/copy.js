// ID のコピー (TABLE-001 AC-007)。コピーするのは ID の文字列だけで、
// 周りのラベルや記号は含めない。
import { t } from "./i18n.js";

/**
 * navigator.clipboard を使い、使えなければ textarea + execCommand に落ちる。
 * 成否を boolean で返す。
 */
export async function copyText(text) {
  const value = String(text);
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* 権限拒否や非セキュアコンテキスト。下のフォールバックを試す */
  }
  return copyViaTextarea(value);
}

function copyViaTextarea(value) {
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    area.remove();
    return ok === true;
  } catch {
    return false;
  }
}

/**
 * ID とその横のコピーボタンをまとめた要素。
 * ボタンはネイティブの button なので Tab で到達し Enter / Space で押せる。
 */
export function createCopyable(text, { labelKey = "copy.action", className = "" } = {}) {
  const wrap = document.createElement("span");
  wrap.className = `copyable ${className}`.trim();

  const code = document.createElement("code");
  code.className = "id mono";
  code.textContent = text;
  wrap.appendChild(code);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.dataset.copy = text;
  button.setAttribute("data-i18n-aria-label", labelKey);
  button.setAttribute("aria-label", t(labelKey));
  button.textContent = "⧉";
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const ok = await copyText(text);
    button.classList.toggle("copied", ok);
    button.textContent = ok ? "✓" : "⧉";
    button.title = ok ? t("copy.done") : "";
    setTimeout(() => {
      button.classList.remove("copied");
      button.textContent = "⧉";
      button.title = "";
    }, 1200);
  });
  wrap.appendChild(button);

  return wrap;
}
