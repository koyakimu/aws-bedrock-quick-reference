// 取得の段取りとファイル書き出し。ここが唯一の I/O 層で、
// 判断ロジックは normalize.mjs、aws の起動は aws-cli.mjs に分けてある。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listFoundationModels, listInferenceProfiles } from "./aws-cli.mjs";
import { normalizeSnapshot } from "./normalize.mjs";

// 生成物は 2 スペースインデント・末尾改行で書く。キー順は normalize が揃えている。
export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// 全リージョンを順に取得し、生 JSON と stderr を rawDir に落とす (AC-008)。
// 1 リージョンの失敗で全体を止めない (AC-010)。
export function collectRegions({ runner, profile, regions, rawDir, log = () => {} }) {
  mkdirSync(rawDir, { recursive: true });
  const collected = {};

  for (const region of regions) {
    const entry = {};
    const fm = listFoundationModels(runner, { profile, region });
    if (fm.ok) {
      writeFileSync(join(rawDir, `fm-${region}.json`), fm.raw);
      entry.fm = fm.json;
    } else {
      writeFileSync(join(rawDir, `fm-${region}.err`), fm.stderr);
      entry.fmError = fm.stderr;
    }

    const ip = listInferenceProfiles(runner, { profile, region });
    // ページごとに生 stdout を残す。2 ページ目以降は ip-<region>.2.json の形。
    ip.raws.forEach((raw, index) => {
      const name = index === 0 ? `ip-${region}.json` : `ip-${region}.${index + 1}.json`;
      writeFileSync(join(rawDir, name), raw);
    });
    if (ip.ok) {
      entry.ip = ip.pages;
    } else {
      writeFileSync(join(rawDir, `ip-${region}.err`), ip.stderr);
      entry.ipError = ip.stderr;
    }

    // 両方失敗したときだけ denied。normalize 側は error を見る。
    if (entry.fmError && entry.ipError) entry.error = entry.fmError;

    const status = entry.error ? "denied" : entry.fmError || entry.ipError ? "partial" : "ok";
    log(`${region}: ${status}\n`);
    collected[region] = entry;
  }

  return collected;
}

// data/raw/<日付>/ に残っている生データだけを読み直して collectRegions と同じ形にする。
// aws は一切呼ばない。正規化の規則を変えたときに取り直さずに生成物を作り直すための経路。
//
// ファイル名の規則は collectRegions と対で、fm-<region>.json / fm-<region>.err /
// ip-<region>.json / ip-<region>.<n>.json / ip-<region>.err。
export function collectFromRaw({ rawDir, log = () => {} }) {
  if (!existsSync(rawDir)) throw new Error(`生データのディレクトリがありません: ${rawDir}`);
  const names = readdirSync(rawDir);
  const regions = new Set();
  for (const name of names) {
    const match = /^(?:fm|ip)-(.+?)(?:\.\d+)?\.(?:json|err)$/.exec(name);
    if (match) regions.add(match[1]);
  }

  const collected = {};
  for (const region of [...regions].sort()) {
    const read = (name) => readFileSync(join(rawDir, name), "utf8");
    const has = (name) => names.includes(name);
    const entry = {};

    if (has(`fm-${region}.json`)) {
      entry.fm = JSON.parse(read(`fm-${region}.json`));
    } else if (has(`fm-${region}.err`)) {
      entry.fmError = read(`fm-${region}.err`);
    }

    if (has(`ip-${region}.err`)) {
      entry.ipError = read(`ip-${region}.err`);
    } else {
      // ページ順を 1, 2, 3 ... に揃える。ip-<region>.json が 1 ページ目。
      const pages = names
        .filter((name) => new RegExp(`^ip-${region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.\\d+)?\\.json$`).test(name))
        .sort((a, b) => pageIndex(a) - pageIndex(b));
      if (pages.length > 0) entry.ip = pages.map((name) => JSON.parse(read(name)));
    }

    if (entry.fmError && entry.ipError) entry.error = entry.fmError;

    const status = entry.error ? "denied" : entry.fmError || entry.ipError ? "partial" : "ok";
    log(`${region}: ${status}\n`);
    collected[region] = entry;
  }
  return collected;
}

function pageIndex(name) {
  const match = /\.(\d+)\.json$/.exec(name);
  return match ? Number(match[1]) : 1;
}

export function writeOutputs({ dataDir, models, profiles, fetchLog }) {
  writeFileSync(join(dataDir, "models.json"), serialize(models));
  writeFileSync(join(dataDir, "profiles.json"), serialize(profiles));
  writeFileSync(join(dataDir, "fetch-log.json"), serialize(fetchLog));
}

// CLI 本体が呼ぶ入口。generatedAt は呼び出し側が渡す (normalize を純粋に保つため)。
export function runSnapshot({ runner, profile, accountKind, regions, date, dataDir, rawRoot, generatedAt, dryRun = false, log = () => {} }) {
  const rawDir = join(rawRoot, date);
  const collected = collectRegions({ runner, profile, regions, rawDir, log });
  const { models, profiles, fetchLog } = normalizeSnapshot({ regions: collected, generatedAt, accountKind, modelPolicies: readModelPolicies(dataDir) });
  if (!dryRun) writeOutputs({ dataDir, models, profiles, fetchLog });
  return { models, profiles, fetchLog, rawDir };
}

// 終了時の要約。fetch-log.json の regions から status ごとの件数を数える。
export function summarize(fetchLog) {
  const counts = {};
  for (const entry of Object.values(fetchLog.regions ?? {})) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
}

// --from-raw <日付> の入口。生データを読み直して data/*.json を書き直す。
// generatedAt は既存の fetch-log.json の値を引き継ぐ (取得し直していないため)。
export function runFromRaw({ accountKind, date, dataDir, rawRoot, generatedAt = null, dryRun = false, log = () => {} }) {
  const rawDir = join(rawRoot, date);
  const collected = collectFromRaw({ rawDir, log });
  const previous = readGeneratedAt(join(dataDir, "fetch-log.json"));
  const { models, profiles, fetchLog } = normalizeSnapshot({
    regions: collected,
    modelPolicies: readModelPolicies(dataDir),
    generatedAt: previous ?? generatedAt,
    accountKind,
  });
  if (!dryRun) writeOutputs({ dataDir, models, profiles, fetchLog });
  return { models, profiles, fetchLog, rawDir };
}

// 既存の生成物から generatedAt だけを拾う。読めなければ null。
export function readGeneratedAt(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")).generatedAt ?? null;
  } catch {
    return null;
  }
}

function readModelPolicies(dataDir) {
  const path = join(dataDir, "model-policies.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}
