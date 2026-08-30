// Thin wrapper for running visual regression in the official Playwright container.
//
// Screenshots depend heavily on installed fonts, so local systems (Windows / macOS) and GitHub
// Actions must use the same container image to produce matching results. CI specifies the same
// image under `container:`, making baselines generated here the expected CI output.
//
// Do not add npm dependencies; use only built-in Node modules.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

const playwrightVersion = pkg.devDependencies["@playwright/test"];
if (!/^\d+\.\d+\.\d+$/.test(playwrightVersion ?? "")) {
  console.error(
    `Pin the @playwright/test version (current: ${playwrightVersion}). ` +
      "It must match the container image tag.",
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
  console.error("Unable to start Docker. Verify that Docker Desktop is running.");
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
