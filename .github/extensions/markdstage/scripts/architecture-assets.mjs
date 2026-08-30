import { open, mkdir, readdir, realpath, stat, unlink } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import {
  ASSET_EXTENSIONS,
  ASSET_PATH_PATTERN,
} from "../renderer/architecture.mjs";
import {
  assetRootCandidates,
  isPathInside,
} from "./asset-paths.mjs";

export const ARCHITECTURE_ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const ARCHITECTURE_ASSET_LIST_MAX = 1_000;

const CONTENT_TYPES = Object.freeze({
  svg: new Set(["image/svg+xml", "text/xml", "application/xml"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function canonicalAssetRoot(
  workspaceRoot,
  { create = false, requestedAssets = "" } = {},
) {
  let canonicalWorkspace;
  try {
    canonicalWorkspace = await realpath(resolve(workspaceRoot));
  } catch (_) {
    fail("workspace_not_found", "The workspace root is unavailable.");
  }
  const assetsPath = requestedAssets || join(canonicalWorkspace, "assets");
  if (create) await mkdir(assetsPath, { recursive: true });
  let canonicalAssets;
  try {
    canonicalAssets = await realpath(assetsPath);
  } catch (error) {
    if (!create && error?.code === "ENOENT") {
      return { workspace: canonicalWorkspace, assets: null };
    }
    fail("asset_root_unavailable", "The workspace assets folder is unavailable.");
  }
  if (!isPathInside(canonicalWorkspace, canonicalAssets)) {
    fail(
      "asset_root_outside_workspace",
      "The assets folder must resolve inside the workspace.",
    );
  }
  const info = await stat(canonicalAssets);
  if (!info.isDirectory()) {
    fail("asset_root_unavailable", "The workspace assets path is not a directory.");
  }
  return { workspace: canonicalWorkspace, assets: canonicalAssets };
}

function supportedExtension(filename) {
  const extension = extname(filename).slice(1).toLowerCase();
  return ASSET_EXTENSIONS.includes(extension) ? extension : "";
}

function assertContentType(extension, contentType) {
  const normalized = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "application/octet-stream") return;
  if (!CONTENT_TYPES[extension]?.has(normalized)) {
    fail(
      "asset_content_type_mismatch",
      `The ${normalized} content type does not match .${extension}.`,
    );
  }
}

function hasSupportedSignature(content, extension) {
  if (extension === "png") {
    return (
      content.length >= 8 &&
      content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }
  if (extension === "jpg" || extension === "jpeg") {
    return (
      content.length >= 3 &&
      content[0] === 0xff &&
      content[1] === 0xd8 &&
      content[2] === 0xff
    );
  }
  if (extension === "webp") {
    return (
      content.length >= 12 &&
      content.subarray(0, 4).toString("ascii") === "RIFF" &&
      content.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (extension === "svg") {
    const source = content.subarray(0, Math.min(content.length, 16 * 1024)).toString("utf8");
    if (/<!doctype/i.test(source)) return false;
    return /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(
      source,
    );
  }
  return false;
}

export function normalizeArchitectureAssetName(filename) {
  const extension = supportedExtension(filename);
  if (!extension) {
    fail(
      "unsupported_asset_type",
      "Only SVG, PNG, WebP, JPG, and JPEG images can be imported.",
    );
  }
  const rawStem = String(filename || "").slice(0, -extname(filename).length);
  const stem =
    rawStem
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/[-_.]+$/, "")
      .slice(0, 160) || "image";
  return { stem, extension };
}

export async function listArchitectureAssets(workspaceRoot, sourcePath = "") {
  const assets = [];
  const seen = new Set();

  const walk = async (root, directory, relativeDirectory = "") => {
    if (assets.length >= ARCHITECTURE_ASSET_LIST_MAX) return;
    let entries = await readdir(directory, { withFileTypes: true });
    entries = entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      if (assets.length >= ARCHITECTURE_ASSET_LIST_MAX) break;
      if (entry.isSymbolicLink()) continue;
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const candidate = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(root, candidate, relativePath);
        continue;
      }
      if (!entry.isFile() || !supportedExtension(entry.name)) continue;
      const assetPath = `assets/${relativePath.split(sep).join("/")}`;
      if (!ASSET_PATH_PATTERN.test(assetPath)) continue;
      let canonicalFile;
      try {
        canonicalFile = await realpath(candidate);
      } catch (_) {
        continue;
      }
      if (!isPathInside(root.workspace, canonicalFile) || !isPathInside(root.assets, canonicalFile)) {
        continue;
      }
      const info = await stat(canonicalFile);
      if (!info.isFile() || info.size > ARCHITECTURE_ASSET_MAX_BYTES) continue;
      const assetKey = process.platform === "win32" ? assetPath.toLowerCase() : assetPath;
      if (seen.has(assetKey)) continue;
      seen.add(assetKey);
      assets.push({ path: assetPath, size: info.size });
    }
  };

  for (const requestedAssets of assetRootCandidates(workspaceRoot, sourcePath)) {
    const root = await canonicalAssetRoot(workspaceRoot, { requestedAssets });
    if (root.assets) await walk(root, root.assets);
  }
  return assets;
}

export async function importArchitectureAsset(
  workspaceRoot,
  { filename, contentType, content },
) {
  if (!Buffer.isBuffer(content) || content.length === 0) {
    fail("empty_asset", "Choose a non-empty image file.");
  }
  if (content.length > ARCHITECTURE_ASSET_MAX_BYTES) {
    fail("asset_too_large", "Images must be 10 MB or smaller.");
  }
  const { stem, extension } = normalizeArchitectureAssetName(filename);
  assertContentType(extension, contentType);
  if (!hasSupportedSignature(content, extension)) {
    fail(
      "asset_signature_mismatch",
      `The file contents do not match the .${extension} image format.`,
    );
  }
  const root = await canonicalAssetRoot(workspaceRoot, { create: true });
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const name = `${stem}${suffix}.${extension}`;
    const assetPath = `assets/${name}`;
    if (!ASSET_PATH_PATTERN.test(assetPath)) {
      fail("invalid_asset_name", "The imported image name is not safe for Architecture DSL.");
    }
    const target = join(root.assets, name);
    let handle;
    try {
      handle = await open(target, "wx");
      await handle.writeFile(content);
      await handle.sync();
      await handle.close();
      return { path: assetPath, size: content.length };
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
        await unlink(target).catch(() => {});
      }
      if (error?.code === "EEXIST") continue;
      fail("asset_write_failed", error?.message || "The image could not be imported.");
    }
  }
  fail("asset_name_exhausted", "A unique filename could not be allocated.");
}
