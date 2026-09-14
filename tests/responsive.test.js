// @vitest-environment node
// TABLE-001 AC-NFR-001 の構造側。
// 実際の 375px の見た目は Playwright のスクリーンショットで目視確認する
// (Test Strategy の e2e)。ここでは「ページ本体は横に伸びず、横スクロールを
// 持つのは表の枠だけ」「Model ID 列が sticky」という CSS の取り決めが
// 消えていないことを固定する。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

const base = read("styles/base.css");
const table = read("styles/table.css");
const tokens = read("styles/tokens.css");

describe("AC-NFR-001 スマートフォン幅", () => {
  it("ページ本体は横スクロールしない", () => {
    expect(base).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden/);
    expect(base).toMatch(/html,\s*body\s*\{[^}]*max-width:\s*100%/);
  });

  it("横スクロールを持つのは表の枠", () => {
    expect(table).toMatch(/\.table-frame\s*\{[^}]*overflow-x:\s*auto/);
    expect(table).toMatch(/\.table-frame\s*\{[^}]*max-width:\s*100%/);
  });

  it("Model ID 列が左端に固定される", () => {
    expect(table).toContain("position: sticky");
    expect(table).toMatch(/\.sticky-modelId[\s\S]*?left:\s*var\(--col-provider-w\)/);
    expect(table).toMatch(/\.sticky-provider[\s\S]*?left:\s*0/);
    expect(tokens).toContain("--col-provider-w");
  });

  it("768px 以下では固定列の幅を詰め、Model ID を折り返す", () => {
    const mobile = base.slice(base.indexOf("@media (max-width: 768px)"));
    expect(mobile).toContain("--col-provider-w");
    expect(mobile).toMatch(/sticky-modelId[\s\S]*?white-space:\s*normal/);
  });
});

describe("テーマ", () => {
  it("ダークが既定で、ライトはトークンの再定義だけ", () => {
    expect(tokens).toContain("color-scheme: dark");
    expect(tokens).toMatch(/\[data-theme="light"\][\s\S]*color-scheme: light/);
  });

  it("コンポーネント CSS にテーマ分岐を書かない", () => {
    expect(table).not.toContain("data-theme");
    expect(base).not.toContain("data-theme");
  });
});
