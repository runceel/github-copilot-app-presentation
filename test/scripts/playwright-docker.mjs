// ビジュアル回帰を Playwright 公式コンテナー内で実行するための薄いラッパー。
//
// スクリーンショットはフォント構成に強く依存するため、ローカル（Windows / macOS）と
// GitHub Actions で同じ結果を得るには、同一のコンテナーイメージで実行する必要がある。
// CI も同じイメージを `container:` に指定しているので、ここで生成したベースラインが
// そのまま CI の期待値になる。
//
// 追加の npm 依存は使わない（node 標準モジュールのみ）。

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

const playwrightVersion = pkg.devDependencies["@playwright/test"];
if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion ?? "")) {
  console.error(
    `@playwright/test のバージョンを固定してください（現在: ${playwrightVersion}）。` +
      "コンテナーイメージのタグと一致させる必要があります。",
  );
  process.exit(1);
}

const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
const args = [
  "run",
  "--rm",
  "--init",
  "--ipc=host",
  "-v",
  `${repoRoot}:/work`,
  "-w",
  "/work",
  image,
  "npx",
  "playwright",
  "test",
  ...process.argv.slice(2),
];

console.log(`> docker ${args.join(" ")}`);
const result = spawnSync("docker", args, { stdio: "inherit" });

if (result.error) {
  console.error("docker を起動できませんでした。Docker Desktop が動作しているか確認してください。");
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
