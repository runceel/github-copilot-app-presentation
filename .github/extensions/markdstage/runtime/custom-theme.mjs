// Custom theme (CSS + optional theme.json metadata) loading shared by the Canvas
// Extension and the MarkdStage CLI.
//
// Every path is confined to the workspace and to the theme folder, and both the
// CSS and each declared asset are size-checked before they are served.

import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { MarkdStageError } from "./errors.mjs";
import { isPathInside } from "./output-paths.mjs";
import { safeJoin } from "./static-files.mjs";
import { resolveThemeFile } from "../scripts/theme-paths.mjs";
import {
  mapThemeMetadataAssets,
  parseThemeMetadata,
  parseThemeVariables,
  serializeThemeVariables,
  THEME_ASSET_MAX_BYTES,
  themeMetadataAssetPaths,
} from "../renderer/theme.mjs";

export const THEME_METADATA_NAME = "theme.json";
export const THEME_METADATA_MAX_BYTES = 64 * 1024;
export const THEME_CSS_MAX_BYTES = 64 * 1024;

export async function loadCustomTheme(
  workspaceRoot,
  sourceName,
  themeFile,
  { assetUrlPrefix = "/theme-assets/" } = {},
) {
  if (!themeFile) {
    throw new MarkdStageError(
      "invalid_theme_file",
      "custom theme requires themeFile or front matter theme-file.",
    );
  }
  let path;
  try {
    path = await resolveThemeFile(workspaceRoot, sourceName, themeFile);
  } catch (error) {
    throw new MarkdStageError("invalid_theme_file", error.message);
  }
  if (!path) {
    throw new MarkdStageError(
      "theme_file_not_found",
      `Could not read custom theme file: ${themeFile}`,
    );
  }
  let realThemeFile;
  let realWorkspaceRoot;
  try {
    [realThemeFile, realWorkspaceRoot] = await Promise.all([
      realpath(path),
      realpath(workspaceRoot),
    ]);
  } catch (_) {
    throw new MarkdStageError(
      "theme_file_not_found",
      `Could not read custom theme file: ${themeFile}`,
    );
  }
  if (!isPathInside(realWorkspaceRoot, realThemeFile)) {
    throw new MarkdStageError(
      "invalid_theme_file",
      "Custom theme files must stay inside the workspace.",
    );
  }
  let css;
  try {
    css = await readFile(realThemeFile, "utf8");
  } catch (error) {
    throw new MarkdStageError(
      "theme_file_not_found",
      `Could not read custom theme file: ${themeFile}`,
    );
  }
  if (Buffer.byteLength(css, "utf8") > THEME_CSS_MAX_BYTES) {
    throw new MarkdStageError(
      "invalid_theme_file",
      "Custom theme CSS must be 64 KiB or smaller.",
    );
  }
  try {
    const themeDir = dirname(path);
    const realThemeDir = await realpath(themeDir);
    if (!isPathInside(realWorkspaceRoot, realThemeDir)) {
      throw new Error("Custom theme metadata must stay inside the workspace.");
    }
    const metadataPath = join(themeDir, THEME_METADATA_NAME);
    let metadata = null;
    if (existsSync(metadataPath)) {
      const realMetadataPath = await realpath(metadataPath);
      if (!isPathInside(realThemeDir, realMetadataPath)) {
        throw new Error("Custom theme metadata must stay inside the theme folder.");
      }
      const metadataText = await readFile(realMetadataPath, "utf8");
      if (Buffer.byteLength(metadataText, "utf8") > THEME_METADATA_MAX_BYTES) {
        throw new Error("Custom theme metadata must be 64 KiB or smaller.");
      }
      metadata = parseThemeMetadata(metadataText);
      for (const assetPath of themeMetadataAssetPaths(metadata)) {
        const candidate = safeJoin(themeDir, assetPath);
        if (!candidate) throw new Error(`Invalid custom theme asset path: ${assetPath}`);
        let realAsset;
        try {
          realAsset = await realpath(candidate);
        } catch (_) {
          throw new Error(`Custom theme asset was not found: ${assetPath}`);
        }
        if (!isPathInside(realThemeDir, realAsset)) {
          throw new Error(`Custom theme asset must stay inside the theme folder: ${assetPath}`);
        }
        const info = await stat(realAsset);
        if (!info.isFile()) throw new Error(`Custom theme asset is not a file: ${assetPath}`);
        if (info.size > THEME_ASSET_MAX_BYTES) {
          throw new Error(`Custom theme asset must be 2 MiB or smaller: ${assetPath}`);
        }
      }
    }
    const assets = metadata ? themeMetadataAssetPaths(metadata) : [];
    return {
      file: relative(workspaceRoot, path),
      css: serializeThemeVariables(parseThemeVariables(css)),
      dir: relative(workspaceRoot, themeDir),
      metadata: metadata
        ? mapThemeMetadataAssets(metadata, (assetPath) => `${assetUrlPrefix}${assetPath}`)
        : null,
      assets,
    };
  } catch (error) {
    throw new MarkdStageError("invalid_theme_file", error.message);
  }
}
