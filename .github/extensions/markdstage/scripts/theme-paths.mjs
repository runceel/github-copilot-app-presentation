import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

import { isPathInside } from "./asset-paths.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function pathKey(path) {
  const normalized = normalize(resolve(path));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function themeRootCandidates(workspaceRoot, sourcePath = "") {
  const workspace = resolve(workspaceRoot);
  const roots = [];
  const seen = new Set();
  const add = (path) => {
    const root = resolve(path);
    const key = pathKey(root);
    if (seen.has(key)) return;
    seen.add(key);
    roots.push(root);
  };

  if (typeof sourcePath === "string" && sourcePath.trim()) {
    const source = resolve(workspace, sourcePath.trim());
    if (!isPathInside(workspace, source)) {
      fail("theme_source_outside_workspace", "The theme source must stay inside the workspace.");
    }
    add(dirname(source));
  }
  add(workspace);
  return roots;
}

function safeJoin(rootDir, rel) {
  if (typeof rel !== "string" || !rel.trim() || isAbsolute(rel) || rel.includes("\0")) {
    return null;
  }
  const root = resolve(rootDir);
  const candidate = normalize(join(root, rel.trim()));
  return isPathInside(root, candidate) ? candidate : null;
}

export function themeFileCandidates(workspaceRoot, sourcePath, themePath) {
  const roots = themeRootCandidates(workspaceRoot, sourcePath);
  return roots.map((root) => {
    const candidate = safeJoin(root, themePath);
    if (!candidate) {
      fail(
        "invalid_theme_path",
        "The theme path must be relative and stay inside a theme search root.",
      );
    }
    return candidate;
  });
}

export async function resolveThemeFile(workspaceRoot, sourcePath, themePath) {
  const roots = themeRootCandidates(workspaceRoot, sourcePath);
  const candidates = themeFileCandidates(workspaceRoot, sourcePath, themePath);
  let canonicalWorkspace;
  try {
    canonicalWorkspace = await realpath(resolve(workspaceRoot));
  } catch (_) {
    fail("workspace_not_found", "The workspace root is unavailable.");
  }

  for (let index = 0; index < roots.length; index += 1) {
    let canonicalRoot;
    try {
      canonicalRoot = await realpath(roots[index]);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      fail("theme_root_unavailable", "A theme search root is unavailable.");
    }
    if (!isPathInside(canonicalWorkspace, canonicalRoot)) {
      fail("theme_root_outside_workspace", "Theme search roots must resolve inside the workspace.");
    }

    let canonicalTheme;
    try {
      canonicalTheme = await realpath(candidates[index]);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      fail("theme_file_unavailable", "The requested theme file is unavailable.");
    }
    if (
      !isPathInside(canonicalWorkspace, canonicalTheme) ||
      !isPathInside(canonicalRoot, canonicalTheme)
    ) {
      fail(
        "theme_file_outside_workspace",
        "The requested theme file must resolve inside its theme search root.",
      );
    }
    const info = await stat(canonicalTheme);
    if (!info.isFile()) {
      fail("theme_file_unavailable", "The requested theme path is not a file.");
    }
    return canonicalTheme;
  }
  return null;
}
