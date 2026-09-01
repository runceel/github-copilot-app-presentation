// Regenerate the portable Agent Skills checked into this repository.
//
// Only the Codex and Claude Code skills are generated; `.github/skills/markdstage`
// stays hand-written because it is the Canvas-specific adapter. Pass `--check`
// to fail when the checked-in files drift from the canonical guide topics.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { skillCommand, formatSkillReport } from "../src/commands/skill.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TARGETS = "codex,claude";

const check = process.argv.includes("--check");
const report = await skillCommand({
  action: check ? "check" : "install",
  target: TARGETS,
  root: REPO_ROOT,
  force: true,
});

process.stdout.write(`${formatSkillReport(report)}\n`);
if (check && (report.changed || report.conflicts)) {
  process.stdout.write(
    "Run `npm run skills` from the repository root and commit the result.\n",
  );
  process.exitCode = 1;
}
