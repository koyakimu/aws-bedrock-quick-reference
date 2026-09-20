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
  classifyFetchError,
  CAUSES,
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
const FM_NOT_OPTED_IN = readText("fm-ap-east-2.err");
const FM_TIMEOUT = readText("fm-me-central-1.err");

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

  it("fetch-log に denied と分類が残り、models/profiles に一切現れない", () => {
    const { models, profiles, fetchLog } = denied();
    expect(fetchLog.regions["us-east-1"]).toEqual({ status: "denied", cause: "scp-deny" });
    expect(JSON.stringify(models)).not.toContain("us-east-1");
    expect(JSON.stringify(profiles)).not.toContain("us-east-1");
    for (const entry of Object.values(models)) expect(entry.availability["us-east-1"]).toBeUndefined();
  });

  it("エラー原文は fetch-log に一切残らない (D-008)", () => {
    const { fetchLog } = denied();
    const text = JSON.stringify(fetchLog);
    expect(text).not.toContain("reason");
    expect(text).not.toContain("AccessDenied");
    expect(text).not.toContain("service control policy");
    expect(text).not.toContain("aws: [ERROR]");
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
    expect(fetchLog.regions["us-east-1"]).toEqual({
      status: "partial",
      cause: "scp-deny",
      models: 0,
      profiles: 4,
    });
    expect(Object.keys(models).length).toBe(0);
    expect(profiles["jp.anthropic.claude-sonnet-4-5-20250929-v1:0"].sources["us-east-1"]).toBeDefined();
  });

  it("ip だけ失敗したリージョンも partial", () => {
    const { profiles, fetchLog } = normalizeSnapshot({
      regions: { "us-east-1": { fm: FM_TOKYO, ipError: IP_DENY } },
    });
    expect(fetchLog.regions["us-east-1"]).toMatchObject({
      status: "partial",
      cause: "scp-deny",
      models: 5,
      profiles: 0,
    });
    expect(Object.keys(profiles).length).toBe(0);
  });
});

describe("D-008 取得失敗の分類 (cause)", () => {
  it("fixture の原文がそれぞれの分類になる", () => {
    expect(classifyFetchError(FM_DENY)).toBe("scp-deny");
    expect(classifyFetchError(IP_DENY)).toBe("scp-deny");
    expect(classifyFetchError(FM_NOT_OPTED_IN)).toBe("not-opted-in");
    expect(classifyFetchError(FM_TIMEOUT)).toBe("timeout");
  });

  it("SCP の明示 Deny でない AccessDeniedException は access-denied", () => {
    expect(
      classifyFetchError(
        "\naws: [ERROR]: An error occurred (AccessDeniedException) when calling the ListFoundationModels operation: User: X is not authorized to perform: bedrock:ListFoundationModels\n",
      ),
    ).toBe("access-denied");
  });

  it("読めない原文・空文字・非文字列は other", () => {
    expect(classifyFetchError("something went wrong")).toBe("other");
    expect(classifyFetchError("")).toBe("other");
    expect(classifyFetchError("   ")).toBe("other");
    expect(classifyFetchError(null)).toBe("other");
    expect(classifyFetchError(undefined)).toBe("other");
  });

  it("戻り値は必ず CAUSES のどれか", () => {
    for (const text of [FM_DENY, IP_DENY, FM_NOT_OPTED_IN, FM_TIMEOUT, "x", ""]) {
      expect(CAUSES).toContain(classifyFetchError(text));
    }
  });

  it("純関数: 入力が同じなら何度呼んでも同じ値", () => {
    expect(classifyFetchError(FM_DENY)).toBe(classifyFetchError(FM_DENY));
  });
});

describe("AC-011 アカウント ID もエラー原文も残さない", () => {
  const generated = () =>
    normalizeSnapshot({
      regions: {
        "ap-northeast-1": { fm: FM_TOKYO, ip: [IP_TOKYO] },
        "us-east-1": { error: FM_DENY },
        "ap-east-2": { error: FM_NOT_OPTED_IN },
        "me-central-1": { error: FM_TIMEOUT },
      },
      generatedAt: "2026-09-14T08:10:00Z",
      accountKind: "sandbox",
    });

  it("生成した JSON 全体に識別子もエラー原文も現れない", () => {
    const { models, profiles, fetchLog } = generated();
    // 入力側には識別子が入っている
    expect(JSON.stringify(IP_TOKYO)).toMatch(/\d{12}/);
    expect(FM_DENY).toMatch(/\d{12}/);
    expect(FM_DENY).toMatch(/(?<![a-z])o-[a-z0-9]{10,}/);

    const patterns = [
      /\d{12}/,
      /arn:/,
      /AccessDenied/,
      /Exception/,
      // 直前が英字でないときだけ拾う。ap-northeast-1 の "p-northeast" は識別子ではない
      /(?<![a-z])o-[a-z0-9]{10,}/,
      /(?<![a-z])p-[a-z0-9]{8,}/,
      /AWSReservedSSO/,
      /assumed-role/,
      /service control policy/,
    ];
    for (const generatedJson of [models, profiles, fetchLog]) {
      const text = JSON.stringify(generatedJson);
      for (const pattern of patterns) expect(text, String(pattern)).not.toMatch(pattern);
    }
  });

  it("リージョンコードは生成物からも消えない (p-northeast などに誤爆しない)", () => {
    const { fetchLog } = generated();
    expect(Object.keys(fetchLog.regions)).toContain("ap-northeast-1");
    expect(Object.keys(fetchLog.regions)).toContain("ap-east-2");
    expect(Object.keys(fetchLog.regions)).toContain("me-central-1");
  });

  it("denied の行は status と cause だけを持つ", () => {
    const { fetchLog } = generated();
    expect(Object.keys(fetchLog.regions["us-east-1"]).sort()).toEqual(["cause", "status"]);
    expect(fetchLog.regions["ap-east-2"].cause).toBe("not-opted-in");
    expect(fetchLog.regions["me-central-1"].cause).toBe("timeout");
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

describe('launch dates from FoundationModelLifecycle', () => {
  it('keeps earliest valid launch time across Regions, including epoch seconds', () => {
    const model = date => ({modelId:'test.model', modelLifecycle:{status:'ACTIVE',startOfLifeTime:date}});
    const regions = {
      'us-east-1':{fm:{modelSummaries:[model('2026-09-02T00:00:00Z')]}},
      'us-west-2':{fm:{modelSummaries:[model(Date.parse('2026-09-01T00:00:00Z')/1000)]}},
      'ap-northeast-1':{fm:{modelSummaries:[model('invalid')]}},
    };
    const run = r => normalizeSnapshot({regions:r}).models['test.model'].releasedAt;
    expect(run(regions)).toBe('2026-09-01T00:00:00.000Z');
    expect(run(Object.fromEntries(Object.entries(regions).reverse()))).toBe(run(regions));
  });
  it('does not infer a launch date from the model ID', () => {
    const result=normalizeSnapshot({regions:{'us-east-1':{fm:{modelSummaries:[{modelId:'test.20260901',modelLifecycle:{status:'ACTIVE'}}]}}}});
    expect(result.models['test.20260901'].releasedAt).toBeNull();
  });
});

it('uses a sourced official launch date override instead of a prelaunch API timestamp', () => {
  const result=normalizeSnapshot({
    regions:{'ap-northeast-1':{fm:{modelSummaries:[{modelId:'moonshotai.kimi-k3',modelLifecycle:{status:'ACTIVE',startOfLifeTime:'2026-08-27T16:00:00Z'}}]}}},
    modelPolicies:{models:{'moonshotai.kimi-k3':{release:{date:'2026-09-18',sourceUrl:'https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html'}}}},
  });
  expect(result.models['moonshotai.kimi-k3'].releasedAt).toBe('2026-09-18T00:00:00.000Z');
});
