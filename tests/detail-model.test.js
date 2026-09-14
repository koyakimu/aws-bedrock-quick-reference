// DETAIL-001 の単体テスト。AC-002 / 003 / 004 / 005 / 006 / 008 / 009。
import { describe, it, expect } from "vitest";
import {
  buildAvailabilityRows,
  buildDetail,
  buildProfileRows,
} from "../src/scripts/detail-model.mjs";
import { selectableRegions } from "../src/scripts/bedrock-view-model.mjs";
import {
  buildSnapshot,
  regionNotes,
  DENIED_REGION,
  TOKYO,
} from "./fixtures/bedrock-fixture.js";

const snapshot = buildSnapshot();
const CLAUDE = "anthropic.claude-sonnet-4-5-20250929-v1:0";
const TITAN = "amazon.titan-embed-text-v1:2:8k";
const NVIDIA = "nvidia.nemotron-nano-12b-v2";

const availability = (modelId) =>
  buildAvailabilityRows(modelId, {
    models: snapshot.models,
    regionNotes,
    fetchLog: snapshot.fetchLog,
  });
const rowFor = (modelId, region) => availability(modelId).find((row) => row.region === region);

// --- AC-002 全リージョン横断の availability ---
describe("DETAIL-001 AC-002 全リージョン横断の availability", () => {
  it("region-notes.json のキー全件について 1 行返す", () => {
    const rows = availability(CLAUDE);
    expect(rows).toHaveLength(selectableRegions(regionNotes).length);
    expect(rows.map((row) => row.region)).toEqual(selectableRegions(regionNotes));
  });

  it("推論タイプはそのままの名前で並べ、PROVISIONED も落とさない", () => {
    const models = {
      "vendor.model": {
        availability: { [TOKYO]: ["ON_DEMAND", "INFERENCE_PROFILE", "PROVISIONED"] },
      },
    };
    const row = buildAvailabilityRows("vendor.model", {
      models,
      regionNotes,
      fetchLog: snapshot.fetchLog,
    }).find((entry) => entry.region === TOKYO);
    expect(row.kind).toBe("types");
    expect(row.types).toEqual(["ON_DEMAND", "INFERENCE_PROFILE", "PROVISIONED"]);
  });
});

// --- AC-003 提供なし ---
describe("DETAIL-001 AC-003 提供なしの表示", () => {
  it("status: ok かつ availability にキーが無いリージョンは「提供なし」種別", () => {
    // eu-west-1 は取得できているがモデルが 1 件も無い
    const row = rowFor(CLAUDE, "eu-west-1");
    expect(row.kind).toBe("none");
    expect(row.types).toEqual([]);
    expect(row.reason).toBeNull();
  });
});

// --- AC-004 空配列 ---
describe("DETAIL-001 AC-004 空配列の表示", () => {
  it("availability[R] が [] なら「提供あり・推論タイプの指定なし」種別", () => {
    const row = rowFor(TITAN, TOKYO);
    expect(row.kind).toBe("empty");
  });

  it("提供なし / データなし とは別種別", () => {
    expect(rowFor(TITAN, TOKYO).kind).not.toBe(rowFor(TITAN, "eu-west-1").kind);
    expect(rowFor(TITAN, TOKYO).kind).not.toBe(rowFor(TITAN, DENIED_REGION).kind);
    expect(rowFor(TITAN, "eu-west-1").kind).not.toBe(rowFor(TITAN, DENIED_REGION).kind);
  });
});

// --- AC-005 プロファイルの起点 → 推論先 ---
describe("DETAIL-001 AC-005 プロファイルの起点 → 推論先", () => {
  it("jp. プロファイルは起点ごとに 1 行、destination は昇順", () => {
    const profiles = {
      "jp.anthropic.claude-sonnet-4-5-20250929-v1:0": {
        prefix: "jp",
        modelId: CLAUDE,
        name: "JP",
        sources: {
          "ap-northeast-3": ["ap-northeast-3", "ap-northeast-1"],
          "ap-northeast-1": ["ap-northeast-3", "ap-northeast-1"],
        },
      },
    };
    const rows = buildProfileRows(CLAUDE, profiles);
    expect(rows).toHaveLength(1);
    expect(rows[0].prefix).toBe("jp");
    expect(rows[0].sources).toEqual([
      { source: "ap-northeast-1", allRegions: false, destinations: ["ap-northeast-1", "ap-northeast-3"] },
      { source: "ap-northeast-3", allRegions: false, destinations: ["ap-northeast-1", "ap-northeast-3"] },
    ]);
  });

  it("複数プロファイルは profileId 昇順で並ぶ", () => {
    const rows = buildProfileRows(CLAUDE, snapshot.profiles);
    expect(rows.map((row) => row.profileId)).toEqual([
      "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
    ]);
  });
});

// --- AC-006 Global の推論先 ---
describe("DETAIL-001 AC-006 Global の推論先", () => {
  it("['*'] は注記種別に変換され、返り値に '*' の文字が含まれない", () => {
    const rows = buildProfileRows(CLAUDE, snapshot.profiles);
    const global = rows.find((row) => row.prefix === "global");
    expect(global.isGlobal).toBe(true);
    expect(global.sources[0].allRegions).toBe(true);
    expect(global.sources[0].destinations).toEqual([]);
    expect(JSON.stringify(rows)).not.toContain("*");
  });
});

// --- AC-008 denied は「データなし」 ---
describe("DETAIL-001 AC-008 denied リージョンは「データなし」", () => {
  it("denied のリージョンは nodata 種別で、reason の原文を持つ", () => {
    const row = rowFor(CLAUDE, DENIED_REGION);
    expect(row.kind).toBe("nodata");
    expect(row.reason).toContain("AccessDeniedException");
  });

  it("「提供なし」と種別が異なる (取得できていないだけのリージョンを提供なしにしない)", () => {
    expect(rowFor(CLAUDE, DENIED_REGION).kind).toBe("nodata");
    expect(rowFor(CLAUDE, "eu-west-1").kind).toBe("none");
  });

  it("buildDetail が denied の原文を脚注用に集める", () => {
    const detail = buildDetail(CLAUDE, {
      models: snapshot.models,
      profiles: snapshot.profiles,
      fetchLog: snapshot.fetchLog,
      regionNotes,
      region: TOKYO,
    });
    expect(detail.deniedReasons.map((entry) => entry.region)).toEqual([DENIED_REGION]);
    expect(detail.deniedReasons[0].reason).toContain("explicit deny in a service control policy");
  });
});

// --- AC-009 対象プロファイルが 1 件も無い ---
describe("DETAIL-001 AC-009 対象プロファイルが 1 件も無い", () => {
  it("hasProfiles: false で空の配列を返す", () => {
    const detail = buildDetail(NVIDIA, {
      models: snapshot.models,
      profiles: snapshot.profiles,
      fetchLog: snapshot.fetchLog,
      regionNotes,
      region: TOKYO,
    });
    expect(detail.profiles).toEqual([]);
    expect(detail.hasProfiles).toBe(false);
  });
});
