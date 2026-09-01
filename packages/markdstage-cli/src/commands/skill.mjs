// markdstage skill — install or check portable Agent Skills.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { UsageError } from "../exit.mjs";
import { SKILL_TARGETS, buildSkillFiles } from "../skills.mjs";

export const SKILL_TARGET_NAMES = Object.keys(SKILL_TARGETS);

function resolveTargets(target) {
  if (!target || target === "all") return SKILL_TARGET_NAMES;
  const names = target
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of names) {
    if (!SKILL_TARGETS[name]) {
      throw new UsageError(
        `Unknown skill target: ${name}. Available targets: ${SKILL_TARGET_NAMES.join(", ")}, all.`,
      );
    }
  }
  return names;
}

export function skillDirectory(root, target) {
  return path.join(root, ...SKILL_TARGETS[target].directory);
}

async function readIfExists(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Install or verify generated skill files.
 *
 * `check` reports drift without writing. Without `force`, files that already
 * exist with different contents are reported as `conflict` and left untouched.
 */
export async function skillCommand({
  action = "install",
  target,
  root = process.cwd(),
  force = false,
} = {}) {
  if (action !== "install" && action !== "check") {
    throw new UsageError(
      `Unknown skill action: ${action}. Available actions: install, check.`,
    );
  }
  const targets = resolveTargets(target);
  const results = [];
  let conflicts = 0;
  let changed = 0;

  for (const name of targets) {
    const directory = skillDirectory(root, name);
    const files = await buildSkillFiles(name);
    for (const [relative, contents] of files) {
      const file = path.join(directory, ...relative.split("/"));
      const existing = await readIfExists(file);
      let status;
      if (existing === contents) {
        status = "unchanged";
      } else if (existing === null) {
        status = "created";
      } else if (force || action === "check") {
        status = "updated";
      } else {
        status = "conflict";
      }
      if (status === "conflict") conflicts += 1;
      if (status === "created" || status === "updated") changed += 1;
      if (action === "install" && (status === "created" || status === "updated")) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, contents, "utf8");
      }
      results.push({ target: name, path: file, status });
    }
  }

  return { action, targets, files: results, changed, conflicts };
}

export function formatSkillReport(report) {
  const lines = [];
  for (const file of report.files) {
    if (file.status === "unchanged") continue;
    lines.push(`  ${file.status.padEnd(9)} ${file.path}`);
  }
  if (report.action === "check") {
    lines.unshift(
      report.changed || report.conflicts
        ? `Generated skills are out of date (${report.changed} file(s) differ).`
        : "Generated skills are up to date.",
    );
    return lines.join("\n");
  }
  lines.unshift(
    `Installed skills for ${report.targets.join(", ")} (${report.changed} file(s) written).`,
  );
  if (report.conflicts) {
    lines.push(
      `${report.conflicts} file(s) were modified locally and were left untouched. Re-run with --force to overwrite.`,
    );
  }
  return lines.join("\n");
}
