import { readFileSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// ビルド実行日 (JST) を index.html の %BUILD_DATE% に埋め込む
const buildDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
}).format(new Date());

// データの取得日時 (%GENERATED_AT%) は生成物の正から読む。
// fetch-log.json がまだ無い初回ビルドでも落ちないようにしておく。
const readGeneratedAt = () => {
  try {
    return JSON.parse(readFileSync(new URL("./data/fetch-log.json", import.meta.url), "utf8")).generatedAt;
  } catch {
    return "unknown";
  }
};

// order: "pre" で、singlefile がバンドルをインライン化する前の生の HTML に対して置換する
const injectBuildMeta = () => ({
  name: "inject-build-meta",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html.replaceAll("%BUILD_DATE%", buildDate).replaceAll("%GENERATED_AT%", readGeneratedAt());
    },
  },
});

export default defineConfig({
  root: "src",
  plugins: [viteSingleFile(), injectBuildMeta()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  test: {
    root: ".",
    environment: "jsdom",
    // worktree (.claude/worktrees/) やビルド生成物の中のテストを拾わない。
    // vitest の既定 (node_modules / .git) に dist と .claude を足す。
    exclude: [...configDefaults.exclude, "**/dist/**", "**/.claude/**"],
  },
});
