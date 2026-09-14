// @vitest-environment node
// fixture や package.json をファイルパスで読むので node 環境で走らせる
// (jsdom 環境だと import.meta.url が file: スキームにならない)。
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, regionsFromNotes, USAGE } from "../scripts/lib/cli-args.mjs";
import { listFoundationModels, listInferenceProfiles } from "../scripts/lib/aws-cli.mjs";
import { collectFromRaw, runFromRaw, runSnapshot, summarize, serialize } from "../scripts/lib/snapshot.mjs";

const fixture = (name) => new URL(`./fixtures/bedrock/${name}`, import.meta.url);
const FM_TOKYO_RAW = readFileSync(fixture("fm-ap-northeast-1.json"), "utf8");
const IP_TOKYO_RAW = readFileSync(fixture("ip-ap-northeast-1.json"), "utf8");
const FM_DENY = readFileSync(fixture("fm-us-east-1.err"), "utf8");
const IP_DENY = readFileSync(fixture("ip-us-east-1.err"), "utf8");

const NOTES = JSON.parse(readFileSync(new URL("../data/region-notes.json", import.meta.url), "utf8"));

// aws CLI の代わりに使う偽の runner。呼ばれた引数配列を全部記録する。
function fakeRunner(handler) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    return handler(args, calls.length);
  };
  runner.calls = calls;
  return runner;
}

const argValue = (args, flag) => args[args.indexOf(flag) + 1];

// 東京は成功、us-east-1 は SCP の明示 Deny で非ゼロ終了する runner。
const tokyoOkUsEastDenied = () =>
  fakeRunner((args) => {
    const region = argValue(args, "--region");
    const isFm = args[1] === "list-foundation-models";
    if (region === "us-east-1") return { status: 254, stdout: "", stderr: isFm ? FM_DENY : IP_DENY };
    return { status: 0, stdout: isFm ? FM_TOKYO_RAW : IP_TOKYO_RAW, stderr: "" };
  });

const makeDirs = () => {
  const root = mkdtempSync(join(tmpdir(), "bedrock-snapshot-"));
  const dataDir = join(root, "data");
  const rawRoot = join(dataDir, "raw");
  mkdirSync(rawRoot, { recursive: true });
  return { dataDir, rawRoot };
};

describe("CLI の引数解析", () => {
  it("--profile と --account-kind は必須", () => {
    expect(() => parseArgs([])).toThrow("--profile は必須です");
    expect(() => parseArgs(["--profile", "sandbox"])).toThrow("--account-kind は必須です");
    expect(() => parseArgs(["--profile"])).toThrow("--profile には値が必要です");
    expect(() => parseArgs(["--profile", "sandbox", "--account-kind", "sandbox", "--oops"])).toThrow("不明な引数");
    expect(USAGE).toContain("--account-kind");
  });

  it("--regions はカンマ区切り、--date は YYYY-MM-DD、--dry-run はフラグ", () => {
    const parsed = parseArgs(
      ["--profile", "sandbox", "--account-kind", "sandbox", "--regions", "ap-northeast-1, us-east-1", "--date", "2026-09-14", "--dry-run"],
      { defaultRegions: ["x"], today: "2026-01-01" },
    );
    expect(parsed).toEqual({
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1", "us-east-1"],
      date: "2026-09-14",
      dryRun: true,
      fromRaw: null,
    });
    expect(() => parseArgs(["--profile", "p", "--account-kind", "k", "--date", "2026/09/14"])).toThrow("--date");
    expect(() => parseArgs(["--profile", "p", "--account-kind", "k", "--regions", " , "])).toThrow("--regions");
  });

  it("AC-008: --regions を省くと region-notes.json のキー全件、--date を省くと今日", () => {
    const defaultRegions = regionsFromNotes(NOTES);
    const parsed = parseArgs(["--profile", "sandbox", "--account-kind", "sandbox"], {
      defaultRegions,
      today: "2026-09-14",
    });
    expect(parsed.regions).toEqual(defaultRegions);
    expect(parsed.date).toBe("2026-09-14");
    // _source はメタ情報なのでリージョンとして扱わない
    expect(parsed.regions).not.toContain("_source");
    expect(parsed.regions).toContain("ap-northeast-1");
    expect(parsed.regions).toContain("us-east-1");
    expect(parsed.regions.length).toBe(Object.keys(NOTES).length - 1);
  });
});

describe("AC-007 nextToken のページング", () => {
  it("nextToken が無くなるまで --next-token を付けて呼び、全ページを返す", () => {
    const pages = [
      JSON.stringify({ inferenceProfileSummaries: [{ inferenceProfileId: "a" }], nextToken: "t1" }),
      JSON.stringify({ inferenceProfileSummaries: [{ inferenceProfileId: "b" }], nextToken: "t2" }),
      JSON.stringify({ inferenceProfileSummaries: [{ inferenceProfileId: "c" }] }),
    ];
    const runner = fakeRunner((_args, call) => ({ status: 0, stdout: pages[call - 1], stderr: "" }));
    const result = listInferenceProfiles(runner, { profile: "sandbox", region: "ap-northeast-1" });

    expect(result.ok).toBe(true);
    expect(result.pages.length).toBe(3);
    expect(runner.calls.length).toBe(3);
    expect(runner.calls[0]).not.toContain("--next-token");
    expect(argValue(runner.calls[1], "--next-token")).toBe("t1");
    expect(argValue(runner.calls[2], "--next-token")).toBe("t2");
  });

  it("typeEquals は SYSTEM_DEFINED 固定で APPLICATION は取らない", () => {
    const runner = fakeRunner(() => ({ status: 0, stdout: "{}", stderr: "" }));
    listInferenceProfiles(runner, { profile: "sandbox", region: "ap-northeast-1" });
    expect(argValue(runner.calls[0], "--type-equals")).toBe("SYSTEM_DEFINED");
    expect(argValue(runner.calls[0], "--max-results")).toBe("1000");
    expect(runner.calls[0].join(" ")).not.toContain("APPLICATION");
  });

  it("nextToken が終わらなければ打ち切って失敗にする", () => {
    const runner = fakeRunner(() => ({
      status: 0,
      stdout: JSON.stringify({ inferenceProfileSummaries: [], nextToken: "loop" }),
      stderr: "",
    }));
    const result = listInferenceProfiles(runner, { profile: "sandbox", region: "ap-northeast-1", maxPages: 3 });
    expect(result.ok).toBe(false);
    expect(runner.calls.length).toBe(3);
  });

  it("aws を配列引数で起動し、シェル文字列を組み立てない", () => {
    const runner = fakeRunner(() => ({ status: 0, stdout: FM_TOKYO_RAW, stderr: "" }));
    listFoundationModels(runner, { profile: "sand box", region: "ap-northeast-1" });
    expect(runner.calls[0]).toEqual([
      "bedrock",
      "list-foundation-models",
      "--profile",
      "sand box",
      "--region",
      "ap-northeast-1",
      "--output",
      "json",
    ]);
  });

  it("壊れた JSON は失敗として扱う", () => {
    const runner = fakeRunner(() => ({ status: 0, stdout: "not json", stderr: "" }));
    expect(listFoundationModels(runner, { profile: "p", region: "r" }).ok).toBe(false);
  });
});

describe("AC-008 生データの保存と生成物", () => {
  it("data/raw/<日付>/ に生 JSON が、data/ に 3 つの生成物が書かれる", () => {
    const { dataDir, rawRoot } = makeDirs();
    const { fetchLog } = runSnapshot({
      runner: tokyoOkUsEastDenied(),
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1", "us-east-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
    });

    const raw = join(rawRoot, "2026-09-14");
    expect(readFileSync(join(raw, "fm-ap-northeast-1.json"), "utf8")).toBe(FM_TOKYO_RAW);
    expect(readFileSync(join(raw, "ip-ap-northeast-1.json"), "utf8")).toBe(IP_TOKYO_RAW);
    // 失敗したリージョンは stderr を原文のまま .err に残す
    expect(readFileSync(join(raw, "fm-us-east-1.err"), "utf8")).toBe(FM_DENY);
    expect(readFileSync(join(raw, "ip-us-east-1.err"), "utf8")).toBe(IP_DENY);

    for (const name of ["models.json", "profiles.json", "fetch-log.json"]) {
      const text = readFileSync(join(dataDir, name), "utf8");
      expect(text.endsWith("\n")).toBe(true);
      expect(text).toContain('\n  "'); // 2 スペースインデント
      expect(() => JSON.parse(text)).not.toThrow();
    }
    expect(JSON.parse(readFileSync(join(dataDir, "fetch-log.json"), "utf8"))).toEqual(fetchLog);
    expect(summarize(fetchLog)).toEqual({ ok: 1, denied: 1 });
  });

  it("2 ページ目以降の生 JSON も別名で残す", () => {
    const { dataDir, rawRoot } = makeDirs();
    const runner = fakeRunner((args, call) => {
      if (args[1] === "list-foundation-models") return { status: 0, stdout: FM_TOKYO_RAW, stderr: "" };
      const first = !args.includes("--next-token");
      return {
        status: 0,
        stdout: JSON.stringify(
          first
            ? { inferenceProfileSummaries: [{ inferenceProfileId: "a" }], nextToken: "t1" }
            : { inferenceProfileSummaries: [{ inferenceProfileId: "b" }] },
        ),
        stderr: `${call}`,
      };
    });
    runSnapshot({
      runner,
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
    });
    const raw = join(rawRoot, "2026-09-14");
    expect(existsSync(join(raw, "ip-ap-northeast-1.json"))).toBe(true);
    expect(existsSync(join(raw, "ip-ap-northeast-1.2.json"))).toBe(true);
  });

  it("--dry-run では data/*.json を書かない", () => {
    const { dataDir, rawRoot } = makeDirs();
    runSnapshot({
      runner: tokyoOkUsEastDenied(),
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
      dryRun: true,
    });
    expect(existsSync(join(dataDir, "models.json"))).toBe(false);
    expect(existsSync(join(rawRoot, "2026-09-14", "fm-ap-northeast-1.json"))).toBe(true);
  });

  it("serialize はキー順を保ったまま 2 スペース + 末尾改行で出す", () => {
    expect(serialize({ b: 1, a: 2 })).toBe('{\n  "b": 1,\n  "a": 2\n}\n');
  });
});

describe("AC-010 失敗しても止まらない", () => {
  it("先頭のリージョンが denied でも後続を取得し、生成物から除外する", () => {
    const { dataDir, rawRoot } = makeDirs();
    const runner = tokyoOkUsEastDenied();
    const { models, profiles, fetchLog } = runSnapshot({
      runner,
      profile: "sandbox",
      accountKind: "sandbox",
      // denied を先に置いて、例外で残りが落ちないことを見る
      regions: ["us-east-1", "ap-northeast-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
    });

    expect(fetchLog.regions["us-east-1"]).toEqual({ status: "denied", cause: "scp-deny" });
    expect(JSON.stringify(fetchLog)).not.toContain("service control policy");
    expect(fetchLog.regions["ap-northeast-1"]).toEqual({ status: "ok", models: 5, profiles: 4 });
    expect(JSON.stringify(models)).not.toContain("us-east-1");
    expect(JSON.stringify(profiles)).not.toContain("us-east-1");
    // 4 回 (2 リージョン × 2 API) 呼ばれている = 失敗で打ち切っていない
    expect(runner.calls.length).toBe(4);
  });

  it("1 行ログに region: status を出す", () => {
    const { dataDir, rawRoot } = makeDirs();
    const lines = [];
    runSnapshot({
      runner: tokyoOkUsEastDenied(),
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1", "us-east-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
      log: (line) => lines.push(line),
    });
    expect(lines).toEqual(["ap-northeast-1: ok\n", "us-east-1: denied\n"]);
  });
});

describe("--from-raw 生データからの再正規化 (D-008)", () => {
  it("--from-raw を渡すと --profile は要らず、日付が --date の代わりになる", () => {
    const parsed = parseArgs(["--from-raw", "2026-09-14", "--account-kind", "sandbox"], {
      defaultRegions: ["x"],
      today: "2026-10-01",
    });
    expect(parsed.fromRaw).toBe("2026-09-14");
    expect(parsed.date).toBe("2026-09-14");
    expect(parsed.profile).toBeNull();
    expect(() => parseArgs(["--from-raw", "2026/09/14", "--account-kind", "k"])).toThrow("--from-raw");
    expect(() => parseArgs(["--from-raw", "2026-09-14"])).toThrow("--account-kind");
    expect(() =>
      parseArgs(["--from-raw", "2026-09-14", "--account-kind", "k", "--regions", "us-east-1"]),
    ).toThrow("同時に指定できません");
    expect(USAGE).toContain("--from-raw");
  });

  it("生データを読み直して runSnapshot と同じ生成物を作る (aws は呼ばない)", () => {
    const { dataDir, rawRoot } = makeDirs();
    const runner = tokyoOkUsEastDenied();
    const fetched = runSnapshot({
      runner,
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1", "us-east-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
    });

    const callsBefore = runner.calls.length;
    const reNormalized = runFromRaw({
      accountKind: "sandbox",
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2099-01-01T00:00:00Z",
    });

    // 偽 runner は runFromRaw に渡していないので、呼び出し回数は増えない
    expect(runner.calls.length).toBe(callsBefore);
    expect(reNormalized.models).toEqual(fetched.models);
    expect(reNormalized.profiles).toEqual(fetched.profiles);
    expect(reNormalized.fetchLog).toEqual(fetched.fetchLog);
    // 既存の fetch-log.json の generatedAt を引き継ぐ (取得し直していないため)
    expect(reNormalized.fetchLog.generatedAt).toBe("2026-09-14T08:10:00Z");
    expect(JSON.parse(readFileSync(join(dataDir, "fetch-log.json"), "utf8"))).toEqual(reNormalized.fetchLog);
  });

  it("既存の fetch-log.json が無ければ渡された generatedAt を使う", () => {
    const { dataDir, rawRoot } = makeDirs();
    runSnapshot({
      runner: tokyoOkUsEastDenied(),
      profile: "sandbox",
      accountKind: "sandbox",
      regions: ["ap-northeast-1"],
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2026-09-14T08:10:00Z",
      dryRun: true,
    });
    const result = runFromRaw({
      accountKind: "prod",
      date: "2026-09-14",
      dataDir,
      rawRoot,
      generatedAt: "2099-01-01T00:00:00Z",
    });
    expect(result.fetchLog.generatedAt).toBe("2099-01-01T00:00:00Z");
    expect(result.fetchLog.accountKind).toBe("prod");
  });

  it("複数ページの ip も番号順に読み直す", () => {
    const { rawRoot } = makeDirs();
    const rawDir = join(rawRoot, "2026-09-14");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "fm-ap-northeast-1.json"), FM_TOKYO_RAW);
    writeFileSync(
      join(rawDir, "ip-ap-northeast-1.json"),
      JSON.stringify({ inferenceProfileSummaries: [{ inferenceProfileId: "a" }], nextToken: "t1" }),
    );
    writeFileSync(
      join(rawDir, "ip-ap-northeast-1.2.json"),
      JSON.stringify({ inferenceProfileSummaries: [{ inferenceProfileId: "b" }] }),
    );
    const collected = collectFromRaw({ rawDir });
    expect(collected["ap-northeast-1"].ip.map((page) => page.inferenceProfileSummaries[0].inferenceProfileId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("生データのディレクトリが無ければ失敗する", () => {
    const { rawRoot } = makeDirs();
    expect(() => collectFromRaw({ rawDir: join(rawRoot, "1999-01-01") })).toThrow("生データのディレクトリ");
  });
});
