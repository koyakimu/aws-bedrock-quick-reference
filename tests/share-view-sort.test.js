// SHARE-001 v4 AC-011 / AC-013: URL の view= と sort=。
// 値は origin / regions と pinned / alpha の 2 つずつで、既定は URL から省く。
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_STATE,
  PARAM_ORDER,
  parseState,
  serializeState,
} from "../src/scripts/url-state.mjs";
import { buildLimitOptions } from "../src/scripts/filter-model.mjs";
import { buildSnapshot, regionNotes } from "./fixtures/bedrock-fixture.js";
import { mountFixtureApp, bodyRows } from "./app-harness.js";

const snapshot = buildSnapshot();
const vocab = {
  regions: Object.keys(regionNotes).filter((key) => key !== "_source"),
  providers: ["Amazon", "Anthropic", "Cohere", "NVIDIA"],
  limitOptions: buildLimitOptions({ regionNotes, profiles: snapshot.profiles }),
};

describe("SHARE-001 AC-011 / AC-013 url-state (単体)", () => {
  it("既定は view=origin / sort=pinned で、どちらも URL から省かれる", () => {
    expect(DEFAULT_STATE.view).toBe("origin");
    expect(DEFAULT_STATE.sort).toBe("pinned");
    expect(serializeState({ view: "origin", sort: "pinned" })).toBe("");
  });

  it("既定でない値は載る", () => {
    expect(serializeState({ view: "regions" })).toBe("view=regions");
    expect(serializeState({ sort: "alpha" })).toBe("sort=alpha");
    expect(serializeState({ view: "regions", sort: "alpha", region: "eu-central-1" })).toBe(
      "view=regions&region=eu-central-1&sort=alpha",
    );
  });

  it("並びは view → region → sort → 既存のパラメータ", () => {
    expect([...PARAM_ORDER].slice(0, 3)).toEqual(["view", "region", "sort"]);
  });

  it("往復する", () => {
    for (const view of ["origin", "regions"]) {
      for (const sort of ["pinned", "alpha"]) {
        const query = serializeState({ view, sort });
        const { state, ignored } = parseState(`?${query}`, vocab);
        expect(state.view).toBe(view);
        expect(state.sort).toBe(sort);
        expect(ignored).toEqual([]);
      }
    }
  });

  it("未知の値は無視して既定に倒し、報告する (AC-008 と同じ扱い)", () => {
    const { state, ignored } = parseState("?view=galaxy&sort=random&region=eu-central-1", vocab);
    expect(state.view).toBe("origin");
    expect(state.sort).toBe("pinned");
    expect(state.region).toBe("eu-central-1");
    expect(ignored).toEqual([
      { param: "view", value: "galaxy", fallback: true },
      { param: "sort", value: "random", fallback: true },
    ]);
  });
});

beforeEach(() => {
  Object.defineProperty(navigator, "language", { value: "ja-JP", configurable: true });
});

const providerColumn = () => bodyRows().map((tr) => tr.children[0].textContent);

describe("SHARE-001 AC-013 画面との往復 (jsdom)", () => {
  it("?sort=alpha で表が純粋な昇順で描画される", () => {
    const app = mountFixtureApp({ search: "?sort=alpha" });
    expect(app.view.getSort()).toBe("alpha");
    expect(providerColumn()[0]).toBe("Amazon");
    expect(app.location.search).toContain("sort=alpha");
  });

  it("指定が無ければ既定の pinned で、URL にも sort が載らない", () => {
    const app = mountFixtureApp();
    expect(app.view.getSort()).toBe("pinned");
    expect(app.location.search).toBe("");
  });

  it("ヘッダのクリックで location.search が更新される (replaceState)", () => {
    const app = mountFixtureApp();
    document.querySelector('thead th[data-key="provider"]').click();
    expect(app.location.search).toBe("?sort=alpha");
    expect(app.history.replaceState).toHaveBeenCalled();
    expect(app.history.pushState).not.toHaveBeenCalled();

    document.querySelector('thead th[data-key="provider"]').click();
    expect(app.location.search).toBe("");
  });

  it("未知の sort は通知に出て既定に倒れる", () => {
    const app = mountFixtureApp({ search: "?sort=random" });
    expect(app.view.getSort()).toBe("pinned");
    expect(app.share.notice.hidden).toBe(false);
    expect(app.share.notice.textContent).toContain("sort=random");
    expect(app.location.search).toBe("");
  });
});

describe("SHARE-001 AC-011 view の受け渡し (jsdom)", () => {
  it("?view=regions は復元され、setView に渡り、URL にも残る", () => {
    let current = "origin";
    const app = mountFixtureApp({
      search: "?view=regions",
      getView: () => current,
      setView: (next) => {
        current = next;
      },
    });
    expect(current).toBe("regions");
    expect(app.share.currentState().view).toBe("regions");
    expect(app.location.search).toBe("?view=regions");
  });

  it("view を指定しなければ origin のままで URL に載らない", () => {
    const app = mountFixtureApp();
    expect(app.share.currentState().view).toBe("origin");
    expect(app.location.search).toBe("");
  });

  it("未知の view は通知に出て origin に倒れる", () => {
    let current = "regions";
    const app = mountFixtureApp({
      search: "?view=galaxy",
      getView: () => current,
      setView: (next) => {
        current = next;
      },
    });
    expect(current).toBe("origin");
    expect(app.share.notice.textContent).toContain("view=galaxy");
    expect(app.location.search).toBe("");
  });

  it("view=regions でも region / 絞り込みは値として保持される (AC-012)", () => {
    let current = "origin";
    const app = mountFixtureApp({
      search: "?view=regions&region=ap-northeast-3&provider=Anthropic",
      getView: () => current,
      setView: (next) => {
        current = next;
      },
    });
    expect(current).toBe("regions");
    expect(app.view.getRegion()).toBe("ap-northeast-3");
    expect(app.filter.getState().provider).toEqual(["Anthropic"]);
    // 保持している値は「解釈できない指定」に数えない
    expect(app.share.notice.hidden).toBe(true);
  });
});
