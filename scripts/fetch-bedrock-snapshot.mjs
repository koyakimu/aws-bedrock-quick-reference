// Bedrock の公開情報を `aws` CLI で取得し、data/*.json に正規化する (DATA-001)。
//   node scripts/fetch-bedrock-snapshot.mjs --profile sandbox --account-kind sandbox
//   node scripts/fetch-bedrock-snapshot.mjs --profile sandbox --account-kind sandbox --regions ap-northeast-1,us-east-1
//   node scripts/fetch-bedrock-snapshot.mjs --profile sandbox --account-kind sandbox --dry-run
//
// 手元の SSO で手動実行する前提。CI に AWS 認証情報は置かない (D-002)。
// 取得できなかったリージョンは例外にせず data/fetch-log.json に denied として残す。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defaultRunner } from "./lib/aws-cli.mjs";
import { parseArgs, regionsFromNotes, USAGE } from "./lib/cli-args.mjs";
import { runSnapshot, summarize } from "./lib/snapshot.mjs";

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const RAW_ROOT = fileURLToPath(new URL("../data/raw/", import.meta.url));

// 実行日 (JST)。--date で上書きできる。
const todayJst = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
const notes = JSON.parse(readFileSync(new URL("../data/region-notes.json", import.meta.url), "utf8"));

let options;
try {
  options = parseArgs(process.argv.slice(2), { defaultRegions: regionsFromNotes(notes), today: todayJst });
} catch (error) {
  process.stderr.write(`error: ${error.message}\n${USAGE}\n`);
  process.exit(2);
}

process.stderr.write(`fetching ${options.regions.length} regions with profile ${options.profile}\n`);

const { fetchLog } = runSnapshot({
  runner: defaultRunner,
  profile: options.profile,
  accountKind: options.accountKind,
  regions: options.regions,
  date: options.date,
  dataDir: DATA_DIR,
  rawRoot: RAW_ROOT,
  generatedAt: new Date().toISOString(),
  dryRun: options.dryRun,
  log: (line) => process.stderr.write(line),
});

const counts = summarize(fetchLog);
const summary = Object.entries(counts)
  .map(([status, count]) => `${status}=${count}`)
  .join(" ");
process.stderr.write(`${options.dryRun ? "dry-run: " : ""}${summary || "no regions"}\n`);
