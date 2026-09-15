// MANTLE-001 の描画 (jsdom)。エンドポイント行・注記・Mantle 列・詳細パネルの接続先節。
import { describe, it, expect, beforeEach } from "vitest";
import { mountFixtureApp, bodyRows, rowFor, cells, $, regionNotes } from "./app-harness.js";
import { mountTableView } from "../src/scripts/table-view.js";
import { TOKYO, NON_MANTLE_REGION } from "./fixtures/bedrock-fixture.js";

const MANTLE_MODEL = "nvidia.nemotron-nano-12b-v2"; // docs で mantle 対応
const RUNTIME_ONLY = "anthropic.claude-sonnet-4-5-20250929-v1:0"; // docs で mantle 非対応
const UNLISTED = "amazon.titan-embed-text-v1:2:8k"; // docs の表にモデル名が載っている (非対応)

// Mantle 列は 備考 の 1 つ手前 = 最後から 2 番目。
const mantleCellOf = (modelId) => {
  const row = cells(rowFor(modelId));
  return row[row.length - 2];
};

let app;
beforeEach(() => {
  app = mountFixtureApp();
});

describe("AC-001 Mantle 提供リージョンのエンドポイント", () => {
  it("起点が東京なら bedrock-mantle.ap-northeast-1.api.aws がコピーボタン付きで出る", () => {
    expect(app.view.getRegion()).toBe(TOKYO);
    expect($("#mantle-endpoint-value").textContent).toBe("bedrock-mantle.ap-northeast-1.api.aws");
    expect($("#mantle-endpoint-value").hidden).toBe(false);
    expect($("#mantle-endpoint-copy").hidden).toBe(false);
    expect($("#mantle-endpoint-label").textContent).toBe("Mantle:");
  });

  it("起点を切り替えると Mantle の FQDN も切り替わる", () => {
    app.view.setRegion("us-east-1");
    expect($("#mantle-endpoint-value").textContent).toBe("bedrock-mantle.us-east-1.api.aws");
  });

  it("bedrock-runtime のエンドポイント行はそのまま残る (TABLE-001 AC-002)", () => {
    expect($("#endpoint-value").textContent).toBe("bedrock-runtime.ap-northeast-1.amazonaws.com");
    expect($("#endpoint-copy")).not.toBeNull();
  });
});

describe("AC-002 Mantle 提供外のリージョン", () => {
  beforeEach(() => {
    app.view.setRegion(NON_MANTLE_REGION);
  });

  it("「Mantle: このリージョンでは提供なし」とだけ出る", () => {
    expect($("#mantle-endpoint-label").textContent).toBe("Mantle: このリージョンでは提供なし");
  });

  it("FQDN もコピーボタンも出さない", () => {
    expect($("#mantle-endpoint-value").textContent).toBe("");
    expect($("#mantle-endpoint-value").hidden).toBe(true);
    expect($("#mantle-endpoint-copy").hidden).toBe(true);
    expect($("#mantle-endpoint-line").textContent).not.toContain(".api.aws");
  });
});

describe("AC-003 Mantle 列", () => {
  it("列は 備考 の 1 つ手前 (最後から 2 番目)", () => {
    const keys = [...document.querySelectorAll("thead th")].map((th) => th.dataset.key);
    expect(keys[keys.length - 2]).toBe("mantle");
    expect(keys[keys.length - 1]).toBe("notes");
  });

  it("mantle 対応モデル × 提供リージョンは ✓", () => {
    const cell = mantleCellOf(MANTLE_MODEL);
    expect(cell.textContent).toContain("✓");
    expect(cell.querySelector(".flag-yes")).not.toBeNull();
  });

  it("✓ のセルは素のモデル ID をツールチップに持つ", () => {
    const wrap = mantleCellOf(MANTLE_MODEL).querySelector(".cell-mantle");
    expect(wrap.dataset.mantleModelId).toBe(MANTLE_MODEL);
    expect(wrap.title).toContain(MANTLE_MODEL);
    // 接頭辞付きのプロファイル ID は出さない。
    expect(wrap.title).not.toMatch(/\b(us|eu|apac|au|jp|global)\./);
  });

  it("mantle 非対応モデルは「—」", () => {
    const cell = mantleCellOf(RUNTIME_ONLY);
    expect(cell.textContent).toBe("—");
    expect(cell.querySelector(".flag-yes")).toBeNull();
  });

  it("起点が Mantle 提供外なら、対応モデルでも「—」", () => {
    app.view.setRegion(NON_MANTLE_REGION);
    expect(mantleCellOf(MANTLE_MODEL).textContent).toBe("—");
  });

  it("「—」のセルは理由をツールチップに持つ", () => {
    expect(mantleCellOf(RUNTIME_ONLY).querySelector(".cell-mantle").title).toBe(
      "このモデルは bedrock-mantle では提供されていません",
    );
    app.view.setRegion(NON_MANTLE_REGION);
    expect(mantleCellOf(MANTLE_MODEL).querySelector(".cell-mantle").title).toBe(
      "Mantle: このリージョンでは提供なし",
    );
  });

  it("全ての行に Mantle 列のセルがある", () => {
    for (const tr of bodyRows()) {
      const row = cells(tr);
      expect(row[row.length - 2].querySelector(".cell-mantle"), tr.dataset.modelId).not.toBeNull();
    }
  });
});

describe("AC-004 cross-region inference が使えない注記", () => {
  it("エンドポイント行の近くに 1 行で出る", () => {
    const note = $("#mantle-no-cris");
    expect(note).not.toBeNull();
    expect(note.textContent).toBe(
      "Mantle では地理圏・全世界への振り分け（cross-region inference）は使えません",
    );
    // 接続先の表示と同じ枠の中にある。
    expect($("#source-bar").contains(note)).toBe(true);
  });

  it("Mantle 提供外のリージョンでも注記は消えない", () => {
    app.view.setRegion(NON_MANTLE_REGION);
    expect($("#mantle-no-cris").textContent).toContain("cross-region inference");
  });
});

describe("AC-005 詳細パネルの接続先 (DETAIL-001 v8 AC-010 の見出し行)", () => {
  const headOf = (modelId) => {
    app.detail.openRow(modelId);
    return document.querySelector(`tr.detail-row[data-model-id="${modelId}"] .head-grid`);
  };
  const mantleItem = (head) => head.querySelector('[data-item="detail.mantleEndpoint"]');

  it("見出し行の 2 項目目が bedrock-runtime、3 項目目が bedrock-mantle", () => {
    const head = headOf(MANTLE_MODEL);
    expect([...head.children].map((item) => item.dataset.item)).toEqual([
      "detail.modelId",
      "detail.runtimeEndpoint",
      "detail.mantleEndpoint",
    ]);
    expect(head.textContent).toContain("bedrock-runtime.ap-northeast-1.amazonaws.com");
    expect(head.textContent).toContain("bedrock-mantle.ap-northeast-1.api.aws");
  });

  it("bedrock-runtime の項目にも呼べる API が書かれている (AC-005 項目 2)", () => {
    const item = headOf(MANTLE_MODEL).querySelector('[data-item="detail.runtimeEndpoint"]');
    const apis = item.querySelector(".detail-endpoint-apis").textContent;
    expect(apis).toContain("InvokeModel");
    expect(apis).toContain("Converse");
    expect(apis).toContain("OpenAI Responses");
    expect(apis).toContain("Anthropic Messages");
  });

  it("mantle の項目には呼べる API が書かれている (InvokeModel / Converse は無い)", () => {
    const item = mantleItem(headOf(MANTLE_MODEL));
    const apis = item.querySelector(".detail-endpoint-apis").textContent;
    expect(apis).toContain("OpenAI Responses");
    expect(apis).toContain("Chat Completions");
    expect(apis).toContain("Anthropic Messages");
    expect(apis).not.toContain("InvokeModel");
    expect(apis).not.toContain("Converse");
  });

  it("Mantle で指定するモデル ID がコピーボタン付きで出る", () => {
    const line = mantleItem(headOf(MANTLE_MODEL)).querySelector(".detail-mantle-model-id");
    expect(line.textContent).toContain(MANTLE_MODEL);
    expect(line.querySelector(".copy-btn").dataset.copy).toBe(MANTLE_MODEL);
  });

  it("mantle 非対応モデルでは ID の代わりに理由を出す", () => {
    const item = mantleItem(headOf(RUNTIME_ONLY));
    expect(item.querySelector(".detail-mantle-none").textContent).toBe(
      "このモデルは bedrock-mantle では提供されていません",
    );
    expect(item.querySelector(".detail-mantle-model-id .copy-btn")).toBeNull();
  });

  it("Mantle 提供外のリージョンでは 3 項目目ごと出さない", () => {
    app.view.setRegion(NON_MANTLE_REGION);
    const head = headOf(MANTLE_MODEL);
    expect(mantleItem(head)).toBeNull();
    expect(head.textContent).not.toContain(".api.aws");
    // bedrock-runtime の項目は残る（FQDN と呼べる API の両方）。
    expect(head.querySelector(".detail-endpoint-value").textContent).toBe(
      "bedrock-runtime.ap-northeast-3.amazonaws.com",
    );
    expect(head.querySelector(".detail-endpoint-apis").textContent).toContain("InvokeModel");
  });

  it("cross-region inference が使えないことも書かれている", () => {
    expect(
      mantleItem(headOf(MANTLE_MODEL)).querySelector(".detail-mantle-no-cris").textContent,
    ).toContain("cross-region inference");
  });

  it("DETAIL-001 v8 AC-010 の起点エンドポイントはどのモデルでも残る", () => {
    expect(headOf(UNLISTED).querySelector(".detail-endpoint-value").textContent).toBe(
      "bedrock-runtime.ap-northeast-1.amazonaws.com",
    );
  });
});

describe("AC-006 出典リンク", () => {
  it("詳細パネルの接続先節に転記元 docs へのリンクがある", () => {
    app.detail.openRow(MANTLE_MODEL);
    const link = document.querySelector(".head-grid .detail-mantle-source .doc-link");
    expect(link.href).toBe(
      "https://docs.aws.amazon.com/bedrock/latest/userguide/models-endpoint-availability.html",
    );
    expect(link.rel).toBe("noreferrer");
  });
});

describe("AC-007 mantle データが無いとき", () => {
  it("列は全て「—」、エンドポイント行は「提供なし」、落ちない", () => {
    // mantle を渡さずに組み立て直す (データが用意されていない状態)。
    const host = document.createElement("main");
    document.body.replaceChildren(host);
    const view = mountTableView({
      host,
      models: app.snapshot.models,
      profiles: app.snapshot.profiles,
      fetchLog: app.snapshot.fetchLog,
      regionNotes,
      // mantle は渡さない
    });
    expect(view.getRegion()).toBe(TOKYO);
    expect(host.querySelector("#mantle-endpoint-label").textContent).toBe(
      "Mantle: このリージョンでは提供なし",
    );
    for (const tr of host.querySelectorAll("tbody tr[data-model-id]")) {
      const tds = [...tr.children];
      expect(tds[tds.length - 2].textContent, tr.dataset.modelId).toBe("—");
    }
  });
});
