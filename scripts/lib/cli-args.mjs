// fetch-bedrock-snapshot.mjs の引数解析。純関数。
// 既定リージョンと「今日」は呼び出し側が渡す (このモジュールは時計を読まない)。

export const USAGE = `usage: node scripts/fetch-bedrock-snapshot.mjs --profile <名前> --account-kind <種別>
                                         [--regions a,b,...] [--date YYYY-MM-DD] [--dry-run]`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv, { defaultRegions = [], today = null } = {}) {
  const options = { profile: null, accountKind: null, regions: null, date: null, dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const take = (name) => {
      const value = argv[index + 1];
      if (value == null || value.startsWith("--")) throw new Error(`${name} には値が必要です`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--profile":
        options.profile = take("--profile");
        break;
      case "--account-kind":
        options.accountKind = take("--account-kind");
        break;
      case "--regions":
        options.regions = take("--regions")
          .split(",")
          .map((region) => region.trim())
          .filter(Boolean);
        break;
      case "--date":
        options.date = take("--date");
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new Error(`不明な引数: ${arg}`);
    }
  }

  if (!options.profile) throw new Error("--profile は必須です");
  if (!options.accountKind) throw new Error("--account-kind は必須です");
  if (options.date && !DATE_PATTERN.test(options.date)) throw new Error("--date は YYYY-MM-DD で指定してください");
  if (options.regions && options.regions.length === 0) throw new Error("--regions が空です");

  // --regions を省いたら region-notes.json のキー全件が対象 (AC-008)。
  return {
    profile: options.profile,
    accountKind: options.accountKind,
    regions: options.regions ?? defaultRegions,
    date: options.date ?? today,
    dryRun: options.dryRun,
  };
}

// region-notes.json のキーのうち、メタ情報の _source を除いたものが対象リージョン。
export function regionsFromNotes(notes) {
  return Object.keys(notes ?? {})
    .filter((key) => !key.startsWith("_"))
    .sort();
}
