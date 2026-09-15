// @vitest-environment node
// 生成物と実データをファイルパスで読むので node 環境で走らせる。
// DATA-001 AC-013 / AC-014 (D-012): 地理圏は「global 以外の全接頭辞」で、
// 接頭辞の閉じた一覧をコードにもデータにも持たない。
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { judgeGeo, judgeGlobal } from "../src/scripts/bedrock-view-model.mjs";
import { buildLimitOptions, geoCodes } from "../src/scripts/filter-model.mjs";
import { limitLabel } from "../src/scripts/filter-bar.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const readJson = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), "utf8"));

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const SOURCE_DIRS = [join(ROOT, "src", "scripts"), join(ROOT, "scripts", "lib")];
const sourceFiles = SOURCE_DIRS.flatMap((dir) => walk(dir));

describe("DATA-001 AC-013 global 以外の接頭辞はすべて地理圏", () => {
  const R = "ap-northeast-1";
  const profiles = {
    "ca.amazon.nova-lite-v1:0": {
      prefix: "ca",
      modelId: "amazon.nova-lite-v1:0",
      sources: { [R]: ["ca-central-1", "ca-west-1"] },
    },
    "in.openai.gpt-5.6-luna": {
      prefix: "in",
      modelId: "amazon.nova-lite-v1:0",
      sources: { [R]: ["ap-south-1", "ap-south-2"] },
    },
    "global.amazon.nova-lite-v1:0": {
      prefix: "global",
      modelId: "amazon.nova-lite-v1:0",
      sources: { [R]: ["*"] },
    },
  };

  it("ca. / in. は Geo と判定し、global. は混ぜない", () => {
    const geo = judgeGeo(profiles, "amazon.nova-lite-v1:0", R);
    expect(geo.map((entry) => entry.prefix)).toEqual(["ca", "in"]);
    expect(judgeGlobal(profiles, "amazon.nova-lite-v1:0", R).prefix).toBe("global");
  });

  it("接頭辞の固定リストが src/scripts/ にも scripts/lib/ にも無い", () => {
    for (const path of sourceFiles) {
      const source = readFileSync(path, "utf8");
      const name = path.slice(ROOT.length);
      // 旧実装の固定リストの名前がどこにも残っていない
      expect(source, name).not.toMatch(/\bGEO_PREFIXES\b/);
      expect(source, name).not.toMatch(/\bGEO_CODES\b/);
      expect(source, name).not.toMatch(/\bCOUNTRY_CODES\b/);
      // 地理圏コードを並べた配列リテラルは「並び順の好み」だけ。
      // 判定や一覧の membership に使う固定リストは持たない。
      for (const [, constName, body] of source.matchAll(
        /const\s+([A-Za-z0-9_$]+)\s*=\s*Object\.freeze\(\[([^\]]*)\]/g,
      )) {
        if (!/"(apac|jp|eu|au)"/.test(body)) continue;
        expect(`${name}: ${constName}`).toMatch(/ORDER|PREFERENCE/);
      }
    }
  });

  it("実データでも global 以外の全接頭辞が地理圏の一覧に入る", () => {
    const profilesJson = readJson("data", "profiles.json");
    const regionNotes = readJson("data", "region-notes.json");
    const prefixes = new Set(
      Object.values(profilesJson)
        .map((profile) => profile.prefix)
        .filter((prefix) => prefix !== "global"),
    );
    const codes = geoCodes({ regionNotes, profiles: profilesJson });
    for (const prefix of prefixes) expect(codes, prefix).toContain(prefix);
    expect(codes).not.toContain("global");
    expect(codes).not.toContain("other");
  });
});

// FILTER-001 v5 UI Description: 実データでの推論先の限定の選択肢は 11 件。
// 件数も畳み込みもデータから決まり、固定値を持たない。
describe("FILTER-001 AC-018 / AC-020 実データでの選択肢", () => {
  const options = buildLimitOptions({
    regionNotes: readJson("data", "region-notes.json"),
    profiles: readJson("data", "profiles.json"),
  });

  it("11 件で、ca / in は国のラベルに畳まれる", () => {
    expect(options.map((option) => option.value)).toEqual([
      "none",
      "country:jp",
      "country:us",
      "country:au",
      "country:ca",
      "country:in",
      "geo:au",
      "geo:eu",
      "geo:apac",
      "geo:us",
      "custom",
    ]);
    expect(options.find((option) => option.value === "country:ca").aliases).toEqual(["geo:ca"]);
    expect(options.find((option) => option.value === "country:in").aliases).toEqual(["geo:in"]);
  });

  it("ラベルと件数がデータ由来で並ぶ (ja)", () => {
    expect(options.map((option) => limitLabel(option))).toEqual([
      "制限なし",
      "日本国内（2）",
      "米国内（4）",
      "オーストラリア国内（2）",
      "カナダ国内（2）",
      "インド国内（2）",
      "オーストラリア＋ニュージーランド（3）",
      "EU 内（8）",
      "アジア太平洋内（12）",
      "米国＋カナダ（5）",
      "カスタム…",
    ]);
  });
});

describe("DATA-001 AC-014 region-notes.json の geo は接頭辞に合わせる", () => {
  const regionNotes = readJson("data", "region-notes.json");
  const profilesJson = readJson("data", "profiles.json");

  it("ca-central-1 / ca-west-1 は ca、ap-south-1 / ap-south-2 は in", () => {
    expect(regionNotes["ca-central-1"].geo).toBe("ca");
    expect(regionNotes["ca-west-1"].geo).toBe("ca");
    expect(regionNotes["ap-south-1"].geo).toBe("in");
    expect(regionNotes["ap-south-2"].geo).toBe("in");
  });

  it("profiles.json に現れる global 以外の全接頭辞が geo の値としても存在する", () => {
    const geoValues = new Set(
      Object.entries(regionNotes)
        .filter(([key]) => key !== "_source")
        .map(([, note]) => note.geo),
    );
    const prefixes = [
      ...new Set(
        Object.values(profilesJson)
          .map((profile) => profile.prefix)
          .filter((prefix) => prefix !== "global"),
      ),
    ];
    expect(prefixes.length).toBeGreaterThan(0);
    for (const prefix of prefixes) expect([...geoValues], prefix).toContain(prefix);
  });

  it("どの接頭辞にも属さないリージョンだけが other に残る", () => {
    const prefixes = new Set(
      Object.values(profilesJson)
        .map((profile) => profile.prefix)
        .filter((prefix) => prefix !== "global"),
    );
    for (const [code, note] of Object.entries(regionNotes)) {
      if (code === "_source") continue;
      if (note.geo === "other") continue;
      expect(prefixes.has(note.geo) || note.geo === note.country, `${code}: ${note.geo}`).toBe(true);
    }
  });
});
