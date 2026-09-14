// @vitest-environment node
// DEPLOY-001 AC-004 / AC-005 / AC-006 / AC-008: 公開用ワークフローの定義を検証する。
// 依存を増やさない (D-001) ため、ここで扱う範囲だけの極小 YAML パーサを持つ。
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKFLOW_DIR = join(ROOT, ".github", "workflows");
const DEPLOY_PATH = join(WORKFLOW_DIR, "deploy.yml");
const source = readFileSync(DEPLOY_PATH, "utf8");

// --- 極小 YAML パーサ -------------------------------------------------
// 対応するのは「インデントによる入れ子マップ」「`- ` のシーケンス」
// 「`[a, b]` のインライン配列」「引用符」「`#` のコメント」だけ。
// これ以上の構文をワークフローに書いたら、パーサではなくワークフローを見直す。
function stripComment(line) {
  let out = "";
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      break;
    }
    out += ch;
  }
  return out.trimEnd();
}

function scalar(text) {
  const value = text.trim();
  if (value === "") return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((part) => scalar(part));
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  return value;
}

function parseYaml(text) {
  const lines = text
    .split("\n")
    .map((line) => ({ indent: line.search(/\S/), text: stripComment(line) }))
    .filter((line) => line.indent >= 0 && line.text.trim() !== "");

  let cursor = 0;

  function parseBlock(indent) {
    if (cursor >= lines.length) return null;
    if (lines[cursor].text.trim().startsWith("- ")) return parseSequence(indent);
    return parseMapping(indent);
  }

  function parseSequence(indent) {
    const items = [];
    while (cursor < lines.length && lines[cursor].indent === indent && lines[cursor].text.trim().startsWith("- ")) {
      const rest = lines[cursor].text.trim().slice(2);
      const itemIndent = lines[cursor].indent + 2;
      if (/^[\w.$-]+:( |$)/.test(rest)) {
        // `- key: value` は、その行を同じ深さのマップの先頭として読み直す
        lines[cursor] = { indent: itemIndent, text: " ".repeat(itemIndent) + rest };
        items.push(parseMapping(itemIndent));
      } else {
        cursor += 1;
        items.push(scalar(rest));
      }
    }
    return items;
  }

  function parseMapping(indent) {
    const map = {};
    while (cursor < lines.length && lines[cursor].indent === indent && !lines[cursor].text.trim().startsWith("- ")) {
      const line = lines[cursor].text.trim();
      const split = line.indexOf(":");
      const key = line.slice(0, split).trim();
      const rest = line.slice(split + 1);
      cursor += 1;
      if (rest.trim() === "" && cursor < lines.length && lines[cursor].indent > indent) {
        map[key] = parseBlock(lines[cursor].indent);
      } else if (rest.trim() === "|" || rest.trim() === ">") {
        // ブロックスカラー: 中身は文字列として畳む
        const chunk = [];
        while (cursor < lines.length && lines[cursor].indent > indent) {
          chunk.push(lines[cursor].text.trim());
          cursor += 1;
        }
        map[key] = chunk.join("\n");
      } else {
        map[key] = scalar(rest);
      }
    }
    return map;
  }

  return parseBlock(lines[0].indent);
}

const workflow = parseYaml(source);
const steps = workflow.jobs.build.steps;
const runs = steps.filter((step) => typeof step.run === "string").map((step) => step.run);
const uses = steps.filter((step) => typeof step.uses === "string").map((step) => step.uses);

describe("DEPLOY-001 公開用ワークフロー", () => {
  it("パーサが期待どおりの骨格を読めている", () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(["build", "deploy"]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on.push.branches).toEqual(["main"]);
  });

  describe("AC-001 npm ci → npm test → npm run build → upload/deploy の順", () => {
    it("run ステップの並びが仕様どおり", () => {
      expect(runs).toEqual(["npm ci", "npm test", "npm run build"]);
    });

    it("test が build より前にある", () => {
      const indexOf = (command) => steps.findIndex((step) => step.run === command);
      expect(indexOf("npm test")).toBeLessThan(indexOf("npm run build"));
      expect(indexOf("npm ci")).toBeLessThan(indexOf("npm test"));
    });

    it("upload-pages-artifact が dist を、deploy ジョブが build を待って公開する", () => {
      const upload = steps.find((step) => String(step.uses).startsWith("actions/upload-pages-artifact"));
      expect(upload.with.path).toBe("dist");
      expect(steps.indexOf(upload)).toBe(steps.length - 1);
      expect(workflow.jobs.deploy.needs).toBe("build");
      expect(workflow.jobs.deploy.environment.name).toBe("github-pages");
      expect(workflow.jobs.deploy.steps.some((step) => String(step.uses).startsWith("actions/deploy-pages"))).toBe(true);
    });

    it("Node 22 と npm キャッシュを使う", () => {
      const setup = steps.find((step) => String(step.uses).startsWith("actions/setup-node"));
      expect(setup.with["node-version"]).toBe(22);
      expect(setup.with.cache).toBe("npm");
    });
  });

  describe("AC-004 CI に AWS 認証情報を置かない", () => {
    const forbidden = [
      "aws-actions/",
      "AWS_ACCESS_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "role-to-assume",
      "aws sso login",
      "configure-aws-credentials",
    ];

    it(".github/workflows/ のどの YAML にも AWS の認証要素が無い", () => {
      const files = readdirSync(WORKFLOW_DIR).filter((name) => /\.ya?ml$/.test(name));
      expect(files).toContain("deploy.yml");
      for (const name of files) {
        const text = readFileSync(join(WORKFLOW_DIR, name), "utf8");
        for (const needle of forbidden) {
          expect(text, `${name} に ${needle} が含まれている`).not.toContain(needle);
        }
        expect(text, `${name} に AWS_ 環境変数がある`).not.toMatch(/\bAWS_[A-Z_]+\b/);
        expect(text, `${name} に secrets 参照がある`).not.toMatch(/secrets\./);
      }
    });

    it("CI でデータを取得しない (fetch スクリプトも aws CLI も呼ばない)", () => {
      expect(runs.join("\n")).not.toMatch(/fetch-bedrock-snapshot|aws\s/);
      expect(uses.every((action) => action.startsWith("actions/"))).toBe(true);
    });
  });

  describe("AC-005 権限の最小化", () => {
    it("permissions が 3 キーのみ", () => {
      expect(workflow.permissions).toEqual({
        contents: "read",
        pages: "write",
        "id-token": "write",
      });
    });

    it("ジョブ単位で permissions を上書きしていない", () => {
      for (const job of Object.values(workflow.jobs)) {
        expect(job.permissions).toBeUndefined();
      }
    });
  });

  describe("AC-006 テストが落ちたら公開しない", () => {
    it("continue-on-error / if で失敗を握り潰していない", () => {
      expect(source).not.toContain("continue-on-error");
      expect(source).not.toMatch(/always\(\)/);
      for (const step of steps) expect(step.if).toBeUndefined();
    });

    it("deploy ジョブは build の成功を待つ", () => {
      expect(workflow.jobs.deploy.needs).toBe("build");
    });
  });

  describe("AC-008 生データを混ぜない", () => {
    it("data/raw を触るステップが無い", () => {
      expect(source).not.toContain("data/raw");
    });

    it("concurrency は pages グループで、進行中の deploy を切らない", () => {
      expect(workflow.concurrency.group).toBe("pages");
      expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    });
  });
});
