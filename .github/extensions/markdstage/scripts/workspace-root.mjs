import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function resolveWorkspaceRoot(workingDirectory, fallbackRoot) {
  const fallback = resolve(fallbackRoot);
  if (!workingDirectory) return fallback;

  const workspace = resolve(workingDirectory);
  if (!existsSync(workspace)) return fallback;

  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (root) return resolve(root);
  } catch (_) {
    /* not a Git repository / Git unavailable — inspect parent markers */
  }

  let directory = workspace;
  for (;;) {
    if (existsSync(join(directory, ".git"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  return workspace;
}
