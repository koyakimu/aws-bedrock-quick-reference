// @vitest-environment node
// REGIONS-001 の純関数 (AC-003 / AC-004 / AC-005 / AC-009)。
import { describe, it, expect } from "vitest";
import regionNotes from "../data/region-notes.json";
import models from "../data/models.json";
import {
  ALL_GEO,
  CELL_BLANK,
  CELL_NONE,
  CELL_PROFILE,
  CELL_YES,
  buildMatrixColumns,
  buildMatrixRows,
  geoChipOptions,
  matrixCellState,
  matrixColumnGroups,
  unfetchedRegionCount,
} from "../src/scripts/regions-model.mjs";
import { SORT_ALPHA, SORT_PINNED, orderRows } from "../src/scripts/bedrock-view-model.mjs";

const regionCount = Object.keys(regionNotes).filter((key) => key !== "_source").length;

describe("AC-004 列の構成と地理圏のグループ", () => {
  const columns = buildMatrixColumns(regionNotes);

  it("region-notes.json のキー全件が 1 列ずつ並ぶ", () => {
    expect(columns).toHaveLength(regionCount);
    expect(columns.map((column) => column.code)).toEqual(
      expect.arrayContaining(["ap-northeast-1", "us-east-1", "eu-central-1"]),
    );
    expect(columns.map((column) => column.code)).not.toContain("_source");
    expect(new Set(columns.map((column) => column.code)).size).toBe(regionCount);
  });

  it("グループの並びが jp → apac → eu → us → au → 残り昇順 → other", () => {
    const geos = matrixColumnGroups(columns).map((group) => group.geo);
    expect(geos.slice(0, 5)).toEqual(["jp", "apac", "eu", "us", "au"]);
    expect(geos[geos.length - 1]).toBe("other");
    const rest = geos.slice(5, -1);
    expect(rest).toEqual([...rest].sort());
  });

  it("グループ内はリージョンコードの昇順で、先頭の列に印が付く", () => {
    for (const group of matrixColumnGroups(columns)) {
      expect(group.codes).toEqual([...group.codes].sort());
    }
    const starts = columns.filter((column) => column.groupStart).map((column) => column.geo);
    expect(starts).toEqual(matrixColumnGroups(columns).map((group) => group.geo));
  });

  it("未知の geo もグループになる (固定リストを持たない)", () => {
    const notes = {
      _source: { date: "2026-09-15" },
      "xx-test-1": { ja: "試験", en: "Test", geo: "zz" },
      "ap-northeast-1": regionNotes["ap-northeast-1"],
    };
    const groups = matrixColumnGroups(buildMatrixColumns(notes));
    expect(groups.map((group) => group.geo)).toEqual(["jp", "zz"]);
  });

  it("geo が無いリージョンは other に入る", () => {
    const notes = { "xx-test-1": { ja: "試験", en: "Test" } };
    expect(buildMatrixColumns(notes)).toEqual([{ code: "xx-test-1", geo: "other", groupStart: true }]);
  });

  it("colspan の合計が列数に一致する", () => {
    const total = matrixColumnGroups(columns).reduce((sum, group) => sum + group.codes.length, 0);
    expect(total).toBe(columns.length);
  });
});

describe("AC-009 地域チップの選択肢", () => {
  it("「すべて」+ 実在する geo が列の並びで並ぶ", () => {
    const options = geoChipOptions(regionNotes);
    expect(options[0]).toBe(ALL_GEO);
    expect(options.slice(1)).toEqual(
      matrixColumnGroups(buildMatrixColumns(regionNotes)).map((group) => group.geo),
    );
  });
});

describe("AC-005 セルの 4 状態", () => {
  it("ON_DEMAND を含むと ●", () => {
    expect(matrixCellState(["ON_DEMAND"], "ok")).toEqual({ state: CELL_YES, unspecified: false });
    expect(matrixCellState(["ON_DEMAND", "INFERENCE_PROFILE"], "ok").state).toBe(CELL_YES);
  });

  it("INFERENCE_PROFILE のみ / PROVISIONED のみ / [] は ○", () => {
    expect(matrixCellState(["INFERENCE_PROFILE"], "ok")).toEqual({
      state: CELL_PROFILE,
      unspecified: false,
    });
    // PROVISIONED を「提供なし」に倒さない (DETAIL-001 v7 AC-002 の引き継ぎ)。
    expect(matrixCellState(["PROVISIONED"], "ok")).toEqual({
      state: CELL_PROFILE,
      unspecified: false,
    });
    expect(matrixCellState([], "ok")).toEqual({ state: CELL_PROFILE, unspecified: true });
  });

  it("status が ok でキーが無ければ —", () => {
    expect(matrixCellState(undefined, "ok")).toEqual({ state: CELL_NONE, unspecified: false });
  });

  it("status が ok 以外なら空欄", () => {
    expect(matrixCellState(undefined, "denied")).toEqual({ state: CELL_BLANK, unspecified: false });
    expect(matrixCellState(["ON_DEMAND"], "partial").state).toBe(CELL_BLANK);
    expect(matrixCellState(undefined, null).state).toBe(CELL_BLANK);
  });

  it("返り値に cause を含まない (D-008)", () => {
    for (const status of ["ok", "denied", "partial"]) {
      const result = matrixCellState(["ON_DEMAND"], status);
      expect(Object.keys(result).sort()).toEqual(["state", "unspecified"]);
      expect(JSON.stringify(result)).not.toContain("cause");
    }
  });
});

describe("AC-003 行の並び", () => {
  it("pinned / alpha とも TABLE-001 と同じ並びになる", () => {
    for (const sort of [SORT_PINNED, SORT_ALPHA]) {
      const rows = buildMatrixRows(models, { sort });
      const expected = orderRows(
        Object.entries(models).map(([modelId, model]) => ({
          modelId,
          provider: model.provider ?? "",
          name: model.name ?? "",
        })),
        { sort },
      );
      expect(rows.map((row) => row.modelId)).toEqual(expected.map((row) => row.modelId));
    }
  });

  it("pinned では Anthropic → OpenAI が先頭、alpha では名前の昇順", () => {
    const pinned = buildMatrixRows(models, { sort: SORT_PINNED });
    expect(pinned[0].provider).toBe("Anthropic");
    const alpha = buildMatrixRows(models, { sort: SORT_ALPHA });
    const providers = [...new Set(alpha.map((row) => row.provider))];
    expect(providers).toEqual([...providers].sort((a, b) => a.localeCompare(b, "ja")));
  });

  it("プロバイダ名は先頭行にだけ入り、境目に印が付く", () => {
    const rows = buildMatrixRows(models, { sort: SORT_PINNED });
    let previous = null;
    for (const row of rows) {
      const first = row.provider !== previous;
      expect(row.providerStart).toBe(first);
      expect(row.providerName).toBe(first ? row.provider : "");
      previous = row.provider;
    }
    expect(rows.filter((row) => row.providerStart)).toHaveLength(
      new Set(rows.map((row) => row.provider)).size,
    );
  });

  it("行の母集団は models.json の全件で、起点で増減しない", () => {
    expect(buildMatrixRows(models, { sort: SORT_PINNED })).toHaveLength(Object.keys(models).length);
  });
});

describe("AC-007 未取得のリージョン数", () => {
  it("status が ok 以外の件数を数える", () => {
    expect(unfetchedRegionCount({ regions: {} })).toBe(0);
    expect(
      unfetchedRegionCount({
        regions: {
          a: { status: "ok" },
          b: { status: "denied", cause: "scp-deny" },
          c: { status: "partial", cause: "timeout" },
        },
      }),
    ).toBe(2);
  });
});
