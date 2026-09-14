// リージョンの表示名は data/region-notes.json の ja / en が正 (I18N-001 AC-005)。
// i18n 辞書側にリージョン名を二重に持たないこと。
import defaultNotes from "../../data/region-notes.json";

export function regionName(code, lang, notes = defaultNotes) {
  const note = notes?.[code];
  const name = note?.[lang];
  return typeof name === "string" && name.length > 0 ? name : code;
}

// セレクタの選択肢。リージョンコードは翻訳しないので、コードと表示名を併記する。
export function regionOptionLabel(code, lang, notes = defaultNotes) {
  return `${code} — ${regionName(code, lang, notes)}`;
}
