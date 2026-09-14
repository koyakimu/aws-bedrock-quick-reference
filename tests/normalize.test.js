// @vitest-environment node
// fixture や package.json をファイルパスで読むので node 環境で走らせる
// (jsdom 環境だと import.meta.url が file: スキームにならない)。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  normalizeSnapshot,
  destinationFromModelArn,
  modelIdFromArn,
  prefixFromProfileId,
  mergeProfilePages,
  redactAccountIds,
  ACCOUNT_ID_MASK,
} from "../scripts/lib/normalize.mjs";

// fixture は spike 出力 (data/raw/2026-09-14-spike/) を 5 モデル・4 プロファイルに
// 間引いたもの。inferenceTypesSupported の 4 パターン (ON_DEMAND のみ /
// INFERENCE_PROFILE のみ / 両方 / 空配列) が揃うように選んである。
// 実アカウント ID は AWS の例示用 ID (123456789012 / 111122223333) に置き換えてある。
const fixture = (name) => new URL(`./fixtures/bedrock/${name}`, import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(fixture(name), "utf8"));
const readText = (name) => readFileSync(fixture(name), "utf8");

const FM_TOKYO = readJson("fm-ap-northeast-1.json");
const IP_TOKYO = readJson("ip-ap-northeast-1.json");
const FM_DENY = readText("fm-us-east-1.err");
const IP_DENY = readText("ip-us-east-1.err");

const tokyoOnly = () =>
  normalizeSnapshot({
    regions: { "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] } },
    generatedAt: "2026-09-14T08:10:00Z",
    accountKind: "sandbox",
  });

describe("AC-001 / AC-002 / AC-003 / AC-004 availability は inferenceTypesSupported をそのまま持つ", () => {
  it("AC-001: ON_DEMAND のみのモデルは ON_DEMAND を含む", () => {
    const { models } = tokyoOnly();
    expect(models["nvidia.nemotron-nano-12b-v2"].availability["ap-northeast-1"]).toEqual(["ON_DEMAND"]);
  });

  it("AC-002: INFERENCE_PROFILE のみのモデルは ON_DEMAND を含まない (= In-Region 不可)", () => {
    const { models } = tokyoOnly();
    const availability = models["anthropic.claude-sonnet-4-5-20250929-v1:0"].availability["ap-northeast-1"];
    expect(availability).toEqual(["INFERENCE_PROFILE"]);
    expect(availability).not.toContain("ON_DEMAND");
  });

  it("AC-003: 両方を含むモデルは、応答の並び順にかかわらず両方を持つ", () => {
    const { models } = tokyoOnly();
    // fixture には順序違いの 2 件が入っている (cohere は ON_DEMAND 先、nova-lite は INFERENCE_PROFILE 先)
    expect(models["cohere.embed-v4:0"].availability["ap-northeast-1"]).toEqual(["ON_DEMAND", "INFERENCE_PROFILE"]);
    expect(models["amazon.nova-lite-v1:0"].availability["ap-northeast-1"]).toEqual([
      "INFERENCE_PROFILE",
      "ON_DEMAND",
    ]);
    for (const id of ["cohere.embed-v4:0", "amazon.nova-lite-v1:0"]) {
      const availability = models[id].availability["ap-northeast-1"];
      expect(availability).toContain("ON_DEMAND");
      expect(availability).toContain("INFERENCE_PROFILE");
    }
  });

  it("AC-004: 空配列のモデルは行が残り、availability だけが空になる", () => {
    const { models } = tokyoOnly();
    expect(models["amazon.titan-embed-text-v1:2:8k"]).toBeDefined();
    expect(models["amazon.titan-embed-text-v1:2:8k"].availability["ap-northeast-1"]).toEqual([]);
  });

  it("モデルのメタ情報が技術設計 §4.1 の形で載る", () => {
    const { models } = tokyoOnly();
    expect(models["anthropic.claude-sonnet-4-5-20250929-v1:0"]).toMatchObject({
      provider: "Anthropic",
      name: "Claude Sonnet 4.5",
      input: ["TEXT", "IMAGE"],
      output: ["TEXT"],
      streaming: true,
      lifecycle: "ACTIVE",
    });
  });
});

describe("AC-005 Geo プロファイルの destination 抽出", () => {
  it("jp. プロファイルの destination をソートして重複除去し、prefix と modelId を取る", () => {
    const { profiles } = tokyoOnly();
    const profile = profiles["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"];
    // fixture の models[] は ap-northeast-3 → ap-northeast-1 の順に並んでいる
    expect(IP_TOKYO.inferenceProfileSummaries.find((s) => s.inferenceProfileId.startsWith("jp.")).models[0].modelArn)
      .toContain("ap-northeast-3");
    expect(profile.sources["ap-northeast-1"]).toEqual(["ap-northeast-1", "ap-northeast-3"]);
    expect(profile.prefix).toBe("jp");
    expect(profile.modelId).toBe("anthropic.claude-sonnet-4-5-20250929-v1:0");
    expect(profile.name).toBe("JP Anthropic Claude Sonnet 4.5");
  });

  it("apac. プロファイルも同じ規則で 6 リージョンを昇順に並べる", () => {
    const { profiles } = tokyoOnly();
    const profile = profiles["apac.amazon.nova-lite-v1:0"];
    expect(profile.prefix).toBe("apac");
    expect(profile.sources["ap-northeast-1"]).toEqual([
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-northeast-3",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
    ]);
  });

  it("重複した destination は 1 つに畳む", () => {
    const { profiles } = normalizeSnapshot({
      regions: {
        "ap-northeast-1": {
          fm: { modelSummaries: [] },
          ip: [
            {
              inferenceProfileSummaries: [
                {
                  inferenceProfileId: "jp.test.model-v1:0",
                  inferenceProfileName: "JP Test",
                  models: [
                    { modelArn: "arn:aws:bedrock:ap-northeast-3::foundation-model/test.model-v1:0" },
                    { modelArn: "arn:aws:bedrock:ap-northeast-1::foundation-model/test.model-v1:0" },
                    { modelArn: "arn:aws:bedrock:ap-northeast-3::foundation-model/test.model-v1:0" },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    expect(profiles["jp.test.model-v1:0"].sources["ap-northeast-1"]).toEqual(["ap-northeast-1", "ap-northeast-3"]);
  });
});

describe("AC-006 Global のリージョン空 ARN", () => {
  it("リージョン空 ARN を持つ global. プロファイルの destination は ['*'] になる", () => {
    const { profiles } = tokyoOnly();
    for (const id of ["global.cohere.embed-v4:0", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"]) {
      const profile = profiles[id];
      expect(profile.prefix).toBe("global");
      // source region だけを列挙してはいけないし、"" を残してもいけない
      expect(profile.sources["ap-northeast-1"]).toEqual(["*"]);
      expect(profile.sources["ap-northeast-1"]).not.toContain("");
      expect(profile.sources["ap-northeast-1"]).not.toContain("ap-northeast-1");
    }
    expect(profiles["global.cohere.embed-v4:0"].modelId).toBe("cohere.embed-v4:0");
  });

  it("destinationFromModelArn / modelIdFromArn / prefixFromProfileId の単体", () => {
    expect(destinationFromModelArn("arn:aws:bedrock:::foundation-model/cohere.embed-v4:0")).toBe("*");
    expect(destinationFromModelArn("arn:aws:bedrock:eu-west-1::foundation-model/cohere.embed-v4:0")).toBe("eu-west-1");
    expect(modelIdFromArn("arn:aws:bedrock:::foundation-model/cohere.embed-v4:0")).toBe("cohere.embed-v4:0");
    expect(modelIdFromArn("arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.titan-embed-text-v1:2:8k")).toBe(
      "amazon.titan-embed-text-v1:2:8k",
    );
    expect(prefixFromProfileId("global.anthropic.claude-sonnet-4-5-20250929-v1:0")).toBe("global");
    expect(prefixFromProfileId("au.anthropic.claude-sonnet-4-5-20250929-v1:0")).toBe("au");
  });
});

describe("AC-007 nextToken ページングの結合", () => {
  it("mergeProfilePages が全ページの inferenceProfileSummaries を 1 本に繋ぐ", () => {
    const merged = mergeProfilePages([
      { inferenceProfileSummaries: [{ inferenceProfileId: "a" }], nextToken: "t1" },
      { inferenceProfileSummaries: [{ inferenceProfileId: "b" }] },
    ]);
    expect(merged.map((s) => s.inferenceProfileId)).toEqual(["a", "b"]);
  });

  it("normalizeSnapshot が複数ページの ip を受け取って全件を載せる", () => {
    const half = (start, end) => ({
      inferenceProfileSummaries: IP_TOKYO.inferenceProfileSummaries.slice(start, end),
    });
    const paged = normalizeSnapshot({
      regions: { "ap-northeast-1": { fm: FM_TOKYO, ip: [half(0, 2), half(2, 4)] } },
    });
    expect(Object.keys(paged.profiles).length).toBe(4);
    expect(paged.fetchLog.regions["ap-northeast-1"].profiles).toBe(4);
  });
});

describe("AC-010 denied リージョン", () => {
  const denied = () =>
    normalizeSnapshot({
      regions: {
        "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] },
        "us-east-1": { error: FM_DENY },
      },
      generatedAt: "2026-09-14T08:10:00Z",
      accountKind: "sandbox",
    });

  it("fetch-log に denied と理由が残り、models/profiles に一切現れない", () => {
    const { models, profiles, fetchLog } = denied();
    expect(fetchLog.regions["us-east-1"].status).toBe("denied");
    expect(fetchLog.regions["us-east-1"].reason).toContain("AccessDeniedException");
    expect(fetchLog.regions["us-east-1"].reason).toContain("explicit deny in a service control policy");
    // 語順も改行も変えない (アカウント ID の伏字だけが原文との差)
    expect(fetchLog.regions["us-east-1"].reason).toBe(redactAccountIds(FM_DENY));
    expect(JSON.stringify(models)).not.toContain("us-east-1");
    expect(JSON.stringify(profiles)).not.toContain("us-east-1");
    for (const entry of Object.values(models)) expect(entry.availability["us-east-1"]).toBeUndefined();
  });

  it("denied があっても残りのリージョンは正規化される", () => {
    const { models, fetchLog } = denied();
    expect(fetchLog.regions["ap-northeast-1"]).toEqual({ status: "ok", models: 5, profiles: 4 });
    expect(Object.keys(models).length).toBe(5);
  });

  it("fm だけ失敗したリージョンは partial として取れた側を載せる", () => {
    const { profiles, models, fetchLog } = normalizeSnapshot({
      regions: { "us-east-1": { ip: [IP_TOKYO], fmError: FM_DENY } },
    });
    expect(fetchLog.regions["us-east-1"].status).toBe("partial");
    expect(fetchLog.regions["us-east-1"].reason).toBe(redactAccountIds(FM_DENY));
    expect(fetchLog.regions["us-east-1"].models).toBe(0);
    expect(Object.keys(models).length).toBe(0);
    expect(profiles["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"].sources["us-east-1"]).toBeDefined();
  });

  it("ip だけ失敗したリージョンも partial", () => {
    const { profiles, fetchLog } = normalizeSnapshot({
      regions: { "us-east-1": { fm: FM_TOKYO, ipError: IP_DENY } },
    });
    expect(fetchLog.regions["us-east-1"]).toMatchObject({ status: "partial", models: 5, profiles: 0 });
    expect(Object.keys(profiles).length).toBe(0);
  });
});

describe("AC-011 アカウント ID を残さない", () => {
  it("生成した JSON 全体に 12 桁の数字列が現れない", () => {
    const { models, profiles, fetchLog } = normalizeSnapshot({
      regions: {
        "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] },
        "us-east-1": { error: FM_DENY },
      },
      generatedAt: "2026-09-14T08:10:00Z",
      accountKind: "sandbox",
    });
    // fixture の inferenceProfileArn とエラー文にはアカウント ID が入っている
    expect(JSON.stringify(IP_TOKYO)).toMatch(/\d{12}/);
    expect(FM_DENY).toMatch(/\d{12}/);
    for (const generated of [models, profiles, fetchLog]) {
      expect(JSON.stringify(generated)).not.toMatch(/\d{12}/);
    }
    expect(fetchLog.regions["us-east-1"].reason).toContain(ACCOUNT_ID_MASK);
  });

  it("inferenceProfileArn を保存せず、accountKind は引数の種別だけ", () => {
    const { profiles, fetchLog } = tokyoOnly();
    expect(JSON.stringify(profiles)).not.toContain("inferenceProfileArn");
    expect(JSON.stringify(profiles)).not.toContain("arn:aws:bedrock");
    expect(fetchLog.accountKind).toBe("sandbox");
  });
});

describe("AC-NFR-001 正規化の純粋性", () => {
  it("同じ入力を 2 回渡すと generatedAt 以外が完全に一致する", () => {
    const input = () => ({
      // キーの列挙順を入れ替えても結果が変わらないことも見る
      regions: {
        "us-east-1": { error: FM_DENY },
        "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] },
      },
      accountKind: "sandbox",
    });
    const first = normalizeSnapshot({ ...input(), generatedAt: "2026-09-14T08:10:00Z" });
    const second = normalizeSnapshot({ ...input(), generatedAt: "2026-10-01T00:00:00Z" });
    const strip = ({ models, profiles, fetchLog }) => ({
      models,
      profiles,
      fetchLog: { accountKind: fetchLog.accountKind, regions: fetchLog.regions },
    });
    expect(strip(second)).toEqual(strip(first));
    expect(JSON.stringify(strip(second))).toBe(JSON.stringify(strip(first)));
  });

  it("入力オブジェクトを書き換えない", () => {
    const before = JSON.stringify(FM_TOKYO);
    normalizeSnapshot({ regions: { "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] } } });
    expect(JSON.stringify(FM_TOKYO)).toBe(before);
  });

  it("複数リージョンの availability / sources キーがコード順に揃う", () => {
    const { models, profiles } = normalizeSnapshot({
      regions: {
        "us-west-2": { fm: FM_TOKYO, ip: [IP_TOKYO] },
        "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] },
        "eu-west-1": { fm: FM_TOKYO, ip: [IP_TOKYO] },
      },
    });
    expect(Object.keys(models["cohere.embed-v4:0"].availability)).toEqual([
      "ap-northeast-1",
      "eu-west-1",
      "us-west-2",
    ]);
    expect(Object.keys(profiles["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"].sources)).toEqual([
      "ap-northeast-1",
      "eu-west-1",
      "us-west-2",
    ]);
    expect(Object.keys(models)).toEqual([...Object.keys(models)].sort());
    expect(Object.keys(profiles)).toEqual([...Object.keys(profiles)].sort());
  });
});
