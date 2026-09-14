// TABLE-001 AC-003 / AC-004 / AC-005 の判定ルール (D-003) を純関数として検証する。
import { describe, it, expect } from "vitest";
import {
  judgeInRegion,
  judgeGeo,
  judgeGlobal,
  regionStatus,
  deniedRegions,
  selectableRegions,
  endpointOf,
  buildViewModel,
  GEO_PREFIXES,
} from "../src/scripts/bedrock-view-model.mjs";
import {
  buildSnapshot,
  buildOverrides,
  regionNotes,
  TOKYO,
  DENIED_REGION,
  EMPTY_REGION,
} from "./fixtures/bedrock-fixture.js";

const R = "ap-northeast-1";

// AC-003: ON_DEMAND を含むかどうかだけで決まる。PROVISIONED は判定に使わない。
describe("AC-003 judgeInRegion", () => {
  const models = {
    "m.on-demand": { availability: { [R]: ["ON_DEMAND"] } },
    "m.profile-only": { availability: { [R]: ["INFERENCE_PROFILE"] } },
    "m.both": { availability: { [R]: ["INFERENCE_PROFILE", "ON_DEMAND"] } },
    "m.empty": { availability: { [R]: [] } },
    "m.provisioned": { availability: { [R]: ["PROVISIONED"] } },
  };

  it("ON_DEMAND のみは可", () => {
    expect(judgeInRegion(models, "m.on-demand", R)).toBe(true);
  });

  it("INFERENCE_PROFILE のみは不可", () => {
    expect(judgeInRegion(models, "m.profile-only", R)).toBe(false);
  });

  it("両方を含むなら可", () => {
    expect(judgeInRegion(models, "m.both", R)).toBe(true);
  });

  it("空配列は不可", () => {
    expect(judgeInRegion(models, "m.empty", R)).toBe(false);
  });

  it("PROVISIONED だけでは可にならない", () => {
    expect(judgeInRegion(models, "m.provisioned", R)).toBe(false);
  });

  it("そのリージョンに記録が無いモデルは不可", () => {
    expect(judgeInRegion(models, "m.on-demand", "eu-west-1")).toBe(false);
    expect(judgeInRegion(models, "m.unknown", R)).toBe(false);
  });
});

// AC-004: 接頭辞 5 種を拾い、destination は昇順。複数プロファイルは全て並べる。
describe("AC-004 judgeGeo", () => {
  const profiles = Object.fromEntries(
    GEO_PREFIXES.map((prefix) => [
      `${prefix}.m.target`,
      { prefix, modelId: "m.target", sources: { [R]: ["z-region-9", "a-region-1"] } },
    ]),
  );

  it("接頭辞 us / eu / apac / au / jp を全て拾う", () => {
    const geo = judgeGeo(profiles, "m.target", R);
    expect(geo.map((entry) => entry.prefix).sort()).toEqual([...GEO_PREFIXES].sort());
  });

  it("destination を昇順に並べる", () => {
    const geo = judgeGeo(profiles, "m.target", R);
    for (const entry of geo) expect(entry.destinations).toEqual(["a-region-1", "z-region-9"]);
  });

  it("同じモデルに複数のプロファイルがあれば全て並べ、profileId の昇順にする", () => {
    const geo = judgeGeo(profiles, "m.target", R);
    expect(geo.map((entry) => entry.profileId)).toEqual(
      [...geo.map((entry) => entry.profileId)].sort(),
    );
    expect(geo).toHaveLength(GEO_PREFIXES.length);
  });

  it("global 接頭辞は Geo に混ぜない", () => {
    const withGlobal = {
      ...profiles,
      "global.m.target": { prefix: "global", modelId: "m.target", sources: { [R]: ["*"] } },
    };
    expect(judgeGeo(withGlobal, "m.target", R).map((e) => e.prefix)).not.toContain("global");
  });

  it("sources に起点リージョンが無いプロファイルは拾わない", () => {
    const elsewhere = {
      "us.m.target": { prefix: "us", modelId: "m.target", sources: { "us-east-1": ["us-east-1"] } },
    };
    expect(judgeGeo(elsewhere, "m.target", R)).toEqual([]);
  });

  it("該当が無ければ空配列", () => {
    expect(judgeGeo(profiles, "m.other", R)).toEqual([]);
  });

  it("入力の destinations 配列を破壊しない", () => {
    const sources = { [R]: ["z", "a"] };
    const input = { "us.m.x": { prefix: "us", modelId: "m.x", sources } };
    judgeGeo(input, "m.x", R);
    expect(sources[R]).toEqual(["z", "a"]);
  });
});

// AC-005: global 接頭辞だけを拾い、["*"] を destination 列挙に展開しない。
describe("AC-005 judgeGlobal", () => {
  const profiles = {
    "global.m.target": { prefix: "global", modelId: "m.target", sources: { [R]: ["*"] } },
    "jp.m.target": { prefix: "jp", modelId: "m.target", sources: { [R]: [R] } },
  };

  it("global 接頭辞のプロファイルを返す", () => {
    expect(judgeGlobal(profiles, "m.target", R)).toEqual({
      profileId: "global.m.target",
      prefix: "global",
    });
  });

  it("destination を持たない (\"*\" を展開しない)", () => {
    const result = judgeGlobal(profiles, "m.target", R);
    expect(JSON.stringify(result)).not.toContain("*");
    expect(result.destinations).toBeUndefined();
  });

  it("global が無ければ null", () => {
    expect(judgeGlobal({ "jp.m.target": profiles["jp.m.target"] }, "m.target", R)).toBeNull();
  });

  it("sources に起点リージョンが無ければ null", () => {
    expect(judgeGlobal(profiles, "m.target", "eu-west-1")).toBeNull();
  });
});

describe("fetch-log の読み取り", () => {
  const { fetchLog } = buildSnapshot();

  it("denied のリージョンは status と reason を返す", () => {
    const status = regionStatus(fetchLog, DENIED_REGION);
    expect(status.status).toBe("denied");
    expect(status.reason).toContain("AccessDeniedException");
  });

  it("ok のリージョンは件数を返す", () => {
    expect(regionStatus(fetchLog, TOKYO)).toMatchObject({ status: "ok", models: 5, profiles: 4 });
  });

  it("記録が無いリージョンは unknown", () => {
    expect(regionStatus(fetchLog, "sa-east-1").status).toBe("unknown");
  });

  it("denied のリージョン一覧を昇順で返す", () => {
    expect(deniedRegions(fetchLog)).toEqual([DENIED_REGION]);
  });
});

describe("リージョンの列挙とエンドポイント", () => {
  it("region-notes.json のキー全件 (_source を除く) が選択肢", () => {
    const regions = selectableRegions(regionNotes);
    expect(regions).not.toContain("_source");
    expect(regions).toContain(TOKYO);
    expect(regions).toHaveLength(Object.keys(regionNotes).length - 1);
  });

  it("エンドポイントは region-notes.json の値", () => {
    expect(endpointOf(regionNotes, TOKYO)).toBe("bedrock-runtime.ap-northeast-1.amazonaws.com");
  });
});

describe("buildViewModel", () => {
  const { models, profiles, fetchLog } = buildSnapshot();
  const base = { models, profiles, fetchLog, regionNotes };

  it("東京では 5 行を provider → modelId 順で返す", () => {
    const view = buildViewModel({ ...base, region: TOKYO });
    expect(view.rows.map((row) => row.modelId)).toEqual([
      "amazon.nova-lite-v1:0",
      "amazon.titan-embed-text-v1:2:8k",
      "anthropic.claude-sonnet-4-5-20250929-v1:0",
      "cohere.embed-v4:0",
      "nvidia.nemotron-nano-12b-v2",
    ]);
  });

  it("各行が In-Region / Geo / Global の判定を持つ", () => {
    const view = buildViewModel({ ...base, region: TOKYO });
    const byId = Object.fromEntries(view.rows.map((row) => [row.modelId, row]));

    expect(byId["nvidia.nemotron-nano-12b-v2"].inRegion).toBe(true);
    expect(byId["anthropic.claude-sonnet-4-5-20250929-v1:0"].inRegion).toBe(false);
    expect(byId["amazon.nova-lite-v1:0"].geo.map((e) => e.profileId)).toEqual([
      "apac.amazon.nova-lite-v1:0",
    ]);
    expect(byId["anthropic.claude-sonnet-4-5-20250929-v1:0"].global.profileId).toBe(
      "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    );
    expect(byId["nvidia.nemotron-nano-12b-v2"].global).toBeNull();
  });

  // AC-009: denied は 0 行 + reason 原文。
  it("denied のリージョンは 0 行で reason を持つ", () => {
    const view = buildViewModel({ ...base, region: DENIED_REGION });
    expect(view.status).toBe("denied");
    expect(view.rows).toEqual([]);
    expect(view.reason).toContain("AccessDeniedException");
  });

  // AC-010: ok かつ 0 件は「提供なし」。reason は無い。
  it("ok かつモデル 0 件のリージョンは 0 行だが status は ok", () => {
    const view = buildViewModel({ ...base, region: EMPTY_REGION });
    expect(view.status).toBe("ok");
    expect(view.rows).toEqual([]);
    expect(view.reason).toBeNull();
  });

  it("脚注に使う情報を持つ", () => {
    const view = buildViewModel({ ...base, region: TOKYO });
    expect(view.generatedAt).toBe("2026-09-14T08:10:00Z");
    expect(view.accountKind).toBe("sandbox");
    expect(view.deniedRegions).toEqual([DENIED_REGION]);
  });

  it("overrides.json の備考を行に載せる", () => {
    const overrides = buildOverrides("cohere.embed-v4:0", "global.cohere.embed-v4:0");
    const view = buildViewModel({ ...base, region: TOKYO, overrides });
    const row = view.rows.find((r) => r.modelId === "cohere.embed-v4:0");
    expect(row.notes.map((entry) => entry.id)).toEqual([
      "cohere.embed-v4:0",
      "global.cohere.embed-v4:0",
    ]);
    expect(row.notes[0].note.ja).toBe("モデルの備考");
  });

  it("_comment は備考として扱わない", () => {
    const view = buildViewModel({
      ...base,
      region: TOKYO,
      overrides: { _comment: "説明" },
    });
    expect(view.rows.every((row) => row.notes.length === 0)).toBe(true);
  });
});
