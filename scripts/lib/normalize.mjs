// スナップショットの正規化 (DATA-001)。純関数だけを置く。
// ファイル I/O・時刻取得・ネットワークは一切行わない (AC-NFR-001)。
// 入力の生 JSON は scripts/lib/snapshot.mjs 側が読んで渡す。

// AWS アカウント ID (12 桁) の伏字。
//
// AC-010 は denied の reason を「API のエラー文をそのまま」入れよと言い、
// AC-011 と Test Strategy は「生成した JSON 全体に 12 桁の数字列が現れないこと」を求める。
// エラー文には呼び出し元のアカウント ID と Organizations の ID がそのまま入るため、
// 2 つは同時には満たせない。生成物は公開リポジトリに載るので AC-011 を優先し、
// 12 桁の数字列だけを置き換える。語順・改行・語彙は一切変えないので、AC-010 の
// 「要約・整形しない」という意図は保たれる。伏字前の原文は data/raw/<日付>/*.err
// (gitignore 対象) に残る。
export const ACCOUNT_ID_MASK = "<account-id>";
const ACCOUNT_ID_PATTERN = /(?<!\d)\d{12}(?!\d)/g;

export function redactAccountIds(text) {
  return typeof text === "string" ? text.replace(ACCOUNT_ID_PATTERN, ACCOUNT_ID_MASK) : text;
}

// arn:aws:bedrock:<region>:<account>:... の <region> を返す。
// Global プロファイルはリージョン空の ARN (arn:aws:bedrock:::foundation-model/...)
// を返すので、その場合は "*" に正規化する (AC-006)。
export function destinationFromModelArn(modelArn) {
  if (typeof modelArn !== "string") return null;
  const region = modelArn.split(":")[3];
  return region ? region : "*";
}

// modelArn の "foundation-model/" 以降をモデル ID として取る (AC-005)。
// モデル ID 自体が ":" を含む (例 cohere.embed-v4:0) ので、分割ではなく後方一致で切る。
export function modelIdFromArn(modelArn) {
  if (typeof modelArn !== "string") return null;
  const marker = "foundation-model/";
  const index = modelArn.indexOf(marker);
  return index === -1 ? null : modelArn.slice(index + marker.length);
}

// プロファイル ID の最初のドットより前が接頭辞 (us / eu / apac / au / jp / global)。
// spike で観測したのは apac / jp / global の 3 種だが、未知の接頭辞も素通しする。
export function prefixFromProfileId(profileId) {
  if (typeof profileId !== "string") return null;
  const dot = profileId.indexOf(".");
  return dot === -1 ? profileId : profileId.slice(0, dot);
}

// キーをコード順に並べ直した新しいオブジェクトを返す。
// 同じ入力なら JSON.stringify まで一致させるために使う (AC-NFR-001)。
function sortedObject(entries) {
  const result = {};
  for (const key of Object.keys(entries).sort()) result[key] = entries[key];
  return result;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

// ListInferenceProfiles は複数ページに分かれることがある (AC-007)。
// 取得側が集めたページ配列を 1 本の inferenceProfileSummaries に潰す。
export function mergeProfilePages(pages) {
  const summaries = [];
  for (const page of pages ?? []) {
    for (const summary of page?.inferenceProfileSummaries ?? []) summaries.push(summary);
  }
  return summaries;
}

// 1 リージョン分の取得結果:
//   { fm?: ListFoundationModels の応答, ip?: ListInferenceProfiles の応答ページ配列,
//     error?: fm/ip の両方が失敗したときのエラー原文,
//     fmError?: fm だけ失敗したときの原文, ipError?: ip だけ失敗したときの原文 }
//
// 戻り値は技術設計 §4 の形:
//   { models, profiles, fetchLog }
export function normalizeSnapshot({ regions = {}, generatedAt = null, accountKind = null } = {}) {
  const models = {};
  const profiles = {};
  const log = {};

  // リージョンはコード順に処理する。availability / sources のキー順を
  // 入力オブジェクトの列挙順に依存させないため (AC-NFR-001)。
  for (const region of Object.keys(regions).sort()) {
    const result = regions[region] ?? {};
    const fmError = result.error ?? result.fmError ?? null;
    const ipError = result.error ?? result.ipError ?? null;

    // 両方失敗したリージョンは fetch-log にだけ残し、models/profiles には一切出さない (AC-010)。
    // reason は API のエラー文をそのまま入れる。要約も整形もしない
    // (12 桁のアカウント ID だけは redactAccountIds で伏せる。上のコメント参照)。
    if (fmError && ipError) {
      log[region] = { status: "denied", reason: redactAccountIds(result.error ?? fmError) };
      continue;
    }

    let modelCount = 0;
    for (const summary of result.fm?.modelSummaries ?? []) {
      const modelId = summary?.modelId;
      if (!modelId) continue;
      modelCount += 1;
      if (!models[modelId]) {
        models[modelId] = {
          provider: summary.providerName ?? null,
          name: summary.modelName ?? null,
          input: summary.inputModalities ?? [],
          output: summary.outputModalities ?? [],
          streaming: summary.responseStreamingSupported ?? false,
          lifecycle: summary.modelLifecycle?.status ?? null,
          availability: {},
        };
      }
      // inferenceTypesSupported は応答の配列をそのまま持つ。空配列でも行は残す (AC-004)。
      // API Reference の enum に無い INFERENCE_PROFILE が返るので、値を検査しない。
      models[modelId].availability[region] = summary.inferenceTypesSupported ?? [];
    }

    const summaries = mergeProfilePages(result.ip);
    let profileCount = 0;
    for (const summary of summaries) {
      const profileId = summary?.inferenceProfileId;
      if (!profileId) continue;
      profileCount += 1;
      const raw = sortedUnique(
        (summary.models ?? []).map((entry) => destinationFromModelArn(entry?.modelArn)).filter(Boolean),
      );
      // Global プロファイルの models[] はリージョン空 ARN と source region の ARN の 2 件。
      // 後者を destination として列挙すると「東京にしか行かない」と読めてしまうので、
      // "*" があれば ["*"] だけにする (AC-006)。
      const destinations = raw.includes("*") ? ["*"] : raw;
      // modelId は models[].modelArn の末尾から取る。リージョン空 ARN でも同じ位置にある。
      const modelId =
        (summary.models ?? []).map((entry) => modelIdFromArn(entry?.modelArn)).find((id) => id != null) ?? null;
      if (!profiles[profileId]) {
        profiles[profileId] = {
          prefix: prefixFromProfileId(profileId),
          modelId,
          // inferenceProfileArn はアカウント ID を含むので保存しない (AC-011)。
          name: summary.inferenceProfileName ?? null,
          sources: {},
        };
      }
      profiles[profileId].sources[region] = destinations;
    }

    // 片方だけ失敗したリージョンは partial。取れた側のデータは載せ、
    // 取れなかった側のエラー原文を reason に残す。
    if (fmError || ipError) {
      log[region] = {
        status: "partial",
        reason: redactAccountIds(fmError ?? ipError),
        models: modelCount,
        profiles: profileCount,
      };
    } else {
      log[region] = { status: "ok", models: modelCount, profiles: profileCount };
    }
  }

  for (const entry of Object.values(models)) entry.availability = sortedObject(entry.availability);
  for (const entry of Object.values(profiles)) entry.sources = sortedObject(entry.sources);

  return {
    models: sortedObject(models),
    profiles: sortedObject(profiles),
    fetchLog: { generatedAt, accountKind, regions: sortedObject(log) },
  };
}
