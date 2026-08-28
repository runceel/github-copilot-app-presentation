import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function isPathInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function pathKey(path) {
  const normalized = normalize(resolve(path));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function assetRootCandidates(workspaceRoot, sourcePath = "") {
  const workspace = resolve(workspaceRoot);
  const roots = [];
  const seen = new Set();
  const add = (path) => {
    const key = pathKey(path);
    if (seen.has(key)) return;
    seen.add(key);
    roots.push(resolve(path));
  };

  if (typeof sourcePath === "string" && sourcePath.trim()) {
    const source = resolve(workspace, sourcePath.trim());
    if (!isPathInside(workspace, source)) {
      fail("asset_source_outside_workspace", "The asset source must stay inside the workspace.");
    }
    add(join(dirname(source), "assets"));
  }
  add(join(workspace, "assets"));
  return roots;
}

function safeJoin(rootDir, rel) {
  if (typeof rel !== "string" || !rel || isAbsolute(rel) || rel.includes("\0")) return null;
  const root = resolve(rootDir);
  const candidate = normalize(join(root, rel));
  return isPathInside(root, candidate) ? candidate : null;
}

export async function resolveAssetFile(workspaceRoot, sourcePath, assetPath) {
  const requestedRoots = assetRootCandidates(workspaceRoot, sourcePath);
  let canonicalWorkspace;
  try {
    canonicalWorkspace = await realpath(resolve(workspaceRoot));
  } catch (_) {
    fail("workspace_not_found", "The workspace root is unavailable.");
  }

  for (const requestedRoot of requestedRoots) {
    const candidate = safeJoin(requestedRoot, assetPath);
    if (!candidate) {
      fail("invalid_asset_path", "The asset path must stay inside an assets folder.");
    }

    let canonicalRoot;
    try {
      canonicalRoot = await realpath(requestedRoot);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      fail("asset_root_unavailable", "An assets folder is unavailable.");
    }
    if (!isPathInside(canonicalWorkspace, canonicalRoot)) {
      fail("asset_root_outside_workspace", "Assets folders must resolve inside the workspace.");
    }

    let canonicalAsset;
    try {
      canonicalAsset = await realpath(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      fail("asset_unavailable", "The requested asset is unavailable.");
    }
    if (
      !isPathInside(canonicalWorkspace, canonicalAsset) ||
      !isPathInside(canonicalRoot, canonicalAsset)
    ) {
      fail("asset_outside_workspace", "The requested asset must resolve inside its assets folder.");
    }
    const info = await stat(canonicalAsset);
    if (info.isFile()) return canonicalAsset;
  }
  return null;
}
