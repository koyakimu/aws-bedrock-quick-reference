// エントリーポイント。データを読み込み、i18n / テーマ / 表を組み立てる。
import models from "../../data/models.json";
import profiles from "../../data/profiles.json";
import fetchLog from "../../data/fetch-log.json";
import regionNotes from "../../data/region-notes.json";
import overrides from "../../data/overrides.json";

import { initI18n, setupLangToggle, LANG_CHANGED_EVENT } from "./i18n.js";
import { initTheme, setupThemeToggle } from "./theme.js";
import { mountTableView } from "./table-view.js";

import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/header.css";
import "../styles/table.css";

function boot() {
  initTheme();
  initI18n();
  setupLangToggle();
  setupThemeToggle();

  const host = document.getElementById("main");
  if (!host) return;

  const view = mountTableView({ host, models, profiles, fetchLog, regionNotes, overrides });

  // 言語が変わったらリロードせずに描き直す (I18N-001 AC-003)。
  document.addEventListener(LANG_CHANGED_EVENT, () => view.rerender());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
